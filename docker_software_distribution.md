# [Feature] Software distribution via Docker #12

## Tool Engine — Decoupled catalog distribution and community tool ecosystem

### TL;DR

Ship MCP tools as **digest-pinned, cosign-verified OCI images** in **`ghcr.io/pengine/tools/`**, with a **signed, versioned catalog** in-repo. Decouple **catalog/tool updates** from **Pengine binary releases**. Prove the pipeline end-to-end with **`pengine/file-manager`** as the first registry-backed tool.

### Problem

Today, first-party tools can rely on **local `podman build` from the source tree** (`build_context`). That works for developers with a checkout; it does **not** work for normal installs. Users need a **durable, reviewable, reproducible** path: **pull by digest → verify → run with a fixed policy profile**.

### Solution (product)

Two streams: **binary** (orchestration, trust root, spawn policy) vs **catalog** (signed data describing *which* artifacts exist). The binary always decides **how** containers run; the catalog never becomes executable policy.

### First milestone

Publish the existing **file-manager** image to **`ghcr.io/pengine/tools/`** as the first **real** registry-backed tool, with **CI build → push → sign → smoke test → catalog entry → Pengine pull-by-digest**, before opening the full community funnel.

---

## Goals

- **Decouple release cadence**: ship core binaries only when core code changes; ship catalog updates when tool PRs merge.
- **Free hosting end-to-end**: GHCR for images, raw GitHub for catalog JSON, GitHub Actions for automation — no paid CDN requirement for the baseline design.
- **Contributions feel like npm**: publish a tool → PR → review → merge; transparent diffs.
- **Durable against contributor churn**: distribution references **Pengine-mirrored** digests; upstream repo/image deletion does not brick users.
- **Trust root in the binary**: compromised catalog hosting cannot widen capabilities or bypass spawn policy.
- **Updates transparent and reversible**: users see what changed, apply intentionally, can roll back.

## Non-goals

- Multi-registry mirroring beyond **single GHCR namespace + cold archive**.
- User-configurable catalog URL or signing key (baseline).
- Auto-update without user consent.
- Web-based catalog browser.
- Remote catalog **overriding** embedded baseline tools (remote may add/rotate; embedded remains trust floor).

---

## Nanoclaw-inspired infrastructure considerations

[Nanoclaw](https://github.com/qwibitai/nanoclaw) positions **containers as the security boundary**: agents see **only what is mounted**, with orchestration staying **outside** the sandbox. Pengine’s Tool Engine should mirror that split at the **distribution + runtime** layer:

| Nanoclaw idea | Pengine Tool Engine analogue |
|---------------|------------------------------|
| **Isolation is the contract** — filesystem visibility is explicit mounts, not app-level “trust me” | **Fixed run profile per tool** from signed catalog + binary: mounts (workspace roots), read-only flags, resource caps, network posture. **No** model-supplied image names, extra mount paths, or `extra_podman_args`. |
| **Orchestrator vs agent container** — one process routes work; heavy lifting in containers | **Pengine binary** resolves catalog, pulls/verifies images, writes **`mcp.json`**, manages lifecycle. **Model** only invokes tools already registered for running servers. |
| **Runtime choice matters** — Docker vs Apple Container vs stronger isolation (e.g. Docker Sandboxes) | **Document and test** primary path (**Podman/Docker** on Linux/macOS/Windows as applicable). Call out **platform/arch matrix** (`linux/amd64`, `linux/arm64`) and **rootless** expectations where they affect pull/run. Reserve headroom for **stricter isolation backends** later without changing catalog semantics (still digest + policy). |
| **Concurrency and fairness** — global limits, per-unit queues | **Bounded concurrent MCP servers** (and optional warm pool): document default cap, eviction (e.g. LRU), idle timeout, optional user pins — so a **large local image catalog** does not imply **many running containers**. |
| **Secrets stay out of the workload** — outbound creds injected at a controlled boundary (e.g. vault/proxy pattern) | **Catalog is not a secret channel**: no arbitrary env injection or fetch URLs for credentials from catalog JSON. Host-owned config paths only where explicitly designed in the **binary** (separate from “tool bytes”). |
| **Small core, extensions outside** — “skills over features” for optional surface area | **Community tools** ship as **containers + catalog entries**, not as new spawn surfaces in core unless the binary gains a **versioned** capability (per hard rule below). |

**Design takeaway**  
Treat **GHCR + signed catalog** as the **supply chain** and **Podman/Docker + fixed profiles** as the **enforcement plane**, the same way Nanoclaw treats **registry/image + mount policy** as enforcement rather than “bigger allowlists in one process.”

---

## Architecture: two independent streams

| Stream | Contains | Updated when | Mechanism |
|--------|-----------|--------------|-----------|
| **Binary** | Agentic loop, MCP client, native tools, install/spawn machinery, signing trust, default catalog URL, embedded baseline `tools.json` | Core code changes | Tauri updater / GitHub Releases |
| **Catalog** | Signed `tools.json`: tool ids, versions, **digests**, yank/revoke flags, resource/mount **hints** (interpreted only within binary policy) | Tool PRs merge | Fetch from `raw.githubusercontent.com` on startup (later phases) |

**Embedded `tools.json`** = trust floor + offline/disaster fallback. Remote catalog may **add** tools/versions, **yank**, or **revoke** — it must not **remove embedded tools**, **change trust root**, or **grant new runtime capabilities** without a new binary.

### Hard rule — catalog describes *what*; binary decides *how*

No `extra_podman_args`, no script hooks, no user-supplied registry URLs in catalog. Any new container capability → **binary release** + schema/`minimum_pengine_version` if needed. **Catalog is data, not code.**

---

## Repository layout (target)

```
pengine/
├── catalog/
│   ├── v1/
│   │   ├── tools.json          # CI-generated aggregate
│   │   └── tools.json.sig      # cosign detached signature
│   ├── entries/                # one JSON per tool (source of truth)
│   │   └── pengine-file-manager.json
│   └── README.md
├── docs/tool-engine/
│   ├── authoring.md
│   ├── contributing.md
│   ├── security.md
│   ├── distribution.md
│   └── update-policy.md
├── .github/workflows/
│   ├── catalog-validate.yml      # PR: pull, smoke, verify sign, vuln scan
│   ├── catalog-mirror.yml        # merge: crane copy → pengine GHCR + archive
│   ├── catalog-publish.yml       # merge: regenerate + sign, commit back
│   ├── catalog-resign.yml        # daily: refresh valid_until
│   └── catalog-watchdog.yml      # daily: digest resolvable; issue on 404
├── scripts/
│   └── dev-build-tools.sh        # local: build all first-party tools from allowlist (optional)
├── tools/
│   ├── allowlist.txt             # first-party tool ids (or paths) eligible for dev script + CI publish
│   └── file-manager/             # first-party tool source (moved out of src-tauri)
└── src-tauri/src/modules/tool_engine/
    └── tools.json                # build-time snapshot of catalog/v1/tools.json
```

---

## Image hosting and durability

- **Mirror-on-merge (community path)**: contributor GHCR is **build source** only; on merge, CI **`crane copy`** to `ghcr.io/pengine/tools/...@digest` (digest-preserving). Catalog references **only** the Pengine mirror.
- **Digest-only references**: `"image": "ghcr.io/pengine/tools/pengine-file-manager@sha256:…"` — **no mutable tags** in catalog for shipped versions. Document whether the pinned value is a **multi-arch manifest digest** or **per-platform image digest** so `podman pull` / verify steps match CI.
- **License**: Apache-2.0 or MIT; codified in `contributing.md` + PR template.

### Why registry images (not “Dockerfile-only” distribution)

- **End users** should **pull a signed, digest-pinned artifact** — not run `podman build` from a checkout. That matches reproducibility, cosign, and allowlist-by-digest.
- **Multi-arch**: publish **`linux/amd64`** and **`linux/arm64`** (e.g. `docker buildx` + manifest list) so one logical release covers typical desktops; the client pulls the correct variant.
- **Low-power machines**: first-time **pull** is mainly network + disk; **building** (`npm ci`, layers) is usually **heavier on CPU/RAM** than pulling layers, especially when base images are already cached locally across tools.
- **Contrast with Nanoclaw-style dev flow**: upstream [Nanoclaw](https://github.com/qwibitai/nanoclaw) documents **local** `docker build` of `nanoclaw-agent` from the repo. Pengine’s **product** path is the opposite for catalog tools: **CI builds once**, users **pull** — Nanoclaw’s pattern is a good **developer** analogue, not the shipped-user default.

---

## MCP npm packages and the OCI boundary

- **MCP servers from npm** (e.g. `@modelcontextprotocol/server-filesystem`) are integrated by **`COPY package.json package-lock.json` + `npm ci` inside the Dockerfile** — same pattern as today’s `tools/file-manager` image. The **wire protocol** is still MCP over stdio; **npm is a build-time dependency**, not something end users run globally.
- **Production installs must not** rely on **`npx -y …@latest`** (or equivalent) at container start for catalog tools: that breaks **immutable digest**, weakens signing story, and makes CI/user environments diverge.
- **When an upstream npm package releases a new version**: bump **`package.json` / lockfile** → **CI rebuilds the image** → **new digest** → **catalog entry** gets a new **semver + digest** (same review path as any tool update). Optional: **Dependabot / Renovate** opens PRs when deps change; merge after review triggers the same publish pipeline.

---

## Supply-chain updates, PR flow, and CI triggers

**Goal:** One PR can update **first-party tool sources** (`tools/<id>/`) **and** the **catalog entry**; automation proves the pair is coherent before merge.

### Path-based triggers (pull requests)

On PRs touching any of:

- `tools/**`
- `catalog/entries/**`
- (optionally) `catalog/v1/tools.json` during transitional workflows

…run **`catalog-validate`** (or a dedicated **`tools-image-pr.yml`**) for **affected** tools in the **first-party allowlist** only:

1. **Build** the image (same Dockerfile/lockfile as merge).
2. **MCP smoke**: `initialize` + `tools/list`.
3. **Digest coherence**: rebuild from the PR’s lockfile and **assert** the **catalog-declared digest** equals the **build output digest** (reproducible build). If the PR only bumps npm and not yet the digest, CI **fails with a clear message** until the entry is updated — or a **trusted bot** commits the new digest to the branch (team choice; document in `distribution.md`).
4. Optional: **vuln scan** on the built image.

**On merge to `main`:** run **publish** (multi-arch push to `ghcr.io/pengine/tools/…`, cosign, cold-archive) for allowlisted tools whose **source or catalog entry** changed, then **`catalog-publish`** regenerates and signs `catalog/v1/tools.json`.

**Avoid:** a scheduled job that silently resolves “latest” npm **without** a lockfile change — that produces **moving builds** and fights digest pinning. Prefer **lockfile-driven** bumps (bot PR → human review → merge).

### First-party build allowlist

- Maintain an explicit list (e.g. `tools/allowlist.txt` or a matrix in workflow config) of **tool ids / paths** that may **auto-build in CI** and **publish** to `ghcr.io/pengine/tools/`.
- **CI enforcement**: every allowlisted `tools/<id>/` has a matching **`catalog/entries/…`** (or generated entry) so first-party tools do not drift out of the signed catalog.

---

## Local development

- Provide a **single dev entrypoint** (e.g. `scripts/dev-build-tools.sh` and/or `bun run tools:build`) that:
  - Reads the **same first-party allowlist** as CI.
  - Runs **`podman build` / `docker build`** per tool (optional `--tool <id>`, `--platform`, `--no-cache`).
  - Tags images for **local use** (e.g. dev tag or the exact digest Pengine can reference in a dev-only `tools.json` override — implementation detail in app docs).
- Developers iterate: **edit Dockerfile or npm deps** → **run dev script** → **run Pengine** against local tags/digests without pushing to GHCR.

This mirrors Nanoclaw’s **“build container from repo”** ergonomics **without** shipping that path to production users.

---

## Catalog format (sketch)

Keep the existing JSON shape; enforce **`schema_version`**, **`catalog_revision`** (monotonic), **`valid_until`**, **`minimum_pengine_version`**, and **`/v1/`** path stability as already specified.

Example shape:

```json
{
  "schema_version": 1,
  "generated_at": "2026-04-11T14:30:00Z",
  "catalog_revision": 1,
  "valid_until": "2026-05-11T14:30:00Z",
  "minimum_pengine_version": "0.5.0",
  "tools": [
    {
      "id": "pengine/file-manager",
      "name": "File Manager",
      "description": "Read and list files from mounted directories via MCP",
      "current": "0.1.0",
      "versions": [
        {
          "version": "0.1.0",
          "digest": "sha256:...",
          "released_at": "2026-04-15T00:00:00Z",
          "yanked": false,
          "revoked": false,
          "security": false
        }
      ],
      "limits": { "cpus": "0.5", "memory": "256m" },
      "mount_workspace": true,
      "mount_read_only": true,
      "append_workspace_roots": true,
      "direct_return": true,
      "mcp_server_cmd": ["node", "/mcp/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js"]
    }
  ]
}
```

---

## Trust and verification

- **Catalog**: cosign **keyless** via GitHub Actions OIDC; trust material embedded in the binary.
- **Images**: cosign sign at publish/mirror under **Pengine identity**; verify on install/pull.
- **Startup**: fetch `tools.json` + `.sig`, verify, check schema/revision/expiry/minimum version, **atomic** cache replace.
- **Failure**: explicit UI error; fall back to **cached or embedded** catalog — **no silent stale remote**.

### Catalog fetch lifecycle (target)

- **Startup**: fetch + verify with short timeout (e.g. 3s). On failure, use newer of (cached, embedded) with clear messaging.
- **While running**: periodic background re-fetch (e.g. every 6 hours).
- **On demand**: “Refresh catalog” action.
- **On install/update**: re-verify entry against latest catalog.
- **Cache**: app data directory; survives binary updates.

---

## Update lifecycle (summary)

- **Tool bytes vs catalog**: shipping a new **`@modelcontextprotocol/*`** (or other npm) revision always implies a **new OCI build + new digest + catalog version row** — see *MCP npm packages and the OCI boundary* and *Supply-chain updates, PR flow, and CI triggers*.
- **Semver + digest integrity**: CI rejects downgrades and same-version/different-digest.
- **Transactional updates**: temp MCP client validates `initialize` + `tools/list` before swapping live config; backup/restore `mcp.json` on failure.
- **Yank vs revoke**: yank = warn / not offered as update / optional reinstall with confirmation; revoke = refuse spawn (high bar, audit trail). **Never delete** catalog rows for auditability.
- **Old images**: keep on disk for a documented revert window; manual GC, not silent auto-prune during update.

---

## UX (summary)

- **Pengine update** vs **tool updates** as separate channels (binary restart vs container refresh).
- **No auto-update**; batch tool update badge; “what’s new” links to merged PRs; security flagging.

---

## Worked example: Phase 1 — `pengine/file-manager`

**Starting state**  
`src-tauri/src/modules/tool_engine/container/file-manager/` contains Dockerfile, lockfiles, etc. Embedded `tools.json` may use `image: "file-manager:0.1.0"` with `build_context` — works only with a source checkout.

### Step 1 — Pengine GHCR namespace (one-time)

Confirm/create `pengine` org; seed `ghcr.io/pengine/tools/*`; public anonymous pulls; retention; deletion protection; OIDC for workflows to push/sign.

### Step 2 — Move tool; add publish workflow

- Move `src-tauri/src/modules/tool_engine/container/file-manager/` → `tools/file-manager/`.
- Add **`tools/allowlist.txt`** (or chosen format) listing `file-manager` (and future first-party ids) so **dev script + CI** share one source of truth.
- Add `tools/file-manager/pengine-tool.json` (metadata, limits, mounts, `mcp_server_cmd`, license).
- Add **`scripts/dev-build-tools.sh`** (and root **`package.json`** script alias) for local multi-tool builds from the allowlist.
- Add `.github/workflows/file-manager-publish.yml`: `workflow_dispatch` and/or tags `file-manager-v*`; `docker buildx` multi-platform; push; capture digest; cosign sign digest; MCP smoke (`initialize` + `tools/list`); cold-archive artifact; job summary with digest and catalog diff hint.
- Add **PR workflow** paths: changes under `tools/**` or `catalog/entries/**` trigger **build + smoke + digest match** for affected allowlisted tools before merge (see *Supply-chain updates, PR flow, and CI triggers*).

For first-party file-manager, push **directly** into Pengine namespace (mirror bridge is Phase 2 for community tools).

### Step 3 — Catalog entry

Add `catalog/entries/pengine-file-manager.json` with digest from Step 2. PR triggers `catalog-validate.yml`. On merge, `catalog-publish.yml` regenerates signed `catalog/v1/tools.json` and commits back.

### Step 4 — Binary changes

- Remove `build_context` from types and **`ensure_tool_image`**: digest-only pull, cosign verify, no local build fallback; surface errors clearly.
- Embedded `tools.json` = build-time copy of `catalog/v1/tools.json`.
- Delete `src-tauri/src/modules/tool_engine/container/`.
- Stream pull output to log panel.

### Step 5 — End-to-end verification (clean machine)

Install from release; install tool from panel; verify `mcp.json`, mounts, agent tool calls; uninstall; restart with/without network; confirm embedded fallback behavior.

**What Phase 1 proves**  
Stock Pengine installs need **no source tree**; tools are **OCI + signed catalog entries**; core ships **no per-tool Dockerfiles**.

---

## Implementation phases

- **Phase 1** — First registry image + publish + signed aggregate + binary strict pull (worked example above); **`tools/allowlist.txt`** (or equivalent) + **`scripts/dev-build-tools.sh`** / `bun run tools:build`; **PR-scoped CI** on `tools/**` and `catalog/entries/**` (build + smoke + digest coherence for allowlisted tools); optional **Dependabot/Renovate** on first-party `package.json` / lockfiles.
- **Phase 2** — Contributor template, mirror workflow, validate/watchdog docs, PR templates; extend PR CI + publish matrix to all allowlisted first-party tools.
- **Phase 3** — Live catalog fetch cadence, cache, resign job.
- **Phase 4** — Update UX, transactional upgrades, revert window.
- **Phase 5** — ETag / `If-None-Match`; **`pengine-cli try`** (optional local iterate without full PR, same Dockerfile/lockfile as CI); per-tool changelogs; revisit embedded vs remote balance.

---

## Description (product framing)

Pengine should run MCP servers **only** via containers (Podman/Docker) so the host stays clean (no global per-tool installs). Users may have **many images** locally; only a **bounded** set of MCP servers should run at once. The **model** never selects arbitrary containers or flags; it only calls tools for servers **already** registered by Pengine under **policy**.

**Install vs run**: only allowlisted images may be installed/pulled; only allowlisted images may be started. Allowlist entries pin **trusted artifacts** (registry + repository + digest). **Warm pool** (optional): bounded recently-used servers, LRU/max N/max RAM, idle timeout, optional pins. **Disk**: layer reuse + documented pruning so many catalog entries do not mean unbounded disk growth.

---

## Acceptance criteria (issue-level)

- [ ] **First-party allowlist**: explicit list of tools eligible for **dev build + CI publish**; CI fails if an allowlisted `tools/<id>/` lacks a catalog entry (or vice versa, per policy).
- [ ] **PR CI on catalog + tools**: pull requests touching `tools/**` or `catalog/entries/**` trigger **image build + MCP smoke** for impacted allowlisted tools; **catalog digest matches reproducible CI build** (or documented bot path updates digest).
- [ ] **Local dev command**: documented script (e.g. `bun run tools:build`) builds all (or one) allowlisted tool images for testing without GHCR.
- [ ] **Allowlist governs install**: cannot pull/install unless image matches catalog entry (**digest-pinned** as defined).
- [ ] **Allowlist governs run**: cannot start a container unless image matches allowlisted digest.
- [ ] **Model boundary**: model cannot start/stop containers or pass image names/flags; Pengine does lifecycle from **user actions + routing**.
- [ ] **Fixed run profile**: mounts, network, CPU/mem, user — from **binary + catalog policy union** where catalog is strictly data; no model overrides.
- [ ] **Scale**: many local images OK; **bounded** concurrent servers; behavior documented (defaults, caps, LRU/eviction if warm pool exists).
- [ ] **Warm pool** (if implemented): LRU / max N / idle timeout / pins documented.
- [ ] **Resource hygiene**: documented or implemented pruning/GC so disk stays manageable with layer reuse.
- [ ] **UX**: clear copy that **catalog size ≠ running servers**; install vs run are both policy-controlled.

## Acceptance criteria — Phase 1

- [ ] `ghcr.io/pengine/tools/pengine-file-manager` **@digest** publicly pullable, **cosign-signed**; **multi-arch** `linux/amd64` + `linux/arm64` (manifest list or documented per-arch pinning).
- [ ] `tools/file-manager/` with Dockerfile, `pengine-tool.json`, package files + **lockfile**; npm deps resolved only at **image build** time (no production `npx @latest` path).
- [ ] `tools/allowlist.txt` (or equivalent) + **`scripts/dev-build-tools.sh`** + **`bun run tools:build`** (or equivalent) documented for local iteration.
- [ ] `.github/workflows/file-manager-publish.yml`: build (multi-arch), push, sign, smoke, cold-archive.
- [ ] PR checks: **path-filtered** workflow runs **build + smoke + digest coherence** when `tools/file-manager/` or `catalog/entries/pengine-file-manager.json` changes.
- [ ] `catalog/entries/pengine-file-manager.json` references that digest.
- [ ] `catalog/v1/tools.json` regenerated + committed on merge; `.sig` verifies against embedded trust.
- [ ] `src-tauri/.../tool_engine/container/` removed; **no** `build_context` path.
- [ ] `ensure_tool_image`: digest-only pull + cosign verify; pull progress in log panel.
- [ ] Embedded `tools.json` is build-time snapshot of `catalog/v1/tools.json`.
- [ ] Clean-machine E2E per Step 5.
- [ ] Phases 2–5 tracked as **sub-issues** after Phase 1 lands.

---

## References

- Plan: `.claude/plans/floofy-spinning-balloon.md`
- Code: `src-tauri/src/modules/tool_engine/`
- Embedded catalog: `src-tauri/src/modules/tool_engine/tools.json`
- Prior art: Homebrew formulae + bottles, Cargo + crates.io, VS Code marketplace split
- **Isolation / orchestration prior art**: [Nanoclaw](https://github.com/qwibitai/nanoclaw) — containers as boundary, orchestrator outside, explicit mounts, concurrency discipline

# Pengine manifest

## Why we exist

Pengine is for people who host their own assistant—for example with Telegram and carefully chosen add-ons—and want real help without quietly handing the assistant more power than they meant to. You should always know what only you can change versus what the model is allowed to do, so automation stays useful without the model widening its own risk—and so sensitive credentials can stay tied to this device and your physical presence when you decide they should.

## How to think about Pengine

Pengine is a router, not one big lump of software.

Capabilities are split into many small, separate boxes. Each add-on (for example a file helper) typically runs in its own container with tight limits: optional no network, CPU and memory caps, and only the folders you explicitly allowed, mounted in predictable places (such as under `/app/...`).

- Boxes do not talk to each other. They only exchange structured work with the host over a simple pipe from the host process.
- The only places things come together are Pengine itself (the host app: orchestration, HTTP, desktop shell) and the conversation the model sees (tool results in one thread).

If two boxes share data—same database or same folder mount—that is your explicit choice. It is not "boxes discovering each other."

## Trust in layers (not "pricing tiers")

Think bronze, silver, and gold as how deep the trust goes and how strong the isolation is—not as product packages.

| Layer | What it is | Rule of thumb |
| --- | --- | --- |
| Bronze | Model output | Untrusted text. It must never directly become "change who is allowed to do what" or rewrite security. |
| Silver | Tool calls | Allowed only against a fixed, reviewed surface: built-in tools plus allowlisted add-on images you chose. |
| Gold | Policy | Only you, through the app: folder access, which add-ons exist, install/uninstall from a catalog. The model does not get a hidden path to widen this—unless you deliberately add a narrow native "install this approved image" capability and accept the extra prompt-injection risk that comes with it. |

## The line we draw

- You own trust, mounts, catalogs, and credentials when you want them device-bound and presence-aware.
- The model operates inside the lane you already defined—silver, not gold.
- Bronze stays bronze: suggestions and answers are not automatic policy.

## In one sentence

Pengine connects helpful automation to your life in small, bounded pieces—so power flows through your choices, not through whatever the model happens to ask for next.

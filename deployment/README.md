# Pengine deployment

## Production (same host as Pengui)

**Use the Pengui stack** — Pengine is an optional Compose **profile** there, so it shares **`pengui-network`** with nginx (no second compose project, no `external` network).

1. In the Pengui repo, set **`PENGINE_ENABLE=1`** and **`PENGINE_WEB_IMAGE`** (e.g. `ghcr.io/pengine-ai/pengine-web:1.0.1`) in **GitHub Actions variables** or in `~/pengui/deployment/.env`.
2. Deploy Pengui (`deploy.sh` or CI). That runs `docker compose --profile pengine up -d pengine-web`.
3. Nginx proxies to **`http://pengine-app:1422`** (see Pengui `nginx/templates`).

**Do not** run this directory’s `docker compose up` on the same server at the same time — you would get a duplicate **`pengine-app`** name. Remove any old standalone Pengine stack first: `docker rm -f pengine-app` (only if moving to Pengui profile).

## Local / standalone (this repo only)

```bash
cd deployment
docker compose up -d
curl -fsS http://127.0.0.1:1422/ | head
```

## TLS for `pengine.net`

Configure **`PENGINE_SUBDOMAIN`** on the **Pengui** repo (Certbot + nginx vhost); see Pengui `deployment/README.md`.

## Troubleshooting

- **`network … external … not found`**: use **Pengui + `--profile pengine`**, not a separate compose with `external: pengui-network`.
- **`incorrect label com.docker.compose.network`**: never run `docker network create pengui-network` by hand; let Pengui’s `docker compose up` create the network.

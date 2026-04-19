# Pengine deployment (with Pengui on the same host)

## Port

- Compose publishes **`1422:1422`** so the app is on **`http://127.0.0.1:1422/`** on the host and reachable from Pengui’s nginx container as **`http://host.docker.internal:1422/`** (Pengui maps `host.docker.internal` via `extra_hosts`).

## Order of operations

1. **DNS** — `pengine.net` (or your subdomain) A/AAAA → server IP (same host as Pengui if you use Pengui’s TLS + nginx).
2. **GitHub Actions variable** on the Pengui repo: `PENGINE_SUBDOMAIN=pengine.net` so `deploy.sh` adds `-d pengine.net` to Let’s Encrypt and writes `pengine.conf`.
3. **Pengine stack** — `docker compose up -d` in this directory **before** expecting `https://pengine.net` to serve (Pengui deploy does not start Pengine).
4. **Build** — For **`https://<DOMAIN>/pengine/`** path mode, build with Vite `base: '/pengine/'`. For **`https://pengine.net/`** only, default `base: '/'` matches `VITE_APP_ORIGIN` in the Dockerfile.

## Verify

```bash
curl -fsS http://127.0.0.1:1422/ | head
# From Pengui nginx container:
docker compose -f ~/pengui/deployment/docker-compose.yml exec nginx \
  wget -qO- --timeout=5 http://host.docker.internal:1422/ | head
```

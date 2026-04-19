# pengine-web: Vite → `dist/`, served by static-web-server (not Next.js — no `.next` or `node server.js`).
#
# Build:  docker build -f deploy/Dockerfile .
# Context: repository root (see /.dockerignore). `src-tauri/` is excluded.

# --- Build stage ---
FROM oven/bun:1.2.23-alpine AS builder

WORKDIR /app

ENV HUSKY=0
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

ARG VITE_APP_ORIGIN=https://pengine.net
ENV VITE_APP_ORIGIN=${VITE_APP_ORIGIN}

RUN bun run build:web

# --- Production: static file server (default CMD/ENTRYPOINT from upstream image) ---
FROM ghcr.io/static-web-server/static-web-server:2-alpine AS runner

USER root
RUN apk add --no-cache curl wget
USER sws

COPY --chown=sws:sws --from=builder /app/dist /home/sws/public

ENV SERVER_HOST=0.0.0.0
# Same port as Vite dev (`vite.config.ts`) for a consistent ops story.
ENV SERVER_PORT=1420
ENV SERVER_ROOT=/home/sws/public
ENV SERVER_FALLBACK_PAGE=/home/sws/public/index.html
ENV SERVER_LOG_LEVEL=error

EXPOSE 1420

# SPA: fallback page is already set; short start — no Node boot delay
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:1420/ >/dev/null || exit 1

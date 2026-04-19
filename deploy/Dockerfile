# pengine-web: **website only** — same static bundle the Tauri desktop shell loads from
# `dist/`, without building or running the native app.
#
# Mirrors `src-tauri/tauri.conf.json`:
#   - `build.beforeBuildCommand` → `npm run build:ci` (→ `build:web`)
#   - `build.frontendDist`       → `../dist` (this image serves that folder on :80)
#
# Intentionally omitted: `tauri build`, Cargo, `src-tauri/` (see /.dockerignore).
#
# Build:  docker build -f deploy/Dockerfile .
# Context: repository root (see /.dockerignore).

FROM oven/bun:1 AS build
WORKDIR /app

ENV HUSKY=0
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

ARG VITE_APP_ORIGIN=https://pengine.net
ENV VITE_APP_ORIGIN=${VITE_APP_ORIGIN}

# CI may inject this file from `main` while `package.json` comes from an older tag without
# `build:ci` / `build:web`. Prefer those scripts when present; otherwise match `build:web` (`tsc` + vite).
RUN node -e "\
const fs = require('fs');\
const { execSync } = require('child_process');\
const s = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};\
const cmd = s['build:ci'] ? 'npm run build:ci'\
  : s['build:web'] ? 'npm run build:web'\
  : 'npx tsc && npx vite build';\
execSync(cmd, { stdio: 'inherit', shell: '/bin/sh' });\
"

FROM ghcr.io/static-web-server/static-web-server:2-alpine
USER root
RUN apk add --no-cache wget
USER sws

COPY --chown=sws:sws --from=build /app/dist /home/sws/public

ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=80
ENV SERVER_ROOT=/home/sws/public
ENV SERVER_FALLBACK_PAGE=/home/sws/public/index.html
ENV SERVER_LOG_LEVEL=error

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

#!/usr/bin/env bash
# EchoVault AI — one-command local setup.
# Installs deps, prepares env + secrets, builds shared packages, generates the
# Prisma client, and (optionally) starts Postgres + Redis via Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m▶ %s\033[0m\n' "$1"; }

# 1. Environment file with generated secrets.
if [ ! -f .env ]; then
  say "Creating .env from .env.example with generated secrets"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    ACCESS=$(openssl rand -hex 32)
    REFRESH=$(openssl rand -hex 32)
    ENCKEY=$(openssl rand -hex 32)
    # Portable in-place sed (Linux + macOS).
    sed -i.bak "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${ACCESS}|" .env
    sed -i.bak "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${REFRESH}|" .env
    sed -i.bak "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCKEY}|" .env
    rm -f .env.bak
    say "Generated JWT secrets and a 32-byte AES-256 encryption key"
  else
    echo "  (openssl not found — edit .env and set real secrets before production)"
  fi
else
  say ".env already exists — leaving it untouched"
fi

# 2. Dependencies.
say "Installing workspace dependencies"
npm install

# 3. Build shared libs + generate Prisma client.
say "Building shared + audio-engine"
npm run build --workspace @echovault/shared
npm run build --workspace @echovault/audio-engine

say "Generating Prisma client"
npm run prisma:generate --workspace @echovault/backend

# 4. Optionally start infra.
if command -v docker >/dev/null 2>&1; then
  say "Starting Postgres + Redis (docker compose)"
  docker compose up -d postgres redis
  echo "  Run database schema:  npm run prisma:migrate:dev --workspace @echovault/backend"
else
  echo "  Docker not found — start Postgres + Redis yourself, then run prisma migrate."
fi

cat <<'EOF'

✅ Setup complete.

Next:
  1. Backend:    npm run dev:backend     (http://localhost:3000, docs at /docs)
  2. Web app:    npm run dev:web         (http://localhost:5173)
  3. Extension:  npm run build --workspace @echovault/extension
                 then load apps/extension/dist as an unpacked extension.

Demo login (after `npm run prisma:seed --workspace @echovault/backend`):
  demo@echovault.ai / echovault-demo
EOF

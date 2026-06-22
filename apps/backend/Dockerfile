# syntax=docker/dockerfile:1
# Multi-stage build for the EchoVault backend.

# ---- Builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install OpenSSL (required by Prisma engines).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests for cached installs.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/audio-engine/package.json packages/audio-engine/
COPY apps/backend/package.json apps/backend/

RUN npm install

# Copy sources and build shared + backend.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend

RUN npm run build --workspace @echovault/shared \
  && npm run prisma:generate --workspace @echovault/backend \
  && npm run build --workspace @echovault/backend

# ---- Runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

EXPOSE 3000
WORKDIR /app/apps/backend

# Create/update the schema, then start. `migrate deploy` applies committed
# migrations in production; `db push` bootstraps the schema when no migrations
# exist yet (demo/first run). Falls through to start the API either way.
CMD ["sh", "-c", "npx prisma migrate deploy 2>/dev/null || npx prisma db push --skip-generate --accept-data-loss; node dist/main.js"]

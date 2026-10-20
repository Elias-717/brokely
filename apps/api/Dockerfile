# Brokely sync API image (Azure Container Apps, D-71). Build from the REPO ROOT:
#   docker build -f apps/api/Dockerfile -t brokely-api .
# Settings come from the environment at run time, never from the image:
#   DATABASE_URL (secret, Supabase pooler URL), SUPABASE_URL, PORT (default 8080).

# ── Build: install the API's workspace dependencies and bundle to one file ──
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@10.28.0

# Manifests first, so dependency layers are cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/local-db/package.json packages/local-db/
# No install scripts: the bundle needs none, and test-only native modules (better-sqlite3)
# would otherwise compile here for nothing.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @brokely/api...

COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter @brokely/api build

# ── Run: Node and the bundle only ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.mjs"]

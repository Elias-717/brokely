# Brokely sync API

Fastify server for `POST /v1/sync/push` and `GET /v1/sync/pull` (docs/design/sync-api.md).
Database and sign-in: Supabase project `swkakkylbsewewulxgra` (Singapore, D-64).
Hosting: Azure Container Apps `brokely-api` in `brokely-rg` (East Asia, D-71).

## Run and test

```bash
pnpm --filter @brokely/api test        # PGlite (Postgres 17 in-process); no Docker or database needed
pnpm --filter @brokely/api build       # bundle to dist/server.mjs
DATABASE_URL=… SUPABASE_URL=https://swkakkylbsewewulxgra.supabase.co pnpm --filter @brokely/api start
```

| Setting | What | Where it lives |
|---|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** URI + `?sslmode=require` (IPv4; the direct host is IPv6-only) | Azure secret `database-url`. Never in the repo or a chat |
| `SUPABASE_URL` | `https://swkakkylbsewewulxgra.supabase.co` (public) | Azure environment variable |
| `PORT` | 8080 (set in the image) | Ingress target port and all three probes must match |

## Database changes

Edit `src/db/schema.ts` → `pnpm --filter @brokely/api db:generate` → tests → apply the new file in `drizzle/` to
Supabase under the same name (Supabase MCP `apply_migration` or the SQL editor). Rules Drizzle can't express go in a
`drizzle-kit generate --custom` migration.

## Deploys

Every push to `main`: `check` → `api-image` (build, smoke test, push `ghcr.io/elias-717/brokely-api:<commit>` and
`:latest`) → `api-deploy` (new revision with the `<commit>` image, then waits for `/health`).

`api-deploy` signs in to Azure with OpenID Connect: Azure trusts tokens GitHub issues for this repo's `production`
environment, so no password or key is stored. It is skipped until this one-time setup is done:

1. **Azure portal → Microsoft Entra ID → App registrations → New registration.** Name `brokely-github-deploy`,
   single tenant, no redirect URI. From its Overview, note **Application (client) ID** and **Directory (tenant) ID**.
2. In that registration: **Certificates & secrets → Federated credentials → Add credential** →
   scenario **GitHub Actions deploying Azure resources**: organization `Elias-717`, repository `brokely`,
   entity type **Environment**, environment name `production`, credential name `brokely-main`.
3. **Resource groups → `brokely-rg` → Access control (IAM) → Add role assignment** → role
   **Container Apps Contributor** (Job function roles; only Container Apps, not the whole group like Contributor) →
   members: *User, group, or service principal* → select `brokely-github-deploy`. Scoped to this resource group.
   Subject identifier of the federated credential (step 2): `repo:Elias-717/brokely:environment:production`
   (GitHub's default token subject; Azure's generated `…@{id}` form only matches if the repo opted into ID-based subjects).
4. **Subscriptions** → note the **Subscription ID** of the subscription that holds `brokely-rg`.
5. **GitHub → repo Settings → Secrets and variables → Actions → Variables tab** → add three repository
   variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. These IDs are not secrets (they grant
   nothing without the federated trust), so they are variables, not secrets.
6. Optional: **Settings → Environments → `production`** (created by the first run) → *Deployment branches*: `main`
   only, or *Required reviewers* to approve each deploy.

If step 1 is refused (some student tenants block app registrations), use **Container App → Settings → Deployment**
instead, or deploy by hand: Containers → Edit and deploy → image tag `<commit>`.

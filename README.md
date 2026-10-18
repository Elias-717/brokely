# 🥦 Brokely

A student-first expenditure planning app for Android, with a money-growing broccoli companion.

Brokely helps university students plan what they intend to spend, cover essentials like meals and
laundry first, log what they actually spend (offline, with or without an account), track money owed to
and from friends, and see honest insights. It is a gamified experience: the Brokely mascot grows from
good money habits, and notifications are written to be fun.

> Status: **Phase 0 (prepare)**. Agents and new contributors: start with [AGENTS.md](AGENTS.md). Requirements v1.1 are drafted; the domain package has its first money
> rules and tests. See the development plan below.

## Repository layout

```
apps/
  mobile/        Expo (React Native) app — development builds, Kotlin TNG listener in 0.2
  api/           Fastify sync API + PostgreSQL (Phase 4)
packages/
  domain/        Pure business rules from SRS section 5 (money, coverage, forecast, debts, XP)
  contracts/     Zod schemas shared by the app and the API
docs/
  requirements/  PRD and SRS v1.1
  project/       Decision log, glossary, interview guide
```

## Getting started

Requirements: Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm check        # format check, lint, typecheck, tests
pnpm test         # tests only
```

The mobile app is created in Phase 3; see `apps/mobile/README.md`.

## Engineering rules

- **Money is whole sen.** No floating-point ringgit anywhere (NFR-01). Rounding is half-even and only for display (R-03).
- **Business rules are pure and tested.** Every formula in `packages/domain` has unit tests tied to SRS acceptance tests.
- **Offline first.** Every record gets a phone-generated ID and goes through an outbox (FR-SYNC-03/04).
- **Public repo, private data.** Never commit spending exports, real notification samples, interview notes or secrets.
- **Conventional Commits** for messages; `pnpm check` must pass before pushing.

## Development plan

| Phase | Goal |
|---|---|
| 0 Prepare | Interviews, TNG notification spike, repo setup |
| 1 Design | ERD, sync API contract, wireframes, mascot art brief |
| 2 Domain core | All business rules in `packages/domain`, tested against the SRS |
| 3 Offline app | Every 0.1 screen working on the phone without a server |
| 4 Backend + sync | Accounts, PostgreSQL, push/pull sync with idempotency and conflicts |
| 5 Release 0.1 | Quality targets, privacy review, usability pilot |
| 6 Release 0.2 | TNG import, fun notifications, Brokely mascot and XP |
| 7 Decide 0.3 | Coins and cosmetics only if the pilot wants them |

## Stack

TypeScript everywhere · React Native + Expo (dev builds) · Expo Router · expo-sqlite + Drizzle ·
Zustand · Zod · Fastify · PostgreSQL · Vitest · Maestro · GitHub Actions · EAS Build

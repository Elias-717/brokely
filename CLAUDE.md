# Brokely — working notes for Claude

Brokely is a learning-oriented project: explain engineering decisions, don't just generate code.

## Sources of truth
- Behaviour, formulas, data and tests: `docs/requirements/Brokely_Software_Requirements_Specification_v1.1.docx` (SRS). Reference requirement IDs (FR-, BR-, NFR-, AC-) in code comments and tests.
- Scope, users and success: the PRD in the same folder.
- Decisions: `docs/project/decision-log.md`. Terms: `docs/project/glossary.md` (use only these words in UI text).

## Rules
- Money is always whole sen (`Sen` in `@brokely/domain`). Never use floating-point ringgit.
- All BR-xx calculations live in `packages/domain` as pure functions with tests. No React, storage or network code there (NFR-02).
- This repo is public: never commit spending exports, real notification text with names, interview notes, secrets or `.env` files.
- Run `pnpm check` (format, lint, typecheck, test) before committing.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Layout
- `apps/mobile` — Expo app (development builds, D-10)
- `apps/api` — Fastify sync API (Phase 4)
- `packages/domain` — business rules
- `packages/contracts` — Zod schemas shared by app and API

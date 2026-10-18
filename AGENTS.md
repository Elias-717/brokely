# AGENTS.md — Brokely

This file is the working memory for any AI agent (or new developer) on Brokely.
**Read it fully at the start of every session. Update the "Current state" section at the end of every session.**
If anything here conflicts with the SRS, the SRS wins for behaviour and the PRD wins for scope; then fix this file.

---

## 1. What Brokely is

A student-first **expenditure planning** app for Android (Malaysia, first pilot at AIU).
Students plan what they intend to spend, cover essentials first (meals, laundry, groceries), log real
spending offline, track money owed to and from friends, and see honest insights.
It is a **gamified experience**: the **Brokely mascot**, a broccoli that grows money instead of leaves,
grows from good habits, and every notification is fun.

**Not** a bank-balance tracker, payment app or lending app. No bank logins, PINs or OTPs, ever.

**How we work:** this is a learning-oriented project. Explain *why* behind decisions, keep changes small
and reviewable, and prefer clarity over cleverness. Ask the user before making product decisions.

---

## 2. Sources of truth (read before changing behaviour)

| What | Where |
|---|---|
| Behaviour, formulas (BR-xx), data model, quality targets (NFR-xx), acceptance tests (AC-xx) | `docs/requirements/Brokely_Software_Requirements_Specification_v1.1.docx` |
| Why, users, scope per release, success measures | `docs/requirements/Brokely_Product_Requirements_Document_v1.1.docx` |
| Every decision with its consequences (D-xx, R-xx) | `docs/project/decision-log.md` |
| Words allowed in UI and docs | `docs/project/glossary.md` |
| Student interview script | `docs/project/interview-guide.md` |

To read a .docx: `pandoc -t markdown <file>`.
**Pending:** decisions D-10 to D-17 and R-09 are newer than SRS/PRD v1.1. Until v1.2 exists, the decision log overrides v1.1 where they differ.

---

## 3. Current state (update every session)

- **Date of last update:** 2026-10-19
- **Phase:** 0 — Prepare
- **Done:**
  - PRD and SRS v1.1 written; decision log D-01…D-17, R-01…R-09
  - Interview guide written; research on the author's spending data done (kept private, not in repo)
  - TNG notification samples: transfer out and transfer in captured (format in section 8)
  - Monorepo scaffold pushed; CI green; `packages/domain/src/money.ts` with 12 tests
  - First local install on the author's Windows machine; `pnpm-lock.yaml` committed; CI uses `--frozen-lockfile` + `cache: pnpm`
  - `.gitattributes` forces LF (Windows `core.autocrlf=true` broke Prettier checks)
- **In progress / waiting on the user:**
  - 5 student interviews
  - TNG samples still needed: QR merchant payment, top-up, refund, and hidden notification extras (is there a transaction ID?)
  - Generate the Expo app in `apps/mobile` (commands in `apps/mobile/README.md`)
- **Next agent tasks:**
  1. After interviews: update PRD/SRS to v1.2 with D-10…D-17, R-09 and interview findings
  2. Phase 1: logical ERD from SRS section 7
- **Open questions:** see section 11

---

## 4. Rules that must never be broken

1. **Money is whole sen.** Use the `Sen` type from `@brokely/domain`. Never floating-point ringgit. Amounts are stored positive; the transaction *type* gives the effect (R-04).
2. **Round only for display**, half-even, with `roundHalfEven` (R-03). Sums are exact.
3. **Business rules live in `packages/domain`** as pure functions with unit tests. No React, database, network or `Date.now()` inside; pass "today" in as an argument (NFR-02).
4. **Every rule and test references its ID** (BR-, FR-, AC-, D-, R-) in a comment or test name.
5. **Offline first.** Every record gets a phone-generated UUID (prefer UUIDv7). Every write goes into the outbox in the same database transaction (FR-SYNC-03/04).
6. **Never claim a balance.** The UI says "left in plan", never "balance" (BR-12). Use only glossary words.
7. **Public repo, private data.** Never commit spending exports, real notification text with names, interview notes, secrets or `.env` files. Anonymise fixtures (e.g. `[FRIEND A]`).
8. **No paid AI services** in the product (NFR-20). Notification text comes from local templates.
9. **Fun never replaces clarity.** Notifications: fact and action first, exact numbers, no shaming for essentials or overspending (D-07, SRS section 6).
10. **The mascot never affects money.** XP comes from habits only, never from spending less (BR-26).
11. **Don't invent product decisions.** If a requirement is missing or unclear, ask the user, then record the answer in the decision log.

---

## 5. How to work in a session

1. Read this file. Run `git pull` and `git log --oneline -10`.
2. Pick the next task from section 3 (or what the user asked). Find its IDs in the SRS.
3. For a domain rule: **write the test first from the SRS example**, then the code.
4. Run `pnpm check` (format check, lint, typecheck, tests). All must pass.
5. Commit with Conventional Commits (`feat(domain): …`, `fix:`, `test:`, `docs:`, `chore:`). Small commits; one idea each.
6. Push to `main` (until the team grows, then use pull requests). Confirm CI is green: `gh run list -R Elias-717/brokely --limit 1`.
7. **Update section 3** of this file and, if a decision was made, `docs/project/decision-log.md`.
8. Tell the user in plain words what changed, what's next and anything you need from them.

**Definition of done:** the code matches the SRS IDs it claims, tests cover the SRS examples, `pnpm check` passes, CI is green, docs and this file are updated.

---

## 6. Development plan

Build from the inside out: correct numbers first, then the offline app, then the server.

| Phase | Goal | Exit criterion |
|---|---|---|
| **0 Prepare** | Interviews, TNG spike, repo setup | "Before ERD" questions closed; TNG samples collected |
| **1 Design** | ERD with keys and constraints; sync contract (`POST /sync/push`, `GET /sync/pull?since=`); low-detail wireframes; mascot art brief (3 stages × 4 moods) | Golden path (AC-04) traced through every table and endpoint on paper |
| **2 Domain core** | BR-01…BR-26 in `packages/domain`; AC-02…AC-17 as automated tests; backtest data from the author's months as fixtures | 100% of BR-xx covered by tests |
| **3 Offline app** | expo-sqlite + Drizzle, repositories (record + outbox in one transaction). Screens in order: plan wizard → quick add/records (with splits) → Home → bills/Mark paid → debts → insights → check-in → settings/export | All of 0.1 works on one phone, offline, without an account |
| **4 Backend + sync** | Fastify + PostgreSQL; sign-in (choose the provider at the start of this phase); idempotent push, versioned writes, reject-and-notify conflicts, delete markers, pull cursor; local-only → account linking | AC-20…AC-24 pass between two real phones |
| **5 Release 0.1** | NFR checks, accessibility, privacy review (PDPA), export/delete, backup drill, usability pilot (5–10 students) | AC-01…AC-30 pass; Play internal testing |
| **6 Release 0.2** | Kotlin TNG listener (Expo Modules API) + parser on fixtures; pending imports, dedup, "Already logged?", merchant memory; fun notification engine; mascot pictures and XP; fill-a-gap estimates; cycle comparison | AC-31…AC-44 pass on a real phone with real TNG payments |
| **7 Decide 0.3** | Coins and cosmetics only if the pilot wants them | Pilot data reviewed |

---

## 7. Architecture and stack

```
apps/mobile        React Native + Expo (development builds; Expo Go NOT used — D-10)
                   Expo Router · expo-sqlite + Drizzle · Zustand (UI state only) · react-hook-form + Zod
                   expo-secure-store (tokens) · expo-notifications (local only, no push server)
                   modules/tng-listener: Kotlin NotificationListenerService (0.2)
apps/api           Node 22 + Fastify · PostgreSQL + Drizzle · Zod contracts · hosted in a Singapore region
packages/domain    pure TypeScript business rules (imported by app and API)
packages/contracts Zod request/response schemas (imported by app and API)
```

Tooling: pnpm workspaces (`node-linker=hoisted` for React Native) · TypeScript strict · ESLint · Prettier ·
Vitest · Testcontainers (API) · Maestro (phone end-to-end) · GitHub Actions · EAS Build.

Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`); no build step.

---

## 8. Domain quick reference (full rules: SRS section 5 + decision log)

**Plan.** B = budget, Cᵢ = category allocations, Sⱼ = set-asides (a category of kind `set_aside`).
Planned spending P = ΣCᵢ. Unallocated U = B − (ΣCᵢ + ΣSⱼ); U < 0 is a shortfall that must be acknowledged.
Edits create revisions; the original is kept; daily guidance uses the latest; cycle summary shows original → final → actual.

**Cycles.** User enters inclusive start/end dates; stored as `[start, end + 1 day)` local dates. At most one active cycle per date. A transaction belongs to the cycle containing its local date (derived, not stored).

**Transactions.** Types: purchase, refund (links to its purchase, cannot exceed what's unrefunded), transfer, borrow, lend, repayment_received, repayment_made, write_off. A purchase can be split into a spending line + debt lines; lines must sum to the amount (D-01).
Spending N = purchase lines − refunds + receivable write-offs. Transfers and debt principal are never spending.
Category remaining = Cᵢ − Nᵢ (may be negative). Left in plan = B − N.

**Bills.** Repeat daily, on weekdays, every N days/weeks, monthly, or once (D-17). "Mark paid" creates one linked transaction with an editable amount; the item leaves "still to come". Never counted twice.

**Progress.** Covered day = a spending entry or a "No spending today" check-in. Elapsed days = days before today + today if covered. Coverage = covered ÷ elapsed. Daily average = N ÷ elapsed. Everyday rate = (N − bill-linked spending) ÷ elapsed.
**Forecast** = N + still to come + everyday rate × days left, shown **only from day 14 with coverage ≥ 70%**, as a **range** (R-09). Pace = over pace if forecast (middle) > P. Estimated "gap fill" entries (0.2) count as spending but not as covered days and not in the everyday rate.

**Debts.** Outstanding = principal − repayments − write-offs ± audited adjustments; never negative without an adjustment. Writing off money owed to you becomes spending in a chosen category (R-07).

**Imports (0.2).** Every TNG capture becomes a pending import and counts for nothing until confirmed (D-02). Person-to-person transfers must be given a type. Unknown wording: never guess an amount. Raw text deleted on confirm/dismiss or after 30 days.
Known TNG formats (no transaction ID in visible text; dedupe on Android notification key + post time + content):
- Transfer out — title `Transfer Successful.` body `RM 0.50 has been successfully transferred to [NAME].`
- Transfer in — title `Ka-ching! Incoming Money.` body `RM 0.50 received from [NAME] for Fund Transfer.`

**Mascot and XP (0.2).** Static pictures, no voice. ≥3 growth stages (XP level), ≥4 moods: happy (on track), worried (over pace), proud (3+ day streak), sleepy (3+ days unlogged). Initial XP: approve plan 50, log 5, check-in 5, Mark paid 5, confirm import 2, weekly review 20; daily cap 100; once per source event.

**Notifications (0.2).** Bill due, evening logging reminder, streak, pace, debt due, pending import. Max 3/day, quiet hours, per-type mute, ≥3 wording variants each. Example: `🧺 Laundry day! Your RM16.00 wash is due. Tap Mark paid once it's spinning.`

**Default categories.** Decided: Meals (essential), Snacks & treats (optional), Groceries & toiletries (essential) — D-12, D-14. Proposed, not yet confirmed: Laundry, Transport, Phone & data (essential); Fun (optional); Emergency (set-aside). Confirm the full list with the user after interviews.

---

## 9. Releases at a glance

- **0.1 Core:** planning, set-asides, bills + Mark paid, transactions with splits, debts + write-off, insights + honest forecast, check-in, local-only mode, accounts, offline sync, export/delete.
- **0.2 Automation and fun:** TNG import with confirmation, merchant memory, fun notifications, mascot + XP + streaks, fill-a-gap estimates, cycle comparison.
- **0.3 Extras (if confirmed):** coins and cosmetics.
- **Out of scope for v1:** bank balances, payments, loans, iOS, social features, paid AI, multi-category splits.

---

## 10. Repo map and commands

```
AGENTS.md            ← this file
CLAUDE.md            ← points here
apps/api/src         app.ts (buildApp), server.ts, *.test.ts
apps/mobile          README with setup steps (Expo app not generated yet)
packages/domain/src  money.ts (+ tests); future: cycle.ts, spending.ts, forecast.ts, debts.ts, xp.ts
packages/contracts   Zod schemas
docs/requirements    PRD, SRS (.docx)
docs/project         decision log, glossary, interview guide
.github/workflows    ci.yml
```

```bash
pnpm install         # install
pnpm check           # format check + lint + typecheck + tests (run before every commit)
pnpm test            # tests only
pnpm format          # auto-format
pnpm --filter @brokely/api dev   # run the API locally
```

---

## 11. Open questions (do not guess; ask the user)

| When | Question |
|---|---|
| Before ERD | Full TNG notification formats (QR payment, top-up, refund) and whether a transaction ID exists in notification extras |
| Before ERD | Plan status transitions (draft → active → completed → archived) and what happens when an active cycle's end date passes |
| Before ERD | Forecast range method (proposal: everyday-rate part ±15%, rounded to RM10) |
| After interviews | Wallet check (D-16): add an optional manual balance check or keep "no balances" strict? |
| After interviews | Keep Meals / Snacks & treats split (D-12)? |
| Phase 4 start | Sign-in provider (library inside our API, e.g. Better Auth, vs managed, e.g. Firebase Auth); hosting provider |
| Before 0.1 testing | Reference test device (NFR-06) |
| During pilot | Coverage threshold (70%), XP values, notification cap |

---

## 12. Things that went wrong before (avoid repeating)

- This cloud workspace may not reach the npm registry. If installs fail, write code without installing, verify pure logic with Node's built-in test runner (`node --test`, TypeScript type stripping), and let CI or the user's machine do the full install.
- On the author's Windows machine, `corepack enable` fails (no admin rights for Program Files). pnpm is installed with `npm install -g pnpm@<version from package.json>` instead.
- The first Vitest run on Windows can time out (antivirus scanning fresh `node_modules`); re-run before debugging.
- Markdown is excluded from Prettier (`.prettierignore`) because table formatting differences broke format checks.
- A first 2-week data sample overstated treats (35%); 6 months showed ~10%. Don't generalise from small samples; label evidence size.

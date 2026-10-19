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
| Behaviour, formulas (BR-xx), data model, quality targets (NFR-xx), acceptance tests (AC-xx) | `docs/requirements/Brokely_Software_Requirements_Specification_v1.6.docx` |
| Why, users, scope per release, success measures | `docs/requirements/Brokely_Product_Requirements_Document_v1.5.docx` |
| Every decision with its consequences (D-xx, R-xx) | `docs/project/decision-log.md` |
| Data model and sync API | `docs/design/erd.md`, `docs/design/sync-api.md` |
| Screens (wireframes) | `docs/design/wireframes.md` → Figma file `Hm2YNImm4pKtD11ke0iPKb` |
| Words allowed in UI and docs | `docs/project/glossary.md` |
| Student interview script | `docs/project/interview-guide.md` |

To read a .docx: `pandoc -t markdown <file>`.
SRS v1.6 (PRD v1.5) includes every decision up to D-27 and R-13; D-28 is layout only (no requirement change). SRS section 15 is the change record: **whenever a requirement changes, add a row there** (ID, type, what changed, decision) so traceability is never lost. Requirement IDs are never reused.

---

## 3. Current state (update every session)

- **Date of last update:** 2026-10-20 (Phase 3 session 2)
- **Phase:** 3 — Offline app **in progress** (started 2026-10-19): repositories, migrations, app shell, theme with dark mode, S1 Welcome and quick start (S1c/S1b/S1d) done; next is S3a Home with essential cards
- **Done:**
  - PRD and SRS v1.1 written, then v1.2; decision log D-01…D-21, R-01…R-10
  - Interview guide written; research on the author's spending data done (kept private, not in repo)
  - TNG notification samples: transfer out and transfer in captured (format in section 8)
  - Monorepo scaffold pushed; CI green; `packages/domain/src/money.ts` with 12 tests
  - First local install on the author's Windows machine; `pnpm-lock.yaml` committed; CI uses `--frozen-lockfile` + `cache: pnpm`
  - `.gitattributes` forces LF (Windows `core.autocrlf=true` broke Prettier checks)
  - Decisions D-18, D-19 (cycle lifecycle, completed cycles editable) and R-10 (forecast range)
  - ERD v0.2: `docs/design/erd.md`; decisions D-20 (one draft revision) and D-21 (used categories archive-only)
  - SRS and PRD v1.2 with full traceability (SRS: 92 FRs ↔ 51 ACs; PRD: 19 requirements cover every FR; change record in SRS section 15)
  - Sync API design v0.1: `docs/design/sync-api.md` (push/pull, aggregates, versions, deterministic IDs, error codes)
  - Contracts: `packages/contracts` has Zod schemas for every synced entity and the push/pull envelopes, with 25 tests and shared fixtures
  - Expo app generated in `apps/mobile` and pushed (SDK 58, blank-typescript, dev client, EAS linked; package `com.elias717.brokely`); not yet run on a phone
  - **Phase 2 domain core:** `packages/domain` implements BR-01…BR-28 (dates, cycles, bills, plan, spending, progress/forecast, debts, XP) with 85 tests; every BR is covered (see `docs/design/domain-rules.md`). New sync error code `DEBT_EXCEEDS_OUTSTANDING` (contracts + sync-api §6)
  - Phone database schema: `packages/local-db` (Drizzle sqlite-core, driver-free) with 11 constraint tests on in-memory better-sqlite3 (merged via PR #2; drizzle-orm 0.44.7, drizzle-kit 0.31.11, better-sqlite3 12.11.1)
  - Wireframes v0.5: 22 low-fidelity screens in Figma, file `Hm2YNImm4pKtD11ke0iPKb`; screen → ID map and checked example numbers in `docs/design/wireframes.md`; **D-28** layout choices (quick add Spent | Money in | More; shortfall asks "Approve anyway?"; mascot small on Home + own Brokely screen; forecast one line on Home)
  - **D-23 lighter first run** (author's request): Welcome with one Brokely picture (0.1) → Quick start (budget + dates) → Home with essential cards one at a time; guided setup optional. **R-11**: pace compares with the budget while P = 0 (`paceTarget`, 89 domain tests). SRS v1.4 (FR-PLN-19/20, FR-MAS-08, AC-53…56), PRD v1.3 (PRD-20), glossary v1.3, mascot brief asks for `brokely_welcome.png` first
  - **D-24 usability review** of the wireframes (U-01…U-11 in `docs/design/wireframes.md`): centre + tab bar (Home · Records · + · Insights · More), Undo after save (FR-TXN-10, AC-57), one-line quick start, Later on essential cards, 48 dp targets. SRS v1.5, PRD v1.4
  - **D-25 mid-month start** (Start fresh / Catch me up) with **R-12** (progress counts from `tracking_start_date`); **D-26 money in** (transaction type `income`, plan suggestion); **D-27 wallet check** (resolves D-16) with **R-13** (expected since the last check). Domain `midMonthStart`, `moneyInSuggestion`, `wallet.ts` (104 tests); contracts `income`, `trackingStartDate`, `WalletCheckSchema`, entity `wallet_check`; phone DB `tracking_start_date`, `wallet_checks`. SRS v1.6 (FR-PLN-21, FR-TXN-11, FR-WAL-01…04, BR-29…31, AC-58…63), PRD v1.5 (PRD-21…23)
  - **Phase 3 repositories** (`packages/local-db/src/repositories/`): every user action runs in one SQLite transaction that checks `@brokely/domain` rules, writes the rows and one outbox operation per aggregate with the payload validated by `@brokely/contracts` (FR-SYNC-04, S-01). Categories (AC-52, AC-27), quick start incl. catch-up entry (AC-53, AC-59), revisions + shortfall (AC-06, AC-03, AC-29), transactions with edit history and delete markers/Undo (AC-04/05/09/10, AC-57), money in (AC-61), debts (AC-08/10/11, BR-22), check-ins (AC-30), wallet checks (AC-62/63; a logged difference is dated 1 ms before its check), bills with stored scheduled items + Mark paid/skip (AC-12/19/26), essential cards (AC-54). IDs and clock injected (`RepoContext`). 80 local-db tests
  - **D-29** (author): only Laundry and Phone & internet cards create a bill (`fixedBill` in `DEFAULT_CATEGORIES`); other cards only set an allocation
  - **D-30** card choices remembered on the phone only; **D-31** visual style = "vintage cartoon" (cream, ink, broccoli green, mustard; Lilita One + Nunito); **D-32** dark mode in 0.1 ("vintage at night"), follows the phone setting. Mockups: claude.ai artifact "Brokely style directions". SRS/PRD need a dark-mode requirement in the next revision
  - First debug build runs on the emulator (Windows build setup in section 12)
  - Theme (D-31/D-32): light + dark tokens in `apps/mobile/src/ui/theme.ts`, `ThemeProvider` (Light / Dark / Same as phone under More, stored in phone-only `local_prefs`, migration 0001), bundled Lilita One + Nunito (3 weights), sticker cards, stroke tab icons (react-native-svg), expo-system-ui
  - Quick start S1c/S1b/S1d (`app/quick-start/`), date picker (@react-native-community/datetimepicker), `parseAmount` in domain (typed money to exact sen); shared form pieces in `src/ui/form.tsx`
  - Contracts: `scheduledItemId(billId, dueDate)` = UUIDv5 under `BROKELY_ID_NAMESPACE` (S-05), value pinned by a test; uuid 11.1.0
  - App dependencies via `expo install` (expo-sqlite, expo-router + peers, expo-crypto), drizzle-orm, `@brokely/local-db`, uuid (v7 from expo-crypto bytes). Migration `packages/local-db/drizzle/0000_initial.sql` + `migrations.js` (export `@brokely/local-db/migrations`); a test fails if `schema.ts` changes without `db:generate`. Metro `.sql` + babel inline-import
  - App shell: `app/_layout.tsx` runs migrations first; tabs Home · Records · (+) · Insights · More; + opens `quick-add` modal; first run (no categories) → **S1 Welcome** with `main_design.png`. `CI=1 npx expo export --platform android` bundles (3.2 MB). Not yet run on a phone
- **Deferred (user decision, 2026-10-19):**
  - Student interviews: skipped for now because of time. Decisions that waited on them (D-12 Meals / Snacks split) stay provisional; categories (D-22) and wallet check (D-27) were decided early by the author; ask the user when one becomes blocking.
  - TNG samples (QR payment, top-up, refund, notification extras): delayed until the author has testing access. 0.2 import design stays provisional.
  - **Mascot art delivered** (commit 3b535fb): `apps/mobile/assets/mascot/` has all 12 pictures `brokely_s{1-3}_{happy,worried,proud,sleepy}.png` plus `main_design.png`. **The 0.1 welcome screen uses `main_design.png`** (author's choice; replaces the planned `brokely_welcome.png`). Total is ~15 MB of PNG: convert to WebP / resize (≈512 px) before release to meet the ≤ 5 MB budget (NFR-19); keep the PNG sources.
  - **Handoff (2026-10-19):** work moves from the claude.ai cloud workspace to **Claude Code on the author's Windows machine**. Locally the npm registry works, so dependencies can be installed and `pnpm-lock.yaml` updated directly (the "cannot update the lockfile" limitation in section 12 applies only to the cloud workspace).
- **Next agent tasks (Phase 3 — offline app; exit: all of 0.1 works on one phone, offline, no account):**
  1. **Run on the author's phone** with a development build (`npx expo run:android` or `eas build --profile development --platform android`) to prove migrations + S1 on a real device before building many screens; name the reference device (NFR-06)
  2. **Screens in this order**, each from its Figma frame (`docs/design/wireframes.md`; S1 = node 9:288, S1b 9:306, S1c 16:330, S1d 16:349): S3a Home with essential cards (`acceptEssentialCard`; card queue Later/Not for me per cycle in `local_prefs`, D-30) → S4/S4c quick add with Undo (`recordPurchase`, `recordMoneyIn`, `deleteTransaction`) → S5 Records → S6/S6b Bills + Mark paid → S7/S7b Debts → S8 Insights (`computeProgress`) → S11 Wallet check → S9 More, settings (`user_settings` repo still missing), export/delete → S10 cycle finished. Guided setup S2a–S2d after the main flow.
  3. Repositories still missing: user settings, guided-setup draft revisions (D-20, AC-47), start next cycle (AC-48), export
  4. Later: server database schema (Drizzle + PostgreSQL) before Phase 4; SRS v1.7 / PRD v1.6 (add D-29…D-32 to the change record; dark mode is new 0.1 scope) when interviews happen
- **Open questions:** see section 11

---

## 4. Rules that must never be broken

1. **Money is whole sen.** Use the `Sen` type from `@brokely/domain`. Never floating-point ringgit. Amounts are stored positive; the transaction *type* gives the effect (R-04).
2. **Round only for display**, half-even, with `roundHalfEven` (R-03). Sums are exact.
3. **Business rules live in `packages/domain`** as pure functions with unit tests. No React, database, network or `Date.now()` inside; pass "today" in as an argument (NFR-02).
4. **Every rule and test references its ID** (BR-, FR-, AC-, D-, R-) in a comment or test name.
5. **Offline first.** Every record gets a phone-generated UUID (prefer UUIDv7). Every write goes into the outbox in the same database transaction (FR-SYNC-03/04).
6. **Never claim a balance.** The UI says "left in plan", never "balance" (BR-12). The wallet check (D-27) only compares with an amount the student typed, worded as "based on your check on…". Use only glossary words ("allowance" is retired; say "money in" / "from family").
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

**First run (D-23).** Welcome (one Brokely picture, fixed greeting, never promise "you won't go broke") → Quick start (budget + dates, approve) → Home suggests essentials one card at a time (Add / Not for me / Later); each accepted card = new revision. Guided setup optional.
**Navigation (D-24).** Tabs: Home · Records · (+) · Insights · More. Quick add from every tab; Undo after save, no confirm dialogs. Touch targets ≥ 48 dp (NFR-07).

**Plan.** B = budget, Cᵢ = category allocations, Sⱼ = set-asides (a category of kind `set_aside`).
Planned spending P = ΣCᵢ. Unallocated U = B − (ΣCᵢ + ΣSⱼ); U < 0 is a shortfall that must be acknowledged.
Edits create revisions; the original is kept; daily guidance uses the latest; cycle summary shows original → final → actual.

**Cycles.** User enters inclusive start/end dates; stored as `[start, end + 1 day)` local dates. At most one active cycle per date. A transaction belongs to the cycle containing its local date (derived, not stored).

**Transactions.** Types: purchase, refund (links to its purchase, cannot exceed what's unrefunded), transfer, borrow, lend, repayment_received, repayment_made, write_off. A purchase can be split into a spending line + debt lines; lines must sum to the amount (D-01).
Spending N = purchase lines − refunds + receivable write-offs. Transfers and debt principal are never spending.
Category remaining = Cᵢ − Nᵢ (may be negative). Left in plan = B − N.

**Bills.** Repeat daily, on weekdays, every N days/weeks, monthly, or once (D-17). "Mark paid" creates one linked transaction with an editable amount; the item leaves "still to come". Never counted twice.

**Progress.** Covered day = a spending entry or a "No spending today" check-in. Elapsed days = days before today + today if covered. Coverage = covered ÷ elapsed. Daily average = N ÷ elapsed. Everyday rate = (N − bill-linked spending) ÷ elapsed.
**Forecast** = N + still to come + everyday rate × days left, shown **only from day 14 with coverage ≥ 70%**, as a **range** (R-09): everyday part ×0.85 / ×1.15, low rounded down and high rounded up to RM10 (R-10). Pace = over pace if forecast (middle) > P, or > B while P = 0 (R-11). Estimated "gap fill" entries (0.2) count as spending but not as covered days and not in the everyday rate.

**Mid-month (D-25, R-12).** After the 1st, quick start offers Start fresh (today → month end, budget = what's left) or Catch me up (whole month + one "Spent before Brokely" entry dated the day before). Progress (covered/elapsed days, daily average, everyday rate) counts from `tracking_start_date`; earlier spending still counts in N.

**Money in (D-26).** Transaction type `income`, no lines, never spending, never changes B; if money in during the cycle > B, suggest adding the difference (new revision).

**Wallet check (D-27, R-13).** Optional; student types total money (cash + TNG + bank). Expected = last check + in − out since. In: income, borrow, repayment_received, refund. Out: purchase (full amount), lend, repayment_made. Neither: transfer, write_off. Offer to log a difference; never automatic.

**Debts.** Outstanding = principal − repayments − write-offs ± audited adjustments; never negative without an adjustment. Writing off money owed to you becomes spending in a chosen category (R-07).

**Imports (0.2).** Every TNG capture becomes a pending import and counts for nothing until confirmed (D-02). Person-to-person transfers must be given a type. Unknown wording: never guess an amount. Raw text deleted on confirm/dismiss or after 30 days.
Known TNG formats (no transaction ID in visible text; dedupe on Android notification key + post time + content):
- Transfer out — title `Transfer Successful.` body `RM 0.50 has been successfully transferred to [NAME].`
- Transfer in — title `Ka-ching! Incoming Money.` body `RM 0.50 received from [NAME] for Fund Transfer.`

**Mascot and XP (0.2).** One welcome picture already in 0.1 (FR-MAS-08). Static pictures, no voice. ≥3 growth stages (XP level), ≥4 moods: happy (on track), worried (over pace), proud (3+ day streak), sleepy (3+ days unlogged). Initial XP: approve plan 50, log 5, check-in 5, Mark paid 5, confirm import 2, weekly review 20; daily cap 100; once per source event.

**Notifications (0.2).** Bill due, evening logging reminder, streak, pace, debt due, pending import. Max 3/day, quiet hours, per-type mute, ≥3 wording variants each. Example: `🧺 Laundry day! Your RM16.00 wash is due. Tap Mark paid once it's spinning.`

**Default categories (D-22, FR-CAT-01).** Essential: Meals, Groceries & toiletries, Laundry, Transport, Phone & internet, Health. Optional: Snacks & treats, Fun & trips, Shopping, Gifts & charity, Other. Set-asides: Emergency, Savings.

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
apps/mobile          Expo Router app (app/ screens, src/db client, src/ui); README with run steps and structure
packages/domain/src  money, dates, cycle, bills, plan, transactions, spending, progress (forecast), debts, wallet, xp, result (+ tests)
packages/contracts   Zod schemas (entities, sync envelopes, fixtures)
packages/local-db    phone database schema, repositories (record + outbox), drizzle/ migrations; tested in Node, used with expo-sqlite
docs/requirements    PRD v1.5, SRS v1.6 (.docx)
docs/design          erd.md, sync-api.md, mascot-brief.md, domain-rules.md (BR → code → tests), wireframes.md (Figma link)
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
| Before 0.2 import work | Full TNG notification formats (QR payment, top-up, refund) and whether a transaction ID exists in notification extras (delayed until testing access) |
| Sync review | Open points in `docs/design/sync-api.md` section 12 |
| Phase 4 start | Sign-in provider (library inside our API, e.g. Better Auth, vs managed, e.g. Firebase Auth); hosting provider |
| Before 0.1 testing | Reference test device (NFR-06) |
| Before 0.2 mascot screen | XP thresholds for the 3 growth stages; priority between moods (e.g. proud vs worried on the same day) |
| During pilot | Coverage threshold (70%), XP values, notification cap |

---

## 12. Things that went wrong before (avoid repeating)

- This cloud workspace may not reach the npm registry. Local copies exist: Prettier at `/opt/node-tools/node_modules/.bin/prettier`, zod 3.25.76 at `/opt/npm-tools/node_modules/zod`, global `tsc` and `tsx`. To test without installing: symlink `node_modules/zod`, add a tiny `node_modules/vitest` shim over `node:test`, then run `tsx --test src/*.test.ts`. typescript-eslint is not available locally, so lint is verified by CI.
- The claude.ai cloud workspace cannot update `pnpm-lock.yaml` (no registry); on the author's machine (Claude Code) just install normally. When a change adds dependencies, push it on a branch and ask the user to run `pnpm install` there and push the lockfile; CI uses `--frozen-lockfile`.
- pnpm 10 skips dependency build scripts unless listed in `onlyBuiltDependencies` (`pnpm-workspace.yaml`); better-sqlite3 needs it.
- On the author's Windows machine, `corepack enable` fails (no admin rights for Program Files). pnpm is installed with `npm install -g pnpm@<version from package.json>` instead.
- The first Vitest run on Windows can time out (antivirus scanning fresh `node_modules`); re-run before debugging.
- The author's Windows machine has no `gh` CLI. CI status: `curl -s "https://api.github.com/repos/Elias-717/brokely/actions/runs?head_sha=<full sha>"` (unauthenticated limit 60/hour: poll every 30 s, not faster). CI runs only on `main` pushes and PRs, so branch work is verified locally with `pnpm install --frozen-lockfile && pnpm check`, then fast-forwarded.
- **Run Expo commands from `apps/mobile`, never the repo root.** `npx expo run:android` at the root (2026-10-20) treated the monorepo root as the app: it added expo/react/react-native to the root `package.json` and lockfile and created a root `android/`, `app.json`, `tsconfig.json` and `eas.json`. Fix: delete those, `git checkout -- package.json pnpm-lock.yaml`. If a stray `android/` is locked, stop the leftover Gradle daemon (`gradlew --stop` or the `GradleDaemon` java process).
- Native builds need `ANDROID_HOME` (author's SDK: `%LOCALAPPDATA%\Android\Sdk`, set as a user variable 2026-10-20, with `platform-tools` on PATH for adb). Without it Gradle fails with "SDK location not found". Open a new terminal after changing it.
- Gradle downloads the Android NDK (~700 MB) silently on the first native build; a build that looks "stuck" may be downloading. Stopping it mid-download left a broken `ndk\27.1.12297006` (error `CXX1101 … did not have a source.properties file`). Fix: delete that folder and run `sdkmanager --install "ndk;27.1.12297006"` (in `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin`).
- **Windows 260-character path limit:** C++ builds of `react-native-reanimated` failed (`ninja: error: mkdir … No such file or directory`, path 295 chars). A short folder does not help (even `C:\b` gives 294 chars from generated codegen paths). Fix used (2026-10-20): Windows `LongPathsEnabled=1` (admin, then restart) **and** CMake 3.31.6 from sdkmanager (its ninja 1.12 supports long paths; the default CMake 3.22.1's ninja does not), selected by the config plugin `apps/mobile/plugins/with-windows-cmake.js`, which writes `cmake.dir` into `android/local.properties` on every `expo prebuild` (prebuild deletes that file, so a hand-written line does not survive). Windows only; no effect on EAS/Linux. Separately, `apps/mobile/react-native.config.js` skips reanimated, worklets and gesture-handler (optional expo-router add-ons the app never imports); remove an entry before using that library.
- Vitest does not type-check: run `pnpm typecheck` (or `pnpm check`) before trusting green tests.
- Markdown is excluded from Prettier (`.prettierignore`) because table formatting differences broke format checks.
- The Phase 2 plan mentioned backtests on the author's real months; they are NOT committed (public repo, rule 7). Tests use synthetic data shaped like the SRS examples.
- A first 2-week data sample overstated treats (35%); 6 months showed ~10%. Don't generalise from small samples; label evidence size.

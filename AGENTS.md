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
| Behaviour, formulas (BR-xx), data model, quality targets (NFR-xx), acceptance tests (AC-xx) | `docs/requirements/Brokely_Software_Requirements_Specification_v1.7.docx` |
| Why, users, scope per release, success measures | `docs/requirements/Brokely_Product_Requirements_Document_v1.6.docx` |
| Every decision with its consequences (D-xx, R-xx) | `docs/project/decision-log.md` |
| Data model and sync API | `docs/design/erd.md`, `docs/design/sync-api.md` |
| Screens (wireframes) | `docs/design/wireframes.md` → Figma file `Hm2YNImm4pKtD11ke0iPKb` |
| Words allowed in UI and docs | `docs/project/glossary.md` |
| Student interview script | `docs/project/interview-guide.md` |
| Features, what's different, what to advertise (Play listing, ads, AI agents) | `docs/marketing/features-and-ads.md` (update when a feature ships) |

To read a .docx: `pandoc -t markdown <file>`.
SRS v1.7 (PRD v1.6, 23 Oct) includes every decision up to D-97 and R-14 (layout-only decisions are listed as "no requirement change" in section 15). To edit a .docx without pandoc/Word: `pip install python-docx`; the v1.7 update scripts copied a table row's XML and replaced its text, which keeps the formatting. SRS section 15 is the change record: **whenever a requirement changes, add a row there** (ID, type, what changed, decision) so traceability is never lost. Requirement IDs are never reused.

---

## 3. Current state (update every session)

- **Date of last update:** 2026-10-24 (Phase 5 session 3)
- **Phase:** 5 — Release 0.1 **started 2026-10-22**. Phase 3 (offline app) **closed 22 Oct**: the 0.1 screen checks passed on the reference phone (`docs/project/phase3-acceptance.md`). Phase 4 (backend + sync) **closed 22 Oct**: AC-20…AC-24 passed between two real phones (`docs/project/phase4-acceptance.md`). Everything is on `main`: Supabase `swkakkylbsewewulxgra` (Singapore) + API on Azure Container Apps (East Asia, automatic deploys from `main`), phone sign-in (Google + email), sync, conflict screen, push limit, speed fix, WebP mascots (1.0 MB). Phase 5: **PDPA done in code 22 Oct (D-92)**: notice EN+BM (`packages/contracts/src/privacy-notice.ts`), in-app screen `app/privacy.tsx`, public `GET /privacy`, review `docs/project/privacy-review.md` with author actions P-1…P-9 (owner/contact placeholders, Malay check, allowBackup, leaked passwords, backup retention, breach plan). **Terms of use + `/terms` + `/delete-account` done (D-93)**; author's legal to-do list: `docs/project/legal-checklist.md`. **Notifications built 22 Oct (D-94)**: `planNotifications` (domain), `apps/mobile/src/notifications/`, More → Notifications; needs `npx expo prebuild` + a new build (expo-notifications is native, its plugin sets the small icon). **24 Oct (pilot feedback):** **D-114** quick start after the 1st asks one number ("How much money do you have left for the rest of October?") with a link "I'd rather plan all of October" (old catch-up); **D-115** keypad calculator (÷ × − + column, `evaluateAmount` in domain, `SumLine`), in every keypad sheet; **D-116** names max 4 words / 30 characters with a "not a sentence" message (`limitName`, `nameOverLimit`, `NameField`); **D-117** Add keeps a draft for the day (`add_draft` in `local_prefs`, "Draft restored · Clear"); **D-118** app version 0.1.1 / versionCode 2, raise the patch and versionCode for every tester or Play build (`app.json`); `docs/marketing/features-and-ads.md` (all features, differences, ranked advertising, store text, don't-advertise list); sheet drag-close no longer plays two animations (the panel used to slide away, leaving a grey screen, then the screen's own close played with the panel put back; now the screen's close animation alone takes it from the finger, `src/ui/sheet.tsx`). **23 Oct:** emojis removed from More → Notifications; **D-95 left to spend today** on Home (`todayGuide`, replaces the "/ day" line), **D-96 category heads-up** on Insights (`categoryHeadsUps`, optional categories ahead of Meals or past their plan, ≥ RM20); **D-97** Android Auto Backup off (`app.json`, needs a new native build) and the notice says so, P-7 stays a link, breach plan approved (`docs/project/breach-plan.md`); **D-98** clearer today card (big amount = "a day from tomorrow" once today is over, status agrees, bills clause gone) and a red ring with a negative % past the budget (`heroOver`); **D-113** 100 money tips (c01…c50 added, author to review); **D-112** past notes drop down while typing in Add → Spent (`noteSuggestions`), chip row removed; **D-111** buzz on every save (Mark paid, paid back, write-off, edit, refund, no-spend) + More → Settings → Vibration switch; **D-110** one-time "Watch Brokely grow" card on Profile with the 3 stages (`GrowIntroCard`, `mascot_intro_seen`); **D-109** "Brokely grew!" card once per stage, mood cross-fade, save buzz (expo-haptics, native: new build) in `src/ui/mascot-image.tsx`, `src/ui/haptics.ts`; **D-108** Phosphor duotone icons replace every icon emoji (`src/ui/icon.tsx`, paths in `src/ui/icon-paths.ts`, `categoryIcon`); **D-107** decorative emojis removed from app text (icon emojis stay until a drawn icon set, Phosphor suggested; notifications keep theirs); **D-106** Home header opens Profile; **D-105** the 12 mascot pictures on Home (stage by days logged 7/30, mood sleepy > proud > worried > happy; `packages/domain/src/mascot.ts`, `src/lib/mascot.ts`); **D-104** "Paying someone back?" under quick add categories → the debt's repay sheet (never spending); **D-103** "Pay back by" chips when lending/borrowing and on each debt (`PayBackBy`, `setDebtDueDate`); **D-102** heads-up can be hidden (✕ / Got it, Undo; back only if the gap grows by RM20; per cycle in `local_prefs`); **D-101** Time zone row removed from More (dates follow the phone; `time_zone` kept unused); **D-100** no server backups for the pilot (free plan; NFR-15 exception; leaked-password protection also off, Pro only; set up backups before a wider release); **D-99 wallet check removed** from the app (screen, Home link, More row, sheet extras; domain, tables, contracts and sync kept so old records still sync/export); **SRS v1.7 / PRD v1.6 written** (FR-ACC-08/09, FR-PLN-22/23, FR-TXN-12, FR-INS-09…11, FR-NOT-08/09, BR-32…35, NFR-21/22, AC-64…70; FR-NOT moved to 0.1; change record section 15). Next: TNG import (Phase 6) once the author has notification samples; meanwhile, NFR checklist, accessibility, release signing key + Play internal testing, Google consent screen, usability pilot
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
  - **S6/S6b Bills** (`app/bills/`): Upcoming/Paid, Mark paid sheet (editable amount + date, Undo = delete payment), Skip + Undo, new/change/stop bill form (`listBills`, `getBill`, `unarchiveBill`); Home's Still to come has Mark paid + Bills link. Shared `PageScreen`, `Empty` (`src/ui/components.tsx`) and `SheetShell`, `SheetAmount`, `SheetNote`, `DateButton` (`src/ui/sheet.tsx`); sheets are listed in `SHEETS` in `app/_layout.tsx`
  - **S7/S7b Debts** (`app/debts/`): Owed to me / I owe with totals, settled list, debt page with history, repay sheet, Write off sheet (R-07 category, "Keep it open"); quick add accepts `?more=lent|borrowed`
  - **S8 Insights** (`app/(tabs)/insights.tsx`, `src/lib/insights-model.ts`, `src/ui/doughnut.tsx`): doughnut (5 named slices + Everything else, legend with RM and %, tap for records), daily average with coverage, forecast range or "not enough data yet", still to come, by category. Chart colours `chart`/`chartOther` in the theme, validated with the dataviz palette checker for both modes
  - **S11 Wallet check** (`app/wallet-check.tsx`): from Home and More; Log it / Leave it
  - **S9 More**: Your plan (`app/plan.tsx`, edit = new revision, "Approve anyway?", add set-aside, Undo = another revision), settings (`settings.ts` repo: week start, time zone; MYR fixed), Your data: CSV/JSON export through the Android share sheet (`data.ts`: `exportJson`, `exportTransactionsCsv`) and delete everything after a second tap (`deleteAllData`)
  - **S10** (`app/cycle/[id].tsx`, `app/next-plan.tsx`, repo `cycles.ts`): ended plans complete on Home open (`completeEndedCycles`), summary original → final → actual, Start next plan = draft (`startNextCycle`) approved or discarded on Next plan. Shared amount fields `src/ui/allocation-fields.tsx`
  - Theme (D-31/D-32): light + dark tokens in `apps/mobile/src/ui/theme.ts`, `ThemeProvider` (Light / Dark / Same as phone under More, stored in phone-only `local_prefs`, migration 0001), bundled Lilita One + Nunito (3 weights), sticker cards, stroke tab icons (react-native-svg), expo-system-ui
  - **S5 Records** (`app/(tabs)/records.tsx`, `src/lib/records-model.ts`): by day, filters, check-ins; edit sheet `app/record/[id].tsx` with edit history (`listTransactionEdits`), Delete + Undo (`restoreTransaction`/`restoreDebt`: before sync the pending delete is dropped), Refund (`refundableSen`). Home offers "No spending today" when nothing is logged today
  - **S4/S4c Quick add** (`app/quick-add.tsx`, D-38): sheet with Spent | Money in | More (transfer, I lent, I borrowed), built-in `Keypad`, chips by use (`src/lib/category-order.ts`), date, optional note, split with a friend (`recordSplitPurchase`); Money in sources Meal money (default) · From family · From a friend (optional name) · Part-time · Gift · Borrowed (debt) · Other, in one From row (D-55). **Undo bar** for 5 s (`src/ui/undo.tsx`, `useUndo`), Undo also removes a debt it created (`deleteDebt`). Refunds come from Records
  - **S3a Home** (`app/(tabs)/index.tsx`, data from `src/lib/home-model.ts` via `computeProgress`): left in plan, forecast line (hidden on plans < 14 days, D-37), next essential card (domain `nextEssentialCard`, choices per cycle in `local_prefs`, D-30), still to come (list only; Mark paid comes with S6), spent so far. **Essential chats** `app/essential/[id].tsx` (D-35, D-36): often (day/week/month) or count (washes/top-ups a month, `timesInPlan`, rounded up) or Phone bill-or-top-up; over budget asks "Add it anyway?" (D-28). Card styles in `src/lib/essentials-meta.ts`
  - Quick start as a **chat with Brokely** (D-33): one conversation `app/quick-start/index.tsx` covers S1c/S1b/S1d (steps choose → fresh-amount/confirm or cu-money/gone/mostly/confirm), then `app/quick-start/done.tsx` ("Your plan is set"). Brokely's words are templates in `src/lib/brokely-lines.ts` (edit wording there); chat pieces in `src/ui/chat.tsx`, `src/ui/use-conversation.ts`; gentle motion in `src/ui/motion.tsx` (respects Reduce motion). Optional nickname on Welcome and in More (D-34, `local_prefs`). `parseAmount` in domain; Android date picker for Change dates
  - Contracts: `scheduledItemId(billId, dueDate)` = UUIDv5 under `BROKELY_ID_NAMESPACE` (S-05), value pinned by a test; uuid 11.1.0
  - App dependencies via `expo install` (expo-sqlite, expo-router + peers, expo-crypto), drizzle-orm, `@brokely/local-db`, uuid (v7 from expo-crypto bytes). Migration `packages/local-db/drizzle/0000_initial.sql` + `migrations.js` (export `@brokely/local-db/migrations`); a test fails if `schema.ts` changes without `db:generate`. Metro `.sql` + babel inline-import
  - **D-41 debts at launch**: quick start asks "Do you owe anyone money from before?" (All / Part / Not this month) and "Does anyone owe you money?" right after the money; paybacks come off the budget (domain `budgetAfterPayback`, `checkPayback`), every debt saved in Debts (`QuickStartInput.openingDebts`, note `OPENING_DEBT_NOTE`). `TextComposer` in `src/ui/chat.tsx`
  - **D-40** (author): AI broccoli-from-photo profile mascot planned for **0.3** (needs NFR-20 change, Phase 4 server, consent; not built)
  - App shell: `app/_layout.tsx` runs migrations first; tabs Home · Records · (+) · Insights · More; + opens `quick-add` modal; first run (no categories) → **S1 Welcome** with `main_design.png`. `CI=1 npx expo export --platform android` bundles (3.2 MB). Not yet run on a phone
- **Deferred (user decision, 2026-10-19):**
  - Student interviews: skipped for now because of time. Decisions that waited on them (D-12 Meals / Snacks split) stay provisional; categories (D-22) and wallet check (D-27) were decided early by the author; ask the user when one becomes blocking.
  - TNG samples (QR payment, top-up, refund, notification extras): delayed until the author has testing access. 0.2 import design stays provisional.
  - **Mascot art delivered** (commit 3b535fb): `apps/mobile/assets/mascot/` has all 12 pictures `brokely_s{1-3}_{happy,worried,proud,sleepy}.png` plus `main_design.png`. **The 0.1 welcome screen uses `main_design.png`** (author's choice; replaces the planned `brokely_welcome.png`). **Done 22 Oct:** the app uses WebP (768 px, quality 85): 14.7 MB → 1.0 MB, NFR-19 met; PNG masters in `design/mascot-source/` with `shrink_mascot.py`.
  - **Handoff (2026-10-19):** work moves from the claude.ai cloud workspace to **Claude Code on the author's Windows machine**. Locally the npm registry works, so dependencies can be installed and `pnpm-lock.yaml` updated directly (the "cannot update the lockfile" limitation in section 12 applies only to the cloud workspace).
  - **Phase 4 server (2026-10-21):** Supabase project `brokely` (ref `swkakkylbsewewulxgra`, `ap-southeast-1` Singapore, Postgres 17, checked empty before starting). Server schema `apps/api/src/db/schema.ts` (Drizzle pg-core, private schema `brokely`, RLS on with no policies, `user_id` → `auth.users` on delete cascade = FR-ACC-07); migrations `apps/api/drizzle/0000…0002` applied to Supabase under the same names (0001 hand-written: `btree_gist` + cycle-overlap EXCLUDE + revoke Data API roles; 0002 foreign-key indexes from the performance advisor). Security advisor: only the expected "RLS enabled, no policy" notices. Sync engine `apps/api/src/sync/`: `entities.ts` (row ↔ contract data, references, rules from `@brokely/domain` per entity), `push.ts` (sync-api §4 steps, per-student advisory lock S-10, only successes stored in `processed_operations`), `pull.ts` (cursor on `server_seq`, limit + 1 per table for `hasMore`). Routes `POST /v1/sync/push`, `GET /v1/sync/pull` (`app.ts`); tokens checked against the project's ES256 public keys (`auth.ts`). Tests on PGlite (in-process Postgres 17, no Docker): 32 API tests incl. every sync-api §6 error code and AC-04/20/21/23/24 at server level. `server.ts` needs env `DATABASE_URL` (Supabase **pooler** URL, a secret, never commit) and `SUPABASE_URL`
  - **Image + phone sync engine (2026-10-21):** `apps/api/build.mjs` bundles the API with esbuild into `dist/server.mjs`; `apps/api/Dockerfile` (build from repo root) → node:22-alpine, port 8080. CI job `api-image` (after `check`, main only) builds, smoke-tests and pushes `ghcr.io/elias-717/brokely-api:<sha>` and `:latest` (package is public; no registry login needed). Phone side `packages/local-db/src/sync/` (`syncNow(ctx, transport, { userId, deviceId })`, `linkAccount`, `SyncTransport`): one op per record per round with version rebase, results → statuses (conflict keeps the server row in `last_error`, FR-SYNC-08), pull all pages then apply in one transaction with deferred FKs, S-06 check-in merge. `apps/api/src/sync/two-phones.test.ts` runs two real phone DBs through the real routes (AC-20…23 at code level)
- **Next agent tasks (Phase 4 — backend + sync; exit: AC-20…AC-24 pass between two real phones):**
  0. **Sign-in and sync (merged into `main` 22 Oct):** app sign-in and sync. `apps/mobile/src/sync/` (config with public Supabase URL/publishable key/API URL; `session-storage.ts` chunked expo-secure-store; `auth.ts` email + password, reset, confirm links `brokely://sign-in` / `brokely://reset-password`; `transport.ts` HTTP `SyncTransport` with the token; `sync-provider.tsx` triggers per sync-api §7: sign-in, app to front, 5 s after a change newer than the last sync, every 15 min, back-off 5 s/15 s/1 min/5 min/15 min; `account-rows.tsx` = first rows of More → Settings, D-72), screens `app/sign-in.tsx` (D-73 flow) and `app/reset-password.tsx`, Welcome link. Engine: `signInStep`, `hasOwnRecords`, `syncCounts`, `latestChangeAt`, `deviceIdOf`; a pulled category merges a same-named local one that never reached the server (D-73 b), then pushes again. **Needs a new development build** (expo-secure-store is native; older builds hide sign-in). **Author's Supabase settings:** Authentication → URL Configuration → Redirect URLs: `brokely://sign-in`, `brokely://reset-password`; Google sign-in built (`src/sync/google.ts`, native `@react-native-google-signin/google-signin` 16.1.5 loaded on demand, Web client ID in `config.ts`; its config plugin is deliberately NOT in app.json: without options it expects Firebase files, and Android needs no plugin). Google Cloud needs the Android OAuth client (package `com.elias717.brokely`, debug SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`; release key later), consent screen in Testing lists the testers. **Hi-fi screens built (D-75, D-76):** Welcome option A; sign-in S13a–S13f in `app/sign-in.tsx` (official Google button `src/ui/google-button.tsx`, email tabs + Show/Hide + live hint, Check your email with "Open email app" via expo-intent-launcher and a 60 s resend, D-73 cards with real counts `phoneSummary`/`accountSummary`, erase step with the mustard `destructive` button and `warningCard`); `app/welcome-back.tsx` (S13g, typed greeting) and the "You're backed up 🥦" toast (`src/ui/toast.tsx`); More starts with `ProfileCard` (S13h) → `app/profile.tsx` (S13j/k: avatar from the Google photo or initial `src/ui/avatar.tsx`, nickname, Backup, Sign out) → `app/backup.tsx` (S13i, `stuckChanges`). Backup words/icons in one place: `src/sync/status.ts`. Figma hi-fi section node 29:470. **D-77 polish:** secondary buttons light green app-wide (white on light green cards, via a Surface context in `Sticker`); shared `src/ui/tabs.tsx`; Bills (`app/bills/index.tsx`: summary card, Needs paying / Later, Skip in the Mark paid sheet, Your bills with next dates, quick add `BILL_PRESETS`); Insights (`app/(tabs)/insights.tsx`: brand-new preview, this month without a plan via `readMonth`, Getting started, forecast progress bar). "Delete my account" in Profile (`DELETE /v1/account`, `apps/api/src/account.ts`: deletes the Supabase user; cascades remove every row). Not built: a profile photo on Home (asked, unanswered). **D-83:** "Add this phone's records" with a plan for the same dates as the account's asks which plan to keep (S13l in `app/sign-in.tsx`, logic in `packages/local-db/src/sync/plan-clash.ts`); the other plan is archived; tested end to end in `two-phones.test.ts`
  1. **Author:** in the Azure portal, `brokely-api` → Containers → image `ghcr.io/elias-717/brokely-api:latest`, target port 8080, secret `database-url` = Supabase pooler URL (Dashboard → Connect; the direct `db.….supabase.co` host is IPv6-only) mapped to env `DATABASE_URL`, env `SUPABASE_URL=https://swkakkylbsewewulxgra.supabase.co`. Then check `GET /health`. **Done 2026-10-21: the API runs on Azure.** **Automatic deploys work (2026-10-21, run 39503874617):** every push to `main` runs check → api-image → api-deploy (OpenID Connect as app registration `brokely-github-deploy`, no stored password; federated subject is GitHub's ID-based form `repo:Elias-717@178709125/brokely@1424643964:environment:production`; role Container Apps Contributor on `brokely-rg`; repo variables `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`). Live: `/health` 200 (first call ~2.5 s = cold start from zero replicas), sync without a valid token 401, http → https. Setup and troubleshooting in `apps/api/README.md`
  1b. **Done 22 Oct:** `feat/sign-in-sync` merged into `main` (CI green, deployed). Push limit 60/min per student (`apps/api/src/rate-limit.ts`, 429 + Retry-After). Conflict choice logic `listConflicts` / `resolveConflict` (Use mine / Keep the latest) with AC-21 tests in `two-phones.test.ts`; screen S13m built (`app/conflict/[id].tsx`, rows from `src/lib/conflict-view.ts`, D-88). Speed check: `apps/api/src/sync/speed.test.ts` counts database queries (first backup 7.7 per change, one pull page 14), `GET /health/db` measures the live round trip, pushes log `changes` + `pushMs`. **Live round trip API → database: 36.7 ms** (22 Oct), so a first backup of ~115 changes ≈ 115 × 8 × 37 ms ≈ 34 s; later backups (a few changes) are under a second. **D-89 done:** one transaction per push with grouped lookups, 2.1 queries per change (first backup ≈ 9 s). Phase 4 device checklist: `docs/project/phase4-acceptance.md`
  2. ~~Fewer database round trips per push~~ done (D-89, see 1b)
  3. ~~Phone app wiring (sign-in, transport, triggers, statuses, conflict screen)~~ done (D-72…D-76, D-88)
  4. ~~Account linking, `DELETE /v1/account`, push limit~~ done (D-73, D-83, FR-ACC-07, sync-api §9)
  5. ~~To close Phase 4~~ **closed 22 Oct** (author ran AC-20…AC-24 on two phones). Kept for reference: the author installs a new release APK (Expo 58.0.16 bump has native code: `apps/mobile/android`, `.\gradlew assembleRelease`) on both phones and runs AC-20…AC-24 from `docs/project/phase4-acceptance.md`; record results there, then mark Phase 4 closed here. Time zone setting removed (D-101: dates follow the phone). Supabase "Leaked password protection" (security advisor WARN, 22 Oct) is off: author can turn it on in Authentication → Email. Advisors otherwise clean (RLS-without-policy is intended, S-09; two debt indexes unused so far, kept). Google consent screen is in Testing: add every pilot tester. Optional: API to Azure Southeast Asia (next to the database); Supabase Realtime for instant sync between devices
  7. **Later (author, 22 Oct): app size and performance.** Starting points: the release APK is ~94 MB because it holds 4 CPU types (`reactNativeArchitectures` in `android/gradle.properties`) and was built before the WebP mascots; Google Play takes an **AAB**, which sends each phone only its own CPU type (~4× smaller); for side-loading, build arm64-v8a only (`-PreactNativeArchitectures=arm64-v8a`); turn on resource shrinking (`shrinkResources`, via `expo-build-properties`), check what `expo-dev-client` adds to release builds, subset the fonts. Performance: measure first on the A26 (cold start, Home open, Records with hundreds of entries); then `FlashList` for Records, narrower `useRead` reads (it re-reads on every database change), SQLite indexes for date ranges, the React Compiler. Hermes and the new architecture are already on, and minify is on
  6. **Session 22 Oct also built:** D-84 smart categorization (`packages/domain/src/category-guess.ts`), D-85 More tab + Wallet check redesign, D-86 sheets pull up to full screen, D-87 full-screen extras (`src/ui/sheet-extras.tsx`), D-88 conflict screen, D-89 speed fix, D-90 phone-run fixes (`KeyboardSafe` by keyboard top edge, drag anywhere on sheets, Profile confirmations as `ModalSheet`). Add → Spent / Money in redesign (Figma 49:534) approved but parked by the author
- **Phase 3 leftovers (offline app; exit: all of 0.1 works on one phone, offline, no account):**
  1. **Run on the author's phone** with a development build (`npx expo run:android` or `eas build --profile development --platform android`) and tap through every screen. Reference device (NFR-06, D-62): **Samsung Galaxy A26 (SM-A266B)**; the author has been testing on it through Metro from their own terminal. Only Bills was tapped through on the emulator (2026-10-20). **Check the Undo bar**: on the emulator the screen dump never showed it (after Mark paid, delete, or No spending today); it may be hidden behind native screens or just invisible to uiautomator
  2. **Export as files** is done in code (`src/lib/export-file.ts`, expo-file-system + expo-sharing; falls back to text on builds without them) but **needs a new development build** on the phone (`npx expo run:android` from `apps/mobile`). The expo-sharing config plugin is deliberately not in `app.json` (it only adds share-into intent filters)
  3. ~~Guided setup S2a–S2d~~ **done** (`app/guided.tsx`, D-63, drafts in `drafts.ts`). Done screens, for reference, each from its Figma frame (`docs/design/wireframes.md`; S1 = node 9:288, S1b 9:306, S1c 16:330, S1d 16:349): S3a Home with essential cards (`acceptEssentialCard`; card queue Later/Not for me per cycle in `local_prefs`, D-30) → S4/S4c quick add with Undo (`recordPurchase`, `recordMoneyIn`, `deleteTransaction`) → S5 Records → S6/S6b Bills + Mark paid → S7/S7b Debts → S8 Insights (`computeProgress`) → S11 Wallet check → S9 More, settings (`user_settings` repo still missing), export/delete → S10 cycle finished. Guided setup S2a–S2d after the main flow.
  4. All 0.1 features are built. **0.1 acceptance check (22 Oct): `docs/project/phase3-acceptance.md`** maps all 43 0.1 ACs; every rule is covered by automated tests (AC-49 test added 22 Oct); 10 screen checks remain for the author on the reference phone, then Phase 3 closes
  5. ~~D-46 part 2~~ done 22 Oct (D-91: `suggestFromHistory`, hints in Next plan and guided step 3)
  6. ~~Server database schema~~ done (Phase 4). ~~SRS v1.7 / PRD v1.6~~ done 23 Oct. (Was: add D-29…D-74 and R-14 (D-47 rewords FR-MAS-08) to the change record (D-43 renames a default category); D-41 needs an FR/AC for debts in quick start; D-40 needs NFR-20 reworded; D-39 needs a new FR/AC for in-app money tips; dark mode is new 0.1 scope; D-36 rewords AC-02 and AC-54: laundry is never a dated bill) when interviews happen
- **Open questions:** see section 11

---

## 4. Rules that must never be broken

1. **Money is whole sen.** Use the `Sen` type from `@brokely/domain`. Never floating-point ringgit. Amounts are stored positive; the transaction *type* gives the effect (R-04).
2. **Round only for display**, half-even, with `roundHalfEven` (R-03). Sums are exact.
3. **Business rules live in `packages/domain`** as pure functions with unit tests. No React, database, network or `Date.now()` inside; pass "today" in as an argument (NFR-02).
4. **Every rule and test references its ID** (BR-, FR-, AC-, D-, R-) in a comment or test name.
5. **Offline first.** Every record gets a phone-generated UUID (prefer UUIDv7). Every write goes into the outbox in the same database transaction (FR-SYNC-03/04).
6. **Never claim a balance.** The UI says "left in plan", never "balance" (BR-12). (The wallet check, D-27, was removed on 23 Oct, D-99.) Use only glossary words ("allowance" is retired; say "money in" / "from family").
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
| **4 Backend + sync** | Fastify on Azure Container Apps (East Asia, `brokely-api` in `brokely-rg`, D-71) + Supabase (sign-in and PostgreSQL, Singapore, D-64); idempotent push, versioned writes, reject-and-notify conflicts, delete markers, pull cursor; local-only → account linking | AC-20…AC-24 pass between two real phones |
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

**First run (D-23).** Welcome (one Brokely picture, fixed greeting, never promise "you won't go broke") → Quick start (money → debts from before (D-41: payback comes off the budget) → dates, approve) → Home suggests essentials one card at a time (Add / Not for me / Later); each accepted card = new revision. Guided setup optional.
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

**Daily guide and left today (D-58, D-95; BR-32, BR-33).** Free = left in plan − still to come − unused set-asides; a day = free ÷ days left (incl. today). Today's share = (free + today's everyday spending) ÷ days left, fixed for the day; left today = share − today's everyday spending (bills, estimates and set-asides left out).
**Category heads-up (D-96, BR-34).** An optional category with ≥ RM20 spent is flagged when it passes Meals (or the biggest essential) or its plan amount; never essentials or set-asides. Fact, then one step.

**Mid-month (D-25, R-12).** After the 1st, quick start offers Start fresh (today → month end, budget = what's left) or Catch me up (whole month + one "Spent before Brokely" entry dated the day before). Progress (covered/elapsed days, daily average, everyday rate) counts from `tracking_start_date`; earlier spending still counts in N.

**Money in (D-26).** Transaction type `income`, no lines, never spending, never changes B; if money in during the cycle > B, suggest adding the difference (new revision).

**Wallet check (D-27, R-13) — removed from the app 23 Oct (D-99); data layer kept.** Was: optional; student types total money (cash + TNG + bank). Expected = last check + in − out since. In: income, borrow, repayment_received, refund. Out: purchase (full amount), lend, repayment_made. Neither: transfer, write_off. Offer to log a difference; never automatic.

**Debts.** Outstanding = principal − repayments − write-offs ± audited adjustments; never negative without an adjustment. Writing off money owed to you becomes spending in a chosen category (R-07).

**Imports (0.2).** Every TNG capture becomes a pending import and counts for nothing until confirmed (D-02). Person-to-person transfers must be given a type. Unknown wording: never guess an amount. Raw text deleted on confirm/dismiss or after 30 days.
Known TNG formats (no transaction ID in visible text; dedupe on Android notification key + post time + content):
- Transfer out — title `Transfer Successful.` body `RM 0.50 has been successfully transferred to [NAME].`
- Transfer in — title `Ka-ching! Incoming Money.` body `RM 0.50 received from [NAME] for Fund Transfer.`

**Mascot and XP (0.2).** One welcome picture already in 0.1 (FR-MAS-08). Static pictures, no voice. ≥3 growth stages (XP level), ≥4 moods: happy (on track), worried (over pace), proud (3+ day streak), sleepy (3+ days unlogged). Initial XP: approve plan 50, log 5, check-in 5, Mark paid 5, confirm import 2, weekly review 20; daily cap 100; once per source event.

**Money tips (built in 0.1, D-39, D-67).** Fun financial-literacy tips slide in from the side inside the app as a reward after recording; tap to dismiss; Settings switch (on by default); daily cap; local reviewed templates only. Brief: `docs/design/money-tips.md`.

**Notifications (0.2).** Bill due (on its due date: pay it, then Mark paid; D-45), evening logging reminder, streak, pace, debt due, pending import. Max 3/day, quiet hours, per-type mute, ≥3 wording variants each. Example: `🧺 Laundry day! Your RM16.00 wash is due. Tap Mark paid once it's spinning.`

**Default categories (D-22, D-43, FR-CAT-01).** Essential: Meals, Home necessities, Laundry, Transport, Phone & internet, Health. Optional: Snacks & treats, Fun & trips, Shopping, Gifts & charity, Other. Set-asides: Emergency, Savings.

---

## 9. Releases at a glance

- **0.1 Core:** planning, set-asides, bills + Mark paid, transactions with splits, debts + write-off, insights + honest forecast, check-in, local-only mode, accounts, offline sync, export/delete.
- **0.2 Automation and fun:** TNG import with confirmation, merchant memory, fun notifications, mascot + XP + streaks, fill-a-gap estimates, cycle comparison.
- **0.3 Extras (if confirmed):** coins and cosmetics.
- **0.3 also:** AI mascot from the student's photo (D-40), if NFR-20 is changed.
- **Out of scope for v1:** bank balances, payments, loans, iOS, social features, paid AI, multi-category splits.

---

## 10. Repo map and commands

```
AGENTS.md            ← this file
CLAUDE.md            ← points here
apps/api/src         app.ts (routes), auth.ts (Supabase tokens), server.ts, db/ (schema, client, PGlite test-db), sync/ (entities, push, pull)
apps/api/drizzle     server migrations (applied to Supabase under the same names; `pnpm --filter @brokely/api db:generate`)
apps/mobile          Expo Router app (app/ screens, src/db client, src/ui); README with run steps and structure
packages/domain/src  money, dates, cycle, bills, plan, transactions, spending, progress (forecast), debts, wallet, xp, result (+ tests)
packages/contracts   Zod schemas (entities, sync envelopes, fixtures)
packages/local-db    phone database schema, repositories (record + outbox), drizzle/ migrations; tested in Node, used with expo-sqlite
docs/requirements    PRD v1.6, SRS v1.7 (.docx)
docs/design          erd.md, sync-api.md, mascot-brief.md, money-tips.md, domain-rules.md (BR → code → tests), wireframes.md (Figma link)
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
| Before 0.2 mascot screen | XP thresholds if XP replaces days logged for growth (0.1 uses 7/30 logged days and sleepy > proud > worried > happy, D-105) |
| Before release | Author reviews the 100 money tips in `apps/mobile/src/lib/money-tips.ts` (c01…c50 added 23 Oct, D-113) |
| Before 0.3 AI mascot (D-40) | Image provider, one picture or all 12 moods, cost cap per student, photo consent wording |
| During pilot | Coverage threshold (70%), XP values, notification cap, heads-up minimum (RM20, D-96) |

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
- **Keyboard on Android:** the app runs edge-to-edge with `adjustResize`, and `KeyboardAvoidingView` on top of that pushed fields half off screen (2026-10-20). Use `KeyboardSafe` (`src/ui/keyboard-safe.tsx`): it measures how much the window really shrank and pads only the rest; sheets read `useAvailableHeight()` for their height cap. Scrolling content with text fields uses `KeyboardScroll` (`src/ui/keyboard-scroll.tsx`, already inside `PageScreen`, `SheetShell` and `ChatScreen`): it keeps the focused field 24 dp above the keyboard, or the newest chat message in view (`stickToEnd`). A screen with fields uses `PageScreen keyboardSafe`.
- **Stage only the files you changed** (`git add <paths>`, then `git diff --cached --stat`), never a whole folder. On 2026-10-20 an editor tab saved an old copy of `app/quick-add.tsx` over the new one and `git add apps/mobile` committed the placeholder (c11ac66); restored in 2044741.
- **Emulator on the author's machine (2026-10-20):** the default GPU mode crashed (`Failed to find ColorBuffer`); `-gpu swiftshader_indirect` runs but `adb screencap` returns an all-white image (even the launcher), and `-gpu angle_indirect` left no usable activity. Workaround: read the screen with `adb shell uiautomator dump` (texts, labels, coordinates) and tap with `adb shell input tap x y`. In Git Bash set `MSYS_NO_PATHCONV=1`, or `/sdcard/...` becomes a Windows path. Open the dev client once with `adb reverse tcp:8081 tcp:8081` and `brokely://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`; opening it twice crashed the dev launcher ("App react context shouldn't be created before"), fix with `am force-stop`.
- **The author's phone can appear in `adb devices` over wireless debugging.** With two devices, adb commands fail ("more than one device"); never send taps or launches to the phone without asking. Use `adb -s emulator-5554 …`.
- Vitest does not type-check: run `pnpm typecheck` (or `pnpm check`) before trusting green tests.
- **Server migrations are applied to Supabase by hand** (Supabase MCP `apply_migration` or the SQL editor), one per file, same name, in journal order; the drizzle migrator only runs on PGlite in tests. A schema change = edit `schema.ts`, `db:generate`, run tests, then apply the new file. Constraints Drizzle can't express go in a `drizzle-kit generate --custom` migration.
- Python's text mode on Windows writes CRLF; when scripting edits use `open(..., newline='')`. Prettier fixes code files, but Markdown is not formatted.
- Markdown is excluded from Prettier (`.prettierignore`) because table formatting differences broke format checks.
- The Phase 2 plan mentioned backtests on the author's real months; they are NOT committed (public repo, rule 7). Tests use synthetic data shaped like the SRS examples.
- A first 2-week data sample overstated treats (35%); 6 months showed ~10%. Don't generalise from small samples; label evidence size.

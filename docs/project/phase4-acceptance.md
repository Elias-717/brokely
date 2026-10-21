# Phase 4 acceptance: AC-20 … AC-24 on two real devices

Phase 4 ends when these five acceptance tests pass between two real devices (AGENTS.md section 6).
Each one is also covered by automated tests (`apps/api/src/sync/two-phones.test.ts`, `sync.test.ts`,
`app.test.ts`); this sheet records the run on devices.

**Devices:** A = Samsung Galaxy A26 (reference phone, NFR-06) · B = Android emulator Pixel_6.
**Build:** release APK (`apps/mobile/android`, `.\gradlew assembleRelease`) on both, same commit.
**Account:** one test account signed in on both (Google or email), unless a test says otherwise.
**Server:** live API on Azure (`/health` 200) and Supabase `swkakkylbsewewulxgra`.

Mark each result ✅ pass / ❌ fail, with the date and a note. A failure gets an issue and is fixed before
Phase 4 closes.

| Test | Steps | Pass when | Result |
|---|---|---|---|
| **AC-20** Offline and restart (FR-SYNC-01…05) | On A: airplane mode on → quick add a purchase (e.g. RM 7.50, Meals) → force-close Brokely → reopen → airplane mode off → More → Profile → Backup → "Back up now" → "Back up now" again | The purchase appears once in Records on A and, after B syncs, once on B; Backup on A says backed up; nothing in "Needs a look" | |
| **AC-21** Conflict (FR-SYNC-07/08) | A and B synced → airplane mode on both → in Your plan → Change amounts, set Meals to RM 200 on A and RM 180 on B → A online, Back up now → B online, Back up now | B's Backup shows "Needs a look": the plan, "Changed on another phone too"; tapping it shows the latest (RM 200) and B's (RM 180); choosing one ends with the same value on both after another sync; nothing lost silently | |
| **AC-22** Start offline, sign up later (FR-ACC-03) | On B: uninstall, install the APK, airplane mode on → Welcome → quick start a plan → add 3 purchases → airplane mode off → More → sign up with a **new** account | The plan and the 3 purchases appear on the server once each: sign in to that account on A ("Use my account's records") and see exactly 1 plan and 3 records | |
| **AC-23** Delete offline (FR-SYNC-09) | A and B synced → airplane mode on A → delete a synced purchase in Records (let the Undo bar time out) → A online, Back up now → B: Back up now, then once more | The purchase is gone on A and B and stays gone after another sync on both | |
| **AC-24** Another student's records (FR-ACC-04, S-02) | Two accounts, X and Y, each with records → sign in as Y on B | B shows only Y's records, never X's. (The server refusing X's records to Y's sign-in is tested automatically in `app.test.ts` and `two-phones.test.ts`.) | |

## Also check while testing

- Sign-in with records on both sides offers S13d, and "Add this phone's records" with a plan for the same
  dates asks which plan to keep (S13l, D-83).
- A first backup of a phone used offline for a while finishes in seconds, not tens of seconds (speed
  check, D-89).
- The phone and emulator both show the "You're backed up 🥦" toast after the first sign-in.

## Run log

| Date | Commit | Devices | Who | Notes |
|---|---|---|---|---|
| | | | | |

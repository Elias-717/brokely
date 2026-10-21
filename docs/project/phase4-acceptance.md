# Phase 4 acceptance: AC-20 … AC-24 on two real devices

Phase 4 ends when these five acceptance tests pass between two real devices (AGENTS.md section 6).
Each one is also covered by automated tests (`apps/api/src/sync/two-phones.test.ts`, `sync.test.ts`,
`app.test.ts`); this sheet records the run on devices.

**Devices:** A = Samsung Galaxy A26 (reference phone, NFR-06) · B = Android emulator Pixel_6.
**Build:** release APK (`apps/mobile/android`, `.\gradlew assembleRelease`) on both, same commit.
**Account:** one test account signed in on both (Google or email), unless a test says otherwise.
**Clocks:** both devices on Malaysia time. The emulator starts on GMT; set it with
`adb -s emulator-5554 shell service call alarm 3 s16 Asia/Kuala_Lumpur`, or "today" differs and the
two devices show different plans for the same data (seen 22 Oct; sync itself was fine).
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

## Findings during the run

- **Time zone setting is not used for "today".** `today()` follows the phone's clock; the stored setting (More → Time zone) changes nothing. Same result on a real phone in Malaysia; on the GMT emulator, "today" was still 21 Oct while the setting said Kuala Lumpur (22 Oct), so a plan starting 22 Oct didn't show. Decide: use the setting for "today", or remove it.
- **The Undo bar is still invisible to the screen reader dump** (`uiautomator`), as noted before; check it by eye on the phone.

## Run log

| Date | Commit | Devices | Who | Notes |
|---|---|---|---|---|
| 22 Oct 2026, 02:4x MYT | aa31b57 (API), APK built 02:24 | B = emulator Pixel_6 (release APK), server checked in Supabase | Claude | **AC-20 ✅** offline purchase "AC20 test" RM 7.50 survived a force-close; after reconnecting, two "Back up now" taps left exactly one copy on the server (version 1, one line), emulator "Backed up", nothing waiting. **AC-23 ✅ on the emulator and server** deleted offline, backed up: server has the delete marker (version 2) and it stayed gone after another sync; still to see on the phone (A). AC-21, AC-22, AC-24 need the phone and emulator together |
| 22 Oct 2026 | release APK from `main` | Two phones (author's) | Author | AC-20, AC-21, AC-22, AC-23 and AC-24 passed on two real phones (author's report). **Phase 4 closed.** |

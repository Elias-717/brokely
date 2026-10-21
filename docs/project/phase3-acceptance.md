# Phase 3 acceptance: the 0.1 acceptance tests

Phase 3 (offline app) ends when all of 0.1 works on one phone, offline, without an account
(AGENTS.md section 6). These are the SRS v1.6 acceptance tests for release 0.1: AC-01…AC-30, AC-47…AC-49
and AC-52…AC-63. AC-20…AC-24 are the sync tests and are run in `phase4-acceptance.md`.

**Automated** = a test checks the rule or the stored result (domain, phone database or server), named
with the AC. **On the phone** = what a test can't see: the screen itself. Run those on the reference
phone (Samsung Galaxy A26) with the release APK, signed out, airplane mode on (offline), and mark
✅ / ❌.

## Covered by automated tests

| AC | What | Where |
|---|---|---|
| AC-02 | Laundry every 2 weeks 2 × RM16; Mon/Thu bill 8 × RM5 | `domain/cycle.test.ts` |
| AC-03 | Shortfall RM30 shown, approval needs acknowledging | `domain/plan.test.ts`, `api/sync.test.ts` |
| AC-04 | Golden path: RM5 laundry, RM35 left in laundry, RM395 left in plan | domain, local-db, api |
| AC-05 | Edit RM5 → RM7: one transaction, history kept | `local-db/transactions.test.ts`, `restore.test.ts` |
| AC-06 | New revision, original kept, summary 250 → 300 → 290 | `domain/plan.test.ts` |
| AC-07 | Transfer is not spending | `domain/spending.test.ts`, `local-db/transactions.test.ts` |
| AC-08 | Borrow 50, repay 20 → outstanding 30 | `domain/debts.test.ts` |
| AC-09 | Refund limits | domain, local-db, api |
| AC-10 | Split purchase, lines must add up | domain, local-db, api |
| AC-11 | Write-off to Gifts is spending | `domain/debts.test.ts`, `spending.test.ts` |
| AC-12 | Mark paid RM22 on a RM20 bill; skip | `local-db/bills.test.ts`, `progress.test.ts` |
| AC-13 | Forecast range RM340–RM400 | `domain/progress.test.ts` |
| AC-14 | Forecast hidden below day 14 or 70% | `domain/progress.test.ts` |
| AC-15 | Elapsed days 2 before logging today, 3 after | `domain/progress.test.ts` |
| AC-16 | Daily average RM3.12 half-even | `domain/money.test.ts`, `progress.test.ts` |
| AC-17 | Category with no spending: RM0.00, 0% | `domain/spending.test.ts` |
| AC-18 | Suggestions say "10 days, 80% logged", nothing invented | `domain/suggestions.test.ts` (D-91) |
| AC-19 | Upcoming bill in still to come, not spending | `local-db/bills.test.ts`, `progress.test.ts` |
| AC-25 | Export has everything; delete removes it | `local-db/data.test.ts`, `api/app.test.ts` (FR-ACC-07), `api/schema.test.ts` |
| AC-26 | Bill RM5 → RM6 changes only what's still to come | `local-db/bills.test.ts` |
| AC-27 | Used category: delete refused, archive kept in reports | domain, local-db, api |
| AC-28 | Emergency set-aside RM30, RM12 paid from it | domain, local-db |
| AC-29 | Overlapping plans refused | domain, local-db |
| AC-30 | No spending today, then Undo | `local-db/progress.test.ts` |
| AC-47 | One draft revision, continue, discard | `local-db/drafts.test.ts`, domain |
| AC-48 | Plan completes the next day; next plan drafted | `domain/cycle.test.ts`, `local-db/cycles.test.ts` |
| AC-49 | Completed plan stays editable: late record and raised amount count | `local-db/cycles.test.ts` (added 22 Oct) |
| AC-52 | The 13 default categories with their kinds | `local-db/categories.test.ts` |
| AC-53 | Quick start RM400, 1–30 Nov, no amounts needed | `local-db/plan.test.ts` |
| AC-54 | Laundry card 3 × RM16 = RM48, new revision | domain, local-db |
| AC-56 | Pace against the budget while nothing is planned (R-11) | `domain/progress.test.ts` |
| AC-57 | Purchase then Undo | `local-db/transactions.test.ts` |
| AC-58 | Start fresh mid-month | `domain/cycle.test.ts` |
| AC-59 | Catch me up with "Spent before Brokely" | domain, local-db |
| AC-60 | Progress counts from the tracking start (BR-29) | `domain/progress.test.ts` |
| AC-61 | Money in RM500 suggests adding RM100 | domain, local-db |
| AC-62 | Wallet check: RM22 missing against expected RM202 | domain, local-db |
| AC-63 | Log it only after the tap; extra offered as money in | domain, local-db |

## On the phone (screen checks)

Offline, signed out, a fresh install (or More → Your data → Delete all my data).

| AC | Steps | Pass when | Result |
|---|---|---|---|
| AC-55 | Open the app for the first time | Welcome shows one Brokely picture and the greeting; no XP, mood or growth | |
| AC-01, AC-52, AC-53 | Let's go → quick start: RM400, 1–30 Nov, approve | No bank balance or allowance asked; Home shows RM400.00 left in plan, 30 days left; no amounts were required | |
| AC-54 | On Home, accept the Laundry card (every 2 weeks, RM16), then "Not for me" on Transport | Laundry RM48 with its basis 3 × RM16; Transport card gone | |
| AC-57 | Records → + → type 12 → Meals → Save → Undo on the bar | Opened in one tap; saved in 3 taps after the amount; Undo bar visible and removes it | |
| AC-04, AC-17 | Add RM5 Laundry; open Insights; tap the Laundry slice | RM395.00 left in plan; slice RM5.00; tapping lists the record; a category with no spending shows RM0.00 / 0% without errors | |
| AC-14 | Insights before day 14 | "Not enough data yet" instead of a forecast; daily average with its coverage | |
| AC-30 | Home → No spending today → Undo | Day covered after the tap, not after Undo | |
| AC-61 | Add money in RM300 (Meal money) and RM200 (Part-time) on a RM400 plan | Left in plan unchanged; Home suggests adding RM100; nothing changes without a tap | |
| AC-62, AC-63 | More → Wallet check twice with a gap (see SRS example) | The difference is worded from your own check; Log it only after a tap | |
| AC-25 | More → Your data → Export records (CSV) and Export everything (JSON), then Delete all my data | Files open in the share sheet and hold the plans, records and debts; after deleting, the app starts at Welcome | |

## Run log

| Date | Build | Phone | Who | Notes |
|---|---|---|---|---|
| 22 Oct 2026 | release APK from `main` (534cb6b era) | Samsung Galaxy A26 | Author | All screen checks passed (author's report); automated tests 399/399 green. **Phase 3 closed.** |

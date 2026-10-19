# Business rules → code → tests

Phase 2 traceability: every business rule in SRS v1.2 section 5 (BR-01…BR-28) is implemented in
`packages/domain` and covered by at least one test. Tests name the SRS IDs they check.

| Rule | What | Code (`packages/domain/src`) | Tests |
|---|---|---|---|
| BR-01 | Whole sen, > 0 on stored amounts | `money.ts` `sen`, `sumSen` | `money.test.ts` |
| BR-02 | Exact sums; half-even rounding for display only | `money.ts` `divideSen`, `roundHalfEven`, `formatRM` | `money.test.ts` (AC-16) |
| BR-03 | Inclusive end stored as end + 1 day; local dates | `dates.ts`, `cycle.ts` `cycleFromInclusive`, `inclusiveEnd` | `cycle.test.ts` |
| BR-04 | A record belongs to the cycle containing its date | `cycle.ts` `contains`, `spending.ts` `inRange` | `cycle.test.ts`, `spending.test.ts` |
| BR-05 | No overlap between active/completed cycles | `cycle.ts` `checkNoOverlap` → `CYCLE_OVERLAP` | `cycle.test.ts` (AC-29) |
| BR-06 | Planned spending P = ΣCᵢ | `plan.ts` `planTotals` | `plan.test.ts` (AC-04) |
| BR-07 | Unallocated U and shortfall | `plan.ts` `planTotals`, `checkCanApprove` | `plan.test.ts` (AC-03) |
| BR-08 | Current = highest approved revision; original kept; approved revisions immutable | `plan.ts` `currentRevision`, `originalRevision`, `checkCanEditRevision` | `plan.test.ts` (AC-06) |
| BR-09 | Bill suggestion = real dates × amount (incl. every N weeks) | `bills.ts` `billDates`, `billSuggestion` | `cycle.test.ts` (AC-02) |
| BR-10 | Spending N; transfers and debt principal excluded | `spending.ts` `spendingByCategory`, `totalSpending` | `spending.test.ts` (AC-07, AC-08, AC-10) |
| BR-11 | Category / set-aside remaining (may be negative) | `spending.ts` `remaining` | `spending.test.ts` (AC-04, AC-28) |
| BR-12 | Left in plan = B − N | `spending.ts` `leftInPlan` | `spending.test.ts` (AC-04) |
| BR-13 | Variance = P − N | `spending.ts` `variance` | `spending.test.ts` |
| BR-14 | A bill is never both upcoming and spent | `progress.ts` (still to come excludes paid items) | `progress.test.ts` (AC-12) |
| BR-15 | Covered day: non-estimate spending entry or check-in | `progress.ts` `coveredDates` | `progress.test.ts` (AC-30, AC-51) |
| BR-16 | Elapsed days, days left, coverage | `progress.ts` `elapsedDays`, `computeProgress` | `progress.test.ts` (AC-15) |
| BR-17 | Forecast gate: ≥ 14 days and ≥ 70% coverage | `progress.ts` `computeProgress` | `progress.test.ts` (AC-14) |
| BR-18 | Daily average; everyday rate without bills and estimates | `progress.ts` `computeProgress` | `progress.test.ts` (AC-16, AC-51) |
| BR-19 | Still to come = upcoming items in the cycle | `progress.ts` `computeProgress` | `progress.test.ts` (AC-19) |
| BR-20 | Forecast middle and ±15% range rounded to RM10 | `progress.ts` `forecast` | `progress.test.ts` (AC-13) |
| BR-21 | Pace from the unrounded middle; budget as target while P is 0 (R-11) | `progress.ts` `forecast`, `paceTarget` | `progress.test.ts` (AC-13, AC-56) |
| BR-22 | Debt outstanding derived; can't go below zero | `debts.ts` `summarizeDebt`, `checkWithinOutstanding` → `DEBT_EXCEEDS_OUTSTANDING` | `debts.test.ts` (AC-08) |
| BR-23 | Receivable write-off becomes spending | `spending.ts` `spendingByCategory`, `debts.ts` | `spending.test.ts`, `debts.test.ts` (AC-11) |
| BR-24 | XP values and daily cap | `xp.ts` `XP_VALUES`, `awardXp` | `xp.test.ts` (AC-42) |
| BR-25 | XP once per source event | `xp.ts` `awardXp` | `xp.test.ts` (AC-42) |
| BR-26 | XP never depends on amounts or changes money | `xp.ts` (events carry no amounts) | `xp.test.ts` |
| BR-27 | Cycle lifecycle; automatic completion; next cycle | `cycle.ts` `statusOn`, `nextCycleRange` | `cycle.test.ts` (AC-48) |
| — | Default categories (FR-CAT-01, D-22) | `categories.ts` `DEFAULT_CATEGORIES` | `categories.test.ts` (AC-52) |
| BR-28 | Used categories are archive-only | `plan.ts` `checkCanDeleteCategory` → `CATEGORY_IN_USE` | `plan.test.ts` (AC-27) |

Also covered: FR-TXN-04 lines sum (`checkLinesSum`, AC-10), FR-TXN-06 refund limit (`checkRefund`, AC-09),
FR-PLN-16 one draft (`checkCanCreateDraft`, AC-47), FR-INS-04 chart shares (`shareOfSpending`, AC-17),
FR-DEBT-01 debt directions (`checkDebtMovement`).

**Not in Phase 2 (decisions still needed, release 0.2):** XP thresholds for the 3 growth stages and the priority
between moods (e.g. proud vs worried on the same day). Ask the user before building the mascot screen.

# Brokely — Decision Log

Decisions D-01 to D-09 and R-01 to R-08 were taken on 19 Oct 2026 while reviewing PRD v1.0 and SRS v1.0, and are applied in v1.1. Decisions from D-10 and R-09 onward come after v1.1 and must be added to the next revision (v1.2). Evidence references (F-xx) point to the private research log, which is not in this public repo.

## Product decisions

| # | Decision | Chosen option | Implications |
|---|----------|---------------|--------------|
| D-01 | Splitting payments | One transaction can be split into a spending part and an owed-to-me part in 0.1. Splits between categories are deferred. | Transaction has one or more lines (spending or debt). The debt line links to a Debt. Lines must add up to the transaction amount. |
| D-02 | Import review | Every imported TNG transaction needs user confirmation in 0.2. | Imports wait in a review queue and don't count toward totals until confirmed. |
| D-03 | Reporting baseline | Show both. | Daily guidance and remaining amounts use the latest approved revision. The end-of-cycle summary shows original plan, final plan and actual. |
| D-04 | Reserve vs set-aside | Merge into one concept: labelled set-asides. | Set-asides are not spending. A transaction may be marked "paid from set-aside", which reduces that set-aside instead of a category. U = B − (ΣCᵢ + ΣSⱼ). |
| D-05 | Before sign-in | Allow local-only mode. | The app works without an account. Local records keep client-generated IDs; on sign-up they are attached to the account and synced. |
| D-06 | Multi-device conflicts | Reject and notify in 0.1. | The server rejects writes based on an out-of-date version. The app shows the latest version and asks the user to re-apply. No merge screen in 0.1. |
| D-07 | Notification tone | Every notification must be fun. | Playful app tone (light humour, emoji), not written as the mascot speaking. Fact and action first, exact numbers, no shaming, mutable. Several local template variants; no paid AI. |
| D-08 | Glossary style | Keep the glossary as simple as possible. | Plain one-line meanings; formulas live only in the SRS. |
| D-09 | Mascot | **Brokely**: a broccoli that grows money instead of leaves. No voice; static pictures with simple XP, from 0.2. | Growth stages from XP level; moods from the user's state. XP only for habits, capped, earned exactly once, never for spending less. 0.3: coins and cosmetics if the pilot wants them. Optional; never affects financial numbers. |
| D-10 | Mobile framework | React Native with Expo (development builds) plus a native Kotlin TNG notification listener. | Expo Go is not used. The listener uses the Expo Modules API in 0.2. |
| D-11 | Merchant memory | Add to 0.2: remember the category chosen for each merchant and pre-fill it. | New FR-IMP-12 and a MerchantCategory entity on the phone. |
| D-12 | Default food categories | **Meals** (essential) and **Snacks & treats** (optional). | Update FR-CAT-01. Evidence is from one student; confirm in interviews. |
| D-13 | Code hosting | **Public** GitHub repository `brokely`. | Monorepo layout. No secrets and no personal data (spending exports, real notification samples, interview notes) are ever committed. |
| D-14 | Groceries category | Add default essential category **Groceries & toiletries**. | Update FR-CAT-01. |
| D-15 | Fill a gap with an estimate | Add in **0.2**. | Estimated entries count as spending but are clearly marked, never count as logged days, and are excluded from the everyday rate. |
| D-16 | Wallet check | **Decide after the interviews.** | Optional manual balance check; would change the "no balances" non-goal. |
| D-17 | Bill repeat options | Add **"every N weeks"** and every N days. | Fix FR-CAT-03; replace the AC-02 laundry example with a realistic pattern (e.g. every 2 weeks at RM16). |
| D-18 | Cycle end | When an active cycle's end date passes it becomes **completed automatically**; the app shows the summary and offers "Start next cycle" (a draft copied from the current revision). | Lifecycle draft → active → completed → archived; only drafts can be deleted. Completed cycles still own their dates (no overlap with active ones). |
| D-19 | Editing completed cycles | **Everything stays editable** in a completed cycle: transactions and the plan. | Plan edits still create a new revision (original kept, D-03); the end-of-cycle summary recomputes with final = latest revision. XP is never re-earned by edits (BR-25). |

## Calculation rules

| # | Rule | Chosen option | Implications |
|---|------|---------------|--------------|
| R-01 | Coverage | "No spending today" check-in. | A day is covered if it has a spending entry or a check-in. Coverage = covered days ÷ elapsed days. |
| R-02 | Forecast formula | Split formula. | Forecast = spent so far + scheduled items still to come + everyday rate × days left. The everyday rate leaves out transactions linked to scheduled items. |
| R-03 | Rounding | Round only when displaying. | Exact whole sen for every sum; division results rounded half-even only for display. |
| R-04 | Sign convention | Positive amount plus a type. | amount_sen > 0; the type decides the effect. Refunds reference the purchase they reverse. |
| R-05 | Paying a planned bill | "Mark paid" in 0.1, reminder in 0.2. | Mark paid creates a linked transaction with an editable amount; the item leaves "still to come". |
| R-06 | Elapsed days | Today counts only once it is covered. | Elapsed days = cycle days before today, plus today if covered. |
| R-07 | Debt write-off | A receivable write-off becomes spending. | Recorded in a category the user chooses, on the write-off date. A payable write-off only closes the debt. |
| R-08 | Pace | Derived from the forecast. | "Over pace" if forecast > planned spending; hidden when the forecast is hidden. |
| R-09 | Forecast gate and range | From **day 14** (coverage ≥ 70%), shown as a **range**. | Replaces the 7-day gate. Range method: see R-10. Pace uses the middle of the range. |
| R-10 | Forecast range method | Everyday-rate part ±15%, rounded to RM10. | Low = N + still to come + 0.85 × everyday rate × days left, rounded **down** to RM10; high = same with 1.15, rounded **up** to RM10. The unrounded middle (×1.00) is used for pace. 15% to be tuned with pilot data. |

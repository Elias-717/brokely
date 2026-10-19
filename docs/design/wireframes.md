# Wireframes v0.1 (low fidelity)

**Figma file:** [Brokely Wireframes](https://www.figma.com/design/Hm2YNImm4pKtD11ke0iPKb) — page "Wireframes".
**Status:** first pass, 2026-10-19. For review by the author before Phase 3 screens are built.

These are grey boxes: they fix **structure, words and numbers**, not colours, fonts or art.
The font (Inter) is a placeholder. The mascot is a dashed slot until the author's pictures land in
`apps/mobile/assets/mascot/` (0.2, `docs/design/mascot-brief.md`).

## Example data (the same on every screen)

Day 15 of a 1–30 Nov 2026 cycle. Budget RM400. Spending so far N = RM111.00
(Meals 42, Phone & internet 35, Laundry 16, Groceries & toiletries 12, Snacks & treats 6).
Bill-linked spending RM51 (laundry 1 Nov, phone 5 Nov). 14 of 15 days logged.

Checked against the rules, so the screens can double as test examples:

| Figure | Working | Shown |
|---|---|---|
| Left in plan (BR-12) | 400 − 111 | RM 289.00 |
| Daily average (BR-15) | 111 ÷ 15 | RM 7.40 |
| Coverage (BR-14) | 14 ÷ 15 | 93% |
| Everyday rate (BR-16) | (111 − 51) ÷ 15 | RM 4.00 a day |
| Still to come | laundry today + laundry 29 Nov | RM 32.00 |
| Forecast middle (BR-18) | 111 + 32 + 4 × 15 | RM 203 |
| Forecast range (R-09, R-10) | 111 + 32 + 51 → down; 111 + 32 + 69 → up | RM 190 – RM 220 |
| Gate (BR-17) | day 15 ≥ 14 and 93% ≥ 70% | shown |
| Chart shares (half-even) | 42, 35, 16, 12, 6 of 111 | 38%, 32%, 14%, 11%, 5% |

The plan wizard uses its own example: essentials add up to RM417 against RM400, so it shows the
shortfall state (unallocated −RM17.00).

## Screens

| Screen | What it shows | Requirement IDs |
|---|---|---|
| S1 First launch | Create a plan / Track spending first; no account | FR-ACC-01, FR-PLN-01, FR-PLN-04 |
| S2a Plan · cycle and budget | Budget only, inclusive dates | FR-PLN-01…03, AC-04 |
| S2b Plan · essentials | How often and how much; repeats become bills | FR-PLN-05, FR-CAT-01, FR-CAT-03 |
| S2c Plan · suggested amounts | "30 × RM9.00" basis, editable; set-asides | FR-PLN-06, FR-PLN-07, FR-PLN-12, BR-05 |
| S2d Plan · review | Totals, shortfall acknowledgement, Approve | FR-PLN-08…10, BR-04, AC-04 |
| S3 Home | Left in plan, forecast range, categories, still to come, No spending today, + Add | FR-INS-01, 02, 06, 07, 08, FR-TXN-08, FR-CAT-05, FR-MAS-01 |
| S4 Quick add (sheet) | Keypad, category chips, split with a friend, lines must add up | FR-TXN-01…05, FR-DEBT-05, D-01 |
| S5 Records | By day, filters, sync status dot, check-ins | FR-TXN-01, 07, 08, FR-SYNC-06, FR-DEBT-06 |
| S6 Bills | Upcoming/Paid, Mark paid with editable amount, Skip, repeat options | FR-CAT-03…07, D-17, BR-06 |
| S7 Debts | Owed to me / I owe, repayments, write off into a category | FR-DEBT-01…06, R-07 |
| S8 Insights | Doughnut with % and RM, daily average with coverage, forecast | FR-INS-03…06, FR-INS-08, R-09, R-10 |
| S9 Plan & settings | Edit plan = new revision; account, time zone, notifications, mascot, export, delete | FR-PLN-11, FR-PLN-16, FR-ACC-02, 05–07, FR-NOT-05, FR-MAS-06 |
| S10 Cycle finished | Original → final → actual, still editable, start next cycle | FR-PLN-14, 15, 17, 18, D-18, D-19 |

## Layout proposals to review (not decisions yet)

These are wireframe choices, not product decisions. Confirm or change them; confirmed ones go in the decision log.

1. **Tab bar:** Home · Records · Insights · Debts · Plan. Bills open from Home ("Still to come").
2. **Quick add is a bottom sheet** with a keypad and category chips, purchase by default; other types (refund, transfer, borrow, lend) sit behind a type switch not drawn yet.
3. **Shortfall:** Approve stays disabled until a checkbox "I understand my plan is over budget" is ticked.
4. **Mascot on Home** sits beside "Left in plan" (top right), hidden when the student turns it off.
5. **Forecast label** reads "On pace" / "Over pace" under the range; before the gate it reads "Not enough data yet".

## Not drawn yet

Refund flow, transfer/borrow/lend type switch, edit history, sync conflict screen (FR-SYNC-08),
sign-in and account linking (FR-ACC-02/03), notification settings detail, export result, and all 0.2
screens (pending imports, XP, cycle comparison).

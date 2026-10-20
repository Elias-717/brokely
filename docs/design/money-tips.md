# In-app money tips (built in 0.1, D-67)

**Status:** requested 20 Oct 2026 (D-39); **built 21 Oct 2026 (D-67)**, brought forward into 0.1 by the author. Tips live in `apps/mobile/src/lib/money-tips.ts`; the pop-up in `src/ui/money-tip.tsx`. Needs an FR and an
acceptance test in the next SRS/PRD revision (v1.7 / v1.6).

## What it is

Short, fun pieces of money know-how that **slide in from the side of the screen** inside the app. They
teach financial literacy in small bites ("Did you know…?") and give practical advice for students.
Tapping a tip **dismisses it**. Tips are a **reward for recording**: one may appear right after the
student logs something, so the habit Brokely wants to build gets a small, friendly payoff.

They are **in-app only**: not phone notifications (those are the separate 0.2 notification engine,
SRS section 6) and never shown when the app is closed.

## How it behaves

| Topic | Rule |
|---|---|
| When | After a record is saved (spending, money in, a check-in…), not on a timer. Not every time: at most a few per day so tips stay special (exact cap: open question). |
| Where | Slides in from the side of the screen, without covering the Undo bar or the main buttons; never blocks the app. |
| Dismiss | Tap the tip to close it. It also leaves on its own after a while. |
| Off switch | **Settings → Money tips: on / off.** On by default; switching it off stops all tips immediately. Stored on the phone. |
| Motion | Respects the phone's Reduce motion setting (it just appears and disappears). |
| Accessibility | Announced to screen readers once; large enough text; dismiss target ≥ 48 dp (NFR-07). |
| Repeats | The same tip does not come back until most others have been shown. |

## Writing the tips (content rules)

- **Local, written templates only**: no AI (rule 8, NFR-20), works offline.
- **Accurate and checked.** Money advice must be correct; each tip is reviewed by the author before it
  ships. Malaysian context where it helps (e.g. PTPTN, TNG, student discounts), no product endorsements.
- **Fun never replaces clarity** (rule 9): one idea per tip, plain words, short (about 1–2 sentences).
- **No shaming**, no fear, no "you spent too much". Encourage habits, never judge spending.
- **Never claim a balance** and never promise the student won't run out of money (rule 6, FR-MAS-08).
- Glossary words only (`docs/project/glossary.md`; e.g. "money in", never "allowance").
- Brokely's voice: friendly, light, a little playful; the mascot can appear next to the tip.

Example tone (draft, to be reviewed):

- "Little leaks sink big ships: RM3 a day of snacks is about RM90 a month. Worth it? Your call 🥦"
- "Paying a friend back fast keeps friendships (and your plan) healthy."
- "Set aside a small Emergency amount first, even RM20. Future you will say thanks."

## Answers (D-67, 21 Oct)

1. **Cap:** none since D-69: a tip after every expense (it was 3 a day; `TIPS_PER_DAY` can bring a cap back). Shown only after logging **spending** (author: "after the user adds an expense").
2. **Writers:** the author's 30 tips (reworded for the glossary: "money in", not "allowance"/"payday") plus 20 by Brokely, some inspired by *Rich Dad Poor Dad* ideas (pay yourself first, assets vs liabilities, learning that earns) in our own words. **The author reviews them all.**
3. **Related to the record:** mostly (about 3 in 4 times) a tip matching the category just logged, otherwise a general one.
4. **XP:** none for now (0.2).

## Open questions (original, kept for history)

1. Daily cap: how many tips per day at most (suggestion: 2–3), and a minimum gap between them.
2. Who writes the first set of tips, and how many to start with (suggestion: 30–50).
3. Should a tip ever relate to what was just recorded (e.g. after a snack: a tip about small daily
   spending), or always be general?
4. Does seeing tips earn XP (0.2 mascot), or are they separate? (Rule 10: XP only for habits.)

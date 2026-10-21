# Brokely Mascot — Art Brief v1

Owner: the author. Used in release 0.2 (D-09, FR-MAS-01…06). The mascot has **no voice and no text**; it is static pictures.

## Character

**Brokely** is a cheerful broccoli whose florets are **banknotes and coins instead of leaves**. The joke is the name:
students feel broke, and Brokely helps their money grow by helping them plan.

- Friendly, simple shapes; one consistent silhouette across all pictures.
- Must read clearly at small size (48 × 48 px on Home) and large size (240 px on the Brokely tab).
- Works on both light and dark backgrounds.
- Mood must be clear from **face and pose**, not colour alone (colour-blind users).

## What to create: 12 pictures (3 stages × 4 moods)

**Growth stages** (set by XP level, FR-MAS-02):

| Stage | Look |
|---|---|
| 1 Sprout | Tiny stem, two leaves, **one coin** on top |
| 2 Young broccoli | Small head with **a few banknotes** as florets |
| 3 Money broccoli | Full, bushy head **packed with banknotes and coins** |

**Moods** (set by the student's state, FR-MAS-03):

| Mood | When it shows | Look |
|---|---|---|
| Happy | On track | Smile, relaxed |
| Worried | Over pace | Concerned eyebrows, small sweat drop. **Not** sad, crying or sick |
| Proud | 3+ day logging streak | Chest out, sparkles or a small flame |
| Sleepy | No logged day for 3+ days | Half-closed eyes, "zzz" |

## Delivered (19 Oct)

All 12 pictures and `main_design` are in the app as **WebP** (`apps/mobile/assets/mascot/*.webp`, longest side 768 px, quality 85, transparent: **1.0 MB in total**, NFR-19 ≤ 5 MB, 22 Oct). The original ~1250 px PNGs (14.7 MB) are kept as masters in `design/mascot-source/`, with `shrink_mascot.py` to make the WebP files again. The author chose **`main_design` for the 0.1 welcome screen** instead of a separate `brokely_welcome`.

## Needed first, for 0.1: the welcome picture (D-23, FR-MAS-08)

One extra picture is needed **before** the 12 above, because it ships in 0.1 on the first-run welcome screen:

| File | Look |
|---|---|
| `brokely_welcome.png` | Stage 2 young broccoli, happy, **waving hello**, maybe a coin tossed in the other hand. Friendly and confident, not smug |

The greeting ("Hi, I'm Brokely! Broke is my name, not your future. Let's plan it together 🥦") is added by the app, not drawn in the picture.

## Guardrails (from the requirements)

- **Never shame** (rule 9, BR-26): no crying, no angry, no wilted or starving Brokely, no frowning at food or laundry.
- Growth comes from habits, not from saving money, so a bigger Brokely must not look "richer because you spent less" in any caption or extra art.
- No real currency notes copied exactly (avoid reproducing Bank Negara designs); use a simple stylised note with "RM".
- No text inside the images (labels are added by the app, translatable later).

## File specs

- Format: **PNG with transparent background** (the app converts to WebP).
- Canvas: **1024 × 1024 px**, character centred with ~10% empty margin.
- Names: `brokely_s{stage}_{mood}.png`, e.g. `brokely_s1_happy.png`, `brokely_s3_sleepy.png`.
- Total of all mascot assets in the app ≤ 5 MB after compression (NFR-19).
- Keep the source file (Figma, Procreate, etc.) so we can change expressions later.

## Optional extras (nice to have)

| Asset | Spec |
|---|---|
| App icon | 1024 × 1024 PNG; Brokely stage 3 happy on a plain background |
| Android adaptive icon | Foreground 1024 × 1024 with the character inside the central 66% circle; separate plain background colour |
| Empty-state picture | Brokely sprout waving, for "no transactions yet" |

## How to hand over

Put the PNGs in `apps/mobile/assets/mascot/` (or send them), and the agent wires them into the Brokely tab and Home.

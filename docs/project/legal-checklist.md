# Legal checklist before releasing Brokely

Written 22 Oct 2026 for the author (Elias Al-Sumairi). **This is an engineering checklist, not legal
advice.** The cheapest real protection is having someone qualified read the notice and terms once:
AIU's legal or research-ethics office, or a Malaysian lawyer.

Done in the app (D-92, D-93): Privacy notice and Terms of use in English and Bahasa Malaysia (More → Your
data, and agreed to on the sign-in screen), public pages `/privacy`, `/terms`, `/delete-account` on the API,
account deletion in the app, export of all data, no ads/analytics/tracking.

## 1. Privacy (PDPA 2010, amended 2024)

Details and findings P-1…P-9: `privacy-review.md`.

- [ ] Have the Malay notice and terms checked by a native speaker (P-2).
- [x] Android Auto Backup switched off (P-3, D-97); the notice stays a link (P-7).
- [ ] Turn on leaked-password protection (P-4), confirm backups ≤ 30 days (P-5).
- [ ] Approve the one-page **breach plan** (`breach-plan.md`, drafted 23 Oct): who notices, how to judge harm, report to the Commissioner **within 72 hours**, tell affected students within 7 days if harm is likely, keep a record (P-6).
- [ ] Answer access, correction and deletion requests within **21 days**; check the contact inbox (eliassumairi@gmail.com) regularly.
- [ ] Check whether Brokely falls into a **class that must register** with the PDP Commissioner. Listed classes include education and financial services; a personal student project usually doesn't, but if Brokely is run **as an AIU project**, the university's own registration and rules may apply. Ask AIU.
- [ ] Never put real student data, notification texts with names, or exports in the public repo (AGENTS rule 7).

## 2. Money and financial regulation

Brokely stays clear of licensed activities as long as it keeps doing what it does now:

- [ ] **No payments or e-money:** it never moves money (Financial Services Act 2013, BNM). Keep it that way.
- [ ] **No lending:** debts are only records between friends; never let Brokely arrange loans or charge interest (Moneylenders Act 1951).
- [ ] **No investment advice:** money tips must stay **general budgeting education**. No specific stocks, unit trusts, ASB, crypto, apps or "buy/sell" advice (Capital Markets and Services Act 2007 licenses investment advice). Check the 50 tips in `apps/mobile/src/lib/money-tips.ts` against this before release.
- [ ] **No promises:** never say "you won't go broke" or guarantee savings (Consumer Protection Act 1999: no misleading claims). The Welcome line already follows this (D-23).

## 3. The pilot with students

- [ ] A usability study with students is **research with people**: ask your supervisor or AIU's research-ethics committee whether you need approval before recruiting.
- [ ] Use a short **consent form**: what they'll do, that it's voluntary, that they can stop any time, what you record (feedback, not their real spending), how long you keep it.
- [ ] Recruit **18 and over** only (the Terms say so).
- [ ] Ask testers to use **test data or rough amounts** if they prefer; never ask for screenshots of real bank or TNG apps.
- [ ] Keep feedback anonymous (e.g. "Student 3") and store it outside the public repo.

## 4. Name, art and fonts (intellectual property)

- [ ] Search **"Brokely"** in MyIPO's trademark search and on Google Play before publishing, to avoid a name clash.
- [ ] **Mascot art:** make sure you own it. If someone drew it for you, get a short written note that they give you the rights; if it was made with an AI tool, check that tool's terms allow use in an app.
- [ ] **Fonts:** Lilita One and Nunito are under the SIL Open Font License (free, commercial use allowed). Add an **"Open-source licences"** screen listing the fonts and the main libraries (MIT/Apache) with their notices. Agent can build this.

## 5. Google Play and Google sign-in

- [ ] **Privacy policy URL:** `https://…azurecontainerapps.io/privacy` (a custom domain later looks more professional).
- [ ] **Account deletion URL** (required for apps with accounts): `https://…azurecontainerapps.io/delete-account`.
- [ ] Fill the **Data safety** form exactly like the privacy notice: email, name, user content (financial records), app activity none, no sharing, encrypted in transit, deletion available.
- [ ] Complete the **financial features declaration** honestly (budgeting/expense tracking; no loans, no payments).
- [ ] **Target audience: 18+.**
- [ ] **Google consent screen:** add pilot testers as test users, or publish with only the basic scopes (email, profile, openid); add the privacy and terms URLs there too.
- [ ] Use a proper **release signing key** and keep it backed up safely (losing it means you can't update the app).

## 6. Security habits

- [ ] Never commit secrets; if one leaks (database URL, keys), **rotate it at once**.
- [ ] Keep dependencies updated (Expo SDK bug-fix releases, `pnpm` audit).
- [ ] Keep the decision log and every version of the notice and terms in git, so you can show what students saw and when.

# Privacy review: Brokely 0.1 and Malaysia's PDPA

Phase 5 (Release 0.1) privacy review, 22 Oct 2026. Law: **Personal Data Protection Act 2010 (PDPA)**, as
amended by the **PDP (Amendment) Act 2024** (in force in phases: 1 Jan, 1 Apr and 1 Jun 2025). This is an
engineering review, not legal advice; the author decides, and a lawyer or the university's data
protection contact should look at it before a public release.

The notice students see: `packages/contracts/src/privacy-notice.ts` (English + Bahasa Malaysia), shown in
the app (More → Your data → Privacy notice; "How Brokely handles your data" on the sign-in screen) and
publicly at `GET /privacy` on the API (for Google Play and the Google consent screen). Decision: D-92.

## 1. What personal data Brokely handles

| Data | Where | Why | Kept until |
|---|---|---|---|
| Plans, budgets, category amounts, records (amount, date, category, **free-text note**), bills, money in, wallet checks (total money counted), no-spending days, settings | Phone (SQLite, app sandbox) | The app's purpose | Delete all my data, or uninstall |
| **Friends' names** typed in debts and splits (third parties) | Phone; account if signed in | Debts | As records |
| Nickname, theme, card choices, money-tip settings | Phone only (`local_prefs`) | Personalisation | As above |
| Random device ID | Phone; sent with each backup | Telling a student's phones apart in sync | As records |
| Email; with Google also name, profile-photo link, Google account ID | Supabase Auth (Singapore) | Sign-in | Delete my account |
| Copy of all synced records | Supabase Postgres, schema `brokely` (Singapore) | Backup and sync | Delete my account (cascade), backups ≤ 30 days (NFR-14) |
| IP address, sign-in times | Supabase Auth logs | Provider's security logs | Provider's log retention |
| Request time, path, status, change counts (no bodies) | Azure Container Apps logs (Hong Kong) | Running the API | Azure log retention |
| Sign-in token | Phone, Android secure storage (expo-secure-store) | Staying signed in | Sign out |

**Not collected:** bank logins, PINs, OTPs, card numbers, contacts, location, advertising IDs, analytics or
crash reports (no such libraries in the app or API; checked 22 Oct). No sensitive personal data in the
PDPA sense (health, religion, biometrics…). Note: spending notes are free text; a student *could* type
something sensitive (e.g. a clinic visit). Treated like any record: private, never analysed.

## 2. The seven principles

| Principle | Brokely | Status |
|---|---|---|
| **General** (s.6): consent, purpose, necessary | Works fully without an account (local-only, D-05); an account is optional and only for backup/sync; signing in is the consent, after the notice is offered | ✅ Notice link on the sign-in screen (D-92) |
| **Notice and Choice** (s.7): written notice, English **and** Malay, before collection | `privacy-notice.ts`, both languages, in the app and public | ⚠️ Fill in owner and contact; native review of the Malay |
| **Disclosure** (s.8) | No disclosure except to processors (Supabase, Azure, Google sign-in); never sold or used for marketing | ✅ |
| **Security** (s.9) | HTTPS only; database reachable only through the API (RLS on, no policies, Data API roles revoked, S-09); every query scoped to the token's student (S-02, tested AC-24); logs without contents (NFR-17, tested); token in secure storage; push limit 60/min | ✅ Phone database is not encrypted by Brokely (relies on Android's device encryption and app sandbox); accepted for 0.1 |
| **Retention** (s.10) | Account delete cascades every row (FR-ACC-07, tested); phone delete wipes everything | ⚠️ Confirm Supabase backup retention ≤ 30 days on the current plan |
| **Data integrity** (s.11) | Students edit any record; edit history kept | ✅ |
| **Access** (s.12, s.30–31: answer within 21 days) | Export everything as CSV and JSON in the app; contact for other requests | ✅ (needs a real contact) |

## 3. The 2024 amendments

| Change | Brokely |
|---|---|
| **Breach notification** (from 1 Jun 2025): notify the Commissioner within **72 hours**; affected students without undue delay (guideline: within 7 days of notifying the Commissioner) if significant harm is likely | Stated in the notice. **Action:** a one-page breach plan (who checks, how to notify, template) before the pilot |
| **Data Protection Officer** (from 1 Jun 2025) | Guideline thresholds (e.g. > 20,000 data subjects, or > 10,000 with sensitive data, or regular large-scale monitoring) are far above a pilot; not required now. The contact in the notice acts as the privacy contact |
| **Data portability** (from 1 Jun 2025) | Export JSON/CSV covers it |
| **Cross-border transfers**: white list removed; transfer allowed where the destination has substantially similar law or adequate protection, or with consent | Singapore (PDPA 2012) and Hong Kong (PDPO) both have data protection laws; providers protect data under contract; notice asks for consent. Optional: move the API to Azure Southeast Asia (Singapore) so only one country is involved |
| **Processors directly bound by the Security Principle** | Supabase and Microsoft are the processors; their terms/DPAs apply. **Action:** keep links to both DPAs in this file once accepted in their dashboards |

## 4. Findings and actions

| # | Finding | Action | Owner |
|---|---|---|---|
| P-1 | Owner name and contact email are placeholders in the notice | Decide who the data user is (you personally, or the university project) and a contact email; fill `PRIVACY_OWNER` / `PRIVACY_CONTACT` | Author |
| P-2 | Malay text is a draft translation | Have a native speaker check it; English prevails on conflict | Author |
| P-3 | Android Auto Backup is on (`allowBackup="true"`; only the secure-store token is excluded), so the phone database can be copied to the student's Google Drive | Either keep it and say so (the notice now does), or set `android.allowBackup: false` so the account is the only backup. Also avoids restoring a phone linked to an account without its token | Author decides; agent changes `app.json` |
| P-4 | Supabase "Leaked password protection" is off (security advisor WARN) | Turn on in Authentication → Email (may need a paid plan) | Author |
| P-5 | Backup retention on the Supabase plan not confirmed | Check Database → Backups; NFR-14 needs ≤ 30 days | Author |
| P-6 | No written breach plan | One page: detect, assess harm, notify Commissioner (72 h) and students, record | Agent drafts, author approves |
| P-7 | Notice shown as a link, not acknowledged | Acceptable under s.7 (notice before collection); optionally show the notice once at first sign-in | Author decides |
| P-8 | Public notice URL needed for Google Play and the OAuth consent screen | `https://brokely-api.ashyglacier-36b03c11.eastasia.azurecontainerapps.io/privacy` (live after deploy); a custom domain later | Done (D-92) |
| P-9 | Pilot students' age | PDPA has no child-specific rule, but minors' consent is weaker; AIU students are adults. State "for students 18+" in the pilot invite | Author |

Sources consulted 22 Oct 2026: [Baker McKenzie on the Amendment Act's commencement](https://insightplus.bakermckenzie.com/bm/data-technology/malaysia-personal-data-protection-amendment-act-2024-to-come-into-force),
[DFDL implementation note](https://www.dfdl.com/insights/legal-and-tax-updates/malaysia-implementation-of-the-personal-data-protection-amendment-act-2024/),
[DLA Piper on the breach and DPO guidelines](https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/),
[CMS on mandatory breach notification](https://cms.law/en/sgp/legal-updates/new-guidelines-on-mandatory-breach-notifications-under-malaysia-s-personal-data-protection-act-2010),
[Chambers practice guide (bilingual notice)](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/malaysia).

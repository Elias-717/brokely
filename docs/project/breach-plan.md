# Data breach plan (P-6)

Drafted 23 Oct 2026 by the agent for the author (Elias Al-Sumairi) to approve. **Status: draft.**
Basis: PDPA 2010 as amended 2024 (s.12B, in force 1 Jun 2025) and the Commissioner's Data Breach
Notification guideline. This is an engineering plan, not legal advice.

## 1. What counts as a breach

Any loss of, or access by someone who shouldn't have it to, students' personal data: the Supabase
database (accounts, backed-up records), the sync API's secrets, or a copy of either. Examples:

- the `DATABASE_URL` secret or a Supabase service key is leaked (committed, pasted, shared);
- Supabase or Microsoft reports an incident affecting our project;
- the API returns one student's records to another student (a bug in the `user_id` checks);
- a laptop or account with database access (Supabase dashboard, Azure, GitHub) is taken over.

Not a breach: a student losing their own phone (the data on it is theirs; the account stays safe),
or the API being down.

## 2. Who does what

| Role | Person | Contact |
|---|---|---|
| Responsible for the data (data user) and the breach decision | Elias Al-Sumairi | eliassumairi@gmail.com |
| Second pair of eyes | None: Brokely is a personal project with one person responsible. If a breach happens, a trusted friend or a lawyer can be asked to review the report before it is sent (optional). | |

## 3. Steps

**Hour 0 — contain (as soon as it is noticed).**
1. Rotate whatever leaked: Supabase database password (new pooler URL into the Azure secret
   `database-url`), Supabase JWT signing key if exposed, GitHub/Azure/Supabase passwords and sessions.
2. If the API itself is the cause, scale `brokely-api` to 0 replicas in Azure (phones keep working
   offline; sync waits).
3. Write down the time it was noticed. The 72-hour clock starts here.

**Within 24 hours — assess.**
4. What data, how many students, since when. Supabase logs (Dashboard → Logs, or the MCP
   `query_logs`), Azure container logs (they never hold amounts, notes or names, NFR-17).
5. Is **significant harm** likely? It is if the data could be used for fraud or identity theft,
   embarrassment, or affects many students. Spending records with friends' names and email addresses
   usually count; assume yes when unsure.

**Within 72 hours — tell the Commissioner** (if personal data was or may have been affected).
6. Use the Commissioner's breach notification form (pdp.gov.my). Include: what happened, when it was
   noticed, the data and number of students, likely harm, what was done, contact person. If something
   isn't known yet, send what is known and follow up.

**Within 7 days of telling the Commissioner — tell the students** (if significant harm is likely).
7. Email every affected student (template below) and show a notice on the public `/privacy` page.

**After — record and fix.**
8. Add an entry to the breach record (section 5) even if nothing had to be reported. Keep it at
   least 2 years.
9. Fix the cause, add a test if it was a bug, and note the change in `decision-log.md`.

## 4. Template for students

> **Subject: About your Brokely data**
>
> Hi, on [date] we found that [what happened, in one sentence]. This may have affected [what data:
> e.g. your email address and the records you backed up]. It did **not** include [e.g. passwords:
> Brokely never sees your Google password].
>
> What we did: [rotated keys / fixed the bug / stopped the server].
> What you can do: [e.g. change your Brokely password in the app; watch for emails pretending to be
> Brokely]. You can also delete your account any time in More → Profile → Delete my account.
>
> Questions: reply to this email (eliassumairi@gmail.com). We have told the Personal Data Protection
> Commissioner. Sorry for the worry.
>
> Elias, Brokely

## 5. Breach record

| Date noticed | What happened | Data / students | Reported to Commissioner? | Students told? | Fix |
|---|---|---|---|---|---|
| (none yet) | | | | | |

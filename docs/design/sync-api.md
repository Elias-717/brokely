# Brokely — Sync API Design v0.1

Status: **draft for review** (Phase 1). Implements SRS v1.2 FR-SYNC-01…10, FR-ACC-01…07 and decision D-06.
Data model: [`erd.md`](erd.md). Shared request/response schemas will live in `packages/contracts` (Zod).

## 1. Purpose and shape

The phone is the **source of truth for the student's own edits**; the server is the **meeting point** that makes
several phones agree and keeps a backup. Everything works offline (FR-SYNC-01); the API only moves changes.

There are only two sync endpoints:

| Endpoint | What it does |
|---|---|
| `POST /v1/sync/push` | The phone sends a batch of changes from its outbox. Each change is applied once, or rejected with a reason. |
| `GET /v1/sync/pull?since=<seq>` | The phone asks for everything that changed on the server after the last sequence number it saw. |

Plus account endpoints: sign-up / sign-in (provider chosen at the start of Phase 4) and `DELETE /v1/account` (FR-ACC-07).
Export (FR-ACC-06) is done on the phone, so it works offline and needs no endpoint.

**Why push/pull and not one REST endpoint per table?** The phone may be offline for days and then send many changes at
once, in order. A single batch endpoint with per-change results handles retries, ordering and partial failure in one
place. Per-table CRUD endpoints would spread that logic across dozens of routes.

## 2. Design decisions

| # | Decision | Why |
|---|---|---|
| S-01 | **Sync whole aggregates, not single rows.** A `transaction` is sent together with its `lines`; a `plan_revision` together with its `allocations`. | Rules like "lines add up to the amount" (FR-TXN-04) can only be checked when the parts arrive together. One outbox operation per aggregate. |
| S-02 | **The server takes `user_id` from the sign-in token, never from the request.** | Prevents one student writing into another's data (FR-ACC-04, FR-SYNC-10). |
| S-03 | **Each operation has its own ID and its own database transaction on the server.** A batch can partly succeed. | One bad change must not block the rest. Retrying a batch is safe because applied operations are remembered (FR-SYNC-05). |
| S-04 | **Optimistic versions** (`baseVersion` on every update/delete). | A change made from an out-of-date copy is rejected, never silently overwrites (D-06, FR-SYNC-07). |
| S-05 | **Deterministic IDs for generated rows.** A scheduled item's ID is `UUIDv5(bill_id + due_date)`. | Two phones generating the same bill date create the *same* row instead of a duplicate. |
| S-06 | **Natural-key merge for one-per-day and one-per-user rows.** Check-ins merge on (`user`, `local_date`); settings on `user`. | Two phones can both tap "No spending today" for the same day; the second becomes a duplicate, not an error. |
| S-07 | **Deletes are delete markers** (`deleted_at` set, version + 1). | Pull can tell other phones about the delete, so deleted records never come back (FR-SYNC-09). |
| S-08 | **Pull is cursor-based on a global server sequence** (`server_seq`). | Simple, gap-free, and needs no clock agreement between phones and server. |

## 3. Synced entities

`category`, `planning_cycle`, `plan_revision` (+ `allocations`), `bill`, `scheduled_item`, `transaction` (+ `lines`),
`transaction_edit` (append-only), `debt`, `debt_adjustment`, `day_check_in`, `user_settings`.
Release 0.2 adds `merchant_category` and `xp_event`. `pending_import` never leaves the phone.

## 4. Push

### Request

```http
POST /v1/sync/push
Authorization: Bearer <access token>
Content-Type: application/json
```

```json
{
  "deviceId": "0192f3a4-…",
  "operations": [
    {
      "operationId": "0192f3a5-6b1c-7d2e-9f00-1a2b3c4d5e6f",
      "entity": "transaction",
      "entityId": "0192f3a5-6b1c-7d2e-9f00-aaaaaaaaaaaa",
      "op": "upsert",
      "baseVersion": null,
      "data": {
        "type": "purchase",
        "amountSen": 500,
        "occurredAt": "2026-11-02T04:15:00Z",
        "localDate": "2026-11-02",
        "source": "manual",
        "note": "Laundry",
        "isEstimate": false,
        "lines": [
          { "id": "0192f3a5-…-bbbb", "kind": "spending", "categoryId": "0192f3a1-…-laundry", "amountSen": 500 }
        ]
      }
    }
  ]
}
```

- `operations`: 1 to 100 per request, in outbox order. Body limit 1 MB.
- `baseVersion`: `null` to create; the version the phone last saw to update or delete.
- `op: "delete"` has no `data`.

### Server steps for each operation (in order)

1. If `operationId` is in `processed_operation` for this user → return the stored result with status `duplicate`.
2. Validate `data` against the Zod contract for `entity` → else `rejected` / `VALIDATION_FAILED`.
3. Load the row by `entityId`. If it belongs to another user → `rejected` / `NOT_FOUND` (never reveal it exists).
4. Version check:
   - create (`baseVersion: null`) and the row exists → `conflict` (unless S-05/S-06 merge applies → `duplicate`);
   - update/delete and `row.version ≠ baseVersion` → `conflict`, with the current row;
   - update/delete and no row → `rejected` / `NOT_FOUND`.
5. Check references (category, debt, cycle, bill exist for this user and are not deleted) → else `rejected` / `REFERENCE_MISSING`.
6. Check business rules with `packages/domain` (table in section 6) → else `rejected` with the rule's code.
7. Write the row(s): `version = old + 1` (or 1), `server_seq = nextval()`, `updated_at = now()`; for delete set `deleted_at`.
8. Save the result in `processed_operation`. Steps 7 and 8 happen in **one** database transaction.

### Response (HTTP 200, one result per operation, same order)

```json
{
  "results": [
    { "operationId": "0192f3a5-…5e6f", "status": "applied", "version": 1, "serverSeq": 10452 }
  ]
}
```

| `status` | Meaning | What the phone does |
|---|---|---|
| `applied` | Saved. | Remove from outbox; store `version`; mark record `synced`. |
| `duplicate` | Already applied earlier (retry or merge). | Same as `applied`. If the server returns a different `entityId` (S-06 merge), replace the local ID. |
| `conflict` | Based on an out-of-date version. Includes `current` (the server row). | Mark record `conflict`; show latest value and the student's unsaved value to re-apply (FR-SYNC-08). |
| `rejected` | Breaks a rule. Includes `error: { code, message }`. | Mark `failed`. `REFERENCE_MISSING` is retried after earlier operations succeed; other codes need the student. |

HTTP-level errors: `400` malformed batch, `401` sign-in expired, `413` too large, `429` too many requests (retry later).

## 5. Pull

```http
GET /v1/sync/pull?since=10400&limit=500
Authorization: Bearer <access token>
```

```json
{
  "changes": [
    {
      "entity": "transaction",
      "entityId": "0192f3a5-…-aaaa",
      "version": 1,
      "serverSeq": 10452,
      "deletedAt": null,
      "data": { "type": "purchase", "amountSen": 500, "lines": [ … ] }
    }
  ],
  "nextSince": 10452,
  "hasMore": false
}
```

- Ordered by `serverSeq`; includes delete markers; includes this phone's own changes (it ignores ones it already has at the same version).
- First sync after sign-in uses `since=0`. The phone saves `nextSince` in `sync_state` only after applying the page.
- **Applying a change on the phone:** if the local record has no pending outbox operation, overwrite it with the server
  version. If it *does* have a pending operation, keep the local edit; the next push will either apply or return a
  `conflict` (so nothing is lost silently).

## 6. Business rules checked on the server

The same `packages/domain` functions run on the phone before saving and on the server before applying.

| Code | Rule | SRS |
|---|---|---|
| `VALIDATION_FAILED` | Shape, types, whole sen > 0 | BR-01, R-04 |
| `LINES_DO_NOT_SUM` | Transaction lines add up to the amount | FR-TXN-04 |
| `REFUND_EXCEEDS_PURCHASE` | Refunds ≤ unrefunded purchase amount | FR-TXN-06 |
| `CYCLE_OVERLAP` | No two active/completed cycles share a date | FR-PLN-03, BR-05 |
| `REVISION_IMMUTABLE` | Approved revisions are never edited | FR-PLN-11, BR-08 |
| `DRAFT_REVISION_EXISTS` | One unapproved draft revision per cycle | FR-PLN-16 |
| `SHORTFALL_NOT_ACKNOWLEDGED` | Approval with U < 0 needs acknowledgement | FR-PLN-10 |
| `CATEGORY_IN_USE` | A used category can only be archived, not deleted | FR-CAT-08, BR-28 |
| `DEBT_EXCEEDS_OUTSTANDING` | A repayment or write-off can't take a debt below zero without an adjustment | BR-22 |
| `REFERENCE_MISSING` | Referenced row unknown or deleted | — |
| `NOT_FOUND` | Update/delete of an unknown row, or another user's row | FR-ACC-04 |

## 7. The sync loop on the phone

```
trigger ─▶ push (outbox, oldest first, batches of 100) ─▶ pull (until hasMore = false) ─▶ done
```

- **Triggers:** app start; 5 seconds after the last local change; network comes back; every 15 minutes while open.
- **One loop at a time.** Push always runs before pull, so the phone's own pending edits reach the server first.
- **Back-off on failure:** 5 s, 15 s, 1 min, 5 min, then every 15 min, with random jitter; reset after a success.
- **Statuses shown per record** (FR-SYNC-06): `pending` (in outbox), `synced`, `failed` (rejected), `conflict`.
- **Signed out / local-only:** the loop does nothing; the outbox keeps growing safely.

## 8. Local-only → account (FR-ACC-03, D-05)

1. Student signs up while having local data (all rows have `user_id = NULL`).
2. The phone, in one SQLite transaction, sets `user_id` on every row and adds one `upsert` (`baseVersion: null`) per aggregate to the outbox, parents before children (categories → cycles → revisions → bills → scheduled items → debts → transactions → check-ins).
3. The normal sync loop pushes them. IDs never change, so a retry is a `duplicate`, never a copy (AC-22).
4. If the account already has data from another phone, pull brings it down; S-05/S-06 merge generated rows.

## 9. Security

- HTTPS only, TLS 1.2+ (NFR-08). Access token in the `Authorization` header; stored on the phone with expo-secure-store (NFR-09).
- Every query is filtered by the token's `user_id` (S-02, NFR-10).
- Rate limit per user (e.g. 60 push requests per minute); body limit 1 MB.
- Logs never contain amounts, notes, counterparty names or merchant names (NFR-17).
- `DELETE /v1/account` deletes all of the user's rows and sign-in identity; backups expire within 30 days (NFR-14).

## 10. Traceability

| Requirement | Where in this design | Test |
|---|---|---|
| FR-SYNC-01 (works offline) | Section 7: loop is optional; outbox grows offline | AC-20 |
| FR-SYNC-02 (survives restart) | Outbox is in SQLite, written with the change | AC-20 |
| FR-SYNC-03 (phone-made IDs) | `entityId`, `operationId` are UUIDv7 from the phone; S-05 | AC-20 |
| FR-SYNC-04 (durable outbox) | Outbox entries removed only on `applied`/`duplicate` | AC-20 |
| FR-SYNC-05 (idempotent) | Step 1 + `processed_operation` (S-03) | AC-20 |
| FR-SYNC-06 (statuses) | Section 7 statuses | AC-20, AC-21 |
| FR-SYNC-07 (reject stale) | Step 4 (S-04) | AC-21 |
| FR-SYNC-08 (re-apply screen) | `conflict` result with `current` | AC-21 |
| FR-SYNC-09 (delete markers) | S-07; pull includes `deletedAt` | AC-23 |
| FR-SYNC-10 (server re-checks) | Steps 2–6, section 6 | AC-24 |
| FR-ACC-03 (link local data) | Section 8 | AC-22 |
| FR-ACC-04 (isolation) | S-02, step 3 | AC-24 |
| FR-ACC-07 (delete account) | Section 9 | AC-25 |

## 11. Changes this design makes to the ERD (applied in erd.md v0.2)

- Outbox operations are **per aggregate** (S-01): recording a transaction writes one operation, not one per row.
- `scheduled_item.id` is deterministic (S-05); `day_check_in` and `user_settings` merge on natural keys (S-06).

## 12. Open points

1. Sign-in provider and token lifetime (Phase 4 start).
2. Should pull be split per entity for very large first syncs? Not needed at pilot scale; revisit if a first sync exceeds a few seconds.

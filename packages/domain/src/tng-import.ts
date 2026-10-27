import { sen, type Sen } from "./money";
import { parseTngNotification } from "./tng-parser";

/**
 * Pending TNG imports (FR-IMP-04…06, FR-IMP-08, FR-IMP-11, D-02, D-128). Pure: the phone's capture
 * store, the clock and the database are the caller's business; this file only decides what is
 * waiting for the student, what has been dealt with and what has expired.
 *
 * A pending import counts for nothing. It becomes a record only when the student saves it in
 * Quick add, choosing the type (and a category when it is spending), so a person-to-person
 * transfer is never saved as spending automatically (FR-IMP-08, AC-35). Confirming and
 * declining both settle it here; whether a record was made is the transaction's own business.
 */

/** Raw captures older than this are dropped, parsed or not (FR-IMP-11, AC-38). */
export const TNG_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** The most settled imports remembered, so a re-delivered notification is still recognised. */
const HANDLED_LIMIT = 500;

/** What the phone's listener captured: the same fields as `TngNotificationText` plus identity. */
export interface TngCaptured {
  /** Android's notification key. Not unique per payment: it repeats (see AGENTS.md section 8). */
  readonly key: string;
  /** When Android posted it, in milliseconds since 1970. */
  readonly postTime: number;
  readonly title: string;
  readonly text: string;
  readonly bigText?: string;
}

/** A caught transfer waiting for the student. The raw notification text is not kept. */
export interface PendingTngImport {
  readonly id: string;
  readonly postTime: number;
  /** "out": the student sent money. "in": the student received money. */
  readonly direction: "out" | "in";
  readonly amountSen: Sen;
  readonly counterparty: string;
}

/** An import already confirmed or declined: only enough is kept to recognise it again. */
export interface HandledTngImport {
  readonly id: string;
  readonly postTime: number;
}

export interface TngQueue {
  /** Newest first. */
  readonly pending: readonly PendingTngImport[];
  readonly handled: readonly HandledTngImport[];
}

export const EMPTY_TNG_QUEUE: TngQueue = { pending: [], handled: [] };

/**
 * The identity of one notification (FR-IMP-05, FR-IMP-06): when it was posted plus Android's key.
 * The key alone repeats across payments, so two payments a minute apart stay two imports. The
 * phone's capture store builds the same text (`TngCaptureStore.captureId` in the Kotlin module),
 * so it can delete exactly the captures that were taken in.
 */
export function tngImportId(key: string, postTime: number): string {
  return `${postTime}|${key}`;
}

const newestFirst = (a: PendingTngImport, b: PendingTngImport) =>
  b.postTime - a.postTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Takes the readable transfers out of the phone's captures and adds the new ones to the queue
 * (FR-IMP-03, FR-IMP-04). Also drops anything older than 30 days (FR-IMP-11).
 *
 * `consumed` lists every readable capture's id, new or repeated: the caller deletes those raw
 * copies once the queue is saved. Unreadable ones (promotions, wordings not sampled yet) are left
 * alone: nothing is guessed from them (FR-IMP-09) and the author still sees them as samples.
 * When nothing changed the same `queue` object comes back, so the caller can skip the write.
 */
export function ingestTngCaptures(
  captured: readonly TngCaptured[],
  queue: TngQueue,
  nowMs: number,
): { queue: TngQueue; consumed: string[] } {
  const oldest = nowMs - TNG_KEEP_MS;
  const pending = queue.pending.filter((p) => p.postTime >= oldest);
  const handled = queue.handled.filter((h) => h.postTime >= oldest);
  let changed = pending.length !== queue.pending.length || handled.length !== queue.handled.length;

  const known = new Set([...pending.map((p) => p.id), ...handled.map((h) => h.id)]);
  const consumed = new Set<string>();
  for (const capture of captured) {
    if (capture.postTime < oldest) continue;
    const parsed = parseTngNotification(capture);
    if (parsed.kind !== "person_transfer") continue;
    const id = tngImportId(capture.key, capture.postTime);
    consumed.add(id);
    if (known.has(id)) continue;
    known.add(id);
    pending.push({
      id,
      postTime: capture.postTime,
      direction: parsed.direction,
      amountSen: parsed.amount,
      counterparty: parsed.counterparty,
    });
    changed = true;
  }

  if (!changed) return { queue, consumed: [...consumed] };
  return { queue: { pending: pending.sort(newestFirst), handled }, consumed: [...consumed] };
}

/**
 * The student confirmed (saved a record) or declined this import: it leaves the pending list and
 * is remembered, so the same notification can never come back. Unknown or already settled: the
 * same queue.
 */
export function settleTngImport(queue: TngQueue, id: string): TngQueue {
  const item = queue.pending.find((p) => p.id === id);
  if (!item) return queue;
  return {
    pending: queue.pending.filter((p) => p.id !== id),
    handled: [...queue.handled, { id, postTime: item.postTime }].slice(-HANDLED_LIMIT),
  };
}

/** Undo of {@link settleTngImport}: the import waits again. */
export function reopenTngImport(queue: TngQueue, item: PendingTngImport): TngQueue {
  if (queue.pending.some((p) => p.id === item.id)) return queue;
  return {
    pending: [...queue.pending, item].sort(newestFirst),
    handled: queue.handled.filter((h) => h.id !== item.id),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readPending(value: unknown): PendingTngImport[] {
  if (!isRecord(value)) return [];
  const { id, postTime, direction, amountSen, counterparty } = value;
  if (typeof id !== "string" || id === "") return [];
  if (typeof postTime !== "number" || !Number.isFinite(postTime)) return [];
  if (direction !== "out" && direction !== "in") return [];
  if (typeof amountSen !== "number" || !Number.isSafeInteger(amountSen) || amountSen <= 0)
    return [];
  if (typeof counterparty !== "string" || counterparty.trim() === "") return [];
  return [
    { id, postTime, direction, amountSen: sen(amountSen), counterparty: counterparty.trim() },
  ];
}

function readHandled(value: unknown): HandledTngImport[] {
  if (!isRecord(value)) return [];
  const { id, postTime } = value;
  if (typeof id !== "string" || id === "") return [];
  if (typeof postTime !== "number" || !Number.isFinite(postTime)) return [];
  return [{ id, postTime }];
}

/** The queue as stored on the phone; anything missing or malformed is dropped, never thrown. */
export function readTngQueue(raw: unknown): TngQueue {
  if (!isRecord(raw)) return EMPTY_TNG_QUEUE;
  return {
    pending: Array.isArray(raw.pending) ? raw.pending.flatMap(readPending).sort(newestFirst) : [],
    handled: Array.isArray(raw.handled) ? raw.handled.flatMap(readHandled) : [],
  };
}

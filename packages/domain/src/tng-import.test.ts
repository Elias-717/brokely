import { describe, expect, it } from "vitest";
import { sen } from "./money";
import {
  EMPTY_TNG_QUEUE,
  TNG_KEEP_MS,
  ingestTngCaptures,
  readTngQueue,
  reopenTngImport,
  settleTngImport,
  tngImportId,
  type TngCaptured,
} from "./tng-import";

/**
 * Fixtures follow the wording of real TNG notifications (D-128); names are [FRIEND A] and
 * [FRIEND B] (rule 7). NOW is a fixed clock: the domain never reads the time itself (NFR-02).
 */
const NOW = 1_793_001_900_000;
const KEY_OUT = "0|my.com.tngdigital.ewallet|1|null|10340";

const out = (
  postTime: number,
  text = "RM 0.06 has been successfully transferred to [FRIEND A].",
): TngCaptured => ({
  key: KEY_OUT,
  postTime,
  title: "Transfer Successful.",
  text,
  bigText: text,
});
const incoming: TngCaptured = {
  key: "0|my.com.tngdigital.ewallet|0|FCM-Notification:13087468|10340",
  postTime: NOW - 20_000,
  title: "Ka-ching! Incoming Money.",
  text: "RM 0.12 received from [FRIEND B] for Fund Transfer.",
  bigText: "RM 0.12 received from [FRIEND B] for Fund Transfer.",
};
const promo: TngCaptured = {
  key: "0|my.com.tngdigital.ewallet|2|null|10340",
  postTime: NOW - 30_000,
  title: "Your eWallet balance is low. Reload now!",
  text: "Psst... Why not cash in to GO+ for a hassle-free eWallet experience while earning daily returns?",
  bigText: "",
};

describe("tngImportId", () => {
  it("is the post time and the Android key, so it matches the phone's capture store", () => {
    expect(tngImportId(KEY_OUT, 1793001822940)).toBe(`1793001822940|${KEY_OUT}`);
  });
});

describe("ingestTngCaptures (FR-IMP-04, FR-IMP-05, FR-IMP-06, FR-IMP-08)", () => {
  it("turns a readable transfer into a pending import that counts for nothing yet", () => {
    const { queue, consumed } = ingestTngCaptures([incoming], EMPTY_TNG_QUEUE, NOW);
    expect(queue.pending).toEqual([
      {
        id: tngImportId(incoming.key, incoming.postTime),
        postTime: incoming.postTime,
        direction: "in",
        amountSen: sen(12),
        counterparty: "[FRIEND B]",
      },
    ]);
    expect(queue.handled).toEqual([]);
    expect(consumed).toEqual([tngImportId(incoming.key, incoming.postTime)]);
  });

  it("keeps one pending import when the same notification arrives twice (FR-IMP-05, AC-32)", () => {
    const first = ingestTngCaptures([out(NOW - 5_000)], EMPTY_TNG_QUEUE, NOW);
    const second = ingestTngCaptures([out(NOW - 5_000), out(NOW - 5_000)], first.queue, NOW);
    expect(second.queue.pending).toHaveLength(1);
    expect(second.queue).toBe(first.queue); // nothing changed, so nothing to write
    expect(second.consumed).toHaveLength(1); // the raw copy is still cleaned up
  });

  it("keeps two imports with the same key and amount a minute apart (FR-IMP-06, AC-33)", () => {
    const { queue } = ingestTngCaptures(
      [out(NOW - 65_000), out(NOW - 5_000)],
      EMPTY_TNG_QUEUE,
      NOW,
    );
    expect(queue.pending).toHaveLength(2);
  });

  it("lists the newest first", () => {
    const { queue } = ingestTngCaptures([out(NOW - 65_000), incoming], EMPTY_TNG_QUEUE, NOW);
    expect(queue.pending.map((p) => p.direction)).toEqual(["in", "out"]);
  });

  it("leaves unreadable notifications alone, still available as samples (FR-IMP-09, AC-36)", () => {
    const result = ingestTngCaptures([promo], EMPTY_TNG_QUEUE, NOW);
    expect(result.queue).toBe(EMPTY_TNG_QUEUE);
    expect(result.consumed).toEqual([]);
  });

  it("does not bring back an import that was already confirmed or declined", () => {
    const first = ingestTngCaptures([incoming], EMPTY_TNG_QUEUE, NOW);
    const id = tngImportId(incoming.key, incoming.postTime);
    const settled = settleTngImport(first.queue, id);
    const again = ingestTngCaptures([incoming], settled, NOW);
    expect(again.queue.pending).toEqual([]);
    expect(again.consumed).toEqual([id]);
  });

  it("ignores captures older than 30 days (FR-IMP-11)", () => {
    const old = out(NOW - TNG_KEEP_MS - 1);
    const result = ingestTngCaptures([old], EMPTY_TNG_QUEUE, NOW);
    expect(result.queue.pending).toEqual([]);
    expect(result.consumed).toEqual([]);
  });
});

describe("settleTngImport and reopenTngImport", () => {
  const start = ingestTngCaptures([incoming, out(NOW - 65_000)], EMPTY_TNG_QUEUE, NOW).queue;
  const id = tngImportId(incoming.key, incoming.postTime);

  it("moves a confirmed or declined import out of pending, so nothing counts until then (D-02)", () => {
    const next = settleTngImport(start, id);
    expect(next.pending.map((p) => p.id)).not.toContain(id);
    expect(next.pending).toHaveLength(1);
    expect(next.handled.map((h) => h.id)).toContain(id);
  });

  it("leaves the queue as it is for an unknown or already settled import", () => {
    expect(settleTngImport(start, "nope")).toBe(start);
    const next = settleTngImport(start, id);
    expect(settleTngImport(next, id)).toBe(next);
  });

  it("brings an import back after Undo", () => {
    const item = start.pending.find((p) => p.id === id)!;
    const back = reopenTngImport(settleTngImport(start, id), item);
    expect(back.pending.map((p) => p.id)).toContain(id);
    expect(back.handled.map((h) => h.id)).not.toContain(id);
    expect(back.pending.map((p) => p.direction)).toEqual(["in", "out"]);
  });
});

describe("expiry (FR-IMP-11)", () => {
  it("drops pending and handled entries older than 30 days", () => {
    const aged = {
      pending: [
        {
          id: "a",
          postTime: NOW - TNG_KEEP_MS - 1,
          direction: "out" as const,
          amountSen: sen(600),
          counterparty: "[FRIEND A]",
        },
      ],
      handled: [
        { id: "b", postTime: NOW - TNG_KEEP_MS - 1 },
        { id: "c", postTime: NOW - 1000 },
      ],
    };
    const { queue } = ingestTngCaptures([], aged, NOW);
    expect(queue.pending).toEqual([]);
    expect(queue.handled).toEqual([{ id: "c", postTime: NOW - 1000 }]);
  });

  it("returns the same queue when nothing has expired and nothing is new", () => {
    expect(ingestTngCaptures([], EMPTY_TNG_QUEUE, NOW).queue).toBe(EMPTY_TNG_QUEUE);
  });
});

describe("readTngQueue", () => {
  it("reads back what was stored", () => {
    const { queue } = ingestTngCaptures([incoming], EMPTY_TNG_QUEUE, NOW);
    expect(readTngQueue(JSON.parse(JSON.stringify(queue)))).toEqual(queue);
  });

  it("falls back to an empty queue for anything odd", () => {
    for (const raw of [undefined, null, 5, "x", [], {}, { pending: 3, handled: "x" }]) {
      expect(readTngQueue(raw)).toEqual(EMPTY_TNG_QUEUE);
    }
  });

  it("drops broken entries and keeps good ones", () => {
    const good = {
      id: "a",
      postTime: 5,
      direction: "in",
      amountSen: 12,
      counterparty: "[FRIEND B]",
    };
    const queue = readTngQueue({
      pending: [
        good,
        { ...good, id: "" },
        { ...good, id: "b", direction: "sideways" },
        { ...good, id: "c", amountSen: 0 },
        { ...good, id: "d", amountSen: 1.5 },
        { ...good, id: "e", counterparty: "  " },
        { ...good, id: "f", postTime: "soon" },
      ],
      handled: [{ id: "h", postTime: 7 }, { id: 3, postTime: 7 }, { id: "i" }],
    });
    expect(queue.pending.map((p) => p.id)).toEqual(["a"]);
    expect(queue.handled).toEqual([{ id: "h", postTime: 7 }]);
  });
});

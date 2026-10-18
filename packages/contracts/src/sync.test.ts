import { describe, expect, it } from "vitest";
import { ids, laundryPurchase } from "./fixtures";
import {
  MAX_OPERATIONS_PER_PUSH,
  PullQuerySchema,
  PushRequestSchema,
  PushResultSchema,
} from "./sync";

const upsert = {
  operationId: ids.operation,
  entity: "transaction",
  entityId: ids.purchase,
  op: "upsert",
  baseVersion: null,
  data: laundryPurchase,
};

describe("PushRequestSchema (sync-api §4)", () => {
  it("accepts the golden-path push (AC-04, AC-20)", () => {
    const result = PushRequestSchema.safeParse({ deviceId: ids.device, operations: [upsert] });
    expect(result.success).toBe(true);
  });

  it("checks data against the schema of its entity (S-01)", () => {
    const wrongData = { ...upsert, entity: "category" };
    expect(
      PushRequestSchema.safeParse({ deviceId: ids.device, operations: [wrongData] }).success,
    ).toBe(false);
  });

  it("accepts a delete without data, but only with a base version (S-04, S-07)", () => {
    const del = {
      operationId: ids.operation,
      entity: "transaction",
      entityId: ids.purchase,
      op: "delete",
      baseVersion: 3,
    };
    expect(PushRequestSchema.safeParse({ deviceId: ids.device, operations: [del] }).success).toBe(
      true,
    );
    expect(
      PushRequestSchema.safeParse({
        deviceId: ids.device,
        operations: [{ ...del, baseVersion: null }],
      }).success,
    ).toBe(false);
    expect(
      PushRequestSchema.safeParse({
        deviceId: ids.device,
        operations: [{ ...del, data: laundryPurchase }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty batch and one over the limit", () => {
    expect(PushRequestSchema.safeParse({ deviceId: ids.device, operations: [] }).success).toBe(
      false,
    );
    const tooMany = Array.from({ length: MAX_OPERATIONS_PER_PUSH + 1 }, () => upsert);
    expect(PushRequestSchema.safeParse({ deviceId: ids.device, operations: tooMany }).success).toBe(
      false,
    );
  });

  it("rejects IDs that are not UUIDs (FR-SYNC-03)", () => {
    const badId = { ...upsert, entityId: "transaction-1" };
    expect(PushRequestSchema.safeParse({ deviceId: ids.device, operations: [badId] }).success).toBe(
      false,
    );
  });
});

describe("PushResultSchema", () => {
  it("accepts each result status (sync-api §4)", () => {
    const results = [
      { operationId: ids.operation, status: "applied", version: 1, serverSeq: 10452 },
      { operationId: ids.operation, status: "duplicate", version: 1, serverSeq: 10452 },
      {
        operationId: ids.operation,
        status: "conflict",
        current: {
          entityId: ids.purchase,
          version: 4,
          serverSeq: 10460,
          deletedAt: null,
          data: { amountSen: 700 },
        },
      },
      {
        operationId: ids.operation,
        status: "rejected",
        error: { code: "LINES_DO_NOT_SUM", message: "Lines add up to RM4.00, not RM5.00" },
      },
    ];
    for (const result of results) expect(PushResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects unknown error codes", () => {
    const bad = {
      operationId: ids.operation,
      status: "rejected",
      error: { code: "OOPS", message: "?" },
    };
    expect(PushResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("PullQuerySchema (sync-api §5)", () => {
  it("coerces query-string numbers and defaults the limit", () => {
    expect(PullQuerySchema.parse({ since: "10400" })).toEqual({ since: 10400, limit: 500 });
  });

  it("rejects negative cursors and oversized pages", () => {
    expect(PullQuerySchema.safeParse({ since: "-1" }).success).toBe(false);
    expect(PullQuerySchema.safeParse({ since: "0", limit: "501" }).success).toBe(false);
  });
});

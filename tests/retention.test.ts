import { describe, test, expect, mock } from "bun:test";
import type { GenericEndpointContext } from "@better-auth/core";
import type { Where } from "better-auth";
import { auditLog, resolveOptions } from "../src/plugin";
import {
  createRetentionSweep,
  deleteExpiredAuditLogs,
  retentionCutoff,
} from "../src/retention";
import { writeEntry } from "../src/internal";
import { MemoryStorage } from "../src/adapters/memory";
import type { AuditLogEntry, AuditLogStorage, ResolvedOptions } from "../src/types";

const DAY_MS = 86_400_000;

function makeCtx() {
  const background: Promise<unknown>[] = [];
  const deleteMany = mock(async (_data: { model: string; where: Where[] }) => 3);
  const error = mock((_message: string, ..._args: unknown[]) => {});

  const ctx = {
    context: {
      adapter: {
        deleteMany,
        create: mock(async () => ({
          id: "test-id",
          userId: null,
          action: "sign-in:email",
          status: "success",
          severity: "medium",
          ipAddress: null,
          userAgent: null,
          metadata: "{}",
          createdAt: new Date(),
        })),
      },
      logger: { error, warn: mock(() => {}), info: mock(() => {}), debug: mock(() => {}) },
      runInBackground: (p: Promise<unknown>) => {
        background.push(p);
      },
      options: {},
    },
  } as unknown as GenericEndpointContext;

  return { ctx, deleteMany, error, settle: () => Promise.all(background) };
}

function makeEntry(): Omit<AuditLogEntry, "id"> {
  return {
    userId: "user-1",
    action: "sign-in:email",
    status: "success",
    severity: "medium",
    ipAddress: null,
    userAgent: null,
    metadata: {},
    createdAt: new Date(),
  };
}

function makeOpts(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    enabled: true,
    nonBlocking: false,
    storage: undefined,
    capture: { ipAddress: true, userAgent: true, requestBody: false },
    piiRedaction: { enabled: false, strategy: "mask" },
    sweepRetention: undefined,
    metadataLimits: { maxBytes: 65536, maxDepth: 5 },
    beforePaths: [],
    beforeLog: undefined,
    afterLog: undefined,
    onWriteError: undefined,
    shouldCapture: () => true,
    getPathConfig: () => undefined,
    ...overrides,
  };
}

describe("retentionCutoff", () => {
  test("subtracts whole days from the reference time", () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    expect(retentionCutoff(90, now).toISOString()).toBe("2025-12-10T12:00:00.000Z");
  });

  test("supports fractional days", () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    expect(retentionCutoff(1.5, now).toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });

  test("rejects values below one day", () => {
    expect(() => retentionCutoff(0)).toThrow("at least 1");
    expect(() => retentionCutoff(-5)).toThrow("at least 1");
  });

  test("rejects non-finite values", () => {
    expect(() => retentionCutoff(Number.NaN)).toThrow("finite");
    expect(() => retentionCutoff(Number.POSITIVE_INFINITY)).toThrow("finite");
  });
});

describe("deleteExpiredAuditLogs", () => {
  test("deletes through the database adapter with a lt cutoff", async () => {
    const { ctx, deleteMany } = makeCtx();
    const before = Date.now();

    const deleted = await deleteExpiredAuditLogs(ctx.context, { days: 30 });

    expect(deleted).toBe(3);
    const { model, where } = deleteMany.mock.calls[0]![0];
    expect(model).toBe("auditLog");
    expect(where).toHaveLength(1);
    expect(where[0]!.field).toBe("createdAt");
    expect(where[0]!.operator).toBe("lt");
    expect((where[0]!.value as Date).getTime()).toBeLessThanOrEqual(
      before - 30 * DAY_MS,
    );
  });

  test("honours a custom model name", async () => {
    const { ctx, deleteMany } = makeCtx();
    await deleteExpiredAuditLogs(ctx.context, { days: 30, modelName: "audit_trail" });
    expect(deleteMany.mock.calls[0]![0].model).toBe("audit_trail");
  });

  test("delegates to custom storage instead of the adapter", async () => {
    const { ctx, deleteMany } = makeCtx();
    const storage = new MemoryStorage();
    await storage.write({ ...makeEntry(), id: "old", createdAt: new Date(Date.now() - 10 * DAY_MS) });
    await storage.write({ ...makeEntry(), id: "recent" });

    const deleted = await deleteExpiredAuditLogs(ctx.context, { days: 7, storage });

    expect(deleted).toBe(1);
    expect(storage.entries.map((e) => e.id)).toEqual(["recent"]);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test("rejects custom storage that cannot delete", async () => {
    const { ctx } = makeCtx();
    const storage: AuditLogStorage = { write: async () => {} };

    await expect(
      deleteExpiredAuditLogs(ctx.context, { days: 30, storage }),
    ).rejects.toThrow("deleteOlderThan");
  });

  test("rejects an invalid retention window before touching storage", async () => {
    const { ctx, deleteMany } = makeCtx();

    await expect(deleteExpiredAuditLogs(ctx.context, { days: 0 })).rejects.toThrow(
      "at least 1",
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("createRetentionSweep", () => {
  test("runs the first sweep in the background", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const sweep = createRetentionSweep({ days: 90, intervalMs: 60_000, modelName: "auditLog" });

    sweep(ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  test("throttles repeat sweeps within the interval", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const sweep = createRetentionSweep({ days: 90, intervalMs: 60_000, modelName: "auditLog" });

    sweep(ctx);
    await settle();
    sweep(ctx);
    sweep(ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  test("collapses concurrent sweeps into one in-flight run", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const sweep = createRetentionSweep({ days: 90, intervalMs: 0, modelName: "auditLog" });

    sweep(ctx);
    sweep(ctx);
    sweep(ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  test("sweeps again once the interval has elapsed", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const sweep = createRetentionSweep({ days: 90, intervalMs: 0, modelName: "auditLog" });

    sweep(ctx);
    await settle();
    sweep(ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  test("logs failures instead of propagating them", async () => {
    const { ctx, error, settle } = makeCtx();
    (ctx.context.adapter as { deleteMany: unknown }).deleteMany = mock(async () => {
      throw new Error("connection reset");
    });
    const sweep = createRetentionSweep({ days: 90, intervalMs: 0, modelName: "auditLog" });

    expect(() => sweep(ctx)).not.toThrow();
    await settle();

    expect(error).toHaveBeenCalled();
    expect(error.mock.calls[0]![0]).toContain("retention cleanup failed");
  });

  test("recovers after a failed sweep", async () => {
    const { ctx, settle } = makeCtx();
    const deleteMany = mock(async () => {
      throw new Error("connection reset");
    });
    (ctx.context.adapter as { deleteMany: unknown }).deleteMany = deleteMany;
    const sweep = createRetentionSweep({ days: 90, intervalMs: 0, modelName: "auditLog" });

    sweep(ctx);
    await settle();
    sweep(ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe("plugin retention configuration", () => {
  test("enabled retention produces a sweep", () => {
    const resolved = resolveOptions({ retention: { enabled: true, days: 90 } });
    expect(resolved.sweepRetention).toBeDefined();
  });

  test("disabled retention produces no sweep", () => {
    const resolved = resolveOptions({ retention: { enabled: false, days: 90 } });
    expect(resolved.sweepRetention).toBeUndefined();
  });

  test("a disabled plugin produces no sweep", () => {
    const resolved = resolveOptions({
      enabled: false,
      retention: { enabled: true, days: 90 },
    });
    expect(resolved.sweepRetention).toBeUndefined();
  });


  test("rejects a retention window below one day", () => {
    expect(() => auditLog({ retention: { enabled: true, days: 0 } })).toThrow(
      "retention.days",
    );
  });

  test("rejects a non-numeric retention window", () => {
    expect(() =>
      auditLog({ retention: { enabled: true, days: "90" as unknown as number } }),
    ).toThrow("retention.days");
  });

  test("rejects an invalid sweep interval", () => {
    expect(() =>
      auditLog({ retention: { enabled: true, days: 90, intervalMs: -1 } }),
    ).toThrow("retention.intervalMs");
  });

  test("rejects custom storage that cannot delete", () => {
    expect(() =>
      auditLog({
        storage: { write: async () => {} },
        retention: { enabled: true, days: 90 },
      }),
    ).toThrow("retention requires storage.deleteOlderThan");
  });

  test("accepts custom storage that can delete", () => {
    expect(() =>
      auditLog({
        storage: { write: async () => {}, deleteOlderThan: async () => 0 },
        retention: { enabled: true, days: 90 },
      }),
    ).not.toThrow();
  });

  test("ignores an invalid window while retention is disabled", () => {
    expect(() => auditLog({ retention: { enabled: false, days: 0 } })).not.toThrow();
  });
});

async function runAfterHook(
  plugin: ReturnType<typeof auditLog>,
  ctx: GenericEndpointContext,
): Promise<void> {
  const handler = plugin.hooks.after[0]!.handler as unknown as (
    c: GenericEndpointContext,
  ) => Promise<unknown>;
  await handler({ ...ctx, path: "/sign-in/email", headers: new Headers() });
}

describe("retention sweeps during writes", () => {
  test("configured retention cleans up on captured auth traffic", async () => {
    const { ctx, deleteMany, settle } = makeCtx();

    await runAfterHook(auditLog({ retention: { enabled: true, days: 90 } }), ctx);
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0]![0].model).toBe("auditLog");
  });

  test("configured retention cleans up through custom storage", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const storage = new MemoryStorage();
    await storage.write({
      ...makeEntry(),
      id: "stale",
      createdAt: new Date(Date.now() - 120 * DAY_MS),
    });

    await runAfterHook(
      auditLog({ storage, retention: { enabled: true, days: 90 } }),
      ctx,
    );
    await settle();

    expect(storage.entries.some((e) => e.id === "stale")).toBe(false);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  test("a runtime without background tasks does not break the write", async () => {
    const { ctx, settle } = makeCtx();
    (ctx.context as { runInBackground: unknown }).runInBackground = undefined;
    const opts = makeOpts({
      sweepRetention: createRetentionSweep({
        days: 90,
        intervalMs: 0,
        modelName: "auditLog",
      }),
    });

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await settle();

    expect(ctx.context.adapter.create).toHaveBeenCalledTimes(1);
  });

  test("unconfigured retention never deletes", async () => {
    const { ctx, deleteMany, settle } = makeCtx();

    await runAfterHook(auditLog(), ctx);
    await settle();

    expect(deleteMany).not.toHaveBeenCalled();
  });


  test("a write triggers the sweep", async () => {
    const { ctx, deleteMany, settle } = makeCtx();
    const opts = makeOpts({
      sweepRetention: createRetentionSweep({
        days: 90,
        intervalMs: 60_000,
        modelName: "auditLog",
      }),
    });

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await settle();

    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  test("a failing sweep does not fail the write", async () => {
    const { ctx, error, settle } = makeCtx();
    (ctx.context.adapter as { deleteMany: unknown }).deleteMany = mock(async () => {
      throw new Error("connection reset");
    });
    const opts = makeOpts({
      sweepRetention: createRetentionSweep({
        days: 90,
        intervalMs: 0,
        modelName: "auditLog",
      }),
    });

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await settle();

    expect(ctx.context.adapter.create).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
  });

  test("no sweep runs when retention is disabled", async () => {
    const { ctx, deleteMany, settle } = makeCtx();

    await writeEntry(ctx, makeEntry(), makeOpts(), "auditLog");
    await settle();

    expect(deleteMany).not.toHaveBeenCalled();
  });
});

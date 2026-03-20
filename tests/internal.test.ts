import { describe, test, expect, mock } from "bun:test";
import { writeEntry } from "../src/internal";
import type { AuditLogEntry, ResolvedOptions } from "../src/types";
import type { GenericEndpointContext } from "@better-auth/core";

function makeEntry(): Omit<AuditLogEntry, "id"> {
  return {
    userId: "user-1",
    action: "sign-in:email",
    status: "success",
    severity: "medium",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
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
    retention: undefined,
    metadataLimits: { maxBytes: 65536, maxDepth: 5 },
    beforePaths: ["/sign-out", "/delete-user"],
    beforeLog: undefined,
    afterLog: undefined,
    onWriteError: undefined,
    shouldCapture: () => true,
    getPathConfig: () => undefined,
    ...overrides,
  };
}

function makeCtx(
  adapterOverrides: Record<string, unknown> = {},
): GenericEndpointContext {
  const backgroundTasks: Promise<unknown>[] = [];
  return {
    context: {
      adapter: {
        create: mock(async () => ({
          id: "test-id",
          ...makeEntry(),
          metadata: "{}",
        })),
        ...adapterOverrides,
      },
      logger: {
        error: mock(() => {}),
        warn: mock(() => {}),
        info: mock(() => {}),
        debug: mock(() => {}),
      },
      runInBackground: (p: Promise<unknown>) => {
        backgroundTasks.push(p);
      },
      options: {},
    },
    // expose for test assertions
    _backgroundTasks: backgroundTasks,
  } as unknown as GenericEndpointContext & { _backgroundTasks: Promise<unknown>[] };
}

describe("writeEntry", () => {
  test("writes to custom storage when provided", async () => {
    const writeFn = mock(async () => {});
    const storage = { write: writeFn };
    const opts = makeOpts({ storage });
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(writeFn).toHaveBeenCalledTimes(1);
    const written = (writeFn.mock.calls[0] as unknown[])[0] as AuditLogEntry;
    expect(written.id).toBeDefined();
    expect(written.action).toBe("sign-in:email");
  });

  test("writes to adapter when no custom storage", async () => {
    const createFn = mock(async () => ({
      id: "adapter-id",
      ...makeEntry(),
      metadata: "{}",
    }));
    const ctx = makeCtx({ create: createFn });
    const opts = makeOpts();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(createFn).toHaveBeenCalledTimes(1);
  });

  test("beforeLog can modify the entry", async () => {
    const writeFn = mock(async () => {});
    const opts = makeOpts({
      storage: { write: writeFn },
      beforeLog: async (entry) => ({ ...entry, action: "modified-action" }),
    });
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    const written = (writeFn.mock.calls[0] as unknown[])[0] as AuditLogEntry;
    expect(written.action).toBe("modified-action");
  });

  test("beforeLog returning null skips the write", async () => {
    const writeFn = mock(async () => {});
    const opts = makeOpts({
      storage: { write: writeFn },
      beforeLog: async () => null,
    });
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(writeFn).not.toHaveBeenCalled();
  });

  test("beforeLog returning invalid entry skips the write", async () => {
    const writeFn = mock(async () => {});
    const opts = makeOpts({
      storage: { write: writeFn },
      beforeLog: async () => ({ action: "x" }) as any, // missing required fields
    });
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(writeFn).not.toHaveBeenCalled();
  });

  test("storage failure calls onWriteError callback", async () => {
    const storageError = new Error("DB connection lost");
    const onWriteError = mock(() => {});
    const opts = makeOpts({
      storage: {
        write: async () => {
          throw storageError;
        },
      },
      onWriteError,
    });
    const ctx = makeCtx();

    await expect(writeEntry(ctx, makeEntry(), opts, "auditLog")).rejects.toThrow(
      "DB connection lost",
    );
    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect((onWriteError.mock.calls[0] as unknown[])[0]).toBe(storageError);
  });

  test("nonBlocking mode does not block on storage write", async () => {
    let writeResolved = false;
    const opts = makeOpts({
      nonBlocking: true,
      storage: {
        write: async () => {
          await new Promise((r) => setTimeout(r, 50));
          writeResolved = true;
        },
      },
    });
    const ctx = makeCtx() as GenericEndpointContext & {
      _backgroundTasks: Promise<unknown>[];
    };

    // writeEntry should return immediately
    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    expect(writeResolved).toBe(false);

    // Wait for the background task to complete
    await Promise.all(ctx._backgroundTasks);
    expect(writeResolved).toBe(true);
  });

  test("nonBlocking mode does not block on beforeLog", async () => {
    let beforeLogCalled = false;
    const opts = makeOpts({
      nonBlocking: true,
      storage: { write: async () => {} },
      beforeLog: async (entry) => {
        await new Promise((r) => setTimeout(r, 50));
        beforeLogCalled = true;
        return entry;
      },
    });
    const ctx = makeCtx() as GenericEndpointContext & {
      _backgroundTasks: Promise<unknown>[];
    };

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    // beforeLog should NOT have completed yet — it's in the background
    expect(beforeLogCalled).toBe(false);

    await Promise.all(ctx._backgroundTasks);
    expect(beforeLogCalled).toBe(true);
  });

  test("nonBlocking write failure calls onWriteError", async () => {
    const onWriteError = mock(() => {});
    const opts = makeOpts({
      nonBlocking: true,
      storage: {
        write: async () => {
          throw new Error("write failed");
        },
      },
      onWriteError,
    });
    const ctx = makeCtx() as GenericEndpointContext & {
      _backgroundTasks: Promise<unknown>[];
    };

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await Promise.all(ctx._backgroundTasks);

    expect(onWriteError).toHaveBeenCalled();
  });

  test("afterLog is called with the written entry", async () => {
    const afterLog = mock(async () => {});
    const opts = makeOpts({
      storage: { write: async () => {} },
      afterLog,
    });
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(afterLog).toHaveBeenCalledTimes(1);
    const written = (afterLog.mock.calls[0] as unknown[])[0] as AuditLogEntry;
    expect(written.id).toBeDefined();
  });
});

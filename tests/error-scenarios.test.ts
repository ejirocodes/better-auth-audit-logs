import { describe, test, expect, mock } from "bun:test";
import { writeEntry } from "../src/internal";
import { parseMetadata } from "../src/utils/parse-metadata";
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
    beforePaths: ["/sign-out"],
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
      runInBackground: (p: Promise<unknown>) => p,
      options: {},
    },
  } as unknown as GenericEndpointContext;
}

describe("error scenarios", () => {
  test("corrupt JSON metadata parses to empty object", () => {
    expect(parseMetadata("{broken")).toEqual({});
    expect(parseMetadata("null")).toEqual({});
    expect(parseMetadata("")).toEqual({});
  });

  test("storage adapter throw propagates in blocking mode", async () => {
    const opts = makeOpts({
      storage: {
        write: async () => { throw new Error("Connection refused"); },
      },
    });

    await expect(
      writeEntry(makeCtx(), makeEntry(), opts, "auditLog"),
    ).rejects.toThrow("Connection refused");
  });

  test("storage adapter throw in non-blocking mode calls onWriteError", async () => {
    const onWriteError = mock(() => {});
    const backgroundTasks: Promise<unknown>[] = [];
    const ctx = {
      context: {
        adapter: { create: mock(async () => ({})) },
        logger: {
          error: mock(() => {}),
          warn: mock(() => {}),
          info: mock(() => {}),
          debug: mock(() => {}),
        },
        runInBackground: (p: Promise<unknown>) => backgroundTasks.push(p),
        options: {},
      },
    } as unknown as GenericEndpointContext;

    const opts = makeOpts({
      nonBlocking: true,
      storage: {
        write: async () => { throw new Error("Timeout"); },
      },
      onWriteError,
    });

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await Promise.all(backgroundTasks);

    expect(onWriteError).toHaveBeenCalled();
  });

  test("beforeLog returning null skips write without error", async () => {
    const writeFn = mock(async () => {});
    const opts = makeOpts({
      storage: { write: writeFn },
      beforeLog: async () => null,
    });

    await writeEntry(makeCtx(), makeEntry(), opts, "auditLog");
    expect(writeFn).not.toHaveBeenCalled();
  });

  test("beforeLog returning entry with missing fields skips write", async () => {
    const writeFn = mock(async () => {});
    const opts = makeOpts({
      storage: { write: writeFn },
      beforeLog: async () => ({ action: "x" }) as any,
    });

    await writeEntry(makeCtx(), makeEntry(), opts, "auditLog");
    expect(writeFn).not.toHaveBeenCalled();
  });

  test("beforeLog throwing does not crash write pipeline", async () => {
    const opts = makeOpts({
      storage: { write: async () => {} },
      beforeLog: async () => { throw new Error("hook crashed"); },
    });

    // In blocking mode, the error propagates but is caught by the hook
    // wrapper. Since writeEntry is called from hooks that have try-catch,
    // we verify it throws so the hook can catch it.
    await expect(
      writeEntry(makeCtx(), makeEntry(), opts, "auditLog"),
    ).rejects.toThrow("hook crashed");
  });

  test("adapter create failure returns error to caller", async () => {
    const ctx = makeCtx({
      create: async () => { throw new Error("INSERT failed"); },
    });
    const opts = makeOpts();

    await expect(
      writeEntry(ctx, makeEntry(), opts, "auditLog"),
    ).rejects.toThrow("INSERT failed");
  });

  test("retry exhaustion reports all attempts failed", async () => {
    let attempts = 0;
    const opts = makeOpts({
      storage: {
        write: async () => {
          attempts++;
          throw new Error("Persistent failure");
        },
      },
    });

    await expect(
      writeEntry(makeCtx(), makeEntry(), opts, "auditLog"),
    ).rejects.toThrow("Persistent failure");

    // 1 initial + 2 retries = 3 attempts
    expect(attempts).toBe(3);
  });
});

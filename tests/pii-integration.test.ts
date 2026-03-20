import { describe, test, expect, mock } from "bun:test";
import { MemoryStorage } from "../src/adapters/memory";
import { writeEntry, buildLogEntryFromAction } from "../src/internal";
import type { ResolvedOptions } from "../src/types";
import type { GenericEndpointContext } from "@better-auth/core";

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

function makeCtx(): GenericEndpointContext {
  return {
    context: {
      adapter: {
        create: mock(async () => ({})),
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

describe("PII redaction end-to-end", () => {
  test("write → store → read with mask strategy", async () => {
    const storage = new MemoryStorage();
    const opts = makeOpts({
      storage,
      piiRedaction: { enabled: true, strategy: "mask" },
    });

    const entry = await buildLogEntryFromAction("sign-in:email", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { email: "user@example.com", password: "secret123" },
      options: opts,
      authOptions: {},
    });

    await writeEntry(makeCtx(), entry, opts, "auditLog");

    expect(storage.entries).toHaveLength(1);
    const stored = storage.entries[0]!;
    expect(stored.metadata.password).toBe("[REDACTED]");
    expect(stored.metadata.email).toBe("user@example.com");
  });

  test("write → store → read with remove strategy", async () => {
    const storage = new MemoryStorage();
    const opts = makeOpts({
      storage,
      piiRedaction: { enabled: true, strategy: "remove" },
    });

    const entry = await buildLogEntryFromAction("sign-in:email", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { email: "user@example.com", token: "abc123" },
      options: opts,
      authOptions: {},
    });

    await writeEntry(makeCtx(), entry, opts, "auditLog");

    expect(storage.entries).toHaveLength(1);
    const stored = storage.entries[0]!;
    expect("token" in stored.metadata).toBe(false);
    expect(stored.metadata.email).toBe("user@example.com");
  });

  test("write → store → read with hash strategy produces consistent hashes", async () => {
    const storage = new MemoryStorage();
    const opts = makeOpts({
      storage,
      piiRedaction: { enabled: true, strategy: "hash" },
    });

    const entry1 = await buildLogEntryFromAction("sign-in:email", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { password: "secret" },
      options: opts,
      authOptions: {},
    });
    await writeEntry(makeCtx(), entry1, opts, "auditLog");

    const entry2 = await buildLogEntryFromAction("sign-in:email", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { password: "secret" },
      options: opts,
      authOptions: {},
    });
    await writeEntry(makeCtx(), entry2, opts, "auditLog");

    const hash1 = storage.entries[0]!.metadata.password as string;
    const hash2 = storage.entries[1]!.metadata.password as string;
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe("secret");
    expect(hash1.length).toBe(64);
  });

  test("PII redaction with custom fields", async () => {
    const storage = new MemoryStorage();
    const opts = makeOpts({
      storage,
      piiRedaction: { enabled: true, strategy: "mask", fields: ["ssn", "creditCard"] },
    });

    const entry = await buildLogEntryFromAction("custom:action", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { ssn: "123-45-6789", creditCard: "4111111111111111", name: "John" },
      options: opts,
      authOptions: {},
    });
    await writeEntry(makeCtx(), entry, opts, "auditLog");

    const stored = storage.entries[0]!;
    expect(stored.metadata.ssn).toBe("[REDACTED]");
    expect(stored.metadata.creditCard).toBe("[REDACTED]");
    expect(stored.metadata.name).toBe("John");
  });

  test("disabled PII redaction passes metadata through unchanged", async () => {
    const storage = new MemoryStorage();
    const opts = makeOpts({
      storage,
      piiRedaction: { enabled: false, strategy: "mask" },
    });

    const entry = await buildLogEntryFromAction("sign-in:email", "success", {
      userId: "user-1",
      request: undefined,
      headers: undefined,
      metadata: { password: "visible" },
      options: opts,
      authOptions: {},
    });
    await writeEntry(makeCtx(), entry, opts, "auditLog");

    expect(storage.entries[0]!.metadata.password).toBe("visible");
  });
});

import { describe, test, expect, mock } from "bun:test";
import type { GenericEndpointContext } from "better-auth";
import { auditLog, resolveOptions } from "../../src/plugin";
import { writeEntry } from "../../src/internal";
import { selectHead } from "../../src/tamper";
import { computeEntryHash } from "../../src/tamper";
import { MemoryStorage } from "../../src/adapters/memory";
import type { AuditLogEntry, AuditLogStorage } from "../../src/types";

const SECRET = "chain-test-secret";

function makeCtx() {
  return {
    context: {
      secret: SECRET,
      adapter: { create: mock(async () => ({})), findMany: mock(async () => []) },
      logger: { error: mock(() => {}), warn: mock(() => {}), info: mock(() => {}), debug: mock(() => {}) },
      runInBackground: () => {},
      options: {},
    },
  } as unknown as GenericEndpointContext;
}

function makeEntry(
  overrides: Partial<Omit<AuditLogEntry, "id">> = {},
): Omit<AuditLogEntry, "id"> {
  return {
    userId: "user-1",
    action: "sign-in:email",
    status: "success",
    severity: "medium",
    ipAddress: null,
    userAgent: null,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function chainedOptions(
  storage: AuditLogStorage,
  scope: "user" | "global" = "user",
) {
  return resolveOptions({ storage, tamperDetection: { enabled: true, scope } });
}

describe("selectHead", () => {
  test("returns null for an empty window", () => {
    expect(selectHead([])).toBeNull();
  });

  test("picks the link no other entry points back to, whatever the order", () => {
    const window = [
      { hash: "b", previousHash: "a" },
      { hash: "c", previousHash: "b" },
      { hash: "a", previousHash: null },
    ];

    expect(selectHead(window)).toBe("c");
  });

  test("ignores entries written before tamper detection was enabled", () => {
    expect(selectHead([{ hash: null }, { hash: "a", previousHash: null }])).toBe("a");
  });
});

describe("chain append", () => {
  test("links each entry to the one before it", async () => {
    const storage = new MemoryStorage();
    const opts = chainedOptions(storage);
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ action: "sign-out" }), opts, "auditLog");

    const [first, second] = storage.entries;
    expect(first!.previousHash).toBeNull();
    expect(first!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second!.previousHash).toBe(first!.hash!);
  });

  test("hashes the entry a beforeLog hook actually returned", async () => {
    const storage = new MemoryStorage();
    const opts = resolveOptions({
      storage,
      tamperDetection: { enabled: true },
      beforeLog: async (entry) => ({ ...entry, severity: "critical" }),
    });

    await writeEntry(makeCtx(), makeEntry(), opts, "auditLog");

    const written = storage.entries[0]!;
    expect(written.severity).toBe("critical");
    expect(written.hash).toBe(await computeEntryHash(written, null, SECRET));
  });

  test("keeps a separate chain per user", async () => {
    const storage = new MemoryStorage();
    const opts = chainedOptions(storage);
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry({ userId: "user-1" }), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ userId: "user-2" }), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ userId: "user-1" }), opts, "auditLog");

    const [a1, b1, a2] = storage.entries;
    expect(b1!.previousHash).toBeNull();
    expect(a2!.previousHash).toBe(a1!.hash!);
  });

  test("chains entries with no user together", async () => {
    const storage = new MemoryStorage();
    const opts = chainedOptions(storage);
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry({ userId: null }), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ userId: "user-1" }), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ userId: null }), opts, "auditLog");

    const [first, , third] = storage.entries;
    expect(first!.previousHash).toBeNull();
    expect(third!.previousHash).toBe(first!.hash!);
  });

  test("global scope puts every user on one chain", async () => {
    const storage = new MemoryStorage();
    const opts = chainedOptions(storage, "global");
    const ctx = makeCtx();

    await writeEntry(ctx, makeEntry({ userId: "user-1" }), opts, "auditLog");
    await writeEntry(ctx, makeEntry({ userId: "user-2" }), opts, "auditLog");

    const [first, second] = storage.entries;
    expect(second!.previousHash).toBe(first!.hash!);
  });

  test("concurrent writes to one chain do not fork", async () => {
    const storage = new MemoryStorage();
    const opts = chainedOptions(storage);
    const ctx = makeCtx();

    await Promise.all(
      Array.from({ length: 8 }, () => writeEntry(ctx, makeEntry(), opts, "auditLog")),
    );

    const previous = storage.entries.map((e) => e.previousHash);
    expect(new Set(previous).size).toBe(storage.entries.length);
    expect(previous.filter((p) => p === null)).toHaveLength(1);
  });

  test("a failed write does not wedge the chain", async () => {
    const storage = new MemoryStorage();
    const failOnce = mock(storage.write.bind(storage));
    failOnce.mockImplementationOnce(async () => {
      throw new Error("backend down");
    });

    const opts = chainedOptions({
      ...storage,
      write: failOnce,
      readChain: storage.readChain.bind(storage),
    } as unknown as AuditLogStorage);

    const ctx = makeCtx();
    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(storage.entries).toHaveLength(2);
    expect(storage.entries[1]!.previousHash).toBe(storage.entries[0]!.hash!);
  });

  test("reads the chain head through the database adapter when no storage is set", async () => {
    const opts = resolveOptions({ tamperDetection: { enabled: true } });
    const ctx = makeCtx();
    const created: Record<string, unknown>[] = [];

    (ctx.context.adapter.create as ReturnType<typeof mock>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `id-${created.length}`, ...data };
      },
    );
    (ctx.context.adapter.findMany as ReturnType<typeof mock>).mockImplementation(
      async () => [...created].reverse(),
    );

    await writeEntry(ctx, makeEntry(), opts, "auditLog");
    await writeEntry(ctx, makeEntry(), opts, "auditLog");

    expect(created[0]!["previousHash"]).toBeNull();
    expect(created[1]!["previousHash"]).toBe(created[0]!["hash"]);
  });

  test("writes no chain fields when tamper detection is off", async () => {
    const storage = new MemoryStorage();
    await writeEntry(makeCtx(), makeEntry(), resolveOptions({ storage }), "auditLog");

    expect(storage.entries[0]).not.toHaveProperty("hash");
    expect(storage.entries[0]).not.toHaveProperty("previousHash");
  });
});

describe("plugin configuration", () => {
  test("adds the chain columns to the schema only when enabled", () => {
    const off = auditLog().schema.auditLog.fields;
    const on = auditLog({ tamperDetection: { enabled: true } }).schema.auditLog.fields;

    expect(off).not.toHaveProperty("hash");
    expect(on).toHaveProperty("hash");
    expect(on).toHaveProperty("previousHash");
  });

  test("throws when a custom storage backend cannot read a chain", () => {
    const storage: AuditLogStorage = { async write() {} };

    expect(() => auditLog({ storage, tamperDetection: { enabled: true } })).toThrow(
      /requires storage.readChain/,
    );
  });

  test("throws when storage.readChain is not a function", () => {
    const storage = { async write() {}, readChain: "nope" } as unknown as AuditLogStorage;

    expect(() => auditLog({ storage })).toThrow(/readChain must be a function/);
  });

  test("stays off when the plugin itself is disabled", () => {
    const resolved = resolveOptions({ enabled: false, tamperDetection: { enabled: true } });

    expect(resolved.appendToChain).toBeUndefined();
  });
});

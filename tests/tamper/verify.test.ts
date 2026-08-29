import { describe, test, expect, mock } from "bun:test";
import type { GenericEndpointContext } from "better-auth";
import { resolveOptions } from "../../src/plugin";
import { writeEntry } from "../../src/internal";
import { verifyAuditLogChain } from "../../src/tamper";
import { MemoryStorage } from "../../src/adapters/memory";
import type { AuditLogEntry, AuditLogVerificationContext } from "../../src";

const SECRET = "verify-test-secret";

const verificationContext = {
  secret: SECRET,
  adapter: { findMany: async () => [] },
} as unknown as AuditLogVerificationContext;

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

async function buildChain(
  entries: Partial<Omit<AuditLogEntry, "id">>[],
  scope: "user" | "global" = "user",
): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  const opts = resolveOptions({ storage, tamperDetection: { enabled: true, scope } });
  const ctx = makeCtx();

  for (const [index, overrides] of entries.entries()) {
    await writeEntry(
      ctx,
      {
        userId: "user-1",
        action: "sign-in:email",
        status: "success",
        severity: "medium",
        ipAddress: null,
        userAgent: null,
        metadata: {},
        createdAt: new Date(Date.now() + index),
        ...overrides,
      },
      opts,
      "auditLog",
    );
  }

  return storage;
}

describe("verifyAuditLogChain", () => {
  test("accepts an untouched chain", async () => {
    const storage = await buildChain([{}, {}, {}]);

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.chains).toBe(1);
    expect(report.entriesChecked).toBe(3);
    expect(report.unchained).toBe(0);
  });

  test("accepts a chain per user and one for entries with no user", async () => {
    const storage = await buildChain([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: null },
      { userId: "user-1" },
      { userId: null },
    ]);

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(true);
    expect(report.chains).toBe(3);
  });

  test("reports an edited entry as modified", async () => {
    const storage = await buildChain([{}, {}, {}]);
    storage.entries[1]!.action = "sign-in:social";

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      {
        type: "modified",
        chainId: "user-1",
        entryId: storage.entries[1]!.id,
        previousHash: storage.entries[1]!.previousHash!,
      },
    ]);
  });

  test("reports an entry deleted from the middle as orphaned", async () => {
    const storage = await buildChain([{}, {}, {}]);
    const [, removed, successor] = storage.entries;
    storage.entries.splice(storage.entries.indexOf(removed!), 1);

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      {
        type: "orphaned",
        chainId: "user-1",
        entryId: successor!.id,
        previousHash: removed!.hash!,
      },
    ]);
  });

  test("reports a retention-trimmed chain start as truncated, not tampering", async () => {
    const storage = await buildChain([{}, {}, {}]);
    const survivor = storage.entries[2]!;
    storage.entries.splice(0, 2);

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([
      {
        type: "truncated",
        chainId: "user-1",
        entryId: survivor.id,
        previousHash: survivor.previousHash!,
      },
    ]);
  });

  test("treats the oldest entry inside a from/to window as a chain start", async () => {
    const storage = await buildChain([{}, {}, {}]);

    const report = await verifyAuditLogChain(verificationContext, {
      storage,
      from: storage.entries[1]!.createdAt,
    });

    expect(report.ok).toBe(true);
    expect(report.entriesChecked).toBe(2);
    expect(report.findings.map((f) => f.type)).toEqual(["truncated"]);
  });

  test("reports two entries claiming the same predecessor as a fork", async () => {
    const storage = await buildChain([{}, {}]);
    const forked: AuditLogEntry = { ...storage.entries[1]!, id: "forked" };
    storage.entries.push(forked);

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(true);
    expect(report.findings.map((f) => f.type)).toEqual(["forked", "forked"]);
  });

  test("counts pre-existing entries with no chain link as unchained", async () => {
    const storage = await buildChain([{}, {}]);
    await storage.write({
      id: "legacy",
      userId: "user-1",
      action: "sign-in:email",
      status: "success",
      severity: "medium",
      ipAddress: null,
      userAgent: null,
      metadata: {},
      createdAt: new Date(),
    });

    const report = await verifyAuditLogChain(verificationContext, { storage });

    expect(report.ok).toBe(true);
    expect(report.entriesChecked).toBe(2);
    expect(report.unchained).toBe(1);
  });

  test("fails when verified with the wrong secret", async () => {
    const storage = await buildChain([{}, {}]);

    const report = await verifyAuditLogChain(verificationContext, {
      storage,
      secret: "not-the-secret",
    });

    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.type)).toEqual(["modified", "modified"]);
  });

  test("verifies a single user's chain", async () => {
    const storage = await buildChain([
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-1" },
    ]);

    const report = await verifyAuditLogChain(verificationContext, {
      storage,
      userId: "user-2",
    });

    expect(report.ok).toBe(true);
    expect(report.chains).toBe(1);
    expect(report.entriesChecked).toBe(1);
  });

  test("pages through the backend until it runs out of entries", async () => {
    const storage = await buildChain(Array.from({ length: 7 }, () => ({})));

    const report = await verifyAuditLogChain(verificationContext, {
      storage,
      batchSize: 2,
    });

    expect(report.ok).toBe(true);
    expect(report.entriesChecked).toBe(7);
  });

  test("groups every entry into one chain under global scope", async () => {
    const storage = await buildChain(
      [{ userId: "user-1" }, { userId: "user-2" }, { userId: null }],
      "global",
    );

    const report = await verifyAuditLogChain(verificationContext, {
      storage,
      scope: "global",
    });

    expect(report.ok).toBe(true);
    expect(report.chains).toBe(1);
    expect(report.findings).toEqual([]);
  });

  test("throws when a custom storage backend cannot read a chain", async () => {
    expect(
      verifyAuditLogChain(verificationContext, { storage: { async write() {} } }),
    ).rejects.toThrow(/must implement readChain/);
  });

  test("ignores a row repeated across pages by a concurrent write", async () => {
    const storage = await buildChain([{}, {}, {}]);
    const pages = [storage.entries.slice(1).reverse(), storage.entries.slice(0, 2).reverse()];

    const report = await verifyAuditLogChain(verificationContext, {
      storage: {
        async write() {},
        async readChain({ offset }) {
          return pages[offset / 2] ?? [];
        },
      },
      batchSize: 2,
    });

    expect(report.entriesChecked).toBe(3);
    expect(report.findings).toEqual([]);
  });

  test("reads through the database adapter when no storage is given", async () => {
    const storage = await buildChain([{}, {}]);
    const rows = [...storage.entries]
      .reverse()
      .map((e) => ({ ...e, metadata: JSON.stringify(e.metadata) }));

    const findMany = mock(async ({ offset = 0 }: { offset?: number }) =>
      rows.slice(offset, offset + 500),
    );

    const report = await verifyAuditLogChain({
      secret: SECRET,
      adapter: { findMany },
    } as unknown as AuditLogVerificationContext);

    expect(report.ok).toBe(true);
    expect(report.entriesChecked).toBe(2);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ model: "auditLog" });
  });
});

import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryStorage } from "../../src/adapters/memory";
import type { AuditLogEntry } from "../../src/types";

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    action: "sign-in:email",
    status: "success",
    severity: "medium",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe("MemoryStorage", () => {
  let store: MemoryStorage;

  beforeEach(() => {
    store = new MemoryStorage();
  });

  test("write stores an entry", async () => {
    const entry = makeEntry();
    await store.write(entry);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]?.id).toBe(entry.id);
  });

  test("read returns all entries when no filters", async () => {
    await store.write(makeEntry());
    await store.write(makeEntry());
    const result = await store.read({ limit: 10, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  test("read filters by userId", async () => {
    await store.write(makeEntry({ userId: "user-1" }));
    await store.write(makeEntry({ userId: "user-2" }));
    const result = await store.read({ userId: "user-1", limit: 10, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.entries[0]?.userId).toBe("user-1");
  });

  test("read filters by action", async () => {
    await store.write(makeEntry({ action: "sign-in:email" }));
    await store.write(makeEntry({ action: "sign-out" }));
    const result = await store.read({
      action: "sign-out",
      limit: 10,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.entries[0]?.action).toBe("sign-out");
  });

  test("read filters by status", async () => {
    await store.write(makeEntry({ status: "success" }));
    await store.write(makeEntry({ status: "failed" }));
    const result = await store.read({
      status: "failed",
      limit: 10,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.entries[0]?.status).toBe("failed");
  });

  test("read filters by date range", async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const old = makeEntry({ createdAt: new Date(Date.now() - 120_000) });
    const recent = makeEntry({ createdAt: new Date() });

    await store.write(old);
    await store.write(recent);

    const result = await store.read({ from: past, to: future, limit: 10, offset: 0 });
    expect(result.total).toBe(1);
  });

  test("read paginates with limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await store.write(makeEntry({ id: `entry-${i}` }));
    }
    const page1 = await store.read({ limit: 2, offset: 0 });
    const page2 = await store.read({ limit: 2, offset: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page2.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  test("read returns entries sorted newest first", async () => {
    const older = makeEntry({ createdAt: new Date(Date.now() - 5000) });
    const newer = makeEntry({ createdAt: new Date() });
    await store.write(older);
    await store.write(newer);
    const result = await store.read({ limit: 10, offset: 0 });
    expect(result.entries[0]?.id).toBe(newer.id);
  });

  test("readById returns the matching entry", async () => {
    const entry = makeEntry({ id: "target" });
    await store.write(entry);
    await store.write(makeEntry({ id: "other" }));
    const found = await store.readById("target");
    expect(found?.id).toBe("target");
  });

  test("readById returns null when not found", async () => {
    const found = await store.readById("nonexistent");
    expect(found).toBeNull();
  });

  test("deleteOlderThan removes old entries and returns count", async () => {
    const old = makeEntry({ createdAt: new Date(Date.now() - 120_000) });
    const recent = makeEntry({ createdAt: new Date() });
    await store.write(old);
    await store.write(recent);

    const cutoff = new Date(Date.now() - 60_000);
    const deleted = await store.deleteOlderThan(cutoff);

    expect(deleted).toBe(1);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]?.id).toBe(recent.id);
  });
});

import { describe, test, expect } from "bun:test";
import { computeEntryHash } from "../../src/tamper";
import type { AuditLogEntry } from "../../src/types";

const SECRET = "test-secret";

function makeEntry(
  overrides: Partial<Omit<AuditLogEntry, "id">> = {},
): Omit<AuditLogEntry, "id"> {
  return {
    userId: "user-1",
    action: "sign-in:email",
    status: "success",
    severity: "medium",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("computeEntryHash", () => {
  test("is deterministic for the same entry, previous hash, and secret", async () => {
    const entry = makeEntry();
    const a = await computeEntryHash(entry, null, SECRET);
    const b = await computeEntryHash(entry, null, SECRET);

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("changes when any audited field changes", async () => {
    const base = await computeEntryHash(makeEntry(), null, SECRET);

    const mutations: Partial<Omit<AuditLogEntry, "id">>[] = [
      { userId: "user-2" },
      { action: "sign-in:social" },
      { status: "failed" },
      { severity: "critical" },
      { ipAddress: "10.0.0.1" },
      { userAgent: "other-agent" },
      { metadata: { requestBody: { email: "a@b.c" } } },
      { createdAt: new Date("2026-01-01T00:00:00.001Z") },
    ];

    for (const mutation of mutations) {
      expect(await computeEntryHash(makeEntry(mutation), null, SECRET)).not.toBe(base);
    }
  });

  test("changes when the previous hash changes", async () => {
    const entry = makeEntry();

    expect(await computeEntryHash(entry, "aaaa", SECRET)).not.toBe(
      await computeEntryHash(entry, "bbbb", SECRET),
    );
  });

  test("changes when the secret changes", async () => {
    const entry = makeEntry();

    expect(await computeEntryHash(entry, null, SECRET)).not.toBe(
      await computeEntryHash(entry, null, "other-secret"),
    );
  });

  test("ignores metadata key order", async () => {
    const first = makeEntry({ metadata: { a: 1, b: { c: 2, d: 3 } } });
    const second = makeEntry({ metadata: { b: { d: 3, c: 2 }, a: 1 } });

    expect(await computeEntryHash(first, null, SECRET)).toBe(
      await computeEntryHash(second, null, SECRET),
    );
  });

  test("survives the JSON round-trip metadata takes through the database", async () => {
    const live = makeEntry({ metadata: { nested: { list: [1, "two"] }, dropped: undefined } });
    const roundTripped = makeEntry({
      metadata: JSON.parse(JSON.stringify(live.metadata)),
    });

    expect(await computeEntryHash(live, null, SECRET)).toBe(
      await computeEntryHash(roundTripped, null, SECRET),
    );
  });

  test("accepts a createdAt that came back from the database as a string", async () => {
    const entry = makeEntry();
    const asString = makeEntry({
      createdAt: entry.createdAt.toISOString() as unknown as Date,
    });

    expect(await computeEntryHash(asString, null, SECRET)).toBe(
      await computeEntryHash(entry, null, SECRET),
    );
  });

  test("rejects an empty secret rather than producing an unkeyed hash", async () => {
    expect(computeEntryHash(makeEntry(), null, "")).rejects.toThrow(
      /requires a secret/,
    );
  });
});

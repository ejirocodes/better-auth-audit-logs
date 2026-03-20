import { describe, test, expect, mock } from "bun:test";
import { auditLog } from "../src/plugin";
import type { AuditLogEntry, AuditLogStorage, StorageReadOptions, StorageReadResult } from "../src/types";

class TestAdapter implements AuditLogStorage {
  readonly entries: AuditLogEntry[] = [];

  async write(entry: AuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async read(opts: StorageReadOptions): Promise<StorageReadResult> {
    const filtered = this.entries
      .filter((e) => !opts.userId || e.userId === opts.userId)
      .slice(opts.offset, opts.offset + opts.limit);
    return { entries: filtered, total: this.entries.length };
  }

  async readById(id: string): Promise<AuditLogEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }
}

describe("custom storage adapter", () => {
  test("plugin accepts a valid custom adapter", () => {
    const adapter = new TestAdapter();
    expect(() => auditLog({ storage: adapter })).not.toThrow();
  });

  test("plugin rejects adapter missing write method", () => {
    expect(() => auditLog({ storage: {} as any })).toThrow("must implement write");
  });

  test("plugin rejects adapter with non-function read", () => {
    expect(() =>
      auditLog({ storage: { write: async () => {}, read: "invalid" } as any }),
    ).toThrow("storage.read must be a function");
  });

  test("plugin rejects adapter with non-function readById", () => {
    expect(() =>
      auditLog({
        storage: { write: async () => {}, readById: 42 } as any,
      }),
    ).toThrow("storage.readById must be a function");
  });

  test("plugin rejects adapter with non-function deleteOlderThan", () => {
    expect(() =>
      auditLog({
        storage: { write: async () => {}, deleteOlderThan: true } as any,
      }),
    ).toThrow("storage.deleteOlderThan must be a function");
  });

  test("write-only adapter (no read/readById) is accepted", () => {
    expect(() =>
      auditLog({ storage: { write: async () => {} } }),
    ).not.toThrow();
  });

  test("adapter with all optional methods is accepted", () => {
    const fullAdapter: AuditLogStorage = {
      write: async () => {},
      read: async () => ({ entries: [], total: 0 }),
      readById: async () => null,
      deleteOlderThan: async () => 0,
    };
    expect(() => auditLog({ storage: fullAdapter })).not.toThrow();
  });
});

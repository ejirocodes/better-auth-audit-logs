import type {
  AuditLogEntry,
  AuditLogStorage,
  StorageReadOptions,
  StorageReadResult,
} from "../types";

export class MemoryStorage implements AuditLogStorage {
  readonly entries: AuditLogEntry[] = [];

  async write(entry: AuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async read(opts: StorageReadOptions): Promise<StorageReadResult> {
    let filtered = this.entries.filter((e) => {
      if (opts.userId !== undefined && e.userId !== opts.userId) return false;
      if (opts.action !== undefined && e.action !== opts.action) return false;
      if (opts.status !== undefined && e.status !== opts.status) return false;
      if (opts.from !== undefined && e.createdAt < opts.from) return false;
      if (opts.to !== undefined && e.createdAt > opts.to) return false;
      return true;
    });

    const total = filtered.length;

    filtered = filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(opts.offset, opts.offset + opts.limit);

    return { entries: filtered, total };
  }

  async readById(id: string): Promise<AuditLogEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const before = this.entries.length;
    const retained = this.entries.filter((e) => e.createdAt >= date);
    this.entries.length = 0;
    this.entries.push(...retained);
    return before - this.entries.length;
  }
}

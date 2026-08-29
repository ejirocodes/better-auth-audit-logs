import type { Where } from "better-auth";
import type {
  AuditLogEntry,
  AuditLogStorage,
  TamperDetectionScope,
} from "../types";
import { DEFAULT_MODEL_NAME } from "../schema";
import { parseMetadata } from "../utils";
import { computeEntryHash } from "./hash";
import { chainWhere } from "./chain";

const DEFAULT_BATCH_SIZE = 500;

export type AuditLogChainFindingType =
  /** Recomputed signature does not match the stored one. */
  | "modified"
  /** The linked-to entry is missing from the middle of the chain. */
  | "orphaned"
  /** Two entries claim the same predecessor — concurrent writers, not tampering. */
  | "forked"
  /** The oldest entry in range links further back, as retention or a `from` bound leaves it. */
  | "truncated";

export interface AuditLogChainFinding {
  type: AuditLogChainFindingType;
  chainId: string | null;
  entryId: string;
  previousHash: string | null;
}

export interface AuditLogChainReport {
  /** False when any entry was modified or deleted from the middle of a chain. */
  ok: boolean;
  chains: number;
  entriesChecked: number;
  /** Entries with no chain link — written before tamper detection was enabled. */
  unchained: number;
  findings: AuditLogChainFinding[];
}

export interface AuditLogVerificationContext {
  secret: string;
  adapter: {
    findMany: <T>(data: {
      model: string;
      where?: Where[];
      limit?: number;
      offset?: number;
      sortBy?: { field: string; direction: "asc" | "desc" };
    }) => Promise<T[]>;
  };
}

export interface VerifyAuditLogChainOptions {
  scope?: TamperDetectionScope;
  secret?: string;
  /** Restrict verification to one user's chain. `null` checks entries with no user. */
  userId?: string | null;
  from?: Date;
  to?: Date;
  storage?: AuditLogStorage;
  modelName?: string;
  batchSize?: number;
}

function byCreatedAtAsc(a: AuditLogEntry, b: AuditLogEntry): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

async function loadEntries(
  context: AuditLogVerificationContext,
  options: VerifyAuditLogChainOptions,
): Promise<AuditLogEntry[]> {
  if (options.storage && !options.storage.readChain) {
    throw new Error(
      "[audit-log] custom storage must implement readChain(options) to support chain verification",
    );
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const scoped = options.userId !== undefined;
  const seen = new Set<string>();
  const entries: AuditLogEntry[] = [];

  for (let offset = 0; ; offset += batchSize) {
    let batch: AuditLogEntry[];

    if (options.storage) {
      batch = await options.storage.readChain!({
        ...(scoped && { userId: options.userId }),
        from: options.from,
        to: options.to,
        limit: batchSize,
        offset,
      });
    } else {
      const where: Where[] = scoped ? chainWhere(options.userId!) : [];
      if (options.from) {
        where.push({ field: "createdAt", operator: "gte", value: options.from });
      }
      if (options.to) {
        where.push({ field: "createdAt", operator: "lte", value: options.to });
      }

      const rows = await context.adapter.findMany<Record<string, unknown>>({
        model: options.modelName ?? DEFAULT_MODEL_NAME,
        ...(where.length > 0 && { where }),
        sortBy: { field: "createdAt", direction: "desc" },
        limit: batchSize,
        offset,
      });

      batch = rows.map(
        (row) =>
          ({ ...row, metadata: parseMetadata(row["metadata"]) }) as AuditLogEntry,
      );
    }

    // Paging by offset can repeat a row when writes land mid-verification.
    for (const entry of batch) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        entries.push(entry);
      }
    }

    if (batch.length < batchSize) return entries;
  }
}

async function verifyChain(
  chainId: string | null,
  entries: AuditLogEntry[],
  secret: string,
): Promise<AuditLogChainFinding[]> {
  const ordered = [...entries].sort(byCreatedAtAsc);
  const findings: AuditLogChainFinding[] = [];
  const hashes = new Set(ordered.map((entry) => entry.hash));
  const successors = new Map<string | null, AuditLogEntry[]>();

  for (const entry of ordered) {
    const previousHash = entry.previousHash ?? null;
    const expected = await computeEntryHash(entry, previousHash, secret);

    if (expected !== entry.hash) {
      findings.push({ type: "modified", chainId, entryId: entry.id, previousHash });
    }

    const siblings = successors.get(previousHash);
    if (siblings) siblings.push(entry);
    else successors.set(previousHash, [entry]);
  }

  for (const [previousHash, siblings] of successors) {
    if (siblings.length < 2) continue;
    for (const entry of siblings) {
      findings.push({ type: "forked", chainId, entryId: entry.id, previousHash });
    }
  }

  for (const entry of ordered) {
    const previousHash = entry.previousHash ?? null;
    if (previousHash === null || hashes.has(previousHash)) continue;

    findings.push({
      // Only the oldest entry in range can legitimately link outside it.
      type: entry === ordered[0] ? "truncated" : "orphaned",
      chainId,
      entryId: entry.id,
      previousHash,
    });
  }

  return findings;
}

/**
 * Recomputes every chain signature and reports where the chain breaks. Safe to
 * call from a cron job, an admin endpoint, or a compliance export.
 */
export async function verifyAuditLogChain(
  context: AuditLogVerificationContext,
  options: VerifyAuditLogChainOptions = {},
): Promise<AuditLogChainReport> {
  const scope = options.scope ?? "user";
  const secret = options.secret ?? context.secret;

  const entries = await loadEntries(context, options);
  const chained = entries.filter((entry) => !!entry.hash);

  const chains = new Map<string | null, AuditLogEntry[]>();
  for (const entry of chained) {
    const chainId = scope === "global" ? null : entry.userId;
    const group = chains.get(chainId);
    if (group) group.push(entry);
    else chains.set(chainId, [entry]);
  }

  const findings: AuditLogChainFinding[] = [];
  for (const [chainId, group] of chains) {
    findings.push(...(await verifyChain(chainId, group, secret)));
  }

  return {
    ok: !findings.some((f) => f.type === "modified" || f.type === "orphaned"),
    chains: chains.size,
    entriesChecked: chained.length,
    unchained: entries.length - chained.length,
    findings,
  };
}

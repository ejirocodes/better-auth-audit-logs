import type { GenericEndpointContext, Where } from "better-auth";
import type {
  AuditLogEntry,
  AuditLogStorage,
  ResolvedTamperDetection,
} from "../types";
import { computeEntryHash } from "./hash";
import { createKeyedMutex } from "./mutex";

/**
 * Entries read back to locate the chain head. A window rather than a single row
 * because `createdAt` alone cannot order writes that land in the same
 * millisecond — the head is the one no other entry links back to.
 */
const HEAD_WINDOW = 16;

export type PersistEntry = (
  entry: Omit<AuditLogEntry, "id">,
) => Promise<AuditLogEntry>;

export type AppendToChain = (
  ctx: GenericEndpointContext,
  entry: Omit<AuditLogEntry, "id">,
  persist: PersistEntry,
) => Promise<AuditLogEntry>;

interface ChainLink {
  hash?: string | null;
  previousHash?: string | null;
}

export function chainWhere(userId: string | null): Where[] {
  return [{ field: "userId", value: userId }];
}

export function selectHead(links: ChainLink[]): string | null {
  const hashed = links.filter(
    (link): link is ChainLink & { hash: string } => !!link.hash,
  );
  const referenced = new Set(hashed.map((link) => link.previousHash));

  return (
    (hashed.find((link) => !referenced.has(link.hash)) ?? hashed[0])?.hash ??
    null
  );
}

export function createAppendToChain(
  tamper: ResolvedTamperDetection,
  modelName: string,
  storage: AuditLogStorage | undefined,
): AppendToChain {
  const runExclusive = createKeyedMutex();

  const readWindow = async (
    ctx: GenericEndpointContext,
    userId: string | null,
  ): Promise<ChainLink[]> => {
    if (storage) {
      return storage.readChain!({
        ...(tamper.scope === "user" && { userId }),
        limit: HEAD_WINDOW,
        offset: 0,
      });
    }

    return ctx.context.adapter.findMany<ChainLink>({
      model: modelName,
      ...(tamper.scope === "user" && { where: chainWhere(userId) }),
      sortBy: { field: "createdAt", direction: "desc" },
      limit: HEAD_WINDOW,
    });
  };

  return (ctx, entry, persist) => {
    const secret = tamper.secret ?? ctx.context.secret;
    const lock = tamper.scope === "global" ? "" : (entry.userId ?? "");

    return runExclusive(lock, async () => {
      const previousHash = selectHead(await readWindow(ctx, entry.userId));
      const hash = await computeEntryHash(entry, previousHash, secret);
      return persist({ ...entry, previousHash, hash });
    });
  };
}

import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { Where } from "better-auth";
import { z } from "zod";
import type { AuditLogEntry, ResolvedOptions, StorageReadOptions } from "../types";
import { parseMetadata, redactPII } from "../utils";

export function createListLogsEndpoint(opts: ResolvedOptions, modelName: string) {
  return createAuthEndpoint(
    "/audit-log/list",
    {
      method: "GET",
      use: [sessionMiddleware],
      query: z.object({
        userId: z.string().optional(),
        action: z.string().optional(),
        status: z.enum(["success", "failed"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).optional().default(50),
        offset: z.coerce.number().min(0).optional().default(0),
      }),
    },
    async (ctx) => {
      const session = ctx.context.session;
      const targetUserId = ctx.query.userId ?? session.user.id;

      if (targetUserId !== session.user.id) {
        throw new APIError("FORBIDDEN", {
          message: "Cannot query other users' audit logs",
        });
      }

      const fromDate = ctx.query.from ? new Date(ctx.query.from) : undefined;
      const toDate = ctx.query.to ? new Date(ctx.query.to) : undefined;

      try {
        if (opts.storage?.read) {
          const readOpts: StorageReadOptions = {
            userId: targetUserId,
            action: ctx.query.action,
            status: ctx.query.status,
            from: fromDate,
            to: toDate,
            limit: ctx.query.limit,
            offset: ctx.query.offset,
          };
          const result = await opts.storage.read(readOpts);

          if (result.entries.length > readOpts.limit) {
            result.entries = result.entries.slice(0, readOpts.limit);
          }

          if (opts.piiRedaction.enabled) {
            for (let i = 0; i < result.entries.length; i++) {
              result.entries[i] = {
                ...result.entries[i]!,
                metadata: await redactPII(result.entries[i]!.metadata, opts.piiRedaction),
              };
            }
          }

          return ctx.json(result);
        }

        const where: Where[] = [{ field: "userId", value: targetUserId }];

        if (ctx.query.action) {
          where.push({ field: "action", value: ctx.query.action });
        }
        if (ctx.query.status) {
          where.push({ field: "status", value: ctx.query.status });
        }
        if (fromDate) {
          where.push({ field: "createdAt", operator: "gte", value: fromDate });
        }
        if (toDate) {
          where.push({ field: "createdAt", operator: "lte", value: toDate });
        }

        const [entries, total] = await Promise.all([
          ctx.context.adapter.findMany<Record<string, unknown>>({
            model: modelName,
            where,
            sortBy: { field: "createdAt", direction: "desc" },
            limit: ctx.query.limit,
            offset: ctx.query.offset,
          }),
          ctx.context.adapter.count({ model: modelName, where }),
        ]);

        let parsed = entries.map((e) => ({
          ...e,
          metadata: parseMetadata(e["metadata"]),
        })) as AuditLogEntry[];

        if (opts.piiRedaction.enabled) {
          parsed = await Promise.all(
            parsed.map(async (e) => ({
              ...e,
              metadata: await redactPII(e.metadata, opts.piiRedaction),
            })),
          );
        }

        return ctx.json({ entries: parsed, total });
      } catch (err) {
        if (err instanceof APIError) throw err;
        ctx.context.logger?.error("[audit-log] list failed", err);
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: "Failed to retrieve audit logs",
        });
      }
    },
  );
}

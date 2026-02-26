import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { Where } from "better-auth";
import { z } from "zod";
import type { AuditLogEntry, ResolvedOptions, StorageReadOptions } from "../types";

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

      const parsed = entries.map((e) => ({
        ...(e as Omit<AuditLogEntry, "metadata">),
        metadata:
          typeof e["metadata"] === "string"
            ? (JSON.parse(e["metadata"]) as Record<string, unknown>)
            : ((e["metadata"] as Record<string, unknown>) ?? {}),
      }));

      return ctx.json({ entries: parsed, total });
    },
  );
}

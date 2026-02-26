import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { AuditLogEntry, ResolvedOptions } from "../types";

export function createGetLogEndpoint(opts: ResolvedOptions, modelName: string) {
  return createAuthEndpoint(
    "/audit-log/:id",
    { method: "GET", use: [sessionMiddleware] },
    async (ctx) => {
      const { id } = ctx.params as { id: string };
      const session = ctx.context.session;

      if (opts.storage?.readById) {
        const entry = await opts.storage.readById(id);
        if (!entry || entry.userId !== session.user.id) {
          throw new APIError("NOT_FOUND", {
            message: "Audit log entry not found",
          });
        }
        return ctx.json(entry);
      }

      const record = await ctx.context.adapter.findOne<Record<string, unknown>>({
        model: modelName,
        where: [
          { field: "id", value: id },
          { field: "userId", value: session.user.id },
        ],
      });

      if (!record) {
        throw new APIError("NOT_FOUND", {
          message: "Audit log entry not found",
        });
      }

      const entry: AuditLogEntry = {
        ...(record as Omit<AuditLogEntry, "metadata">),
        metadata:
          typeof record["metadata"] === "string"
            ? (JSON.parse(record["metadata"]) as Record<string, unknown>)
            : ((record["metadata"] as Record<string, unknown>) ?? {}),
      };

      return ctx.json(entry);
    },
  );
}

import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { AuditLogEntry, ResolvedOptions } from "../types";
import { parseMetadata } from "../utils";

export function createGetLogEndpoint(opts: ResolvedOptions, modelName: string) {
  return createAuthEndpoint(
    "/audit-log/:id",
    { method: "GET", use: [sessionMiddleware] },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>)?.id;
      if (!id) {
        throw new APIError("BAD_REQUEST", {
          message: "Missing audit log entry id",
        });
      }

      const session = ctx.context.session;

      try {
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
          ...record,
          metadata: parseMetadata(record["metadata"]),
        } as AuditLogEntry;

        return ctx.json(entry);
      } catch (err) {
        if (err instanceof APIError) throw err;
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: "Failed to retrieve audit log entry",
        });
      }
    },
  );
}

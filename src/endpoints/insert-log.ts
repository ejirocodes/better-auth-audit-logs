import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import { z } from "zod";
import type { ResolvedOptions } from "../types";
import { buildLogEntryFromAction, writeEntry } from "../internal";
import { validateMetadataSize } from "../utils/validate-metadata";

export function createInsertLogEndpoint(opts: ResolvedOptions, modelName: string) {
  return createAuthEndpoint(
    "/audit-log/insert",
    {
      method: "POST",
      use: [sessionMiddleware],
      body: z.object({
        action: z.string().min(1),
        status: z.enum(["success", "failed"]).optional().default("success"),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        metadata: z.record(z.string(), z.unknown()).optional().default({}),
      }),
    },
    async (ctx) => {
      const session = ctx.context.session;
      const { action, status, severity, metadata } = ctx.body;

      if (opts.metadataLimits !== false) {
        const error = validateMetadataSize(metadata, opts.metadataLimits);
        if (error) {
          throw new APIError("BAD_REQUEST", { message: error });
        }
      }

      try {
        const entry = await buildLogEntryFromAction(action, status, {
          userId: session.user.id,
          request: ctx.request,
          headers: ctx.headers,
          metadata,
          options: opts,
          authOptions: ctx.context.options,
        });

        if (severity) {
          entry.severity = severity;
        }

        await writeEntry(ctx, entry, opts, modelName);

        return ctx.json({ success: true });
      } catch (err) {
        if (err instanceof APIError) throw err;
        ctx.context.logger?.error("[audit-log] insert failed", err);
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message: "Failed to insert audit log entry",
        });
      }
    },
  );
}

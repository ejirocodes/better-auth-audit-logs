import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";
import type { AuditLogSeverity, AuditLogStatus, ResolvedOptions } from "../types";
import { buildLogEntryFromAction, writeEntry } from "../internal";

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

      const entry = await buildLogEntryFromAction(
        action,
        status as AuditLogStatus,
        {
          userId: session.user.id,
          request: ctx.request,
          headers: ctx.headers,
          metadata: metadata as Record<string, unknown>,
          options: opts,
          authOptions: ctx.context.options,
        },
      );

      if (severity) {
        entry.severity = severity as AuditLogSeverity;
      }

      await writeEntry(ctx, entry, opts, modelName);

      return ctx.json({ success: true });
    },
  );
}

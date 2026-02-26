import { createAuthMiddleware } from "better-auth/api";
import type { HookEndpointContext } from "@better-auth/core";
import type { AuditLogStatus, ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";
import { BEFORE_PATHS } from "./before";

export function createAfterHooks(opts: ResolvedOptions, modelName: string) {
  return [
    {
      matcher: (context: HookEndpointContext) =>
        !!context.path &&
        !BEFORE_PATHS.some((p) => context.path!.startsWith(p)) &&
        opts.shouldCapture(context.path!),

      handler: createAuthMiddleware(async (ctx) => {
        try {
          const path = ctx.path!;
          const isError = ctx.context.returned instanceof Error;
          const status: AuditLogStatus = isError ? "failed" : "success";

          const user =
            ctx.context.newSession?.user ?? ctx.context.session?.user;

          const pathConfig = opts.getPathConfig(path);

          const metadata: Record<string, unknown> = {};

          if (opts.capture.requestBody && ctx.body) {
            metadata.requestBody = ctx.body as Record<string, unknown>;
          }

          if (isError) {
            const err = ctx.context.returned as Error & {
              status?: number;
              code?: string;
            };
            metadata.error = {
              message: err.message,
              ...(err.status !== undefined && { status: err.status }),
              ...(err.code !== undefined && { code: err.code }),
            };
          }

          const entry = await buildLogEntry(path, status, {
            userId: user?.id ?? null,
            request: ctx.request,
            headers: ctx.headers,
            metadata,
            pathConfig,
            options: opts,
            authOptions: ctx.context.options,
          });

          await writeEntry(ctx, entry, opts, modelName);
        } catch (err) {
          ctx.context.logger?.error("[audit-log] after hook failed", err);
        }
      }),
    },
  ];
}

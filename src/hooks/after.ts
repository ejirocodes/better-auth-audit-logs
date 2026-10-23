import { createAuthMiddleware } from "better-auth/api";
import type { HookEndpointContext } from "better-auth";
import type { AuditLogStatus, ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";

// Explicitly allowlisted identifiers only; never copy credentials or tokens.
export const IDENTIFIER_BODY_FIELDS: Record<string, readonly string[]> = {
  "/sign-in/email": ["email"],
  "/sign-up/email": ["email", "name"],
  "/sign-in/social": ["provider"],
  "/sign-in/username": ["username"],
  "/forget-password": ["email"],
  "/send-verification-email": ["email"],
  "/change-email": ["newEmail"],
  "/request-password-reset": ["email"],
  "/two-factor/send-otp": ["email"],
};

export function createAfterHooks(opts: ResolvedOptions, modelName: string) {
  return [
    {
      matcher: (context: HookEndpointContext) =>
        !!context.path &&
        !opts.beforePaths.some((p) => context.path!.startsWith(p)) &&
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

          const captureIdentifiers = pathConfig?.capture?.identifiers ?? opts.capture.identifiers;
          if (captureIdentifiers && ctx.body && typeof ctx.body === "object") {
            const body = ctx.body as Record<string, unknown>;
            for (const field of IDENTIFIER_BODY_FIELDS[path] ?? []) {
              const value = body[field];
              if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                metadata[field] = value;
              }
            }
          }

          if ((pathConfig?.capture?.requestBody ?? opts.capture.requestBody) && ctx.body) {
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

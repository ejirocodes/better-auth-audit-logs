import { createAuthMiddleware } from "better-auth/api";
import type { HookEndpointContext } from "better-auth";
import type { AuditLogStatus, ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";

type VerifyReturned = {
  valid?: boolean;
  key?: { id?: string; userId?: string; name?: string; prefix?: string } | null;
  error?: { code?: string; message?: string } | null;
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
          const returned = ctx.context.returned;
          const statusCode = returned instanceof Response
            ? returned.status
            : (returned as { statusCode?: number } | undefined)?.statusCode;
          const isRedirect = statusCode !== undefined && statusCode >= 300 && statusCode < 400;
          const location = isRedirect
            ? new Headers((returned as { headers?: ConstructorParameters<typeof Headers>[0] }).headers).get("location")
            : null;
          const redirectError = location
            ? new URL(location, "http://localhost").searchParams.get("error")
            : null;
          const isError = returned instanceof Error && !isRedirect;
          let status: AuditLogStatus = isError || redirectError !== null ? "failed" : "success";

          const user =
            ctx.context.newSession?.user ?? ctx.context.session?.user;
          let userId = user?.id ?? null;

          const pathConfig = opts.getPathConfig(path);

          const metadata: Record<string, unknown> = {};

          // API key request bodies can contain plaintext keys, even on CRUD paths.
          if ((pathConfig?.capture?.requestBody ?? opts.capture.requestBody) && !path.startsWith("/api-key/") && ctx.body) {
            metadata.requestBody = ctx.body as Record<string, unknown>;
          }

          if (redirectError !== null) {
            metadata.error = { code: redirectError };
          } else if (isError) {
            const err = ctx.context.returned as Error & {
              status?: string;
              code?: string;
            };
            metadata.error = {
              message: err.message,
              ...(err.status !== undefined && { status: err.status }),
              ...(err.code !== undefined && { code: err.code }),
            };
          }

          if (path === "/api-key/verify" && status === "success" && returned) {
            const verification = returned as VerifyReturned;
            if (verification.valid === false) {
              status = "failed";
              if (verification.error) {
                metadata.error = {
                  ...(verification.error.code !== undefined && { code: verification.error.code }),
                  ...(verification.error.message !== undefined && { message: verification.error.message }),
                };
              }
            }
            userId ??= verification.key?.userId ?? null;
            if (verification.key) {
              const key = verification.key;
              if (key.id !== undefined) metadata.keyId = key.id;
              if (key.name !== undefined) metadata.keyName = key.name;
              if (key.prefix !== undefined) metadata.keyPrefix = key.prefix;
            }
          }

          const entry = await buildLogEntry(path, status, {
            userId,
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

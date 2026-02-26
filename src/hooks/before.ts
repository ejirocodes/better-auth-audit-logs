import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { HookEndpointContext } from "@better-auth/core";
import type { ResolvedOptions } from "../types";
import { buildLogEntry, writeEntry } from "../internal";

export const BEFORE_PATHS = [
  "/sign-out",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
] as const;

export function createBeforeHooks(opts: ResolvedOptions, modelName: string) {
  return [
    {
      matcher: (context: HookEndpointContext) =>
        !!context.path &&
        BEFORE_PATHS.some((p) => context.path!.startsWith(p)) &&
        opts.shouldCapture(context.path!),

      handler: createAuthMiddleware(async (ctx) => {
        try {
          const session = await getSessionFromCtx(ctx);
          const path = ctx.path!;
          const pathConfig = opts.getPathConfig(path);

          const entry = await buildLogEntry(path, "success", {
            userId: session?.user?.id ?? null,
            request: ctx.request,
            headers: ctx.headers,
            pathConfig,
            options: opts,
            authOptions: ctx.context.options,
          });

          await writeEntry(ctx, entry, opts, modelName);
        } catch (err) {
          ctx.context.logger?.error("[audit-log] before hook failed", err);
        }
      }),
    },
  ];
}

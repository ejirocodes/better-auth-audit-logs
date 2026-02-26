import type { BetterAuthPlugin } from "better-auth";
import { buildSchema, getModelName } from "./schema";
import { createBeforeHooks, createAfterHooks } from "./hooks";
import {
  createListLogsEndpoint,
  createGetLogEndpoint,
  createInsertLogEndpoint,
} from "./endpoints";
import type {
  AuditLogOptions,
  PathConfig,
  ResolvedOptions,
} from "./types";

function resolveOptions(options?: AuditLogOptions): ResolvedOptions {
  const pathsMap = new Map<string, PathConfig | undefined>();
  const hasPaths = (options?.paths?.length ?? 0) > 0;

  for (const p of options?.paths ?? []) {
    if (typeof p === "string") {
      pathsMap.set(p, undefined);
    } else {
      pathsMap.set(p.path, p.config);
    }
  }

  return {
    enabled: options?.enabled ?? true,
    nonBlocking: options?.nonBlocking ?? false,
    storage: options?.storage,
    capture: {
      ipAddress: options?.capture?.ipAddress ?? true,
      userAgent: options?.capture?.userAgent ?? true,
      requestBody: options?.capture?.requestBody ?? false,
    },
    piiRedaction: {
      enabled: options?.piiRedaction?.enabled ?? false,
      fields: options?.piiRedaction?.fields,
      strategy: options?.piiRedaction?.strategy ?? "mask",
    },
    retention: options?.retention,
    beforeLog: options?.beforeLog,
    afterLog: options?.afterLog,
    shouldCapture: (path: string) => !hasPaths || pathsMap.has(path),
    getPathConfig: (path: string) => pathsMap.get(path),
  };
}

export function auditLog(options?: AuditLogOptions) {
  const schema = buildSchema(options);
  const modelName = getModelName(options);
  const resolved = resolveOptions(options);

  const beforeHooks = resolved.enabled ? createBeforeHooks(resolved, modelName) : [];
  const afterHooks = resolved.enabled ? createAfterHooks(resolved, modelName) : [];

  return {
    id: "audit-log",
    schema,
    hooks: {
      before: beforeHooks,
      after: afterHooks,
    },
    endpoints: {
      listAuditLogs: createListLogsEndpoint(resolved, modelName),
      getAuditLog: createGetLogEndpoint(resolved, modelName),
      insertAuditLog: createInsertLogEndpoint(resolved, modelName),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path.startsWith("/audit-log/"),
        window: 60,
        max: 60,
      },
    ],
  } satisfies BetterAuthPlugin;
}

import type { BetterAuthPlugin } from "better-auth";
import { buildSchema, getModelName, validateSchema } from "./schema";
import { createRetentionSweep, DEFAULT_RETENTION_INTERVAL_MS } from "./retention";
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
import { DEFAULT_METADATA_LIMITS } from "./utils/validate-metadata";

const DEFAULT_BEFORE_PATHS = [
  "/sign-out",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
] as const;

function validateStorageAdapter(storage: AuditLogOptions["storage"]): void {
  if (!storage) return;

  if (typeof storage.write !== "function") {
    throw new Error(
      "[audit-log] Custom storage adapter must implement write(entry): Promise<void>",
    );
  }

  if (storage.read !== undefined && typeof storage.read !== "function") {
    throw new Error(
      "[audit-log] storage.read must be a function if provided",
    );
  }

  if (storage.readById !== undefined && typeof storage.readById !== "function") {
    throw new Error(
      "[audit-log] storage.readById must be a function if provided",
    );
  }

  if (storage.deleteOlderThan !== undefined && typeof storage.deleteOlderThan !== "function") {
    throw new Error(
      "[audit-log] storage.deleteOlderThan must be a function if provided",
    );
  }
}

function validateRetention(options?: AuditLogOptions): void {
  const retention = options?.retention;
  if (!retention?.enabled) return;

  if (!Number.isFinite(retention.days) || retention.days < 1) {
    throw new Error(
      "[audit-log] retention.days must be a finite number of at least 1",
    );
  }

  if (
    retention.intervalMs !== undefined &&
    (!Number.isFinite(retention.intervalMs) || retention.intervalMs < 0)
  ) {
    throw new Error(
      "[audit-log] retention.intervalMs must be a non-negative finite number",
    );
  }

  if (options?.storage && !options.storage.deleteOlderThan) {
    throw new Error(
      "[audit-log] retention requires storage.deleteOlderThan — implement it on your storage adapter or disable retention",
    );
  }
}

export function resolveOptions(options?: AuditLogOptions): ResolvedOptions {
  const enabled = options?.enabled ?? true;
  const pathsMap = new Map<string, PathConfig | undefined>();
  const hasPaths = (options?.paths?.length ?? 0) > 0;

  for (const p of options?.paths ?? []) {
    if (typeof p === "string") {
      pathsMap.set(p, undefined);
    } else {
      pathsMap.set(p.path, p.config);
    }
  }

  // Resolve metadata limits: false = disabled, undefined = defaults, object = merge with defaults
  const metadataLimits =
    options?.metadataLimits === false
      ? false
      : {
          maxBytes: options?.metadataLimits?.maxBytes ?? DEFAULT_METADATA_LIMITS.maxBytes,
          maxDepth: options?.metadataLimits?.maxDepth ?? DEFAULT_METADATA_LIMITS.maxDepth,
        };

  return {
    enabled,
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
    sweepRetention:
      enabled && options?.retention?.enabled
        ? createRetentionSweep({
            days: options.retention.days,
            intervalMs:
              options.retention.intervalMs ?? DEFAULT_RETENTION_INTERVAL_MS,
            storage: options.storage,
            modelName: getModelName(options),
          })
        : undefined,
    metadataLimits,
    beforePaths: options?.beforePaths ?? DEFAULT_BEFORE_PATHS,
    beforeLog: options?.beforeLog,
    afterLog: options?.afterLog,
    onWriteError: options?.onWriteError,
    shouldCapture: (path: string) => !hasPaths || pathsMap.has(path),
    getPathConfig: (path: string) => pathsMap.get(path),
  };
}

export function auditLog(options?: AuditLogOptions) {
  validateStorageAdapter(options?.storage);
  validateRetention(options);

  const schema = buildSchema(options);
  validateSchema(schema);

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

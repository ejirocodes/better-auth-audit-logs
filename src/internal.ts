import type { GenericEndpointContext } from "@better-auth/core";
import type {
  AuditLogEntry,
  AuditLogStatus,
  PathConfig,
  ResolvedOptions,
} from "./types";
import {
  normalizePath,
  inferSeverity,
  extractRequestMeta,
  redactPII,
  validateEntry,
  withRetry,
} from "./utils";

interface BuildParams {
  userId: string | null;
  request: Request | undefined;
  headers: Headers | undefined;
  metadata?: Record<string, unknown>;
  pathConfig?: PathConfig;
  options: ResolvedOptions;
  authOptions: GenericEndpointContext["context"]["options"];
}

export async function buildLogEntry(
  path: string,
  status: AuditLogStatus,
  params: BuildParams,
): Promise<Omit<AuditLogEntry, "id">> {
  const action = normalizePath(path);
  const severity =
    params.pathConfig?.severity ?? inferSeverity(action, status);

  const captureOpts = {
    ...params.options.capture,
    ...params.pathConfig?.capture,
  };

  const { ipAddress, userAgent } = extractRequestMeta(
    captureOpts.ipAddress !== false ? params.request : undefined,
    captureOpts.userAgent !== false ? params.headers : undefined,
    params.authOptions,
  );

  let metadata = params.metadata ?? {};
  if (params.options.piiRedaction.enabled) {
    metadata = await redactPII(metadata, params.options.piiRedaction);
  }

  return {
    userId: params.userId,
    action,
    status,
    severity,
    ipAddress,
    userAgent,
    metadata,
    createdAt: new Date(),
  };
}

export async function buildLogEntryFromAction(
  action: string,
  status: AuditLogStatus,
  params: Omit<BuildParams, "pathConfig">,
): Promise<Omit<AuditLogEntry, "id">> {
  const severity = inferSeverity(action, status);

  const { ipAddress, userAgent } = extractRequestMeta(
    params.options.capture.ipAddress !== false ? params.request : undefined,
    params.options.capture.userAgent !== false ? params.headers : undefined,
    params.authOptions,
  );

  let metadata = params.metadata ?? {};
  if (params.options.piiRedaction.enabled) {
    metadata = await redactPII(metadata, params.options.piiRedaction);
  }

  return {
    userId: params.userId,
    action,
    status,
    severity,
    ipAddress,
    userAgent,
    metadata,
    createdAt: new Date(),
  };
}

export async function writeEntry(
  ctx: GenericEndpointContext,
  entry: Omit<AuditLogEntry, "id">,
  opts: ResolvedOptions,
  modelName: string,
): Promise<void> {
  const doFullWrite = async () => {
    let finalEntry = entry;

    if (opts.beforeLog) {
      const modified = await opts.beforeLog(finalEntry);
      if (modified === null) return;

      const validated = validateEntry(modified, ctx.context.logger);
      if (validated === null) return;
      finalEntry = validated;
    }

    let written: AuditLogEntry;
    try {
      written = await withRetry(async () => {
        if (opts.storage) {
          const result: AuditLogEntry = { id: crypto.randomUUID(), ...finalEntry };
          await opts.storage!.write(result);
          return result;
        }

        const record = await ctx.context.adapter.create<
          Record<string, unknown>
        >({
          model: modelName,
          data: {
            ...finalEntry,
            metadata: JSON.stringify(finalEntry.metadata),
          },
        });
        return {
          ...(record as Omit<AuditLogEntry, "metadata">),
          metadata: finalEntry.metadata,
        } as AuditLogEntry;
      }, { maxRetries: 2, baseDelayMs: 100 });
    } catch (err) {
      ctx.context.logger?.error("[audit-log] storage write failed after retries", err);
      opts.onWriteError?.(err, finalEntry);
      throw err;
    }

    if (opts.afterLog) await opts.afterLog(written);
  };

  if (opts.nonBlocking) {
    ctx.context.runInBackground(
      doFullWrite().catch((err) => {
        ctx.context.logger?.error("[audit-log] background write failed", err);
        opts.onWriteError?.(err, entry);
      }),
    );
  } else {
    await doFullWrite();
  }
}

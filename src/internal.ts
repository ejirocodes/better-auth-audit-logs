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
  let finalEntry = entry;

  if (opts.beforeLog) {
    const modified = await opts.beforeLog(finalEntry);
    if (modified === null) return;
    finalEntry = modified;
  }

  const doWrite = async () => {
    let written: AuditLogEntry;

    if (opts.storage) {
      written = { id: crypto.randomUUID(), ...finalEntry };
      await opts.storage.write(written);
    } else {
      const record = await ctx.context.adapter.create<Record<string, unknown>>({
        model: modelName,
        data: {
          ...finalEntry,
          metadata: JSON.stringify(finalEntry.metadata),
        },
      });
      // Reconstruct with parsed metadata — the DB stores it as a JSON string
      written = { ...(record as Omit<AuditLogEntry, "metadata">), metadata: finalEntry.metadata };
    }

    if (opts.afterLog) await opts.afterLog(written);
  };

  if (opts.nonBlocking) {
    ctx.context.runInBackground(
      doWrite().catch((err) =>
        ctx.context.logger?.error("[audit-log] write failed", err),
      ),
    );
  } else {
    await doWrite();
  }
}

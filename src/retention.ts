import type { GenericEndpointContext, Where } from "better-auth";
import type { AuditLogStorage } from "./types";
import { DEFAULT_MODEL_NAME } from "./schema";

const MS_PER_DAY = 86_400_000;

export const DEFAULT_RETENTION_INTERVAL_MS = MS_PER_DAY;

export interface AuditLogRetentionContext {
  adapter: {
    deleteMany: (data: { model: string; where: Where[] }) => Promise<number>;
  };
}

export interface DeleteExpiredAuditLogsOptions {
  days: number;
  storage?: AuditLogStorage;
  modelName?: string;
}

export function retentionCutoff(days: number, now: number = Date.now()): Date {
  if (!Number.isFinite(days) || days < 1) {
    throw new Error(
      "[audit-log] retention days must be a finite number of at least 1",
    );
  }
  return new Date(now - days * MS_PER_DAY);
}

/**
 * Deletes every audit log entry older than `days`. Safe to call from a cron job,
 * a queue worker, or any other scheduler the application already runs.
 */
export async function deleteExpiredAuditLogs(
  context: AuditLogRetentionContext,
  options: DeleteExpiredAuditLogsOptions,
): Promise<number> {
  const cutoff = retentionCutoff(options.days);

  if (options.storage) {
    if (!options.storage.deleteOlderThan) {
      throw new Error(
        "[audit-log] custom storage must implement deleteOlderThan(date) to support retention cleanup",
      );
    }
    return options.storage.deleteOlderThan(cutoff);
  }

  return context.adapter.deleteMany({
    model: options.modelName ?? DEFAULT_MODEL_NAME,
    where: [{ field: "createdAt", operator: "lt", value: cutoff }],
  });
}

export type RetentionSweep = (ctx: GenericEndpointContext) => void;

export interface RetentionSweepOptions extends DeleteExpiredAuditLogsOptions {
  intervalMs: number;
}

/**
 * Builds a fire-and-forget sweep that runs at most once per `intervalMs` per
 * process. Cleanup rides on audit log traffic because the plugin owns no
 * scheduler: a timer would hold a long-running process open and would never
 * fire reliably in a serverless runtime.
 */
export function createRetentionSweep(
  options: RetentionSweepOptions,
): RetentionSweep {
  let nextRunAt = 0;
  let running = false;

  return (ctx) => {
    const now = Date.now();
    if (running || now < nextRunAt) return;

    const logFailure = (err: unknown) =>
      ctx.context.logger?.error("[audit-log] retention cleanup failed", err);

    running = true;
    nextRunAt = now + options.intervalMs;

    try {
      const sweep = deleteExpiredAuditLogs(ctx.context, options)
        .catch(logFailure)
        .finally(() => {
          running = false;
        });

      ctx.context.runInBackground(sweep);
    } catch (err) {
      logFailure(err);
    }
  };
}

import { z } from "zod";
import type { AuditLogEntry } from "../types";

/**
 * Runtime schema for validating audit log entries returned by beforeLog hooks.
 * Ensures required fields are present before writing to storage.
 */
const auditLogEntrySchema = z.object({
  userId: z.string().nullable(),
  action: z.string().min(1),
  status: z.enum(["success", "failed"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});

/**
 * Validate that a beforeLog return value has all required fields.
 * Returns the validated entry or null if validation fails.
 */
export function validateEntry(
  entry: unknown,
  logger?: { warn: (message: string, ...args: unknown[]) => void },
): Omit<AuditLogEntry, "id"> | null {
  const result = auditLogEntrySchema.safeParse(entry);
  if (!result.success) {
    logger?.warn(
      "[audit-log] beforeLog returned invalid entry, skipping write:",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
    return null;
  }
  return result.data;
}

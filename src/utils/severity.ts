import type { AuditLogSeverity, AuditLogStatus } from "../types";

const SEVERITY_MAP = new Map<string, AuditLogSeverity>([
  ["ban-user", "critical"],
  ["impersonate-user", "critical"],
  ["delete-user", "high"],
  ["delete-account", "high"],
  ["revoke-sessions", "high"],
  ["revoke-other-sessions", "high"],
  ["sign-in", "medium"],
  ["sign-out", "medium"],
  ["revoke-session", "medium"],
  ["two-factor", "medium"],
  ["change-password", "medium"],
  ["reset-password", "medium"],
]);

export function inferSeverity(
  action: string,
  status: AuditLogStatus,
): AuditLogSeverity {
  for (const [pattern, severity] of SEVERITY_MAP) {
    if (action.includes(pattern)) {
      if (severity === "medium" && status === "failed") return "high";
      return severity;
    }
  }
  return "low";
}

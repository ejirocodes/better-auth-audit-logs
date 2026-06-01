import type { AuditLogSeverity, AuditLogStatus } from "../types";

type SeverityRule =
  | AuditLogSeverity
  | { success: AuditLogSeverity; failed: AuditLogSeverity };

const SEVERITY_MAP = new Map<string, SeverityRule>([
  ["ban-user", "critical"],
  ["impersonate-user", "critical"],
  ["delete-user", "high"],
  ["delete-account", "high"],
  ["revoke-sessions", "high"],
  ["revoke-other-sessions", "high"],
  ["sign-in", { success: "medium", failed: "high" }],
  ["sign-out", { success: "medium", failed: "high" }],
  ["revoke-session", { success: "medium", failed: "high" }],
  ["two-factor", { success: "medium", failed: "high" }],
  ["change-password", { success: "medium", failed: "high" }],
  ["reset-password", { success: "medium", failed: "high" }],
  // Successful api-key verifies fire on every authed API request, so the base
  // stays low; failed lookups are a strong security signal worth elevating.
  ["api-key:verify", { success: "low", failed: "high" }],
]);

export function inferSeverity(
  action: string,
  status: AuditLogStatus,
): AuditLogSeverity {
  for (const [pattern, rule] of SEVERITY_MAP) {
    if (action.includes(pattern)) {
      return typeof rule === "string" ? rule : rule[status];
    }
  }
  return "low";
}

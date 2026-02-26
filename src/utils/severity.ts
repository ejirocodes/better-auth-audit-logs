import type { AuditLogSeverity, AuditLogStatus } from "../types";

const CRITICAL = ["ban-user", "impersonate-user"];
const HIGH = [
  "delete-user",
  "delete-account",
  "revoke-sessions",
  "revoke-other-sessions",
];
const MEDIUM = [
  "sign-in",
  "sign-out",
  "revoke-session",
  "two-factor",
  "change-password",
  "reset-password",
];

export function inferSeverity(
  action: string,
  status: AuditLogStatus,
): AuditLogSeverity {
  if (CRITICAL.some((p) => action.includes(p))) return "critical";
  if (HIGH.some((p) => action.includes(p))) return "high";
  if (MEDIUM.some((p) => action.includes(p)))
    return status === "failed" ? "high" : "medium";
  return "low";
}

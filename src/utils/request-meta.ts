import { getIp } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";

export function extractRequestMeta(
  request: Request | undefined,
  headers: Headers | undefined,
  options: BetterAuthOptions,
): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: request ? (getIp(request, options) ?? null) : null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

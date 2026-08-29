import * as betterAuthApi from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";

type IpResolver = (
  source: Request | Headers,
  options: BetterAuthOptions,
) => string | null;

const { getIP, getIp } = betterAuthApi as typeof betterAuthApi & {
  getIP?: IpResolver;
  getIp?: IpResolver;
};

const resolveIp = getIP ?? getIp;

export function extractRequestMeta(
  ipSource: Request | Headers | undefined,
  headers: Headers | undefined,
  options: BetterAuthOptions,
): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: ipSource ? (resolveIp(ipSource, options) ?? null) : null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

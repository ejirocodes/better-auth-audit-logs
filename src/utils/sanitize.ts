import type { PIIRedactionOptions } from "../types";

export const DEFAULT_PII_FIELDS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "secret",
  "apiKey",
  "refreshToken",
  "accessToken",
  "code",
  "backupCode",
  "otp",
];

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function redactPII(
  data: Record<string, unknown>,
  config: PIIRedactionOptions,
): Promise<Record<string, unknown>> {
  if (!config.enabled) return data;

  const strategy = config.strategy ?? "mask";
  const result: Record<string, unknown> = { ...data };

  // Step 1: allowlist — drop any key not in `includeFields` entirely.
  if (config.includeFields) {
    const keep = new Set(config.includeFields);
    for (const key of Object.keys(result)) {
      if (!keep.has(key)) delete result[key];
    }
  }

  // Step 2: denylist — apply the strategy to matching keys among the survivors.
  const fields = config.fields ?? DEFAULT_PII_FIELDS;
  for (const field of fields) {
    if (!(field in result) || result[field] == null) continue;

    if (strategy === "remove") {
      delete result[field];
    } else if (strategy === "hash") {
      result[field] = await sha256(String(result[field]));
    } else {
      result[field] = "[REDACTED]";
    }
  }

  return result;
}

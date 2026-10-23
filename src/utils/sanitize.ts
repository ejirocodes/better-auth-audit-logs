import type { PIIRedactionOptions } from "../types";
import { toHex } from "./hex";

// Traversal safety cap, independent of metadata validation limits.
const MAX_REDACTION_DEPTH = 32;

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
  return toHex(await crypto.subtle.digest("SHA-256", encoded));
}

export async function redactPII(
  data: Record<string, unknown>,
  config: PIIRedactionOptions,
): Promise<Record<string, unknown>> {
  if (!config.enabled) return data;

  const fields = config.fields ?? DEFAULT_PII_FIELDS;
  const strategy = config.strategy ?? "mask";
  const fieldSet = new Set(fields);
  const ancestors = new WeakSet<object>();

  async function redactNode(node: unknown, depth: number): Promise<unknown> {
    if (node === null || typeof node !== "object" || node instanceof Date) return node;
    // Do not return unredacted references when traversal stops.
    if (depth > MAX_REDACTION_DEPTH) return "[MaxDepth]";
    if (ancestors.has(node)) return "[Circular]";
    ancestors.add(node);

    try {
      if (Array.isArray(node)) {
        const result: unknown[] = [];
        for (const value of node) {
          result.push(await redactNode(value, depth + 1));
        }
        return result;
      }

      const result: Record<string, unknown> = { ...node };
      for (const [key, value] of Object.entries(result)) {
        if (fieldSet.has(key) && value != null) {
          if (strategy === "remove") delete result[key];
          else if (strategy === "hash") result[key] = await sha256(String(value));
          else result[key] = "[REDACTED]";
        } else if (depth !== 0 || key !== "error") {
          // Preserve the plugin-generated diagnostic subtree, including error.code.
          result[key] = await redactNode(value, depth + 1);
        }
      }
      return result;
    } finally {
      // Shared objects are redacted on every branch, not mistaken for cycles.
      ancestors.delete(node);
    }
  }

  return await redactNode(data, 0) as Record<string, unknown>;
}

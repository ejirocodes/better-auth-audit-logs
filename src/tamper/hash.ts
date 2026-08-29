import type { AuditLogEntry } from "../types";
import { toHex } from "../utils/hex";

/**
 * Domain separator so the chain key cannot be used to forge anything else
 * Better Auth signs with the same root secret (sessions, cookies, tokens).
 */
const KEY_INFO = "better-auth-audit-log:hash-chain:v1";

export type HashableEntry = Omit<AuditLogEntry, "id" | "hash" | "previousHash">;

const chainKeys = new Map<string, Promise<CryptoKey>>();

const encoder = new TextEncoder();

function importHmacKey(material: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function deriveChainKey(secret: string): Promise<CryptoKey> {
  const root = await importHmacKey(encoder.encode(secret));
  return importHmacKey(
    await crypto.subtle.sign("HMAC", root, encoder.encode(KEY_INFO)),
  );
}

function getChainKey(secret: string): Promise<CryptoKey> {
  let key = chainKeys.get(secret);
  if (!key) {
    key = deriveChainKey(secret);
    chainKeys.set(secret, key);
  }
  return key;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Serializes metadata so that an object and its JSON round-trip hash
 * identically — the write path hashes a live object, verification hashes what
 * came back out of the database.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(JSON.parse(JSON.stringify(value ?? null))));
}

export async function computeEntryHash(
  entry: HashableEntry,
  previousHash: string | null,
  secret: string,
): Promise<string> {
  if (!secret) {
    throw new Error(
      "[audit-log] tamper detection requires a secret — set tamperDetection.secret or Better Auth's secret",
    );
  }

  const payload = JSON.stringify([
    previousHash,
    entry.userId,
    entry.action,
    entry.status,
    entry.severity,
    entry.ipAddress,
    entry.userAgent,
    new Date(entry.createdAt).toISOString(),
    canonicalJson(entry.metadata),
  ]);

  const signature = await crypto.subtle.sign(
    "HMAC",
    await getChainKey(secret),
    encoder.encode(payload),
  );

  return toHex(signature);
}

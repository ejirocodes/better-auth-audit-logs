/**
 * Safely parse metadata from a database record.
 *
 * The schema stores metadata as a JSON string, but the application type is
 * Record<string, unknown>. This function centralizes the conversion and
 * handles corrupt/malformed data gracefully.
 */
export function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  return {};
}

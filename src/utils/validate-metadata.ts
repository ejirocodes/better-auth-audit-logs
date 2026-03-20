/**
 * Validate metadata size constraints to prevent abuse.
 * Returns an error message if validation fails, null if valid.
 */
export interface MetadataLimits {
  maxBytes: number;
  maxDepth: number;
}

export const DEFAULT_METADATA_LIMITS: MetadataLimits = {
  maxBytes: 64 * 1024, // 64KB
  maxDepth: 5,
};

function measureDepth(value: unknown, current: number = 0): number {
  if (current > 100) return current; // safety cap
  if (typeof value !== "object" || value === null) return current;

  if (Array.isArray(value)) {
    let max = current;
    for (const item of value) {
      max = Math.max(max, measureDepth(item, current + 1));
    }
    return max;
  }

  let max = current;
  for (const v of Object.values(value)) {
    max = Math.max(max, measureDepth(v, current + 1));
  }
  return max;
}

export function validateMetadataSize(
  metadata: Record<string, unknown>,
  limits: MetadataLimits = DEFAULT_METADATA_LIMITS,
): string | null {
  const depth = measureDepth(metadata);
  if (depth > limits.maxDepth) {
    return `Metadata exceeds maximum depth of ${limits.maxDepth}`;
  }

  const bytes = new TextEncoder().encode(JSON.stringify(metadata)).byteLength;
  if (bytes > limits.maxBytes) {
    return `Metadata exceeds maximum size of ${limits.maxBytes} bytes`;
  }

  return null;
}

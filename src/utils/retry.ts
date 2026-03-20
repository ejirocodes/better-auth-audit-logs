/**
 * Retry an async operation with exponential backoff.
 * Throws the last error if all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; baseDelayMs: number },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxRetries) {
        const delay = opts.baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

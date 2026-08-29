export type RunExclusive = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

/**
 * Serializes work per key so a chain's read-head-then-write never interleaves
 * with itself. Scoped to one process — see the README on multi-instance forks.
 */
export function createKeyedMutex(): RunExclusive {
  const tails = new Map<string, Promise<unknown>>();

  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const current = previous.then(fn, fn);
    const settled = current.catch(() => {});
    tails.set(key, settled);

    try {
      return await current;
    } finally {
      if (tails.get(key) === settled) tails.delete(key);
    }
  };
}

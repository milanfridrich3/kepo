/** Resolves after `ms`. */
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Runs `work` and makes sure the caller waits at least `floorMs` in total.
 * Used by endpoints that must not reveal, through response time, which branch
 * ran (e.g. "this address has an account" vs "it does not").
 */
export async function withMinDuration<T>(floorMs: number, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const remaining = floorMs - (Date.now() - started);
    if (remaining > 0) await sleep(remaining);
  }
}

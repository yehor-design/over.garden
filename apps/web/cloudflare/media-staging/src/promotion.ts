/** Concurrent public-object promotions per claim (OVE-372). */
export const PROMOTION_CONCURRENCY = 4;

/** Runs `work` over `items` with at most `limit` in flight; the first failure wins. */
export async function promoteWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        await work(item);
      }
    },
  );
  await Promise.all(lanes);
}

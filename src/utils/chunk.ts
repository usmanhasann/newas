/**
 * Split a list into batches of `size`. Used for `in (...)` lookups by id: one request per batch
 * keeps every request's URL well under server limits, however many ids there are.
 */
export function chunk<T>(items: readonly T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

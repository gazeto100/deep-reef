/** Deterministic UUID-shaped ids for tests: 00000000-0000-4000-8000-000000000001, ... */
export function sequentialIds(prefix = 0): () => string {
  let n = 0;
  return () => {
    n++;
    const hex = (prefix * 1_000_000 + n).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  };
}

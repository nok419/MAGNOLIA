export function toRecord<T extends Record<string, unknown>, K extends keyof T>(
  rows: T[],
  key: K,
): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [String(row[key]), row]))
}

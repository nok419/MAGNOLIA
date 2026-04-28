export type VisualSeedInput = number | string

export function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function seedKey(...parts: Array<string | number | undefined | null>): string {
  return parts.filter((part) => part !== undefined && part !== null).join(":")
}

export function seededUnit(seed: VisualSeedInput): number {
  const n = typeof seed === "number" ? seed : hashString(seed)
  const mixed = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return mixed - Math.floor(mixed)
}

export function seededRange(seed: VisualSeedInput, min: number, max: number): number {
  return min + (max - min) * seededUnit(seed)
}

export function seededChoice<T>(seed: VisualSeedInput, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error("seededChoice requires at least one value")
  }
  return values[Math.floor(seededUnit(seed) * values.length) % values.length] as T
}

export function timeBucket(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / Math.max(1, bucketMs))
}

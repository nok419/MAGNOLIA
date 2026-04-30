export const PHI = 1.618033988749895
export const PHI_INV = 1 / PHI
export const TAU = Math.PI * 2

export function lerpScalar(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

export function clampScalar(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return clampScalar(value, 0, 1)
}

export function easeOutCubic(value: number): number {
  // renderer 間で同じ easing を使うため、入力の丸めもここで統一します。
  const clamped = clamp01(value)
  return 1 - (1 - clamped) ** 3
}

export function easeInOutCubic(value: number): number {
  const clamped = clamp01(value)
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (-2 * clamped + 2) ** 3 / 2
}

export function easeInOutSine(value: number): number {
  const clamped = clamp01(value)
  return -(Math.cos(Math.PI * clamped) - 1) / 2
}

export function seededUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

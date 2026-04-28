export const PHI = 1.618033988749895
export const PHI_INV = 1 / PHI

export function normalizeCanvasVector(x: number, y: number) {
  const length = Math.hypot(x, y)
  if (length <= 0.0001) {
    return { x: 0, y: -1 }
  }
  return { x: x / length, y: y / length }
}

export function easeOutCubic(value: number): number {
  const clamped = clamp01(value)
  return 1 - (1 - clamped) ** 3
}

export function easeInOutCubic(value: number): number {
  const clamped = clamp01(value)
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (-2 * clamped + 2) ** 3 / 2
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

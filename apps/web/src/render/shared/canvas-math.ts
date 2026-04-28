export function lerpPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  amount: number,
) {
  return {
    x: lerpScalar(from.x, to.x, amount),
    y: lerpScalar(from.y, to.y, amount),
  }
}

export function lerpScalar(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

export function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

export function seededUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

export function seededRandom(seed: number): number {
  return seededUnit(seed)
}

export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function easeInOutSine(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return -(Math.cos(Math.PI * clamped) - 1) / 2
}

export function easeOutCubic(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return 1 - (1 - clamped) ** 3
}

export function easeOutCubicFinite(value: number): number {
  const clamped = clamp01(value)
  return 1 - (1 - clamped) ** 3
}

export function easeInOutCubic(value: number): number {
  const clamped = clamp01(value)
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (-2 * clamped + 2) ** 3 / 2
}

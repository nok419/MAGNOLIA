export const PHI = 1.618033988749895
export const PHI_INV = 1 / PHI
export const TAU = Math.PI * 2

export function normalizeCanvasVector(x: number, y: number) {
  const length = Math.hypot(x, y)
  if (length <= 0.0001) {
    return { x: 0, y: -1 }
  }
  return { x: x / length, y: y / length }
}

/* ============================================================
   HAZARD — 磁気干渉ノイズゾーン
   グリッチ・色収差・不規則乱流・ストロボを重ねた不安定な表現。
   ============================================================ */

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

export function alphaColor(color: string, alpha: number): string {
  const clampedAlpha = clamp01(alpha)
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const expanded =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color
    const red = Number.parseInt(expanded.slice(1, 3), 16)
    const green = Number.parseInt(expanded.slice(3, 5), 16)
    const blue = Number.parseInt(expanded.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha.toFixed(3)})`
  }

  const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch) {
    const [red, green, blue] = rgbMatch[1].split(",").map((part) => Number.parseFloat(part.trim()))
    if ([red, green, blue].every(Number.isFinite)) {
      return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha.toFixed(3)})`
    }
  }

  return color
}

/* ============================================================
   UTILITIES
   ============================================================ */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

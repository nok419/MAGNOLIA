export const BATTLE_CANVAS_WIDTH = 480
export const BATTLE_CANVAS_HEIGHT = 520
export const PHI = 1.618033988749895
export const PHI_INV = 1 / PHI
export const TAU = Math.PI * 2

export type BattleRendererCategory = "enemy" | "projectile" | "hazard" | "background"

export function resolveBattleRenderer<T>(
  registry: Record<string, T>,
  rendererKind: string,
  diagnostic: { presetId?: string; category: BattleRendererCategory },
): T {
  const renderer = registry[rendererKind]
  if (renderer) {
    return renderer
  }
  warnUnknownRendererKind(rendererKind, diagnostic)
  return registry.default
}

const warnedRendererKinds = new Set<string>()

function warnUnknownRendererKind(
  rendererKind: string,
  diagnostic: { presetId?: string; category: BattleRendererCategory },
): void {
  // unknown rendererKind を黙って fallback させると content の取りこぼしが見えなくなるため、
  // 開発環境では同一 key 1 回だけ console.warn を出して validator と整合させます。
  const env = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined
  if (env === "production") {
    return
  }
  const cacheKey = `${diagnostic.category}:${diagnostic.presetId ?? "?"}:${rendererKind}`
  if (warnedRendererKinds.has(cacheKey)) {
    return
  }
  warnedRendererKinds.add(cacheKey)
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      `[battle-renderer] unknown rendererKind="${rendererKind}" for ${diagnostic.category} preset "${diagnostic.presetId ?? "(none)"}" — falling back to default.`,
    )
  }
}

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

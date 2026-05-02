export const BATTLE_CANVAS_WIDTH = 480
export const BATTLE_CANVAS_HEIGHT = 520
export {
  PHI,
  PHI_INV,
  TAU,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  seededUnit as seededRandom,
} from "@/render/shared/render-math"

export type BattleRendererCategory = "enemy" | "projectile" | "hazard" | "background"

export function resolveBattleRenderer<T>(
  registry: Record<string, T>,
  rendererKind: string,
  diagnostic: { presetId?: string; category: BattleRendererCategory },
  options: { allowFallback?: boolean } = {},
): T {
  const renderer = registry[rendererKind]
  if (renderer) {
    return renderer
  }
  if (!options.allowFallback) {
    throw new Error(
      `[battle-renderer] unknown rendererKind="${rendererKind}" for ${diagnostic.category} preset "${diagnostic.presetId ?? "(none)"}".`,
    )
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

export function hashRenderString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

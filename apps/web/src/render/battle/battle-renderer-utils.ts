export const BATTLE_CANVAS_WIDTH = 480
export const BATTLE_CANVAS_HEIGHT = 520
export const PHI = 1.618033988749895
export const PHI_INV = 1 / PHI
export const TAU = Math.PI * 2

export function resolveBattleRenderer<T>(registry: Record<string, T>, candidates: Array<string | undefined>): T {
  for (const candidate of candidates) {
    if (candidate && registry[candidate]) {
      return registry[candidate]
    }
  }
  return registry.default
}

export function buildEntityRendererKeys(input: {
  visualPresetId?: string
  legacyEntityId: string
  missionId: string
}) {
  // visualPresetId を優先し、content 側の preset が来た時点で描画 dispatch を切り替えられるようにする。
  return [
    input.visualPresetId,
    `mission:${input.missionId}:${input.legacyEntityId}`,
    input.legacyEntityId,
    `mission:${input.missionId}`,
    "default",
  ]
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

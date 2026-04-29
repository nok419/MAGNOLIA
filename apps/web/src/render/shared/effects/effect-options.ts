import type { CanvasPaletteRole } from "@/render/shared/canvas-palette"

export type SharedEffectSemantic =
  | "transmission"
  | "scan"
  | "fragment"
  | "hazard"
  | "hit"
  | "surface"

export type SharedEffectOptions = {
  paletteRole: CanvasPaletteRole
  reduceFlashing: boolean
  lowFrameRateMode: boolean
  nowMs: number
  intensity: number
  semantic: SharedEffectSemantic
}

export type EffectPoint = {
  x: number
  y: number
}

export function clampEffectRatio(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function readEffectAlpha(options: SharedEffectOptions, baseAlpha: number): number {
  const motionScale = options.reduceFlashing ? 0.72 : 1
  return clampEffectRatio(baseAlpha * clampEffectRatio(options.intensity) * motionScale)
}

export function readEffectStep(options: SharedEffectOptions, standardStep: number): number {
  return options.lowFrameRateMode ? standardStep * 1.8 : standardStep
}

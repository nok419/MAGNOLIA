import type { SettingsRow } from "@magnolia/contracts"

export type DisplayOptions = {
  reduceFlashing: boolean
  lowFrameRateMode: boolean
  targetFrameIntervalMs: number
  canvasPixelRatio: number
}

export function resolveDisplayOptions(settings: SettingsRow): DisplayOptions {
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  return {
    reduceFlashing: settings.reduceFlashing,
    lowFrameRateMode: settings.lowFrameRateMode,
    targetFrameIntervalMs: settings.lowFrameRateMode ? 1000 / 30 : 1000 / 60,
    canvasPixelRatio: settings.lowFrameRateMode ? 1 : devicePixelRatio,
  }
}

export function shouldDrawVisualFrame(input: {
  now: number
  lastDrawAt: number
  options: DisplayOptions
}): boolean {
  if (!input.options.lowFrameRateMode) {
    return true
  }
  return input.now - input.lastDrawAt >= input.options.targetFrameIntervalMs
}

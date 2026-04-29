import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import { drawSignalPulse } from "@/render/shared/effects/signal-pulse"

export function drawExploreScanPulseLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    viewport: Rect
    width: number
    padding: number
    elapsedMs: number
    pulses: ExploreRenderState["scanPulses"]
    alpha: number
    reduceFlashing?: boolean
    lowFrameRateMode?: boolean
  },
) {
  if (input.alpha <= 0.001 || input.pulses.length === 0) {
    return
  }
  const worldToPx = (input.width - input.padding * 2) / Math.max(1, input.viewport.width)
  ctx.save()
  for (const pulse of input.pulses) {
    const progress = clampScalar((input.elapsedMs - pulse.startedAtMs) / Math.max(1, pulse.durationMs), 0, 1)
    const radius = pulse.radius * worldToPx * easeOutCubic(progress)
    const fade = (1 - progress) * input.alpha
    if (fade <= 0.01) {
      continue
    }
    ctx.globalAlpha = fade
    drawSignalPulse(ctx, {
      origin: input.playerPoint,
      radius,
      progress,
      paletteRole: "signalPrimary",
      reduceFlashing: Boolean(input.reduceFlashing),
      lowFrameRateMode: Boolean(input.lowFrameRateMode),
      nowMs: input.elapsedMs,
      intensity: 1,
      semantic: "scan",
    })
  }
  ctx.restore()
}

function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function easeOutCubic(value: number): number {
  const inverse = 1 - clampScalar(value, 0, 1)
  return 1 - inverse * inverse * inverse
}

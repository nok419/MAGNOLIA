import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import { clampScalar, easeOutCubic } from "@/render/shared/render-math"
import { drawSignalPulse } from "@/render/shared/effects/signal-pulse"

export function drawExploreScanPulseLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    viewport: Rect
    width: number
    height: number
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
  const maxVisibleRadius = computeMaxVisiblePulseRadius(input.playerPoint, input.width, input.height)
  ctx.save()
  for (const pulse of input.pulses) {
    const progress = clampScalar((input.elapsedMs - pulse.startedAtMs) / Math.max(1, pulse.durationMs), 0, 1)
    const radius = pulse.radius * worldToPx * easeOutCubic(progress)
    const fade = (1 - progress) * input.alpha
    // scan の遠距離反応は signal-hints の視界円端 HUD に任せます。
    // 波面が画面外へ抜けた後は巨大な radial gradient を作らず、探索中の frame 負荷を抑えます。
    if (fade <= 0.01 || radius > maxVisibleRadius) {
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

function computeMaxVisiblePulseRadius(
  playerPoint: { x: number; y: number },
  width: number,
  height: number,
): number {
  const farthestCornerDistance = Math.max(
    Math.hypot(playerPoint.x, playerPoint.y),
    Math.hypot(width - playerPoint.x, playerPoint.y),
    Math.hypot(playerPoint.x, height - playerPoint.y),
    Math.hypot(width - playerPoint.x, height - playerPoint.y),
  )
  return farthestCornerDistance + 24
}

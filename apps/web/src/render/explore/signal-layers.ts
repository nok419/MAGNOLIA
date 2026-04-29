import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import { TAU, clampScalar, easeOutCubic } from "@/render/shared/canvas-math"
import { MG_CANVAS_PALETTE } from "@/render/shared/palette"

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
    reduceFlashing: boolean
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
    const fade = (1 - progress) * input.alpha * (input.reduceFlashing ? 0.58 : 1)
    if (fade <= 0.01) {
      continue
    }
    ctx.globalAlpha = fade
    ctx.strokeStyle = "rgba(180, 235, 255, 0.72)"
    ctx.lineWidth = input.reduceFlashing ? 0.9 : 1.2
    ctx.beginPath()
    ctx.arc(input.playerPoint.x, input.playerPoint.y, radius, 0, TAU)
    ctx.stroke()

    ctx.globalAlpha = fade * (input.reduceFlashing ? 0.05 : 0.12)
    ctx.fillStyle = "rgba(93, 164, 209, 0.7)"
    ctx.beginPath()
    ctx.arc(input.playerPoint.x, input.playerPoint.y, radius, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function drawSignalHintLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    hints: ExploreRenderState["signalHints"]
    alpha: number
    reduceFlashing: boolean
  },
) {
  if (input.alpha <= 0.001 || input.hints.length === 0) {
    return
  }

  ctx.save()
  for (const hint of input.hints) {
    const color = readSignalHintColor(hint)
    const bandRadius =
      hint.distanceBand === "near"
        ? input.visionPx * 0.78
        : hint.distanceBand === "mid"
          ? input.visionPx * 0.9
          : input.visionPx * 1.02
    const arcHalf = hint.category === "broadcast" ? 0.34 : hint.category === "automated" ? 0.22 : 0.16
    const alpha =
      input.alpha *
      (0.18 + hint.strength * 0.58) *
      (input.reduceFlashing ? 0.68 : 1)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = hint.kind === "transmission" ? 2 : 1.4
    ctx.beginPath()
    ctx.arc(
      input.playerPoint.x,
      input.playerPoint.y,
      bandRadius,
      hint.bearingRad - arcHalf,
      hint.bearingRad + arcHalf,
    )
    ctx.stroke()

    const markerX = input.playerPoint.x + Math.cos(hint.bearingRad) * bandRadius
    const markerY = input.playerPoint.y + Math.sin(hint.bearingRad) * bandRadius
    ctx.globalAlpha = alpha * 0.7
    if (hint.kind === "equipment" || hint.kind === "repair") {
      ctx.strokeRect(markerX - 3, markerY - 3, 6, 6)
    } else {
      ctx.beginPath()
      ctx.arc(markerX, markerY, 2.5 + hint.confidence * 2.5, 0, TAU)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function readSignalHintColor(
  hint: ExploreRenderState["signalHints"][number],
): string {
  if (hint.kind === "transmission") {
    return MG_CANVAS_PALETTE.dangerNoise.strong
  }
  if (hint.kind === "equipment") {
    return MG_CANVAS_PALETTE.memoryFragment.strong
  }
  if (hint.kind === "repair") {
    return "rgba(139, 240, 192, 0.82)"
  }
  switch (hint.category) {
    case "broadcast":
      return "rgba(180, 235, 255, 0.86)"
    case "automated":
      return "rgba(150, 220, 255, 0.78)"
    case "maintenance":
      return "rgba(216, 231, 246, 0.74)"
    case "private":
    default:
      return "rgba(247, 251, 255, 0.76)"
  }
}

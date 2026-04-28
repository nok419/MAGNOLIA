import type { ExploreRenderState } from "@magnolia/game-session"

const TAU = Math.PI * 2

export function drawSignalHintLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    hints: ExploreRenderState["signalHints"]
    alpha: number
  },
) {
  if (input.alpha <= 0.001 || input.hints.length === 0) {
    return
  }

  ctx.save()
  for (const hint of input.hints) {
    const strength = clampScalar(hint.strength, 0, 1)
    const confidence = clampScalar(hint.confidence, 0, 1)
    const bearingRad = Number.isFinite(hint.bearingRad) ? hint.bearingRad : 0
    const color = readSignalHintColor(hint)
    const bandRadius =
      hint.distanceBand === "near"
        ? input.visionPx * 0.78
        : hint.distanceBand === "mid"
          ? input.visionPx * 0.9
          : input.visionPx * 1.02
    const arcHalf = hint.category === "broadcast" ? 0.34 : hint.category === "automated" ? 0.22 : 0.16
    const alpha = input.alpha * (0.18 + strength * 0.58)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = hint.kind === "transmission" ? 2 : 1.4
    ctx.beginPath()
    ctx.arc(
      input.playerPoint.x,
      input.playerPoint.y,
      bandRadius,
      bearingRad - arcHalf,
      bearingRad + arcHalf,
    )
    ctx.stroke()

    const markerX = input.playerPoint.x + Math.cos(bearingRad) * bandRadius
    const markerY = input.playerPoint.y + Math.sin(bearingRad) * bandRadius
    ctx.globalAlpha = alpha * 0.7
    if (hint.kind === "equipment" || hint.kind === "repair") {
      ctx.strokeRect(markerX - 3, markerY - 3, 6, 6)
    } else {
      ctx.beginPath()
      ctx.arc(markerX, markerY, 2.5 + confidence * 2.5, 0, TAU)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function readSignalHintColor(
  hint: ExploreRenderState["signalHints"][number],
): string {
  if (hint.kind === "equipment") {
    return "rgba(240, 198, 116, 0.88)"
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

function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

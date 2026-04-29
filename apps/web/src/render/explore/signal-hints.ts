import type { ExploreRenderState } from "@magnolia/game-session"
import { rgba } from "@/render/shared/canvas-palette"

const TAU = Math.PI * 2

export function drawSignalHintLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    hints: ExploreRenderState["signalHints"]
    alpha: number
    reduceFlashing?: boolean
    lowFrameRateMode?: boolean
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
    const detectedState = hint.detectedState ?? "hint"
    const color = readSignalHintColor(hint)
    const bandRadius =
      hint.distanceBand === "near"
        ? input.visionPx * 0.78
        : hint.distanceBand === "mid"
          ? input.visionPx * 0.9
          : input.visionPx * 1.02
    const arcHalf = hint.category === "broadcast" ? 0.34 : hint.category === "automated" ? 0.22 : 0.16
    const stateAlpha =
      detectedState === "recorded"
        ? 0.68
        : detectedState === "identified"
          ? 0.56
          : detectedState === "ghost"
            ? 0.4
            : 0.28
    const alpha = input.alpha * stateAlpha * (0.42 + strength * 0.58)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth =
      detectedState === "recorded"
        ? 2.2
        : detectedState === "identified"
          ? 1.8
          : 1.2
    ctx.beginPath()
    ctx.arc(
      input.playerPoint.x,
      input.playerPoint.y,
      bandRadius,
      bearingRad - arcHalf,
      bearingRad + arcHalf,
    )
    ctx.stroke()

    if (detectedState === "recorded" && !input.lowFrameRateMode) {
      ctx.globalAlpha = alpha * 0.36
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(
        input.playerPoint.x,
        input.playerPoint.y,
        bandRadius + 7,
        bearingRad - arcHalf * 0.74,
        bearingRad + arcHalf * 0.74,
      )
      ctx.stroke()
    }

    if (detectedState === "hint" || detectedState === "ghost") {
      continue
    }

    const markerX = input.playerPoint.x + Math.cos(bearingRad) * bandRadius
    const markerY = input.playerPoint.y + Math.sin(bearingRad) * bandRadius
    ctx.globalAlpha = alpha * (detectedState === "recorded" ? 0.95 : 0.74)
    drawSignalHintSymbol(ctx, {
      hint,
      x: markerX,
      y: markerY,
      confidence,
      recorded: detectedState === "recorded",
      reduceFlashing: Boolean(input.reduceFlashing),
    })
  }
  ctx.restore()
}

function drawSignalHintSymbol(
  ctx: CanvasRenderingContext2D,
  input: {
    hint: ExploreRenderState["signalHints"][number]
    x: number
    y: number
    confidence: number
    recorded: boolean
    reduceFlashing: boolean
  },
) {
  const size = 3.8 + input.confidence * 2.4
  ctx.save()
  ctx.lineWidth = input.recorded ? 1.6 : 1.2
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  switch (input.hint.kind) {
    case "repair": {
      // repair は同じ帯上に水平線 2 本だけを置き、通信や装備と読み違えないようにします。
      const gap = input.reduceFlashing ? 2.4 : 3.2
      ctx.beginPath()
      ctx.moveTo(input.x - size, input.y - gap)
      ctx.lineTo(input.x + size, input.y - gap)
      ctx.moveTo(input.x - size, input.y + gap)
      ctx.lineTo(input.x + size, input.y + gap)
      ctx.stroke()
      break
    }
    case "equipment":
    case "collectible": {
      // 未記録の装備・収集物は正確座標ではなく距離帯上の小さい菱形として示します。
      ctx.beginPath()
      ctx.moveTo(input.x, input.y - size)
      ctx.lineTo(input.x + size * 0.62, input.y)
      ctx.lineTo(input.x, input.y + size)
      ctx.lineTo(input.x - size * 0.62, input.y)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case "transmission":
    default: {
      // 通信は円弧に短い縦線を添える。speaker や本文の正確な位置はここでは出しません。
      ctx.beginPath()
      ctx.arc(input.x, input.y, size, -TAU * 0.18, TAU * 0.18)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(input.x, input.y - size - 2)
      ctx.lineTo(input.x, input.y + size + 2)
      ctx.stroke()
      break
    }
  }

  ctx.restore()
}

function readSignalHintColor(
  hint: ExploreRenderState["signalHints"][number],
): string {
  if (hint.kind === "equipment") {
    return rgba("residualWarmth", 0.88)
  }
  if (hint.kind === "repair") {
    return rgba("restoration", 0.82)
  }
  switch (hint.category) {
    case "broadcast":
      return rgba("signalReadable", 0.86)
    case "automated":
      return rgba("signalSecondary", 0.78)
    case "maintenance":
      return rgba("signalSecondary", 0.74)
    case "private":
    default:
      return rgba("signalReadable", 0.76)
  }
}

function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

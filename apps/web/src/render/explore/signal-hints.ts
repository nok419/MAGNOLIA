import type { ExploreRenderState } from "@magnolia/game-session"
import { rgba } from "@/render/shared/canvas-palette"
import { TAU, clampScalar } from "@/render/shared/render-math"

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
        ? 0.82
        : detectedState === "identified"
          ? 0.7
          : detectedState === "ghost"
            ? 0.52
            : 0.38
    const alpha = input.alpha * stateAlpha * (0.5 + strength * 0.5)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = input.reduceFlashing ? 3 : 7
    ctx.lineWidth =
      detectedState === "recorded"
        ? 3
        : detectedState === "identified"
          ? 2.4
          : 1.8
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
      ctx.lineWidth = 1.1
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

    ctx.shadowBlur = input.reduceFlashing ? 2 : 5
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
  const size = 5 + input.confidence * 3.2
  ctx.save()
  ctx.lineWidth = input.recorded ? 2 : 1.6
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
  if (hint.kind === "transmission") {
    // scanで出るミッション方向は、通常の白い可読テキストと混ざらないよう赤で固定します。
    return rgba("threatNoise", 0.98)
  }
  if (hint.kind === "equipment") {
    return rgba("residualWarmth", 0.96)
  }
  if (hint.kind === "repair") {
    return rgba("restoration", 0.94)
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

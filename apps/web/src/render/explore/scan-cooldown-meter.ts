import { rgba } from "@/render/shared/canvas-palette"
import { TAU, clamp01, easeOutCubic } from "@/render/shared/render-math"

const SCAN_METER_RADIUS = 34
const SCAN_METER_FLASH_MS = 520
const SCAN_METER_COMPLETE_RATIO = 0.995

export type ScanCooldownMeterState = {
  wasCoolingDown: boolean
  flashUntilMs: number
}

export function createScanCooldownMeterState(): ScanCooldownMeterState {
  return {
    wasCoolingDown: false,
    flashUntilMs: 0,
  }
}

export function drawScanCooldownMeter(
  ctx: CanvasRenderingContext2D,
  input: {
    state: ScanCooldownMeterState
    playerPoint: { x: number; y: number }
    ratio: number | undefined
    alpha: number
    timeMs: number
    reduceFlashing: boolean
    lowFrameRateMode: boolean
  },
): void {
  const ratio = clamp01(input.ratio ?? 1)
  const isCoolingDown = ratio < SCAN_METER_COMPLETE_RATIO

  if (isCoolingDown) {
    input.state.wasCoolingDown = true
  } else if (input.state.wasCoolingDown) {
    // ここがスキャン再使用可能になった瞬間です。将来の効果音もこのエッジに合わせます。
    input.state.wasCoolingDown = false
    input.state.flashUntilMs = input.timeMs + SCAN_METER_FLASH_MS
  }

  const flashRemainingMs = Math.max(0, input.state.flashUntilMs - input.timeMs)
  if (!isCoolingDown && flashRemainingMs <= 0) {
    return
  }

  const baseAlpha = clamp01(input.alpha)
  if (baseAlpha <= 0.001) {
    return
  }

  const flashRatio = clamp01(flashRemainingMs / SCAN_METER_FLASH_MS)
  const flashAlpha = isCoolingDown ? 0 : easeOutCubic(flashRatio)
  const meterAlpha = baseAlpha * (isCoolingDown ? 1 : flashAlpha)
  const radius = SCAN_METER_RADIUS + (isCoolingDown ? 0 : (1 - flashRatio) * 5)
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + TAU * (isCoolingDown ? ratio : 1)
  const pulse = input.reduceFlashing ? 1 : 0.88 + 0.12 * Math.sin(input.timeMs * 0.012)

  ctx.save()
  ctx.translate(input.playerPoint.x, input.playerPoint.y)
  ctx.globalAlpha = meterAlpha

  drawMeterTrack(ctx, radius)
  drawMeterTicks(ctx, radius, input.lowFrameRateMode)

  ctx.lineCap = "round"
  ctx.lineWidth = 3
  ctx.strokeStyle = rgba("residualWarmth", 0.72)
  ctx.shadowColor = rgba("residualWarmth", isCoolingDown ? 0.26 : 0.64 * flashAlpha)
  ctx.shadowBlur = input.reduceFlashing ? 0 : isCoolingDown ? 8 * pulse : 18 * flashAlpha
  ctx.beginPath()
  ctx.arc(0, 0, radius, startAngle, endAngle)
  ctx.stroke()
  ctx.shadowBlur = 0

  if (isCoolingDown && ratio > 0.03) {
    drawMeterTip(ctx, radius, endAngle, pulse)
  }

  if (!isCoolingDown) {
    drawCompletionGlow(ctx, radius, flashAlpha, input.reduceFlashing)
  }

  ctx.restore()
}

function drawMeterTrack(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.lineCap = "butt"
  ctx.lineWidth = 1.2
  ctx.strokeStyle = rgba("signalPrimary", 0.22)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, TAU)
  ctx.stroke()

  ctx.lineWidth = 0.8
  ctx.strokeStyle = rgba("lineSubtle", 0.12)
  ctx.beginPath()
  ctx.arc(0, 0, radius - 5, 0, TAU)
  ctx.stroke()
}

function drawMeterTicks(
  ctx: CanvasRenderingContext2D,
  radius: number,
  lowFrameRateMode: boolean,
): void {
  const tickCount = lowFrameRateMode ? 4 : 8
  ctx.strokeStyle = rgba("signalPrimary", 0.28)
  ctx.lineWidth = 1
  for (let index = 0; index < tickCount; index += 1) {
    const angle = (TAU / tickCount) * index - Math.PI / 2
    const inner = radius - 4
    const outer = radius - (index % 2 === 0 ? -1 : 1)
    ctx.beginPath()
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
    ctx.stroke()
  }
}

function drawMeterTip(
  ctx: CanvasRenderingContext2D,
  radius: number,
  angle: number,
  pulse: number,
): void {
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius
  ctx.fillStyle = rgba("signalReadable", 0.82)
  ctx.shadowColor = rgba("residualWarmth", 0.55)
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(x, y, 2 * pulse, 0, TAU)
  ctx.fill()
  ctx.shadowBlur = 0
}

function drawCompletionGlow(
  ctx: CanvasRenderingContext2D,
  radius: number,
  flashAlpha: number,
  reduceFlashing: boolean,
): void {
  ctx.strokeStyle = rgba("residualWarmth", 0.55 * flashAlpha)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, 0, radius + 5, 0, TAU)
  ctx.stroke()

  if (reduceFlashing) {
    return
  }

  ctx.strokeStyle = rgba("signalReadable", 0.26 * flashAlpha)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, 0, radius + 10 * (1 - flashAlpha), 0, TAU)
  ctx.stroke()
}

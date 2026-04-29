import { gradientStop, rgba, resolveGlow } from "@/render/shared/canvas-palette"
import {
  clampEffectRatio,
  readEffectAlpha,
  type EffectPoint,
  type SharedEffectOptions,
} from "@/render/shared/effects/effect-options"

const TAU = Math.PI * 2

export type SignalPulseInput = SharedEffectOptions & {
  origin: EffectPoint
  radius: number
  progress: number
}

export function drawSignalPulse(ctx: CanvasRenderingContext2D, input: SignalPulseInput): void {
  const progress = clampEffectRatio(input.progress)
  const fade = readEffectAlpha(input, 1 - progress)
  if (fade <= 0.001 || input.radius <= 0) {
    return
  }

  const glow = resolveGlow(input.paletteRole, input.reduceFlashing ? 0.35 : 0.62)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = rgba(input.paletteRole, 0.72 * fade)
  ctx.lineWidth = input.reduceFlashing ? 1.8 : 1.2
  ctx.shadowColor = glow.color
  ctx.shadowBlur = glow.blur
  ctx.beginPath()
  ctx.arc(input.origin.x, input.origin.y, input.radius, 0, TAU)
  ctx.stroke()

  const fill = ctx.createRadialGradient(input.origin.x, input.origin.y, 0, input.origin.x, input.origin.y, input.radius)
  fill.addColorStop(0, gradientStop(input.paletteRole, 0))
  fill.addColorStop(0.74, gradientStop(input.paletteRole, fade * 0.08))
  fill.addColorStop(1, gradientStop(input.paletteRole, 0))
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(input.origin.x, input.origin.y, input.radius, 0, TAU)
  ctx.fill()
  ctx.restore()
}

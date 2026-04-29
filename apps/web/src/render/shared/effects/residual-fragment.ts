import { rgba, resolveGlow } from "@/render/shared/canvas-palette"
import {
  clampEffectRatio,
  readEffectAlpha,
  type EffectPoint,
  type SharedEffectOptions,
} from "@/render/shared/effects/effect-options"

export type ResidualFragmentInput = SharedEffectOptions & {
  origin: EffectPoint
  progress: number
  size: number
}

export function drawResidualFragment(ctx: CanvasRenderingContext2D, input: ResidualFragmentInput): void {
  const progress = clampEffectRatio(input.progress)
  const fade = readEffectAlpha(input, 1 - progress)
  if (fade <= 0.001 || input.size <= 0) {
    return
  }

  const glow = resolveGlow(input.paletteRole, input.reduceFlashing ? 0.28 : 0.5)
  const radius = input.size * (0.7 + progress * 0.6)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = rgba(input.paletteRole, 0.72 * fade)
  ctx.fillStyle = rgba(input.paletteRole, 0.14 * fade)
  ctx.lineWidth = input.reduceFlashing ? 1.6 : 1.1
  ctx.shadowColor = glow.color
  ctx.shadowBlur = glow.blur
  ctx.beginPath()
  ctx.moveTo(input.origin.x, input.origin.y - radius)
  ctx.lineTo(input.origin.x + radius, input.origin.y)
  ctx.lineTo(input.origin.x, input.origin.y + radius)
  ctx.lineTo(input.origin.x - radius, input.origin.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

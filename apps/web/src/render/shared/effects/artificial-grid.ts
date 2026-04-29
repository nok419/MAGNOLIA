import { rgba } from "@/render/shared/canvas-palette"
import {
  readEffectAlpha,
  readEffectStep,
  type SharedEffectOptions,
} from "@/render/shared/effects/effect-options"

export type ArtificialGridInput = SharedEffectOptions & {
  width: number
  height: number
  spacing: number
}

export function drawArtificialGrid(ctx: CanvasRenderingContext2D, input: ArtificialGridInput): void {
  const alpha = readEffectAlpha(input, 0.16)
  if (alpha <= 0.001 || input.width <= 0 || input.height <= 0) {
    return
  }

  const spacing = Math.max(8, readEffectStep(input, input.spacing))
  ctx.save()
  ctx.strokeStyle = rgba(input.paletteRole, alpha)
  ctx.lineWidth = 1
  for (let x = 0; x <= input.width; x += spacing) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, input.height)
    ctx.stroke()
  }
  for (let y = 0; y <= input.height; y += spacing) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(input.width, y)
    ctx.stroke()
  }
  ctx.restore()
}

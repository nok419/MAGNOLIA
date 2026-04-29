import { rgba, resolveGlow } from "@/render/shared/canvas-palette"
import {
  readEffectAlpha,
  type SharedEffectOptions,
} from "@/render/shared/effects/effect-options"

export type SurfaceFrameInput = SharedEffectOptions & {
  x: number
  y: number
  width: number
  height: number
}

export function drawSurfaceFrame(ctx: CanvasRenderingContext2D, input: SurfaceFrameInput): void {
  const alpha = readEffectAlpha(input, 0.72)
  if (alpha <= 0.001 || input.width <= 0 || input.height <= 0) {
    return
  }

  const glow = resolveGlow(input.paletteRole, input.reduceFlashing ? 0.16 : 0.32)
  ctx.save()
  ctx.strokeStyle = rgba(input.paletteRole, alpha)
  ctx.lineWidth = input.reduceFlashing ? 1.5 : 1
  ctx.shadowColor = glow.color
  ctx.shadowBlur = glow.blur
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.restore()
}

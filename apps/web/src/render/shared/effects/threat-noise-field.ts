import { gradientStop, rgba } from "@/render/shared/canvas-palette"
import {
  readEffectAlpha,
  readEffectStep,
  type SharedEffectOptions,
} from "@/render/shared/effects/effect-options"

export type ThreatNoiseFieldInput = SharedEffectOptions & {
  width: number
  height: number
  phase: number
}

export function drawThreatNoiseField(ctx: CanvasRenderingContext2D, input: ThreatNoiseFieldInput): void {
  const fade = readEffectAlpha(input, input.semantic === "hazard" || input.semantic === "hit" ? 1 : 0)
  if (fade <= 0.001 || input.width <= 0 || input.height <= 0) {
    return
  }

  ctx.save()
  const veil = ctx.createLinearGradient(0, 0, input.width, input.height)
  veil.addColorStop(0, gradientStop(input.paletteRole, 0.16 * fade))
  veil.addColorStop(0.52, gradientStop(input.paletteRole, 0.04 * fade))
  veil.addColorStop(1, gradientStop(input.paletteRole, 0))
  ctx.fillStyle = veil
  ctx.fillRect(0, 0, input.width, input.height)

  // threatNoise は hazard と被弾の予兆用です。通常hoverの強調へ流用しないよう semantic で入口を限定します。
  ctx.strokeStyle = rgba(input.paletteRole, input.reduceFlashing ? 0.06 * fade : 0.12 * fade)
  ctx.lineWidth = 1
  const step = readEffectStep(input, 18)
  for (let y = step; y < input.height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y + input.phase * 16)
    ctx.lineTo(input.width, y + input.phase * 6)
    ctx.stroke()
  }
  ctx.restore()
}

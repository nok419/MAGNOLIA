import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import type { BattleProjectile } from "./types"

export function drawInversePhaseProjectileAura(
  ctx: CanvasRenderingContext2D,
  p: BattleProjectile,
  t: number,
) {
  const { x, y } = p.position
  const seed = hashString(p.projectileInstanceId)
  const glitch = Math.sin(t * 0.018 + seed) * 1.4

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineWidth = 0.7
  ctx.strokeStyle = tokenRgba("line", 0.26)
  ctx.shadowColor = tokenRgba("signal", 0.38)
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.ellipse(x + glitch, y - glitch * 0.35, p.radius * 1.45, p.radius * 2.15, 0, 0, TAU)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = tokenRgba("deep", 0.28)
  for (let i = 0; i < 3; i++) {
    const yy = y + (i - 1) * p.radius * 0.72 + Math.sin(t * 0.012 + seed + i) * 1.2
    ctx.beginPath()
    ctx.moveTo(x - p.radius * (1.4 + i * 0.16), yy)
    ctx.lineTo(x + p.radius * (1.2 - i * 0.1), yy + glitch * 0.35)
    ctx.stroke()
  }
  ctx.restore()
}

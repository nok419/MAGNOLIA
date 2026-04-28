import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import { normalizeCanvasVector } from "../battle-math"
import type { BattleProjectile } from "./types"

export function drawCarrierProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile) {
  const { x, y } = p.position
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const tailLength = p.radius * 8.5
  const halfWidth = Math.max(1.6, p.radius * 0.48)
  const tailX = x - direction.x * tailLength
  const tailY = y - direction.y * tailLength
  const normal = { x: -direction.y, y: direction.x }

  ctx.save()
  ctx.shadowColor = tokenRgba("signalBright", 0.9)
  ctx.shadowBlur = 14

  const beamGradient = ctx.createLinearGradient(tailX, tailY, x, y)
  beamGradient.addColorStop(0, tokenRgba("signal", 0))
  beamGradient.addColorStop(0.35, tokenRgba("signal", 0.36))
  beamGradient.addColorStop(0.78, tokenRgba("signalBright", 0.92))
  beamGradient.addColorStop(1, tokenRgba("text", 1))
  ctx.fillStyle = beamGradient
  ctx.beginPath()
  ctx.moveTo(tailX + normal.x * halfWidth, tailY + normal.y * halfWidth)
  ctx.lineTo(x + normal.x * (halfWidth * 0.35), y + normal.y * (halfWidth * 0.35))
  ctx.lineTo(x - normal.x * (halfWidth * 0.35), y - normal.y * (halfWidth * 0.35))
  ctx.lineTo(tailX - normal.x * halfWidth, tailY - normal.y * halfWidth)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = tokenRgba("signalBright", 0.92)
  ctx.lineWidth = Math.max(1, halfWidth * 0.8)
  ctx.beginPath()
  ctx.moveTo(tailX, tailY)
  ctx.lineTo(x, y)
  ctx.stroke()

  ctx.restore()
}

export function drawCarrierBlast(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const pulse = 0.84 + Math.sin(t * 0.02) * 0.08

  ctx.save()
  ctx.shadowColor = tokenRgba("signalBright", 0.8)
  ctx.shadowBlur = 16
  ctx.strokeStyle = tokenRgba("signalBright", 0.82)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x, y, p.radius * pulse, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = tokenRgba("signalBright", 0.4)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(x, y, p.radius * 0.62 * pulse, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

import type { BattleRenderState } from "@magnolia/game-session"
import { TAU, clamp01, easeOutCubic, hashString } from "@/render/battle/battle-renderer-utils"

export type BattleFragmentMotion = {
  originX?: number
  originY?: number
  createdAtMs?: number
}

export function drawBattleFragment(
  ctx: CanvasRenderingContext2D,
  fragment: BattleRenderState["fragments"][number],
  t: number,
  reduceFlashing: boolean,
) {
  const x = fragment.x
  const y = fragment.y
  const birthProgress = fragment.createdAtMs === undefined
    ? 1
    : clamp01((t - fragment.createdAtMs) / 420)
  const originX = fragment.originX ?? x
  const originY = fragment.originY ?? y
  const drawX = originX + (x - originX) * easeOutCubic(birthProgress)
  const drawY = originY + (y - originY) * easeOutCubic(birthProgress)
  const lifeMs = Math.max(0, fragment.expiresAtMs - t)
  const fade = Math.min(1, lifeMs / 700)
  const pulse = reduceFlashing ? 0.86 : 0.78 + Math.sin(t * 0.011 + fragment.x * 0.03) * 0.18
  const size = 8 + fragment.strength * 4

  ctx.save()
  ctx.globalAlpha = 0.34 * fade * (1 - birthProgress)
  ctx.strokeStyle = "rgba(255, 236, 190, 0.68)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(originX, originY)
  ctx.quadraticCurveTo((originX + x) / 2, originY - 22, drawX, drawY)
  ctx.stroke()

  ctx.translate(drawX, drawY)
  ctx.rotate((hashString(fragment.fragmentId) % 360) * (Math.PI / 180))
  ctx.shadowColor = "rgba(240, 198, 116, 0.58)"
  ctx.shadowBlur = 12 * pulse

  ctx.globalAlpha = 0.16 * fade
  ctx.fillStyle = "rgba(240, 198, 116, 0.75)"
  drawDiamondPath(ctx, 0, 0, size * 2.2)
  ctx.fill()

  ctx.globalAlpha = 0.88 * fade
  ctx.strokeStyle = "rgba(255, 236, 190, 0.92)"
  ctx.lineWidth = 1.15
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(size * 0.76, -size * 0.08)
  ctx.lineTo(size * 0.22, size * 0.82)
  ctx.lineTo(-size * 0.88, size * 0.18)
  ctx.closePath()
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.55 * fade
  ctx.strokeStyle = "rgba(255, 248, 220, 0.62)"
  ctx.lineWidth = 0.65
  ctx.beginPath()
  ctx.moveTo(-size * 0.42, -size * 0.24)
  ctx.lineTo(size * 0.44, size * 0.2)
  ctx.moveTo(-size * 0.2, size * 0.46)
  ctx.lineTo(size * 0.24, -size * 0.54)
  ctx.stroke()

  ctx.rotate(-((hashString(fragment.fragmentId) % 360) * (Math.PI / 180)))
  ctx.globalAlpha = 0.72 * fade
  ctx.fillStyle = "rgba(255, 248, 220, 0.82)"
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("▧", 0, 0)

  ctx.globalAlpha = 0.22 * fade
  ctx.strokeStyle = "rgba(255, 236, 190, 0.72)"
  ctx.lineWidth = 0.75
  for (let offset = -8; offset <= 8; offset += 4) {
    ctx.beginPath()
    ctx.moveTo(-size * 1.5, offset)
    ctx.lineTo(size * 1.5, offset + Math.sin(t * 0.003 + offset) * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.lineTo(x + size * 0.72, y)
  ctx.lineTo(x, y + size)
  ctx.lineTo(x - size * 0.72, y)
  ctx.closePath()
}

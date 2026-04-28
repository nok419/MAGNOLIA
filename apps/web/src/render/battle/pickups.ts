import { TAU } from "@/render/battle/battle-renderer-utils"

export type BattlePickupVisualKind = "selfRepairPoints"

export function drawBattlePickup(
  ctx: CanvasRenderingContext2D,
  pickup: { position: { x: number; y: number }; radius: number; amount: number },
  t: number,
) {
  const { x, y } = pickup.position
  const r = pickup.radius
  const pulse = 0.7 + Math.sin(t * 0.008) * 0.2

  ctx.save()
  ctx.shadowColor = "rgba(93, 164, 209, 0.55)"
  ctx.shadowBlur = 12

  ctx.globalAlpha = 0.16 * pulse
  ctx.fillStyle = "#5da4d1"
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#d8f1ff"
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.65, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.65, y)
  ctx.closePath()
  ctx.stroke()

  ctx.fillStyle = "#d8f1ff"
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.fillText(`+${pickup.amount}`, x, y - r - 6)
  ctx.restore()
}

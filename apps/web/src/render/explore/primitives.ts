import { PHI_INV } from "@/render/shared/canvas-math"

function drawDiamondPath(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, r: number) {
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - r)
  ctx.lineTo(pos.x + r * PHI_INV, pos.y)
  ctx.lineTo(pos.x, pos.y + r)
  ctx.lineTo(pos.x - r * PHI_INV, pos.y)
  ctx.closePath()
}

export function drawDiamond(
  ctx: CanvasRenderingContext2D, pos: { x: number; y: number },
  r: number, color: string, glow: boolean,
) {
  ctx.save()
  const base = ctx.globalAlpha
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8 }
  ctx.globalAlpha = base * 0.12; ctx.fillStyle = color
  drawDiamondPath(ctx, pos, r); ctx.fill()
  ctx.globalAlpha = base * 0.85; ctx.strokeStyle = color; ctx.lineWidth = 1.5
  drawDiamondPath(ctx, pos, r); ctx.stroke()
  ctx.restore()
}

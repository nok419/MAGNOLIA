import type { Rect } from "@magnolia/game-session"
import { worldToCanvasPoint } from "@/render/shared/coordinates"

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  now: number,
  viewport: Rect,
) {
  const breathe = 0.5 + 0.5 * Math.sin(now * 0.00032)
  const topTint = 8 + breathe * 2
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, `rgb(${topTint}, ${topTint + 6}, ${Math.min(32, 20 + Math.round(topTint * 0.4))})`)
  grad.addColorStop(1, "#040810")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = "rgba(93, 164, 209, 0.04)"
  ctx.lineWidth = 1
  const gridWorldSize = 60
  const startX = Math.floor(viewport.x / gridWorldSize) * gridWorldSize
  const endX = viewport.x + viewport.width + gridWorldSize
  for (let worldX = startX; worldX <= endX; worldX += gridWorldSize) {
    const x = ((worldX - viewport.x) / Math.max(1, viewport.width)) * W
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  const startY = Math.floor(viewport.y / gridWorldSize) * gridWorldSize
  const endY = viewport.y + viewport.height + gridWorldSize
  for (let worldY = startY; worldY <= endY; worldY += gridWorldSize) {
    const y = ((worldY - viewport.y) / Math.max(1, viewport.height)) * H
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  const bands = [
    { period: 22000, phase: 0, thickness: 90 },
    { period: 28000, phase: 8600, thickness: 64 },
  ]
  for (const band of bands) {
    const progress = ((now + band.phase) % band.period) / band.period
    const centerY = -band.thickness + progress * (H + band.thickness * 2)
    const bandGrad = ctx.createLinearGradient(0, centerY - band.thickness / 2, 0, centerY + band.thickness / 2)
    bandGrad.addColorStop(0, "rgba(140, 195, 255, 0)")
    bandGrad.addColorStop(0.5, "rgba(140, 195, 255, 0.03)")
    bandGrad.addColorStop(1, "rgba(140, 195, 255, 0)")
    ctx.fillStyle = bandGrad
    ctx.fillRect(0, centerY - band.thickness / 2, W, band.thickness)
  }

  const fastScanY = (now * 0.022) % H
  ctx.fillStyle = "rgba(200, 230, 255, 0.028)"
  ctx.fillRect(0, fastScanY, W, 1.5)

  const slowScanY = H - ((now * 0.008) % H)
  ctx.fillStyle = "rgba(93, 164, 209, 0.022)"
  ctx.fillRect(0, slowScanY, W, 2.4)

  const vignette = ctx.createRadialGradient(
    W * 0.5, H * 0.5, Math.min(W, H) * 0.35,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.85,
  )
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
  vignette.addColorStop(0.55, "rgba(0, 0, 0, 0.18)")
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
}

export function drawFogGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pad: number,
  fogBitmap: string,
  worldBounds: Rect,
  viewport: Rect,
) {
  const rows = fogBitmap.split("|")
  const cols = rows[0]?.length || 1
  const cellWorldW = worldBounds.width / Math.max(1, cols)
  const cellWorldH = worldBounds.height / Math.max(1, rows.length)
  rows.forEach((row, yi) => {
    row.split("").forEach((cell, xi) => {
      if (cell === "1") {
        return
      }
      const worldX = worldBounds.x + xi * cellWorldW
      const worldY = worldBounds.y + yi * cellWorldH
      const topLeft = toCanvasPoint(viewport, W, H, pad, worldX, worldY)
      const bottomRight = toCanvasPoint(
        viewport,
        W,
        H,
        pad,
        worldX + cellWorldW,
        worldY + cellWorldH,
      )
      const drawX = Math.min(topLeft.x, bottomRight.x)
      const drawY = Math.min(topLeft.y, bottomRight.y)
      const drawW = Math.abs(bottomRight.x - topLeft.x)
      const drawH = Math.abs(bottomRight.y - topLeft.y)
      if (drawW <= 0.5 || drawH <= 0.5) {
        return
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)"
      ctx.fillRect(drawX, drawY, drawW, drawH)
    })
  })
}

function toCanvasPoint(bounds: Rect, W: number, H: number, pad: number, wx: number, wy: number) {
  return worldToCanvasPoint({
    bounds,
    size: { width: W, height: H },
    padding: pad,
    worldPosition: { x: wx, y: wy },
  })
}

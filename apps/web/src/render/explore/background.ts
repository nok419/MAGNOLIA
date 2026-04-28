import type { Rect } from "@magnolia/game-session"
import {
  drawCarrierLineField,
  drawPeripheralVignette,
  drawSignalParticleField,
  drawVoidGradient,
} from "@/app/effect-primitives"
import { tokenRgba, visualToken } from "@/app/visual-tokens"
import { worldToCanvasPoint } from "@/render/shared/coordinates"

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  now: number,
  viewport: Rect,
  reduceMotion = false,
) {
  drawVoidGradient(ctx, W, H)

  // 探索背景は world 座標に同期した carrier line を基準にし、カメラ移動時の地続き感を残します。
  const seed = Math.floor(viewport.x * 11 + viewport.y * 17 + viewport.width * 3)
  drawCarrierLineField(ctx, {
    seed: `explore-grid:${seed}`,
    width: W,
    height: H,
    timeMs: now,
    orientation: "vertical",
    density: 18,
    curvature: 0.04,
    alpha: visualToken.alpha.backgroundLine * 0.54,
    centerQuietRatio: 0.16,
  })
  drawCarrierLineField(ctx, {
    seed: `explore-grid-h:${seed}`,
    width: W,
    height: H,
    timeMs: now,
    orientation: "horizontal",
    density: 10,
    curvature: 0.03,
    alpha: visualToken.alpha.backgroundLine * 0.34,
    centerQuietRatio: 0.22,
  })
  drawSignalParticleField(ctx, {
    seed: `explore-particles:${seed}`,
    width: W,
    height: H,
    timeMs: now,
    density: "sparse",
    depth: "far",
    drift: "current",
    colorRole: "line",
    reduceMotion,
    alpha: 0.72,
  })

  const slowScanY = H - ((now * 0.006) % H)
  ctx.fillStyle = tokenRgba("signal", 0.028)
  ctx.fillRect(0, slowScanY, W, visualToken.stroke.regular)

  drawPeripheralVignette(ctx, { width: W, height: H, strength: 0.78 })
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
      if (cell !== "1") {
        const worldX = worldBounds.x + xi * cellWorldW
        const worldY = worldBounds.y + yi * cellWorldH
        const topLeft = worldToCanvasPoint(viewport, W, H, pad, worldX, worldY)
        const bottomRight = worldToCanvasPoint(
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
        ctx.fillStyle = tokenRgba("void", 0.3)
        ctx.fillRect(drawX, drawY, drawW, drawH)
      }
    })
  })
}

import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import { PHI_INV } from "../battle-math"
import type { BattleProjectile } from "./types"

/* ── Variant 2: ジオ・ダイアモンド (回転菱形, 幾何学的) ── */
export function drawGeoDiamondProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const rot = t * 0.003 * (seed % 2 === 0 ? 1 : -1) + seed * 0.01
  const s = r * 0.8
  const sw = s * PHI_INV   // 菱形の横幅 (黄金比)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  // 1. ソフトハロー
  ctx.globalAlpha = 0.09
  ctx.fillStyle = tokenRgba("memory", 0.72)
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.7, 0, TAU)
  ctx.fill()

  // 2. 菱形アウトライン
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = tokenRgba("memory", 0.85)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(sw, 0)
  ctx.lineTo(0, s)
  ctx.lineTo(-sw, 0)
  ctx.closePath()
  ctx.stroke()

  // 3. 菱形内側フィル
  ctx.globalAlpha = 0.12
  ctx.fillStyle = tokenRgba("memory", 0.78)
  ctx.fill()

  // 4. 中心ドット
  ctx.globalAlpha = 0.85
  ctx.fillStyle = tokenRgba("text", 0.95)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.15, 0, TAU)
  ctx.fill()

  ctx.restore()
}

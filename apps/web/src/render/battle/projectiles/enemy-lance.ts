import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import { normalizeCanvasVector } from "../battle-math"
import type { BattleProjectile } from "./types"

/* ── 三角弾: 進行方向に向く軽い三角形 + 円ハロー。
   ランス系の鋭さを抑え、丸+三角の幾何学的な美しさだけ残します。      ── */
export function drawEnemyLanceProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.006 + seed)

  ctx.save()
  ctx.translate(x, y)

  // 1. ソフトハロー (円)
  ctx.globalAlpha = 0.09 + 0.04 * pulse
  ctx.fillStyle = tokenRgba("memory", 0.7)
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.55, 0, TAU)
  ctx.fill()

  ctx.rotate(angle)

  // 2. 三角アウトライン (進行方向に向く正三角形)
  const tip = r * 1.05
  const base = r * 0.78
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = tokenRgba("memory", 0.9)
  ctx.lineWidth = 0.95
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(0, -tip)
  ctx.lineTo(base, tip * 0.55)
  ctx.lineTo(-base, tip * 0.55)
  ctx.closePath()
  ctx.stroke()

  // 3. 三角内側フィル
  ctx.globalAlpha = 0.16
  ctx.fillStyle = tokenRgba("memory", 0.78)
  ctx.fill()

  // 4. 中心ドット
  ctx.globalAlpha = 0.92
  ctx.fillStyle = tokenRgba("text", 0.96)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import type { BattleProjectile } from "./types"

/* ── ボス弾: 大型サイズの円バリアント。中心の三角アクセントで
   通常弾と差別化しつつ、過度な攻撃感は出さないように調整します。 ── */
export function drawBossCoreProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const rot = t * 0.0018 * (seed % 2 === 0 ? 1 : -1) + seed * 0.04
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.005 + seed)
  const breathe = 0.94 + 0.06 * Math.sin(t * 0.003 + seed)

  ctx.save()
  ctx.translate(x, y)

  // 1. ソフトハロー (大きめ)
  ctx.globalAlpha = 0.1
  ctx.fillStyle = tokenRgba("memory", 0.72)
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.05 * breathe, 0, TAU)
  ctx.fill()

  // 2. 外周リング (円アウトライン)
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = tokenRgba("memory", 0.92)
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.18, 0, TAU)
  ctx.stroke()

  // 3. 内側リング (薄く)
  ctx.globalAlpha = 0.32
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, TAU)
  ctx.stroke()

  // 4. 中心の小三角 (回転、丸+三角の対比)
  ctx.rotate(rot)
  ctx.globalAlpha = 0.78
  ctx.strokeStyle = tokenRgba("text", 0.92)
  ctx.lineWidth = 0.9
  const triR = r * 0.46
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const a = (TAU / 3) * i - Math.PI / 2
    const px = Math.cos(a) * triR
    const py = Math.sin(a) * triR
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()

  // 5. 中心コア
  ctx.globalAlpha = 0.95
  ctx.fillStyle = tokenRgba("text", 0.96)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

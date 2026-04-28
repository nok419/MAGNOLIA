import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import type { BattleProjectile } from "./types"

/* ── Variant 3: シグナル・シャード (角片の発散) ──
   以前の花形表現は廃止し、制御境界が砕けたような角片へ置き換えます。 ── */
export function drawSignalShardProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const dir = seed % 2 === 0 ? 1 : -1
  const rot = t * 0.0022 * dir + seed * 0.08
  const pulse = 0.82 + 0.18 * Math.sin(t * 0.008 + seed)
  const haloScale = 0.92 + 0.08 * Math.sin(t * 0.004 + seed)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  ctx.globalAlpha = 0.07 + 0.03 * pulse
  ctx.fillStyle = tokenRgba("memory", 0.68)
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.1 * haloScale, 0, TAU)
  ctx.fill()

  for (let index = 0; index < 4; index++) {
    const angle = (TAU / 4) * index
    ctx.save()
    ctx.rotate(angle)

    ctx.globalAlpha = 0.22 + (index % 2) * 0.06
    ctx.fillStyle = tokenRgba("memory", 0.76)
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.35)
    ctx.lineTo(r * 0.42, -r * 0.24)
    ctx.lineTo(0, r * 0.2)
    ctx.lineTo(-r * 0.42, -r * 0.24)
    ctx.closePath()
    ctx.fill()

    ctx.globalAlpha = 0.44
    ctx.strokeStyle = tokenRgba("memory", 0.84)
    ctx.lineWidth = 0.65
    ctx.stroke()
    ctx.restore()
  }

  ctx.globalAlpha = 0.22
  ctx.strokeStyle = tokenRgba("memory", 0.82)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.92, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.86
  ctx.fillStyle = tokenRgba("text", 0.95)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.22 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.16
  ctx.strokeStyle = tokenRgba("text", 0.88)
  ctx.lineWidth = 0.4
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (TAU / 4) * i
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)
    ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5)
  }
  ctx.stroke()

  ctx.restore()
  ctx.globalAlpha = 1
}

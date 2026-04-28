import { hashString } from "@/app/visual-seed"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import type { BattleProjectile } from "./types"

/* ── Variant 1: ノイズ・オーブ (軌道リング + 周回粒子 + 十字スパークル) ──
   エネルギーを放射するノイズ粒子。原子/軌道モチーフ。
   gradient 不使用で高速描画を維持。                                    ── */
export function drawNoiseOrbProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const dir = seed % 2 === 0 ? 1 : -1

  const breathe = 0.88 + 0.12 * Math.sin(t * 0.004 + seed)
  const pulse = 0.8 + 0.2 * Math.sin(t * 0.01 + seed)
  const rot = t * 0.0025 * dir + seed * 0.1

  ctx.save()

  // 1. 呼吸するハロー (有機的な拡縮)
  ctx.globalAlpha = 0.07 + 0.04 * breathe
  ctx.fillStyle = tokenRgba("memory", 0.68)
  ctx.beginPath()
  ctx.arc(x, y, r * 2.0 * breathe, 0, TAU)
  ctx.fill()

  // 2. 回転する軌道アーク (生命感・エネルギー放射)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = tokenRgba("memory", 0.78)
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(x, y, r * 1.2, rot, rot + Math.PI * 1.3)
  ctx.stroke()

  // 3. 十字スパークル (放射する光の十字, 1パスで描画)
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = tokenRgba("text", 0.9)
  ctx.lineWidth = 0.5
  const crossRot = rot * 0.6
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = crossRot + (TAU / 4) * i
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    ctx.moveTo(x + ca * r * 0.25, y + sa * r * 0.25)
    ctx.lineTo(x + ca * r * 1.4, y + sa * r * 1.4)
  }
  ctx.stroke()

  // 4. コロナリング (コア外縁の薄いストローク)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = tokenRgba("memory", 0.82)
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(x, y, r * 0.78, 0, TAU)
  ctx.stroke()

  // 5. コア本体
  ctx.globalAlpha = 0.5
  ctx.fillStyle = tokenRgba("memory", 0.76)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.6, 0, TAU)
  ctx.fill()

  // 6. 周回する微小粒子 (3個, 電子の軌道のように, 1パスで描画)
  ctx.globalAlpha = 0.45
  ctx.fillStyle = tokenRgba("memory", 0.84)
  const moteR = r * 0.07
  const moteOrbit = r * 0.5
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const ma = rot * 1.6 + (TAU / 3) * i
    const mx = x + Math.cos(ma) * moteOrbit
    const my = y + Math.sin(ma) * moteOrbit
    ctx.moveTo(mx + moteR, my)
    ctx.arc(mx, my, moteR, 0, TAU)
  }
  ctx.fill()

  // 7. 白熱する中心核 (パルス)
  ctx.globalAlpha = 0.9
  ctx.fillStyle = tokenRgba("text", 0.96)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

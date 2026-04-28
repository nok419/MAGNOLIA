import type { BattleRenderState } from "@magnolia/game-session"
import { tokenRgba } from "@/app/visual-tokens"
import { hashString } from "@/app/visual-seed"
import { TAU } from "./battle-canvas"

const FRAGMENT_EJECTION_DURATION_MS = 420

export function drawBattlePickup(
  ctx: CanvasRenderingContext2D,
  pickup: { position: { x: number; y: number }; radius: number; amount: number },
  t: number,
) {
  const { x, y } = pickup.position
  const r = pickup.radius
  const pulse = 0.7 + Math.sin(t * 0.008) * 0.2

  ctx.save()
  ctx.shadowColor = tokenRgba("signal", 0.55)
  ctx.shadowBlur = 12

  ctx.globalAlpha = 0.16 * pulse
  ctx.fillStyle = tokenRgba("signal", 1)
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.9
  ctx.strokeStyle = tokenRgba("signalBright", 1)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.65, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.65, y)
  ctx.closePath()
  ctx.stroke()

  ctx.fillStyle = tokenRgba("signalBright", 1)
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.fillText(`+${pickup.amount}`, x, y - r - 6)
  ctx.restore()
}

export function drawBattleFragment(
  ctx: CanvasRenderingContext2D,
  fragment: BattleRenderState["fragments"][number],
  t: number,
  reduceFlashing: boolean,
) {
  // 被弾由来の破片は最終位置だけを描くと自然発生に見えるため、
  // session が渡す自機位置から外側へ移動する描画位置を作ります。
  const ejectionProgress = clamp01((t - fragment.spawnedAtMs) / FRAGMENT_EJECTION_DURATION_MS)
  const ejectionEase = easeOutCubic(ejectionProgress)
  const x = lerp(fragment.originX, fragment.x, ejectionEase)
  const y = lerp(fragment.originY, fragment.y, ejectionEase)
  const lifeMs = Math.max(0, fragment.expiresAtMs - t)
  const fade = Math.min(1, lifeMs / 700)
  const pulse = reduceFlashing ? 0.86 : 0.78 + Math.sin(t * 0.011 + fragment.x * 0.03) * 0.18
  const size = 8 + fragment.strength * 4

  ctx.save()
  if (ejectionProgress < 1) {
    const trailAlpha = (1 - ejectionProgress) * 0.34 * fade
    ctx.globalAlpha = trailAlpha
    ctx.strokeStyle = tokenRgba("signalBright", 0.74)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(fragment.originX, fragment.originY)
    ctx.lineTo(x, y)
    ctx.stroke()

    ctx.globalAlpha = trailAlpha * 0.58
    ctx.strokeStyle = tokenRgba("signal", 0.58)
    ctx.lineWidth = 0.65
    ctx.beginPath()
    ctx.moveTo(lerp(fragment.originX, x, 0.36), lerp(fragment.originY, y, 0.36))
    ctx.lineTo(lerp(fragment.originX, x, 0.84), lerp(fragment.originY, y, 0.84))
    ctx.stroke()
  }

  ctx.translate(x, y)
  ctx.rotate((hashString(fragment.fragmentId) % 360) * (Math.PI / 180))
  ctx.shadowColor = tokenRgba("signal", 0.74)
  ctx.shadowBlur = 14 * pulse

  ctx.globalAlpha = 0.16 * fade
  ctx.fillStyle = tokenRgba("signal", 0.72)
  drawDiamondPath(ctx, 0, 0, size * 2.2)
  ctx.fill()

  ctx.globalAlpha = 0.88 * fade
  ctx.strokeStyle = tokenRgba("signalBright", 0.94)
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
  ctx.strokeStyle = tokenRgba("text", 0.62)
  ctx.lineWidth = 0.65
  ctx.beginPath()
  ctx.moveTo(-size * 0.42, -size * 0.24)
  ctx.lineTo(size * 0.44, size * 0.2)
  ctx.moveTo(-size * 0.2, size * 0.46)
  ctx.lineTo(size * 0.24, -size * 0.54)
  ctx.stroke()

  ctx.rotate(-((hashString(fragment.fragmentId) % 360) * (Math.PI / 180)))
  ctx.globalAlpha = 0.72 * fade
  ctx.shadowColor = tokenRgba("signal", 0.46)
  ctx.shadowBlur = 5
  ctx.fillStyle = tokenRgba("signalBright", 0.86)
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("▧", 0, 0)

  ctx.globalAlpha = 0.22 * fade
  ctx.shadowBlur = 0
  ctx.strokeStyle = tokenRgba("signal", 0.52)
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

import type { BattleRenderState } from "@magnolia/game-session"
import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "./battle-canvas"
import { PHI_INV } from "./battle-math"

/* ============================================================
   BARRIER GAUGE — circular arc around player
   ============================================================ */
export function drawBarrierGauge(ctx: CanvasRenderingContext2D, state: BattleRenderState) {
  const player = state.player
  const { x, y } = player.position
  const gaugeRadius = 28

  // barrier active -> cyan arc shrinks with remaining
  if (player.barrierState?.active && player.barrierState.maxMs > 0) {
    const ratio = Math.max(0, player.barrierState.remainingMs / player.barrierState.maxMs)
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + TAU * ratio
    const t = state.elapsedMs
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.006)

    ctx.save()

    // ── 1. 広域ブルーグロー (深い青の拡散光) ──
    ctx.shadowColor = tokenRgba("signal", 0.8)
    ctx.shadowBlur = 28 * breathe
    ctx.globalAlpha = 0.08 + 0.04 * breathe
    ctx.fillStyle = tokenRgba("signal", 1)
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 14, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0

    // ── 2. シアン主アーク (残量ゲージ) ──
    ctx.globalAlpha = 1
    ctx.shadowColor = tokenRgba("signal", 0.9)
    ctx.shadowBlur = 16
    ctx.strokeStyle = tokenRgba("signalBright", 0.9)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    // ── 3. 背景トラック ──
    ctx.shadowBlur = 0
    ctx.strokeStyle = tokenRgba("signalBright", 0.1)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // ── 4. シールドフィル (呼吸するシアンの薄膜) ──
    const shieldAlpha = 0.06 + 0.04 * Math.sin(t * 0.008)
    ctx.fillStyle = tokenRgba("signal", shieldAlpha)
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 4, 0, TAU)
    ctx.fill()

    // ── 5. 内側ヘキサゴングリッド (エネルギーフィールドの構造) ──
    ctx.globalAlpha = 0.12 * breathe
    ctx.strokeStyle = tokenRgba("line", 0.5)
    ctx.lineWidth = 0.4
    const hexRot = t * 0.0008
    for (let ring = 0; ring < 2; ring++) {
      const hexR = gaugeRadius * (0.45 + ring * 0.3)
      const sides = 6
      ctx.beginPath()
      for (let i = 0; i <= sides; i++) {
        const a = hexRot + (TAU / sides) * i
        const hx = x + Math.cos(a) * hexR
        const hy = y + Math.sin(a) * hexR
        if (i === 0) ctx.moveTo(hx, hy)
        else ctx.lineTo(hx, hy)
      }
      ctx.stroke()
    }

    // ── 6. パルスリング (二重展開) ──
    ctx.globalAlpha = 1
    for (let pr = 0; pr < 2; pr++) {
      const pulsePhase = ((t + pr * 600) % 1400) / 1400
      const pulseR = gaugeRadius + 4 + pulsePhase * 22
      const pulseAlpha = 0.35 * (1 - pulsePhase)
      ctx.strokeStyle = tokenRgba("signal", pulseAlpha)
      ctx.lineWidth = 1.2 - pulsePhase * 0.4
      ctx.beginPath()
      ctx.arc(x, y, pulseR, 0, TAU)
      ctx.stroke()
    }

    // ── 7. 軌道パーティクル (6個, 逆回転ペア) ──
    ctx.fillStyle = tokenRgba("line", 0.75)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const dir = i < 3 ? 1 : -1
      const speed = 0.004 + (i % 3) * 0.0008
      const orbitAngle = t * speed * dir + (TAU / 3) * (i % 3)
      const orbitR = gaugeRadius + 2 + (i < 3 ? 0 : 4)
      const px = x + Math.cos(orbitAngle) * orbitR
      const py = y + Math.sin(orbitAngle) * orbitR
      ctx.moveTo(px + 1.3, py)
      ctx.arc(px, py, 1.3, 0, TAU)
    }
    ctx.fill()

    // ── 8. アーク先端のブルースパーク ──
    if (ratio > 0.05) {
      const tipX = x + Math.cos(endAngle) * gaugeRadius
      const tipY = y + Math.sin(endAngle) * gaugeRadius
      ctx.shadowColor = tokenRgba("line", 1)
      ctx.shadowBlur = 12
      ctx.fillStyle = tokenRgba("signalBright", 0.9)
      ctx.beginPath()
      ctx.arc(tipX, tipY, 2.2 * breathe, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.restore()
    return
  }

  // sub cooldown active -> dark arc with progress
  if (player.subCooldownMs > 0 && player.subMaxCooldownMs > 0) {
    const ratio = 1 - player.subCooldownMs / player.subMaxCooldownMs
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + TAU * ratio

    ctx.save()
    // track
    ctx.strokeStyle = tokenRgba("textSecondary", 0.2)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // progress
    ctx.strokeStyle = ratio > 0.95 ? tokenRgba("signalBright", 0.7) : tokenRgba("textSecondary", 0.5)
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    if (ratio > 0.95) {
      ctx.shadowColor = tokenRgba("signalBright", 0.5)
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/* ============================================================
   SUPPORT FIELD
   ============================================================ */
export function drawSupportField(
  ctx: CanvasRenderingContext2D,
  field: {
    fieldId: string
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  if (field.fieldId === "field.silent_wave") {
    drawSilentWaveField(ctx, field, t)
    return
  }

  const { x, y } = field.position
  const r = field.radius
  const fieldRole = field.blocksMagneticDisaster ? "signalBright" : "signal"

  ctx.save()
  ctx.shadowColor = tokenRgba(fieldRole, 0.72)
  ctx.shadowBlur = 8

  // outer ring
  ctx.strokeStyle = tokenRgba(fieldRole, 0.78)
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // inner spinning arc
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  const spin = t * 0.002
  ctx.beginPath()
  ctx.arc(x, y, r * PHI_INV, spin, spin + Math.PI * 1.2)
  ctx.stroke()

  ctx.restore()
}

function drawSilentWaveField(
  ctx: CanvasRenderingContext2D,
  field: {
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  const { x, y } = field.position
  const r = field.radius
  const pulse = 0.9 + Math.sin(t * 0.003) * 0.06

  ctx.save()
  ctx.shadowColor = tokenRgba("signalBright", 0.9)
  ctx.shadowBlur = 18

  ctx.globalAlpha = 0.11
  ctx.fillStyle = tokenRgba("signal", 1)
  ctx.beginPath()
  ctx.arc(x, y, r * 1.08 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.48
  ctx.strokeStyle = tokenRgba("signalBright", 0.88)
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.28
  ctx.lineWidth = 1
  const spin = t * 0.0014
  ctx.beginPath()
  ctx.arc(x, y, r * 0.58, spin, spin + Math.PI * 1.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.82, -spin * 1.2, -spin * 1.2 + Math.PI * 0.9)
  ctx.stroke()

  ctx.globalAlpha = 0.2
  ctx.strokeStyle = tokenRgba(field.blocksMagneticDisaster ? "signalBright" : "signal", 0.62)
  ctx.lineWidth = 0.9
  for (let band = 0; band < 4; band += 1) {
    const offset = ((t * 0.08 + band * r * 0.55) % (r * 2)) - r
    ctx.beginPath()
    ctx.moveTo(x - r * 0.72, y + offset)
    ctx.quadraticCurveTo(x, y + offset - 8, x + r * 0.72, y + offset)
    ctx.stroke()
  }

  ctx.restore()
}

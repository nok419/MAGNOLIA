import type { BattleRenderState } from "@magnolia/game-session"
import { PHI_INV, TAU, hashString } from "./math"

export function drawBattlePickup(
  ctx: CanvasRenderingContext2D,
  pickup: { position: { x: number; y: number }; radius: number; amount: number },
  t: number,
) {
  const { x, y } = pickup.position
  const r = pickup.radius
  const pulse = 0.7 + Math.sin(t * 0.008) * 0.2

  ctx.save()
  ctx.shadowColor = "rgba(93, 164, 209, 0.55)"
  ctx.shadowBlur = 12

  ctx.globalAlpha = 0.16 * pulse
  ctx.fillStyle = "#5da4d1"
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#d8f1ff"
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.65, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.65, y)
  ctx.closePath()
  ctx.stroke()

  ctx.fillStyle = "#d8f1ff"
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
  const x = fragment.x
  const y = fragment.y
  const lifeMs = Math.max(0, fragment.expiresAtMs - t)
  const fade = Math.min(1, lifeMs / 700)
  const pulse = reduceFlashing ? 0.86 : 0.78 + Math.sin(t * 0.011 + fragment.x * 0.03) * 0.18
  const size = 8 + fragment.strength * 4

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((hashString(fragment.fragmentId) % 360) * (Math.PI / 180))
  ctx.shadowColor = "rgba(93, 164, 209, 0.64)"
  ctx.shadowBlur = 12 * pulse

  ctx.globalAlpha = 0.16 * fade
  ctx.fillStyle = "rgba(93, 164, 209, 0.76)"
  drawDiamondPath(ctx, 0, 0, size * 2.2)
  ctx.fill()

  ctx.globalAlpha = 0.88 * fade
  ctx.strokeStyle = "rgba(226, 248, 255, 0.94)"
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
  ctx.strokeStyle = "rgba(168, 220, 255, 0.66)"
  ctx.lineWidth = 0.65
  ctx.beginPath()
  ctx.moveTo(-size * 0.42, -size * 0.24)
  ctx.lineTo(size * 0.44, size * 0.2)
  ctx.moveTo(-size * 0.2, size * 0.46)
  ctx.lineTo(size * 0.24, -size * 0.54)
  ctx.stroke()

  ctx.rotate(-((hashString(fragment.fragmentId) % 360) * (Math.PI / 180)))
  ctx.globalAlpha = 0.72 * fade
  ctx.fillStyle = "rgba(238, 252, 255, 0.86)"
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("▧", 0, 0)

  ctx.globalAlpha = 0.22 * fade
  ctx.strokeStyle = "rgba(255, 236, 190, 0.72)"
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
    ctx.shadowColor = "rgba(60, 140, 255, 0.8)"
    ctx.shadowBlur = 28 * breathe
    ctx.globalAlpha = 0.08 + 0.04 * breathe
    ctx.fillStyle = "rgba(40, 120, 255, 1)"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 14, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0

    // ── 2. シアン主アーク (残量ゲージ) ──
    ctx.globalAlpha = 1
    ctx.shadowColor = "rgba(80, 180, 255, 0.9)"
    ctx.shadowBlur = 16
    ctx.strokeStyle = "rgba(104, 220, 255, 0.9)"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    // ── 3. 背景トラック ──
    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(104, 220, 255, 0.1)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // ── 4. シールドフィル (呼吸するシアンの薄膜) ──
    const shieldAlpha = 0.06 + 0.04 * Math.sin(t * 0.008)
    ctx.fillStyle = `rgba(80, 180, 255, ${shieldAlpha})`
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 4, 0, TAU)
    ctx.fill()

    // ── 5. 内側ヘキサゴングリッド (エネルギーフィールドの構造) ──
    ctx.globalAlpha = 0.12 * breathe
    ctx.strokeStyle = "rgba(100, 200, 255, 0.5)"
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
      ctx.strokeStyle = `rgba(80, 170, 255, ${pulseAlpha})`
      ctx.lineWidth = 1.2 - pulsePhase * 0.4
      ctx.beginPath()
      ctx.arc(x, y, pulseR, 0, TAU)
      ctx.stroke()
    }

    // ── 7. 軌道パーティクル (6個, 逆回転ペア) ──
    ctx.fillStyle = "rgba(140, 220, 255, 0.75)"
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
      ctx.shadowColor = "rgba(100, 200, 255, 1)"
      ctx.shadowBlur = 12
      ctx.fillStyle = "rgba(200, 240, 255, 0.9)"
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
    ctx.strokeStyle = "rgba(90, 122, 150, 0.2)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // progress
    ctx.strokeStyle = ratio > 0.95 ? "rgba(104, 220, 255, 0.7)" : "rgba(90, 122, 150, 0.5)"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    if (ratio > 0.95) {
      ctx.shadowColor = "rgba(104, 220, 255, 0.5)"
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
    visual: BattleRenderState["supportFields"][number]["visual"]
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  if (field.visual.rendererKind === "silentWave") {
    drawSilentWaveField(ctx, field, t)
    return
  }

  const { x, y } = field.position
  const r = field.radius
  const color = field.visual.accentColor

  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 8

  // outer ring
  ctx.strokeStyle = color
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
    visual: BattleRenderState["supportFields"][number]["visual"]
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
  ctx.shadowColor = field.visual.glowColor
  ctx.shadowBlur = 18

  ctx.globalAlpha = 0.11
  ctx.fillStyle = "rgba(116, 240, 255, 1)"
  ctx.beginPath()
  ctx.arc(x, y, r * 1.08 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.48
  ctx.strokeStyle = "rgba(196, 249, 255, 0.88)"
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
  ctx.strokeStyle = field.blocksMagneticDisaster
    ? "rgba(116, 240, 255, 0.62)"
    : "rgba(156, 224, 111, 0.62)"
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

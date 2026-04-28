import { tokenRgba } from "@/app/visual-tokens"
import { TAU } from "../battle-canvas"
import { clamp01, easeInOutCubic, normalizeCanvasVector } from "../battle-math"
import type { BattleProjectile } from "./types"

export function drawDefaultPlayerProjectile(ctx: CanvasRenderingContext2D, p: BattleProjectile) {
  const { x, y } = p.position
  const length = p.radius * 4
  const width = p.radius * 0.7

  ctx.save()

  // Outer aura
  ctx.shadowColor = tokenRgba("signal", 0.9)
  ctx.shadowBlur = 8

  // fading tail
  const tailGrad = ctx.createLinearGradient(x, y - length * 0.3, x, y + length * 1.5)
  tailGrad.addColorStop(0, tokenRgba("text", 1))
  tailGrad.addColorStop(0.3, tokenRgba("signal", 0.6))
  tailGrad.addColorStop(1, tokenRgba("signal", 0))
  ctx.fillStyle = tailGrad
  ctx.fillRect(x - width * 0.5, y, width, length * 1.5)

  // Lance Core (sharp shape)
  ctx.fillStyle = tokenRgba("text", 1)
  ctx.beginPath()
  ctx.moveTo(x, y - length * 0.6) // Pointy tip
  ctx.lineTo(x + width * 0.6, y)
  ctx.lineTo(x, y + length * 0.4)
  ctx.lineTo(x - width * 0.6, y)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

export function drawPulseMelee(ctx: CanvasRenderingContext2D, p: BattleProjectile, t: number) {
  const { x, y } = p.position
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const angle = Math.atan2(direction.y, direction.x)
  const rawProgress = clamp01(p.progress ?? 0)
  const swingPhase = clamp01((rawProgress - 0.08) / 0.74)
  const progress = easeInOutCubic(swingPhase)
  const fadeIn = clamp01(rawProgress / 0.12)
  const fadeOut = clamp01((1 - rawProgress) / 0.26)
  const alpha = Math.min(fadeIn, fadeOut)
  if (alpha <= 0.01) {
    return
  }

  const sweepSpan = ((p.meleeSweep?.arcDeg ?? 120) * Math.PI) / 180
  const bladeAngle = angle - sweepSpan * 0.5 + sweepSpan * progress
  const bladeLength = p.radius * 1.28
  const bladeStart = Math.max(12, p.radius * 0.13)
  const bladeWidth = Math.max(7.4, p.radius * 0.105)
  const impactPulse = Math.sin(Math.PI * swingPhase)
  const surfacePulse = 0.9 + Math.sin(t * 0.008) * 0.06
  const grip = {
    x: x - Math.cos(bladeAngle) * Math.max(15, p.radius * 0.22),
    y: y - Math.sin(bladeAngle) * Math.max(15, p.radius * 0.22),
  }
  const blade = buildPulseMeleeBladeGeometry(
    x,
    y,
    bladeAngle,
    bladeStart,
    bladeLength,
    bladeWidth * (1 + impactPulse * 0.22),
  )

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = tokenRgba("signal", 0.9)
  ctx.shadowBlur = 17
  ctx.globalCompositeOperation = "lighter"

  // 判定は前方範囲のまま、見た目は太い一枚刃を遅く振り抜く表現へ寄せます。
  drawPulseMeleeWake(ctx, x, y, angle - sweepSpan * 0.5, bladeAngle, bladeLength, alpha, progress)
  drawPulseMeleeAfterImages(
    ctx,
    x,
    y,
    angle,
    sweepSpan,
    swingPhase,
    bladeStart,
    bladeLength,
    bladeWidth,
    alpha,
  )

  const bladeGradient = ctx.createLinearGradient(blade.start.x, blade.start.y, blade.tip.x, blade.tip.y)
  bladeGradient.addColorStop(0, tokenRgba("signal", 0.1))
  bladeGradient.addColorStop(0.28, tokenRgba("line", 0.64 * surfacePulse))
  bladeGradient.addColorStop(0.72, tokenRgba("signalBright", 0.98))
  bladeGradient.addColorStop(1, tokenRgba("text", 1))
  ctx.fillStyle = bladeGradient
  tracePulseMeleeBlade(ctx, blade)
  ctx.fill()

  drawPulseMeleeGlitchTrail(ctx, x, y, bladeAngle, bladeLength, alpha, t)

  ctx.shadowBlur = 10
  ctx.strokeStyle = tokenRgba("text", 0.94 * alpha)
  ctx.lineWidth = Math.max(2.6, bladeWidth * 0.42)
  ctx.beginPath()
  ctx.moveTo(grip.x, grip.y)
  ctx.quadraticCurveTo(
    x + Math.cos(bladeAngle) * p.radius * 0.42,
    y + Math.sin(bladeAngle) * p.radius * 0.42,
    blade.tip.x,
    blade.tip.y,
  )
  ctx.stroke()

  ctx.shadowBlur = 18
  ctx.fillStyle = tokenRgba("text", 0.74 * alpha)
  ctx.beginPath()
  ctx.arc(blade.tip.x, blade.tip.y, Math.max(3.4, p.radius * 0.052), 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 7
  ctx.strokeStyle = tokenRgba("line", 0.3 * alpha)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(
    x + Math.cos(angle - sweepSpan * 0.5) * p.radius * 0.28,
    y + Math.sin(angle - sweepSpan * 0.5) * p.radius * 0.28,
  )
  ctx.lineTo(
    x + Math.cos(angle - sweepSpan * 0.5) * p.radius * 0.48,
    y + Math.sin(angle - sweepSpan * 0.5) * p.radius * 0.48,
  )
  ctx.moveTo(
    x + Math.cos(angle + sweepSpan * 0.5) * p.radius * 0.28,
    y + Math.sin(angle + sweepSpan * 0.5) * p.radius * 0.28,
  )
  ctx.lineTo(
    x + Math.cos(angle + sweepSpan * 0.5) * p.radius * 0.48,
    y + Math.sin(angle + sweepSpan * 0.5) * p.radius * 0.48,
  )
  ctx.stroke()
  ctx.restore()
}

type PulseMeleeBladeGeometry = {
  start: { x: number; y: number }
  mid: { x: number; y: number }
  tip: { x: number; y: number }
  normal: { x: number; y: number }
  width: number
  tipWidth: number
}

function buildPulseMeleeBladeGeometry(
  x: number,
  y: number,
  angle: number,
  startDistance: number,
  bladeLength: number,
  bladeWidth: number,
): PulseMeleeBladeGeometry {
  return {
    start: {
      x: x + Math.cos(angle) * startDistance,
      y: y + Math.sin(angle) * startDistance,
    },
    mid: {
      x: x + Math.cos(angle) * ((startDistance + bladeLength) * 0.58),
      y: y + Math.sin(angle) * ((startDistance + bladeLength) * 0.58),
    },
    tip: {
      x: x + Math.cos(angle) * bladeLength,
      y: y + Math.sin(angle) * bladeLength,
    },
    normal: { x: -Math.sin(angle), y: Math.cos(angle) },
    width: bladeWidth,
    tipWidth: Math.max(1.8, bladeWidth * 0.3),
  }
}

function tracePulseMeleeBlade(
  ctx: CanvasRenderingContext2D,
  blade: PulseMeleeBladeGeometry,
): void {
  const n = blade.normal
  ctx.beginPath()
  ctx.moveTo(blade.start.x + n.x * blade.width, blade.start.y + n.y * blade.width)
  ctx.quadraticCurveTo(
    blade.mid.x + n.x * blade.width * 1.08,
    blade.mid.y + n.y * blade.width * 1.08,
    blade.tip.x + n.x * blade.tipWidth,
    blade.tip.y + n.y * blade.tipWidth,
  )
  ctx.lineTo(blade.tip.x - n.x * blade.tipWidth, blade.tip.y - n.y * blade.tipWidth)
  ctx.quadraticCurveTo(
    blade.mid.x - n.x * blade.width * 0.86,
    blade.mid.y - n.y * blade.width * 0.86,
    blade.start.x - n.x * blade.width,
    blade.start.y - n.y * blade.width,
  )
  ctx.closePath()
}

function drawPulseMeleeWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  startAngle: number,
  bladeAngle: number,
  bladeLength: number,
  alpha: number,
  progress: number,
): void {
  const wakeAlpha = alpha * (0.36 + 0.22 * (1 - progress))
  for (let layer = 0; layer < 3; layer += 1) {
    const layerAlpha = wakeAlpha * (1 - layer * 0.28)
    ctx.strokeStyle = tokenRgba("signal", layerAlpha)
    ctx.lineWidth = 20 - layer * 5.2
    ctx.beginPath()
    ctx.arc(x, y, bladeLength * (0.78 - layer * 0.08), startAngle, bladeAngle)
    ctx.stroke()
  }
}

function drawPulseMeleeAfterImages(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseAngle: number,
  sweepSpan: number,
  swingPhase: number,
  bladeStart: number,
  bladeLength: number,
  bladeWidth: number,
  alpha: number,
): void {
  // 残像は刃そのものの過去位置を薄く残し、単なる円弧に戻らないようにします。
  for (let index = 6; index >= 1; index -= 1) {
    const ghostPhase = clamp01(swingPhase - index * 0.055)
    if (ghostPhase <= 0) {
      continue
    }
    const ghostProgress = easeInOutCubic(ghostPhase)
    const ghostAngle = baseAngle - sweepSpan * 0.5 + sweepSpan * ghostProgress
    const ghostBlade = buildPulseMeleeBladeGeometry(
      x,
      y,
      ghostAngle,
      bladeStart,
      bladeLength * (0.98 - index * 0.018),
      bladeWidth * (0.74 - index * 0.055),
    )
    const ageFade = Math.pow(1 - index / 7, 1.9)
    ctx.fillStyle = tokenRgba("signal", alpha * 0.18 * ageFade)
    tracePulseMeleeBlade(ctx, ghostBlade)
    ctx.fill()
  }
}

function drawPulseMeleeGlitchTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bladeAngle: number,
  bladeLength: number,
  alpha: number,
  timeMs: number,
): void {
  const normal = { x: -Math.sin(bladeAngle), y: Math.cos(bladeAngle) }
  const forward = { x: Math.cos(bladeAngle), y: Math.sin(bladeAngle) }

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = tokenRgba("signalBright", 0.12 * alpha)
  ctx.lineWidth = 0.8
  for (let i = 0; i < 4; i++) {
    const phase = (i + 1) / 5
    const jitter = Math.sin(timeMs * 0.024 + i * 2.13) * 3.2
    const cx = x + forward.x * bladeLength * (0.34 + phase * 0.52) + normal.x * jitter
    const cy = y + forward.y * bladeLength * (0.34 + phase * 0.52) + normal.y * jitter
    ctx.beginPath()
    ctx.moveTo(cx - normal.x * 7, cy - normal.y * 7)
    ctx.lineTo(cx + normal.x * (7 + i * 1.6), cy + normal.y * (7 + i * 1.6))
    ctx.stroke()
  }
  ctx.restore()
}

import type { BattleRenderState, ProjectileRenderState } from "@magnolia/game-session"
import type { ProjectileContentVisualPreset } from "@magnolia/contracts"
import {
  PHI_INV,
  TAU,
  clamp01,
  easeInOutCubic,
  hashString,
  normalizeCanvasVector,
  resolveBattleRenderer,
} from "@/render/battle/battle-renderer-utils"
import type { CanvasPaletteRole } from "@/render/shared/canvas-palette"
import { gradientStop, hex, rgba } from "@/render/shared/canvas-palette"
import { readCachedCanvasPath } from "@/render/shared/canvas-path-cache"

export type BattleProjectileRenderEffect = "inversePhase" | "inversePhaseAura" | "meleeSweep"

type ProjectileRendererInput = {
  projectile: ProjectileRenderState
  timeMs: number
  renderState: BattleRenderState
  renderOptions: BattleProjectileRenderOptions
}

type BattleProjectileRenderOptions = {
  reduceFlashing: boolean
  lowFrameRateMode: boolean
}

const BATTLE_PLAYER_PROJECTILE_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: ProjectileRendererInput) => void
> = {
  carrier: (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  lance: (ctx, input) => drawPulseMelee(ctx, input.projectile, input.timeMs),
  pulse: (ctx, input) => {
    // pulse renderer は preset.radiusScale が大きい場合に carrier blast 形状へ振ります。
    if ((input.projectile.visual.radiusScale ?? 1) > 1.1) {
      drawCarrierBlast(ctx, input.projectile, input.timeMs)
      return
    }
    drawDefaultPlayerProjectile(ctx, input.projectile)
  },
  default: (ctx, input) => drawDefaultPlayerProjectile(ctx, input.projectile),
}

const BATTLE_ENEMY_PROJECTILE_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: ProjectileRendererInput) => void
> = {
  orb: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
  lance: (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  pulse: (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  shard: (ctx, input) => {
    // trailKind が brokenSignal の preset は鋭い菱形派生に振ります。
    if (input.projectile.visual.trailKind === "brokenSignal") {
      drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs, input.renderOptions)
      return
    }
    drawSignalShardProjectile(ctx, input.projectile, input.timeMs, input.renderOptions)
  },
  default: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
}

export function drawPlayerProjectile(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
  renderState: BattleRenderState,
  renderOptions: BattleProjectileRenderOptions,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_PROJECTILE_RENDERERS,
    p.visual.rendererKind,
    { category: "projectile", presetId: p.visualPresetId },
  )
  const renderEffects = p.renderEffects ?? (p.inversePhaseVisual ? ["inversePhase"] : [])
  if (renderEffects.includes("inversePhaseAura")) {
    drawInversePhaseProjectileAura(ctx, p, t)
  }
  drawProjectileTrailHint(ctx, p, renderOptions)
  renderer(ctx, { projectile: p, timeMs: t, renderState, renderOptions })
}

function drawDefaultPlayerProjectile(ctx: CanvasRenderingContext2D, p: ProjectileRenderState) {
  const role = readProjectileRole(p, "playerSignal")
  const glow = readGlowIntensity(p.visual, 0.5)
  const { x, y } = p.position
  const length = p.radius * 4
  const width = p.radius * 0.7

  ctx.save()
  ctx.shadowColor = rgba(role, 0.4 + glow * 0.45)
  ctx.shadowBlur = 4 + glow * 8

  const tailGrad = ctx.createLinearGradient(x, y - length * 0.3, x, y + length * 1.5)
  tailGrad.addColorStop(0, gradientStop("signalReadable", 0.95))
  tailGrad.addColorStop(0.3, gradientStop(role, 0.55))
  tailGrad.addColorStop(1, gradientStop(role, 0))
  ctx.fillStyle = tailGrad
  ctx.fillRect(x - width * 0.5, y, width, length * 1.5)

  ctx.fillStyle = hex("signalReadable")
  ctx.beginPath()
  ctx.moveTo(x, y - length * 0.6)
  ctx.lineTo(x + width * 0.6, y)
  ctx.lineTo(x, y + length * 0.4)
  ctx.lineTo(x - width * 0.6, y)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawInversePhaseProjectileAura(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
) {
  const role = readProjectileRole(p, "playerSignal")
  const { x, y } = p.position
  const seed = hashString(p.projectileInstanceId)
  const glitch = Math.sin(t * 0.018 + seed) * 1.4

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgba(role, 0.26)
  ctx.shadowColor = rgba(role, 0.38)
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.ellipse(x + glitch, y - glitch * 0.35, p.radius * 1.45, p.radius * 2.15, 0, 0, TAU)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = rgba("signalSecondary", 0.28)
  for (let i = 0; i < 3; i++) {
    const yy = y + (i - 1) * p.radius * 0.72 + Math.sin(t * 0.012 + seed + i) * 1.2
    ctx.beginPath()
    ctx.moveTo(x - p.radius * (1.4 + i * 0.16), yy)
    ctx.lineTo(x + p.radius * (1.2 - i * 0.1), yy + glitch * 0.35)
    ctx.stroke()
  }
  ctx.restore()
}

function drawCarrierProjectile(ctx: CanvasRenderingContext2D, p: ProjectileRenderState) {
  const role = readProjectileRole(p, "playerSignal")
  const glow = readGlowIntensity(p.visual, 0.58)
  const radiusScale = p.visual.radiusScale ?? 1
  const { x, y } = p.position
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const tailLength = p.radius * 8.5 * radiusScale
  const halfWidth = Math.max(1.6, p.radius * 0.48)
  const tailX = x - direction.x * tailLength
  const tailY = y - direction.y * tailLength
  const normal = { x: -direction.y, y: direction.x }

  ctx.save()
  ctx.shadowColor = rgba(role, 0.5 + glow * 0.4)
  ctx.shadowBlur = 8 + glow * 10

  const beamGradient = ctx.createLinearGradient(tailX, tailY, x, y)
  beamGradient.addColorStop(0, gradientStop(role, 0))
  beamGradient.addColorStop(0.35, gradientStop(role, 0.36))
  beamGradient.addColorStop(0.78, gradientStop("signalReadable", 0.9))
  beamGradient.addColorStop(1, gradientStop("signalReadable", 1))
  ctx.fillStyle = beamGradient
  ctx.beginPath()
  ctx.moveTo(tailX + normal.x * halfWidth, tailY + normal.y * halfWidth)
  ctx.lineTo(x + normal.x * (halfWidth * 0.35), y + normal.y * (halfWidth * 0.35))
  ctx.lineTo(x - normal.x * (halfWidth * 0.35), y - normal.y * (halfWidth * 0.35))
  ctx.lineTo(tailX - normal.x * halfWidth, tailY - normal.y * halfWidth)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = rgba("signalReadable", 0.92)
  ctx.lineWidth = Math.max(1, halfWidth * 0.8)
  ctx.beginPath()
  ctx.moveTo(tailX, tailY)
  ctx.lineTo(x, y)
  ctx.stroke()

  ctx.restore()
}

function drawCarrierBlast(ctx: CanvasRenderingContext2D, p: ProjectileRenderState, t: number) {
  const role = readProjectileRole(p, "playerSignal")
  const glow = readGlowIntensity(p.visual, 0.5)
  const radiusScale = p.visual.radiusScale ?? 1
  const { x, y } = p.position
  const pulse = 0.84 + Math.sin(t * 0.02) * 0.08

  ctx.save()
  ctx.shadowColor = rgba(role, 0.6 + glow * 0.3)
  ctx.shadowBlur = 10 + glow * 12
  ctx.strokeStyle = rgba("signalReadable", 0.82)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x, y, p.radius * pulse * radiusScale, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = rgba(role, 0.4 + glow * 0.2)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(x, y, p.radius * 0.62 * pulse * radiusScale, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function drawPulseMelee(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
) {
  const role = readProjectileRole(p, "playerSignal")
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

  const sweepSpan = 2.08
  const bladeAngle = angle - sweepSpan * 0.5 + sweepSpan * progress
  const bladeLength = p.radius * 1.28 * (p.visual.radiusScale ?? 1)
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
  ctx.shadowColor = rgba(role, 0.6 + readGlowIntensity(p.visual, 0.62) * 0.3)
  ctx.shadowBlur = 17
  ctx.globalCompositeOperation = "lighter"

  drawPulseMeleeWake(ctx, x, y, angle - sweepSpan * 0.5, bladeAngle, bladeLength, alpha, progress, role)
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
    role,
  )

  const bladeGradient = ctx.createLinearGradient(blade.start.x, blade.start.y, blade.tip.x, blade.tip.y)
  bladeGradient.addColorStop(0, gradientStop(role, 0.1))
  bladeGradient.addColorStop(0.28, gradientStop(role, 0.64 * surfacePulse))
  bladeGradient.addColorStop(0.72, gradientStop("signalReadable", 0.98))
  bladeGradient.addColorStop(1, gradientStop("signalReadable", 1))
  ctx.fillStyle = bladeGradient
  tracePulseMeleeBlade(ctx, blade)
  ctx.fill()

  drawPulseMeleeGlitchTrail(ctx, x, y, bladeAngle, bladeLength, alpha, t, role)

  ctx.shadowBlur = 10
  ctx.strokeStyle = rgba("signalReadable", 0.94 * alpha)
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
  ctx.fillStyle = rgba("signalReadable", 0.74 * alpha)
  ctx.beginPath()
  ctx.arc(blade.tip.x, blade.tip.y, Math.max(3.4, p.radius * 0.052), 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 7
  ctx.strokeStyle = rgba(role, 0.3 * alpha)
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

function tracePulseMeleeBlade(ctx: CanvasRenderingContext2D, blade: PulseMeleeBladeGeometry): void {
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
  role: CanvasPaletteRole,
): void {
  const wakeAlpha = alpha * (0.36 + 0.22 * (1 - progress))
  for (let layer = 0; layer < 3; layer += 1) {
    const layerAlpha = wakeAlpha * (1 - layer * 0.28)
    ctx.strokeStyle = rgba(role, layerAlpha)
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
  role: CanvasPaletteRole,
): void {
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
    ctx.fillStyle = rgba(role, alpha * 0.18 * ageFade)
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
  role: CanvasPaletteRole,
): void {
  const normal = { x: -Math.sin(bladeAngle), y: Math.cos(bladeAngle) }
  const forward = { x: Math.cos(bladeAngle), y: Math.sin(bladeAngle) }

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = rgba(role, 0.12 * alpha)
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

/* ============================================================
   ENEMY PROJECTILE — Noise Particles / Signal Shards
   見た目は preset.paletteRole / glowIntensity / radiusScale / motionSmear
   / auraKind を入口にして palette role 経由で塗ります。
   ============================================================ */
export function drawEnemyProjectile(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
  renderState: BattleRenderState,
  renderOptions: BattleProjectileRenderOptions,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_PROJECTILE_RENDERERS,
    p.visual.rendererKind,
    { category: "projectile", presetId: p.visualPresetId },
  )
  drawProjectileTrailHint(ctx, p, renderOptions)
  renderer(ctx, { projectile: p, timeMs: t, renderState, renderOptions })
}

function drawProjectileTrailHint(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  renderOptions: BattleProjectileRenderOptions,
): void {
  const trailKind = p.visual.trailKind
  if (!trailKind || trailKind === "none") {
    return
  }
  const role = readProjectileRole(p, p.side === "enemy" ? "enemyNoise" : "playerSignal")
  const direction = normalizeCanvasVector(-p.velocity.x, -p.velocity.y)
  const motionSmear = clamp01(p.visual.motionSmear ?? 0.2)
  // trailKind と motionSmear で軌跡の長さ・濃さを切り替えます。
  const lengthFactor =
    trailKind === "longSignal" || trailKind === "lance"
      ? 6.5
      : trailKind === "arcSignal"
        ? 5
        : trailKind === "brokenSignal" || trailKind === "geometric"
          ? 4
          : 3
  const qualityScale = renderOptions.lowFrameRateMode ? 0.58 : 1
  const length = p.radius * lengthFactor * (0.7 + motionSmear * 1.1) * qualityScale
  const baseAlpha = (trailKind === "noise" || trailKind === "shortSignal" ? 0.16 : 0.1) * qualityScale
  ctx.save()
  ctx.strokeStyle = rgba(role, baseAlpha + motionSmear * 0.06)
  ctx.lineWidth = Math.max(1, p.radius * 0.28)
  ctx.beginPath()
  ctx.moveTo(p.position.x, p.position.y)
  ctx.lineTo(p.position.x + direction.x * length, p.position.y + direction.y * length)
  ctx.stroke()
  ctx.restore()
}

function drawNoiseOrbProjectile(ctx: CanvasRenderingContext2D, p: ProjectileRenderState, t: number) {
  const role = readProjectileRole(p, "enemyNoise")
  const glow = readGlowIntensity(p.visual, 0.45)
  const auraScale = readAuraScale(p.visual.auraKind, 1)
  const { x, y } = p.position
  const r = p.radius * (p.visual.radiusScale ?? 1)
  const seed = hashString(p.projectileInstanceId)
  const dir = seed % 2 === 0 ? 1 : -1

  const breathe = 0.88 + 0.12 * Math.sin(t * 0.004 + seed)
  const pulse = 0.8 + 0.2 * Math.sin(t * 0.01 + seed)
  const rot = t * 0.0025 * dir + seed * 0.1

  ctx.save()
  ctx.shadowColor = rgba(role, 0.18 + glow * 0.4)
  ctx.shadowBlur = glow * 8

  ctx.globalAlpha = 0.07 + 0.04 * breathe
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(x, y, r * 2.0 * breathe * auraScale, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.3
  ctx.strokeStyle = rgba(role, 0.78)
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(x, y, r * 1.2, rot, rot + Math.PI * 1.3)
  ctx.stroke()

  ctx.globalAlpha = 0.18
  ctx.strokeStyle = rgba("signalReadable", 0.45)
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

  ctx.globalAlpha = 0.3
  ctx.strokeStyle = rgba(role, 0.82)
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(x, y, r * 0.78, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.5
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.6, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.45
  ctx.fillStyle = rgba(role, 0.85)
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

  ctx.globalAlpha = 0.9
  ctx.fillStyle = rgba("signalReadable", 0.96)
  ctx.beginPath()
  ctx.arc(x, y, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function drawGeoDiamondProjectile(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
  renderOptions: BattleProjectileRenderOptions,
) {
  const role = readProjectileRole(p, "enemyNoise")
  const glow = readGlowIntensity(p.visual, 0.4)
  const auraScale = readAuraScale(p.visual.auraKind, 1)
  const { x, y } = p.position
  const r = p.radius * (p.visual.radiusScale ?? 1)
  const seed = hashString(p.projectileInstanceId)
  const rot = t * 0.003 * (seed % 2 === 0 ? 1 : -1) + seed * 0.01
  const s = r * 0.8
  const sw = s * PHI_INV
  const diamondPath = readCachedCanvasPath(
    {
      rendererKind: p.visual.rendererKind,
      visualPresetId: p.visualPresetId,
      paletteRole: role,
      shape: "projectile-diamond",
      shapeParams: [s, sw, p.visual.radiusScale ?? 1],
      reduceFlashing: renderOptions.reduceFlashing,
      lowFrameRateMode: renderOptions.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.moveTo(0, -s)
      path.lineTo(sw, 0)
      path.lineTo(0, s)
      path.lineTo(-sw, 0)
      path.closePath()
      return path
    },
  )

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.shadowColor = rgba(role, 0.24 + glow * 0.34)
  ctx.shadowBlur = glow * 6

  ctx.globalAlpha = 0.09
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.7 * auraScale, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.6
  ctx.strokeStyle = rgba(role, 0.85)
  ctx.lineWidth = 0.9
  ctx.stroke(diamondPath)

  ctx.globalAlpha = 0.12
  ctx.fillStyle = hex(role)
  ctx.fill(diamondPath)

  ctx.globalAlpha = 0.85
  ctx.fillStyle = rgba("signalReadable", 0.95)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.15, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function drawEnemyLanceProjectile(ctx: CanvasRenderingContext2D, p: ProjectileRenderState, t: number) {
  const role = readProjectileRole(p, "enemyPrototype")
  const glow = readGlowIntensity(p.visual, 0.5)
  const auraScale = readAuraScale(p.visual.auraKind, 1)
  const { x, y } = p.position
  const r = p.radius * (p.visual.radiusScale ?? 1)
  const seed = hashString(p.projectileInstanceId)
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.006 + seed)

  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = rgba(role, 0.24 + glow * 0.4)
  ctx.shadowBlur = glow * 6

  ctx.globalAlpha = 0.09 + 0.04 * pulse
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.55 * auraScale, 0, TAU)
  ctx.fill()

  ctx.rotate(angle)

  const tip = r * 1.05
  const base = r * 0.78
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = rgba(role, 0.9)
  ctx.lineWidth = 0.95
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(0, -tip)
  ctx.lineTo(base, tip * 0.55)
  ctx.lineTo(-base, tip * 0.55)
  ctx.closePath()
  ctx.stroke()

  ctx.globalAlpha = 0.16
  ctx.fillStyle = hex(role)
  ctx.fill()

  ctx.globalAlpha = 0.92
  ctx.fillStyle = rgba("signalReadable", 0.96)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function drawBossCoreProjectile(ctx: CanvasRenderingContext2D, p: ProjectileRenderState, t: number) {
  const role = readProjectileRole(p, "enemyPrototype")
  const glow = readGlowIntensity(p.visual, 0.55)
  const auraScale = readAuraScale(p.visual.auraKind, 1.05)
  const { x, y } = p.position
  const r = p.radius * (p.visual.radiusScale ?? 1.15)
  const seed = hashString(p.projectileInstanceId)
  const rot = t * 0.0018 * (seed % 2 === 0 ? 1 : -1) + seed * 0.04
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.005 + seed)
  const breathe = 0.94 + 0.06 * Math.sin(t * 0.003 + seed)

  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = rgba(role, 0.32 + glow * 0.4)
  ctx.shadowBlur = glow * 12

  ctx.globalAlpha = 0.1
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.05 * breathe * auraScale, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.6
  ctx.strokeStyle = rgba(role, 0.92)
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.18, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.32
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, TAU)
  ctx.stroke()

  ctx.rotate(rot)
  ctx.globalAlpha = 0.78
  ctx.strokeStyle = rgba("residualWarmth", 0.88)
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

  ctx.globalAlpha = 0.95
  ctx.fillStyle = rgba("signalReadable", 0.96)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function drawSignalShardProjectile(
  ctx: CanvasRenderingContext2D,
  p: ProjectileRenderState,
  t: number,
  renderOptions: BattleProjectileRenderOptions,
) {
  const role = readProjectileRole(p, "enemyNoise")
  const glow = readGlowIntensity(p.visual, 0.42)
  const auraScale = readAuraScale(p.visual.auraKind, 1)
  const { x, y } = p.position
  const r = p.radius * (p.visual.radiusScale ?? 1)
  const seed = hashString(p.projectileInstanceId)
  const dir = seed % 2 === 0 ? 1 : -1
  const rot = t * 0.0022 * dir + seed * 0.08
  const pulse = 0.82 + 0.18 * Math.sin(t * 0.008 + seed)
  const haloScale = 0.92 + 0.08 * Math.sin(t * 0.004 + seed)
  const shardPath = readCachedCanvasPath(
    {
      rendererKind: p.visual.rendererKind,
      visualPresetId: p.visualPresetId,
      paletteRole: role,
      shape: "projectile-shard",
      shapeParams: [r, p.visual.radiusScale ?? 1],
      reduceFlashing: renderOptions.reduceFlashing,
      lowFrameRateMode: renderOptions.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.moveTo(0, -r * 1.35)
      path.lineTo(r * 0.42, -r * 0.24)
      path.lineTo(0, r * 0.2)
      path.lineTo(-r * 0.42, -r * 0.24)
      path.closePath()
      return path
    },
  )

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.shadowColor = rgba(role, 0.2 + glow * 0.36)
  ctx.shadowBlur = glow * 8

  ctx.globalAlpha = 0.07 + 0.03 * pulse
  ctx.fillStyle = hex(role)
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.1 * haloScale * auraScale, 0, TAU)
  ctx.fill()

  for (let index = 0; index < 4; index++) {
    const angle = (TAU / 4) * index
    ctx.save()
    ctx.rotate(angle)

    ctx.globalAlpha = 0.22 + (index % 2) * 0.06
    ctx.fillStyle = rgba(role, 0.78)
    ctx.fill(shardPath)

    ctx.globalAlpha = 0.44
    ctx.strokeStyle = rgba(role, 0.85)
    ctx.lineWidth = 0.65
    ctx.stroke(shardPath)
    ctx.restore()
  }

  ctx.globalAlpha = 0.22
  ctx.strokeStyle = rgba(role, 0.82)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.92, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.86
  ctx.fillStyle = rgba("signalReadable", 0.95)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.22 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.16
  ctx.strokeStyle = rgba(role, 0.6)
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

function readProjectileRole(p: ProjectileRenderState, fallback: CanvasPaletteRole): CanvasPaletteRole {
  return resolvePaletteRole(p.visual.paletteRole, fallback)
}

function readGlowIntensity(visual: ProjectileContentVisualPreset, fallback: number): number {
  return clamp01(visual.glowIntensity ?? fallback)
}

function readAuraScale(auraKind: string | undefined, base: number): number {
  // auraKind は粒子のハロー幅に対応します。preset を変えるだけで雰囲気が切り替わるようにします。
  switch (auraKind) {
    case "dense":
      return base * 1.18
    case "thin":
      return base * 0.78
    case "soft":
      return base * 1.05
    case "clear":
      return base * 0.95
    default:
      return base
  }
}

const SUPPORTED_ROLES: ReadonlySet<CanvasPaletteRole> = new Set([
  "voidBase",
  "voidRaised",
  "voidDepth",
  "panel",
  "lineSubtle",
  "lineStrong",
  "signalPrimary",
  "signalPrimaryDim",
  "signalReadable",
  "signalSecondary",
  "signalMuted",
  "residualWarmth",
  "restoration",
  "threatNoise",
  "playerSignal",
  "enemyNoise",
  "enemyPrototype",
])

function resolvePaletteRole(value: string, fallback: CanvasPaletteRole): CanvasPaletteRole {
  return SUPPORTED_ROLES.has(value as CanvasPaletteRole) ? (value as CanvasPaletteRole) : fallback
}

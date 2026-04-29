import type { BattleRenderState } from "@magnolia/game-session"
import { resolveBattleRenderer } from "./registry"
import type { EnemyRendererInput } from "./types"
import { TAU, hashString } from "./math"

const BATTLE_ENEMY_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: EnemyRendererInput) => void
> = {
  orbital: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs),
  orbitalBoss: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs),
  default: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs),
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_RENDERERS,
    [enemy.visual.rendererKind, "default"],
  )
  renderer(ctx, { enemy, timeMs: t, renderState })
}

function drawCircleEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
) {
  const profile = enemy.visual
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accentColor
  const glowIntensity = 0.3 + hpRatio * 0.5

  const seed = hashString(enemy.enemyInstanceId) + profile.seedBucket
  const rotSpeed1 = profile.orbit1AngularSpeed * 0.001 + (seed % 5) * 0.00004
  const rotSpeed2 = Math.abs(profile.orbit2AngularSpeed) * 0.001 + (seed % 3) * 0.00003
  const rot1 = t * rotSpeed1
  const rot2 = t * rotSpeed2 * Math.sign(profile.orbit2AngularSpeed || -1)

  ctx.save()
  ctx.shadowColor = profile.glowColor
  ctx.shadowBlur = 6 * glowIntensity * Math.max(0.4, profile.glowStrength)

  // orbit 2 — wide arc with gap (見た目用の外周)
  const r2 = r * profile.orbit2Scale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.25 * glowIntensity
  ctx.lineWidth = Math.max(0.7, profile.orbit2Width * 0.34)
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + profile.orbit2ArcStart, rot2 + profile.orbit2ArcEnd)
  ctx.stroke()

  // diamond icon on orbit 2
  const iconAngle = rot2 + profile.iconAngle
  const ix = x + Math.cos(iconAngle) * r2
  const iy = y + Math.sin(iconAngle) * r2
  const iconSize = profile.iconSize
  ctx.globalAlpha = 0.6 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.moveTo(ix, iy - iconSize)
  ctx.lineTo(ix + iconSize, iy)
  ctx.lineTo(ix, iy + iconSize)
  ctx.lineTo(ix - iconSize, iy)
  ctx.closePath()
  ctx.fill()

  // orbit 1 — partial arc
  const r1 = r * profile.orbit1Scale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.4 * glowIntensity
  ctx.lineWidth = Math.max(0.9, profile.orbit1Width * 0.38)
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1 + profile.orbit1ArcStart, rot1 + profile.orbit1ArcEnd)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.15 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.8
  ctx.strokeStyle = baseColor
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // hp depleted indicator — inner ring fades
  if (hpRatio < 1) {
    ctx.globalAlpha = 0.3 * (1 - hpRatio)
    ctx.strokeStyle = "#ff5a6e"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

function drawCircleBossEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
) {
  const profile = enemy.visual
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accentColor
  const secondaryColor = profile.secondaryColor ?? "#fff0c4"
  const glowIntensity = 0.36 + hpRatio * 0.54

  const seed = hashString(enemy.enemyInstanceId) + profile.seedBucket
  const rot1 = t * (profile.orbit1AngularSpeed * 0.001 + (seed % 5) * 0.00004)
  const rot2 = t * (Math.abs(profile.orbit2AngularSpeed) * 0.001 + (seed % 3) * 0.00003)
    * Math.sign(profile.orbit2AngularSpeed || -1)
  const rot3 = t * 0.00028

  ctx.save()
  ctx.shadowColor = profile.glowColor
  ctx.shadowBlur = 11 * glowIntensity * Math.max(0.4, profile.glowStrength)

  // outer orbit — full arc with gap, larger radius
  const r2 = r * profile.orbit2Scale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.26 * glowIntensity
  ctx.lineWidth = Math.max(0.9, profile.orbit2Width * 0.34)
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + profile.orbit2ArcStart, rot2 + profile.orbit2ArcEnd)
  ctx.stroke()

  // orbital diamond icons (multiple, evenly spaced)
  const iconSize = profile.iconSize
  const iconCount = profile.iconCount ?? 3
  ctx.globalAlpha = 0.7 * glowIntensity
  ctx.fillStyle = baseColor
  for (let i = 0; i < iconCount; i++) {
    const a = rot2 + (TAU / iconCount) * i + Math.PI / iconCount
    const ix = x + Math.cos(a) * r2
    const iy = y + Math.sin(a) * r2
    ctx.beginPath()
    ctx.moveTo(ix, iy - iconSize)
    ctx.lineTo(ix + iconSize, iy)
    ctx.lineTo(ix, iy + iconSize)
    ctx.lineTo(ix - iconSize, iy)
    ctx.closePath()
    ctx.fill()
  }

  // mid orbit — counter-rotating thin ring
  const rMid = r * (profile.midOrbitScale ?? (profile.orbit1Scale + profile.orbit2Scale) / 2)
  ctx.globalAlpha = 0.22 * glowIntensity
  ctx.strokeStyle = secondaryColor
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(x, y, rMid, rot3 + 0.4, rot3 + TAU - 0.4)
  ctx.stroke()

  // inner orbit — partial arc
  const r1 = r * profile.orbit1Scale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.45 * glowIntensity
  ctx.lineWidth = Math.max(0.9, profile.orbit1Width * 0.38)
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1 + profile.orbit1ArcStart, rot1 + profile.orbit1ArcEnd)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.16 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.85
  ctx.strokeStyle = baseColor
  ctx.lineWidth = 1.9
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // core highlight (boss は中心が一段明るい)
  ctx.globalAlpha = 0.7
  ctx.fillStyle = secondaryColor
  ctx.beginPath()
  ctx.arc(x, y, r * 0.22, 0, TAU)
  ctx.fill()

  if (hpRatio < 1) {
    ctx.globalAlpha = 0.34 * (1 - hpRatio)
    ctx.strokeStyle = "#ff5a6e"
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

/* ============================================================
   PLAYER PROJECTILE — Energy Lance
   ============================================================ */

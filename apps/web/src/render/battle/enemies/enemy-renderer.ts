import type { BattleRenderState } from "@magnolia/game-session"
import {
  PHI,
  TAU,
  buildEntityRendererKeys,
  hashString,
  resolveBattleRenderer,
} from "@/render/battle/battle-renderer-utils"

type EnemyRendererInput = {
  enemy: BattleRenderState["enemies"][number]
  timeMs: number
  renderState: BattleRenderState
}

const BATTLE_ENEMY_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: EnemyRendererInput) => void
> = {
  vis_enemy_a1: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  vis_enemy_scout: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  vis_enemy_a2: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  vis_enemy_standard: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  vis_enemy_heavy: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.heavy),
  vis_enemy_c1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.c1),
  vis_enemy_b1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.b1),
  a1: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  a2: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  c1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.c1),
  b1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.b1),
  enemy_scout: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  enemy_standard: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  enemy_heavy: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.heavy),
  default: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
}

type CircleEnemyProfile = {
  accent: string
  glow: string
  outerOrbitScale: number   // r2 = r * outerOrbitScale (見た目の外周)
  innerOrbitScale: number   // r1 = r * innerOrbitScale
  iconSize: number
  seedOffset: number
}

type CircleBossProfile = {
  accent: string
  secondary: string
  glow: string
  outerOrbitScale: number
  innerOrbitScale: number
  iconSize: number
  iconCount: number          // 外周に並ぶダイヤアイコン数
  midOrbitScale: number      // 中間の追加リング
  seedOffset: number
}

const ENEMY_VISUAL_PROFILES: Record<string, CircleEnemyProfile> = {
  a1: {
    accent: "#ffc9a2",
    glow: "rgba(255, 178, 116, 0.7)",
    outerOrbitScale: PHI * PHI,    // 約 2.618
    innerOrbitScale: PHI,          // 約 1.618
    iconSize: 3,
    seedOffset: 11,
  },
  a2: {
    accent: "#ffd7a8",
    glow: "rgba(255, 198, 130, 0.7)",
    outerOrbitScale: PHI * PHI * 1.05,
    innerOrbitScale: PHI * 1.05,
    iconSize: 3.2,
    seedOffset: 23,
  },
  heavy: {
    accent: "#ffb16f",
    glow: "rgba(255, 151, 82, 0.78)",
    outerOrbitScale: PHI * PHI * 1.12,
    innerOrbitScale: PHI * 1.12,
    iconSize: 3.6,
    seedOffset: 37,
  },
}

const ENEMY_BOSS_VISUAL_PROFILES: Record<string, CircleBossProfile> = {
  c1: {
    accent: "#ffbc83",
    secondary: "#fff0c4",
    glow: "rgba(255, 172, 104, 0.86)",
    outerOrbitScale: 2.35,
    innerOrbitScale: 1.55,
    midOrbitScale: 1.95,
    iconSize: 3.6,
    iconCount: 3,
    seedOffset: 101,
  },
  b1: {
    accent: "#ff976f",
    secondary: "#ffe0a8",
    glow: "rgba(255, 117, 86, 0.94)",
    outerOrbitScale: 2.7,
    innerOrbitScale: 1.7,
    midOrbitScale: 2.18,
    iconSize: 4,
    iconCount: 4,
    seedOffset: 211,
  },
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_RENDERERS,
    buildEntityRendererKeys({
      visualPresetId: enemy.visualPresetId,
      legacyEntityId: enemy.enemyId,
      missionId: renderState.missionId,
    }),
  )
  renderer(ctx, { enemy, timeMs: t, renderState })
}

function drawCircleEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  profile: CircleEnemyProfile,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accent
  const glowIntensity = 0.3 + hpRatio * 0.5

  const seed = hashString(enemy.enemyInstanceId) + profile.seedOffset
  const rotSpeed1 = 0.0008 + (seed % 5) * 0.0001
  const rotSpeed2 = 0.0005 + (seed % 3) * 0.00008
  const rot1 = t * rotSpeed1
  const rot2 = -t * rotSpeed2

  ctx.save()
  ctx.shadowColor = profile.glow
  ctx.shadowBlur = 6 * glowIntensity

  // orbit 2 — wide arc with gap (見た目用の外周)
  const r2 = r * profile.outerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.25 * glowIntensity
  ctx.lineWidth = 1
  const gapAngle = 25 * Math.PI / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  // diamond icon on orbit 2
  const iconAngle = rot2 + Math.PI
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
  const r1 = r * profile.innerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.4 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
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
  profile: CircleBossProfile,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accent
  const glowIntensity = 0.36 + hpRatio * 0.54

  const seed = hashString(enemy.enemyInstanceId) + profile.seedOffset
  const rot1 = t * (0.0006 + (seed % 5) * 0.00008)
  const rot2 = -t * (0.00042 + (seed % 3) * 0.00006)
  const rot3 = t * 0.00028

  ctx.save()
  ctx.shadowColor = profile.glow
  ctx.shadowBlur = 11 * glowIntensity

  // outer orbit — full arc with gap, larger radius
  const r2 = r * profile.outerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.26 * glowIntensity
  ctx.lineWidth = 1.1
  const gapAngle = 22 * Math.PI / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  // orbital diamond icons (multiple, evenly spaced)
  const iconSize = profile.iconSize
  ctx.globalAlpha = 0.7 * glowIntensity
  ctx.fillStyle = baseColor
  for (let i = 0; i < profile.iconCount; i++) {
    const a = rot2 + (TAU / profile.iconCount) * i + Math.PI / profile.iconCount
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
  const rMid = r * profile.midOrbitScale
  ctx.globalAlpha = 0.22 * glowIntensity
  ctx.strokeStyle = profile.secondary
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(x, y, rMid, rot3 + 0.4, rot3 + TAU - 0.4)
  ctx.stroke()

  // inner orbit — partial arc
  const r1 = r * profile.innerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.45 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
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
  ctx.fillStyle = profile.secondary
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

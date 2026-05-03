import type { BattleRenderState, EnemyRenderState } from "@magnolia/game-session"
import {
  PHI,
  TAU,
  hashRenderString,
  resolveBattleRenderer,
} from "@/render/battle/battle-renderer-utils"
import type { CanvasPaletteRole } from "@/render/shared/canvas-palette"
import { hex, resolveCanvasPaletteRole, rgba } from "@/render/shared/canvas-palette"
import { readCachedCanvasPath } from "@/render/shared/canvas-path-cache"
import { clamp01 } from "@/render/shared/render-math"

type EnemyRendererInput = {
  enemy: EnemyRenderState
  timeMs: number
  renderState: BattleRenderState
  renderOptions: BattleEnemyRenderOptions
}

type BattleEnemyRenderOptions = {
  reduceFlashing: boolean
  lowFrameRateMode: boolean
  denseFrameMode: boolean
}

const BATTLE_ENEMY_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: EnemyRendererInput) => void
> = {
  circleSignal: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, input.renderOptions),
  shardCore: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, input.renderOptions),
  bossLattice: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, input.renderOptions),
  default: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, input.renderOptions),
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyRenderState,
  t: number,
  renderState: BattleRenderState,
  renderOptions: BattleEnemyRenderOptions,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_RENDERERS,
    enemy.visual.rendererKind,
    { category: "enemy", presetId: enemy.visualPresetId },
  )
  renderer(ctx, { enemy, timeMs: t, renderState, renderOptions })
}

function readPaletteRole(enemy: EnemyRenderState): CanvasPaletteRole {
  return resolvePaletteRole(enemy.visual.paletteRole, "enemyNoise")
}

function drawCircleEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyRenderState,
  t: number,
  renderOptions: BattleEnemyRenderOptions,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  // burning は被弾直後の警告色。preset の paletteRole に上書きはせず、表現用 role を上乗せします。
  const baseRole: CanvasPaletteRole = enemy.burning ? "residualWarmth" : readPaletteRole(enemy)
  const presetGlow = clamp01(enemy.visual.glowIntensity ?? 0.5)
  const orbitScale = Math.max(0.4, enemy.visual.orbitScale ?? 1)
  const simplified = renderOptions.lowFrameRateMode || renderOptions.denseFrameMode
  const glyphCount = Math.max(1, enemy.visual.glyphCount ?? 1)
  const motion = readEnemyMotionProfile(enemy.visual.motionProfile)
  const glowIntensity = clamp01(0.3 + hpRatio * 0.5) * (0.6 + presetGlow * 0.6)

  const seed = hashRenderString(enemy.enemyInstanceId)
  const iconSize = 3 + (presetGlow - 0.5) * 1.4
  const bodyPath = readEnemyCirclePath(enemy, baseRole, r, renderOptions)
  const glyphPath = readEnemyDiamondPath(enemy, baseRole, iconSize, renderOptions)
  // motionProfile は同じ rendererKind 内で動きだけを変えるための preset 値です。
  // enemyId ではなく content preset が回転速度と揺れ幅を決めます。
  const wobble = Math.sin(t * 0.0024 + seed) * motion.wobble
  const rotSpeed1 = (0.0008 + (seed % 5) * 0.0001) * motion.orbitSpeed
  const rotSpeed2 = (0.0005 + (seed % 3) * 0.00008) * motion.counterSpeed
  const rot1 = t * rotSpeed1 + wobble
  const rot2 = -t * rotSpeed2 - wobble * 0.5

  ctx.save()
  ctx.shadowColor = rgba(baseRole, 0.32 + presetGlow * 0.4)
  ctx.shadowBlur = simplified ? 0 : 6 * glowIntensity

  // orbit 2 — wide arc with gap. orbitScale は preset で外周拡縮。
  const r2 = r * (PHI * PHI) * orbitScale
  ctx.strokeStyle = hex(baseRole)
  ctx.globalAlpha = 0.25 * glowIntensity
  ctx.lineWidth = 1
  const gapAngle = (25 * Math.PI) / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  if (!simplified) {
    // glyph icons on orbit 2 — preset.glyphCount を反映。高密度時は本体と輪郭を優先します。
    ctx.globalAlpha = 0.6 * glowIntensity
    ctx.fillStyle = hex(baseRole)
    for (let i = 0; i < glyphCount; i += 1) {
      const a = rot2 + (TAU / glyphCount) * i + Math.PI / glyphCount
      const ix = x + Math.cos(a) * r2
      const iy = y + Math.sin(a) * r2
      ctx.save()
      ctx.translate(ix, iy)
      ctx.fill(glyphPath)
      ctx.restore()
    }
  }

  // orbit 1 — partial arc
  const r1 = r * PHI * orbitScale
  ctx.strokeStyle = hex(baseRole)
  ctx.globalAlpha = 0.4 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.15 * glowIntensity
  ctx.fillStyle = hex(baseRole)
  ctx.save()
  ctx.translate(x, y)
  ctx.fill(bodyPath)
  ctx.restore()

  ctx.globalAlpha = 0.8
  ctx.strokeStyle = hex(baseRole)
  ctx.lineWidth = 1.8
  ctx.save()
  ctx.translate(x, y)
  ctx.stroke(bodyPath)
  ctx.restore()

  // hp depleted indicator — 被弾フィードバックのみ threatNoise を使う。
  if (hpRatio < 1) {
    ctx.globalAlpha = 0.3 * (1 - hpRatio)
    ctx.strokeStyle = hex("threatNoise")
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

function drawCircleBossEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyRenderState,
  t: number,
  renderOptions: BattleEnemyRenderOptions,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseRole: CanvasPaletteRole = enemy.burning ? "residualWarmth" : readPaletteRole(enemy)
  const presetGlow = clamp01(enemy.visual.glowIntensity ?? 0.7)
  const orbitScale = Math.max(0.4, enemy.visual.orbitScale ?? 1.5)
  const simplified = renderOptions.lowFrameRateMode || renderOptions.denseFrameMode
  const glyphCount = Math.max(2, enemy.visual.glyphCount ?? 4)
  const motion = readEnemyMotionProfile(enemy.visual.motionProfile)
  const glowIntensity = clamp01(0.36 + hpRatio * 0.54) * (0.6 + presetGlow * 0.6)

  const seed = hashRenderString(enemy.enemyInstanceId)
  const iconSize = 3.2 + presetGlow * 1.2
  const bodyPath = readEnemyCirclePath(enemy, baseRole, r, renderOptions)
  const glyphPath = readEnemyDiamondPath(enemy, baseRole, iconSize, renderOptions)
  // boss 系も motionProfile を共有して、preset 変更だけで圧力の速度差を出します。
  const wobble = Math.sin(t * 0.0018 + seed) * motion.wobble
  const rot1 = t * (0.0006 + (seed % 5) * 0.00008) * motion.orbitSpeed + wobble
  const rot2 = -t * (0.00042 + (seed % 3) * 0.00006) * motion.counterSpeed
  const rot3 = t * 0.00028 * motion.innerSpeed - wobble * 0.35

  ctx.save()
  ctx.shadowColor = rgba(baseRole, 0.4 + presetGlow * 0.4)
  ctx.shadowBlur = simplified ? 0 : 11 * glowIntensity

  // outer orbit — wider radius for boss
  const r2 = r * (PHI * PHI) * orbitScale
  ctx.strokeStyle = hex(baseRole)
  ctx.globalAlpha = 0.26 * glowIntensity
  ctx.lineWidth = 1.1
  const gapAngle = (22 * Math.PI) / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  if (!simplified) {
    // orbital glyph icons (preset.glyphCount 並列)
    ctx.globalAlpha = 0.7 * glowIntensity
    ctx.fillStyle = hex(baseRole)
    for (let i = 0; i < glyphCount; i++) {
      const a = rot2 + (TAU / glyphCount) * i + Math.PI / glyphCount
      const ix = x + Math.cos(a) * r2
      const iy = y + Math.sin(a) * r2
      ctx.save()
      ctx.translate(ix, iy)
      ctx.fill(glyphPath)
      ctx.restore()
    }
  }

  // mid orbit — counter-rotating thin ring (warmth で対比)
  if (!simplified) {
    const rMid = r * PHI * 1.2 * orbitScale
    ctx.globalAlpha = 0.22 * glowIntensity
    ctx.strokeStyle = rgba("residualWarmth", 0.75)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(x, y, rMid, rot3 + 0.4, rot3 + TAU - 0.4)
    ctx.stroke()
  }

  // inner orbit — partial arc
  const r1 = r * PHI * orbitScale
  ctx.strokeStyle = hex(baseRole)
  ctx.globalAlpha = 0.45 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.16 * glowIntensity
  ctx.fillStyle = hex(baseRole)
  ctx.save()
  ctx.translate(x, y)
  ctx.fill(bodyPath)
  ctx.restore()

  ctx.globalAlpha = 0.85
  ctx.strokeStyle = hex(baseRole)
  ctx.lineWidth = 1.9
  ctx.save()
  ctx.translate(x, y)
  ctx.stroke(bodyPath)
  ctx.restore()

  // boss は中心が一段明るい (warmth role)
  ctx.globalAlpha = 0.7
  ctx.fillStyle = hex("residualWarmth")
  ctx.beginPath()
  ctx.arc(x, y, r * 0.22, 0, TAU)
  ctx.fill()

  if (hpRatio < 1) {
    ctx.globalAlpha = 0.34 * (1 - hpRatio)
    ctx.strokeStyle = hex("threatNoise")
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

function readEnemyCirclePath(
  enemy: EnemyRenderState,
  role: CanvasPaletteRole,
  radius: number,
  renderOptions: BattleEnemyRenderOptions,
): Path2D {
  return readCachedCanvasPath(
    {
      rendererKind: enemy.visual.rendererKind,
      visualPresetId: enemy.visualPresetId,
      paletteRole: role,
      shape: "enemy-circle",
      shapeParams: [radius, enemy.visual.orbitScale ?? 1, enemy.visual.glowIntensity ?? 0.5],
      reduceFlashing: renderOptions.reduceFlashing,
      lowFrameRateMode: renderOptions.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.arc(0, 0, radius, 0, TAU)
      return path
    },
  )
}

function readEnemyDiamondPath(
  enemy: EnemyRenderState,
  role: CanvasPaletteRole,
  size: number,
  renderOptions: BattleEnemyRenderOptions,
): Path2D {
  return readCachedCanvasPath(
    {
      rendererKind: enemy.visual.rendererKind,
      visualPresetId: enemy.visualPresetId,
      paletteRole: role,
      shape: "enemy-glyph-diamond",
      shapeParams: [size, enemy.visual.glyphCount ?? 1],
      reduceFlashing: renderOptions.reduceFlashing,
      lowFrameRateMode: renderOptions.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.moveTo(0, -size)
      path.lineTo(size, 0)
      path.lineTo(0, size)
      path.lineTo(-size, 0)
      path.closePath()
      return path
    },
  )
}

function readEnemyMotionProfile(profile: string | undefined): {
  orbitSpeed: number
  counterSpeed: number
  innerSpeed: number
  wobble: number
} {
  switch (profile) {
    case "prototypeOrbit":
      return { orbitSpeed: 1.18, counterSpeed: 0.92, innerSpeed: 1.08, wobble: 0.08 }
    case "weightedOrbit":
      return { orbitSpeed: 0.72, counterSpeed: 0.62, innerSpeed: 0.8, wobble: 0.03 }
    case "pressureOrbit":
      return { orbitSpeed: 1.05, counterSpeed: 1.28, innerSpeed: 1.2, wobble: 0.06 }
    case "bossLattice":
      return { orbitSpeed: 0.88, counterSpeed: 1.34, innerSpeed: 1.48, wobble: 0.04 }
    case "slowOrbit":
    default:
      return { orbitSpeed: 1, counterSpeed: 1, innerSpeed: 1, wobble: 0.04 }
  }
}

function resolvePaletteRole(value: string, fallback: CanvasPaletteRole): CanvasPaletteRole {
  return resolveCanvasPaletteRole(value, fallback)
}

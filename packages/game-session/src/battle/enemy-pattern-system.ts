import type {
  BulletPattern,
  ContentHitboxPreset,
  DifficultyModifiers,
  EnemyArchetype,
  ProjectileSpec,
} from "@magnolia/contracts"
import {
  readEnemyPatternBaseRotation,
  resolveEnemyPatternBaseDirection,
  resolveHitRadius,
  rotateVector,
} from "../battle-world"
import type { InternalBattleState, InternalEnemyState, InternalProjectileState } from "../battle-state"

type EnemyPatternHandlerInput = {
  battle: InternalBattleState
  enemy: InternalEnemyState
  patternId: string
  pattern: BulletPattern
  projectile: ProjectileSpec
  noiseDamageMultiplier: number
  projectileSpeedMultiplier: number
  burstBonus: number
  spreadMultiplier: number
  nextInstanceId(prefix: string): string
  hitboxPresets: Record<string, ContentHitboxPreset>
}

type EnemyPatternHandler = (input: EnemyPatternHandlerInput) => InternalProjectileState[]

const GOLDEN_ANGLE_RAD = 2.39996322972865332
const ENEMY_PROJECTILE_SPEED_MULTIPLIER = 1.12
const ENEMY_FOLLOWUP_CADENCE_MULTIPLIER = 1.8

const ENEMY_PATTERN_HANDLERS: Record<string, EnemyPatternHandler> = {
  goldenStream: fireGoldenStream,
  radial: fireRadial,
  spread: fireSpread,
}

export function fireEnemyPatterns(input: {
  battle: InternalBattleState
  enemy: InternalEnemyState
  enemyDefinition: EnemyArchetype
  bulletPatterns: Record<string, BulletPattern>
  projectiles: Record<string, ProjectileSpec>
  hitboxPresets: Record<string, ContentHitboxPreset>
  difficultyModifiers: DifficultyModifiers
  nextInstanceId(prefix: string): string
}): void {
  const cadenceMultiplier = input.difficultyModifiers.enemyCadenceMultiplier ?? 1
  const noiseDamageMultiplier = input.difficultyModifiers.enemyNoiseDamageMultiplier ?? 1
  const projectileSpeedMultiplier = input.difficultyModifiers.enemyProjectileSpeedMultiplier ?? 1
  const burstBonus = Math.max(0, Math.floor(input.difficultyModifiers.enemyPatternBurstBonus ?? 0))
  const spreadMultiplier = input.difficultyModifiers.enemyPatternSpreadMultiplier ?? 1

  for (const patternId of input.enemyDefinition.bulletPatternIds) {
    const pattern = input.bulletPatterns[patternId]
    const projectile = input.projectiles[pattern.projectileId]
    const baseCadenceMs = Math.max(80, pattern.cadenceMs * cadenceMultiplier)
    const hasFiredPattern = Object.prototype.hasOwnProperty.call(
      input.enemy.patternLastFiredAtMs,
      patternId,
    )
    // 初回射撃は出現直後の攻撃として残し、倒し損なった敵の追加射撃だけ間隔を伸ばします。
    const cadenceMs = hasFiredPattern
      ? baseCadenceMs * ENEMY_FOLLOWUP_CADENCE_MULTIPLIER
      : baseCadenceMs
    const lastFiredAtMs = hasFiredPattern
      ? input.enemy.patternLastFiredAtMs[patternId]
      : -baseCadenceMs
    if (input.battle.elapsedMs - lastFiredAtMs < cadenceMs) {
      continue
    }

    input.enemy.patternLastFiredAtMs[patternId] = input.battle.elapsedMs
    const handler = ENEMY_PATTERN_HANDLERS[pattern.patternKind] ?? ENEMY_PATTERN_HANDLERS.spread
    input.battle.projectiles.push(
      ...handler({
        battle: input.battle,
        enemy: input.enemy,
        patternId,
        pattern,
        projectile,
        noiseDamageMultiplier,
        projectileSpeedMultiplier,
        burstBonus,
        spreadMultiplier,
        nextInstanceId: input.nextInstanceId,
        hitboxPresets: input.hitboxPresets,
      }),
    )
  }
}

function fireGoldenStream(input: EnemyPatternHandlerInput): InternalProjectileState[] {
  // 黄金角で発射方向を進め、単体の patternKind で螺旋を表現します。
  const countKey = `${input.patternId}:n`
  const fireCount = input.enemy.patternLastFiredAtMs[countKey] ?? 0
  const baseRotationRad = readEnemyPatternBaseRotation({
    battleElapsedMs: input.battle.elapsedMs,
    enemy: input.enemy,
    pattern: input.pattern,
  })
  const angle = baseRotationRad + fireCount * GOLDEN_ANGLE_RAD
  input.enemy.patternLastFiredAtMs[countKey] = fireCount + 1
  const projectileCount = 1 + input.burstBonus
  return Array.from({ length: projectileCount }, (_, index) => {
    const shotAngle = angle + (index * GOLDEN_ANGLE_RAD) / projectileCount
    return createEnemyProjectile(input, {
      x: Math.cos(shotAngle),
      y: Math.sin(shotAngle),
    })
  })
}

function fireRadial(input: EnemyPatternHandlerInput): InternalProjectileState[] {
  const burstCount = resolveDifficultyBurstCount(input)
  const baseRotationRad = readEnemyPatternBaseRotation({
    battleElapsedMs: input.battle.elapsedMs,
    enemy: input.enemy,
    pattern: input.pattern,
  })
  return Array.from({ length: burstCount }, (_, index) => {
    const angle = baseRotationRad + ((index / burstCount) * 360 * Math.PI) / 180
    return createEnemyProjectile(input, {
      x: Math.cos(angle),
      y: Math.sin(angle),
    })
  })
}

function fireSpread(input: EnemyPatternHandlerInput): InternalProjectileState[] {
  const burstCount = resolveDifficultyBurstCount(input)
  const spreadDeg = Number(input.pattern.params.spreadDeg ?? 0) * input.spreadMultiplier
  const baseDirection = resolveEnemyPatternBaseDirection({
    battleElapsedMs: input.battle.elapsedMs,
    enemy: input.enemy,
    pattern: input.pattern,
  })
  return Array.from({ length: burstCount }, (_, index) => {
    const offset =
      ((burstCount === 1 ? 0 : (index / (burstCount - 1)) * spreadDeg - spreadDeg / 2) * Math.PI) / 180
    return createEnemyProjectile(input, rotateVector(baseDirection, offset))
  })
}

function resolveDifficultyBurstCount(input: EnemyPatternHandlerInput): number {
  // terminal では authored pattern を差し替えず、既存 pattern の弾数だけを増やします。
  return Math.max(1, input.pattern.burstCount + input.burstBonus)
}

function createEnemyProjectile(input: EnemyPatternHandlerInput, direction: { x: number; y: number }): InternalProjectileState {
  const hitbox = input.hitboxPresets[input.projectile.hitboxPresetId]
  if (!hitbox) {
    throw new Error(`Missing hitbox preset: ${input.projectile.hitboxPresetId}`)
  }
  const nonColliding = input.pattern.params.nonColliding === true || input.pattern.params.visualOnly === true
  // 敵弾が画面内に残る時間を少し短くするため、生成時の速度だけを一定倍率で上げます。
  const projectileSpeed =
    input.projectile.speed *
    input.projectileSpeedMultiplier *
    ENEMY_PROJECTILE_SPEED_MULTIPLIER
  return {
    projectileInstanceId: input.nextInstanceId(input.pattern.projectileId),
    projectileId: input.pattern.projectileId,
    side: "enemy",
    position: { ...input.enemy.position },
    velocity: {
      x: direction.x * projectileSpeed,
      y: direction.y * projectileSpeed,
    },
    radius: resolveHitRadius(hitbox),
    remainingMs: input.projectile.lifetimeMs,
    spawnDelayMs: 0,
    damage: nonColliding ? 0 : input.projectile.damage,
    noiseDamage: nonColliding ? 0 : input.projectile.noiseDamage * input.noiseDamageMultiplier,
    nonColliding,
  }
}

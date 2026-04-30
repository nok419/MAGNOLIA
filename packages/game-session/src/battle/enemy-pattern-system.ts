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
  nextInstanceId(prefix: string): string
  hitboxPresets: Record<string, ContentHitboxPreset>
}

type EnemyPatternHandler = (input: EnemyPatternHandlerInput) => InternalProjectileState[]

const GOLDEN_ANGLE_RAD = 2.39996322972865332

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

  for (const patternId of input.enemyDefinition.bulletPatternIds) {
    const pattern = input.bulletPatterns[patternId]
    const projectile = input.projectiles[pattern.projectileId]
    const cadenceMs = Math.max(80, pattern.cadenceMs * cadenceMultiplier)
    const lastFiredAtMs = input.enemy.patternLastFiredAtMs[patternId] ?? -cadenceMs
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
  return [
    createEnemyProjectile(input, {
      x: Math.cos(angle),
      y: Math.sin(angle),
    }),
  ]
}

function fireRadial(input: EnemyPatternHandlerInput): InternalProjectileState[] {
  const burstCount = Math.max(1, input.pattern.burstCount)
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
  const burstCount = Math.max(1, input.pattern.burstCount)
  const spreadDeg = Number(input.pattern.params.spreadDeg ?? 0)
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

function createEnemyProjectile(input: EnemyPatternHandlerInput, direction: { x: number; y: number }): InternalProjectileState {
  const hitbox = input.hitboxPresets[input.projectile.hitboxPresetId]
  if (!hitbox) {
    throw new Error(`Missing hitbox preset: ${input.projectile.hitboxPresetId}`)
  }
  return {
    projectileInstanceId: input.nextInstanceId(input.pattern.projectileId),
    projectileId: input.pattern.projectileId,
    side: "enemy",
    position: { ...input.enemy.position },
    velocity: {
      x: direction.x * input.projectile.speed,
      y: direction.y * input.projectile.speed,
    },
    radius: resolveHitRadius(hitbox),
    remainingMs: input.projectile.lifetimeMs,
    spawnDelayMs: 0,
    damage: input.projectile.damage,
    noiseDamage: input.projectile.noiseDamage * input.noiseDamageMultiplier,
  }
}

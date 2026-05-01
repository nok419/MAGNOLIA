import type {
  ContentBundle,
  DomainEvent,
  PresentationRequest,
  RuntimeEffectRequest,
} from "@magnolia/contracts"
import { detonatePlayerProjectile } from "../battle-effects"
import type { InternalBattleState, InternalEnemyState, InternalProjectileState } from "../battle-state"
import { clamp01 } from "../battle-world"
import { runSubsystemHooks } from "../equipment-runtime"
import { createBattleHitPresentation, createBattleNoiseSourceClearPresentation } from "../presentation"
import { isWithinRadius } from "../explore-world"

export type BattleCollisionResult = {
  playerNoiseDamage: number
  events: DomainEvent[]
  presentationRequests: PresentationRequest[]
  effectRequests: RuntimeEffectRequest[]
}

export function resolveBattleCollisions(input: {
  battle: InternalBattleState
  dtMs: number
  content: ContentBundle
  resolvePlayerHitRadius(): number
  spawnSelfRepairPickup(position: { x: number; y: number }, amount: number): void
  nextInstanceId(prefix: string): string
}): BattleCollisionResult {
  const { battle } = input
  let playerNoiseDamage = 0
  const events: DomainEvent[] = []
  const presentationRequests: PresentationRequest[] = []
  const effectRequests: RuntimeEffectRequest[] = []

  if (battle.barrier) {
    const barrierRadius = battle.barrier.radius
    let blockedProjectileCount = 0
    battle.projectiles = battle.projectiles.filter((projectile) => {
      if (projectile.side !== "enemy" || projectile.nonColliding) {
        return true
      }
      const blocked = isWithinRadius(projectile.position, battle.playerPosition, barrierRadius)
      if (blocked) {
        blockedProjectileCount += 1
      }
      return !blocked
    })
    if (blockedProjectileCount > 0) {
      events.push({ type: "playerBarrierHit", hitCount: blockedProjectileCount })
    }
  }

  for (const field of battle.supportFields) {
    if (field.blocksEnemyBullets) {
      battle.projectiles = battle.projectiles.filter((projectile) => {
        if (projectile.side !== "enemy" || projectile.nonColliding) {
          return true
        }
        return !isWithinRadius(projectile.position, field.position, field.radius)
      })
    }
  }

  applyAreaProjectileEffects(input)

  const remainingProjectiles: InternalProjectileState[] = []
  const spawnedVisualProjectiles: InternalProjectileState[] = []
  for (const projectile of battle.projectiles) {
    if (projectile.spawnDelayMs > 0) {
      remainingProjectiles.push(projectile)
      continue
    }

    if (projectile.side === "enemy") {
      if (projectile.nonColliding) {
        remainingProjectiles.push(projectile)
        continue
      }
      if (
        battle.noiseState.invincibleUntilMs <= battle.elapsedMs &&
        isWithinRadius(projectile.position, battle.playerPosition, projectile.radius + input.resolvePlayerHitRadius())
      ) {
        playerNoiseDamage += projectile.noiseDamage
        presentationRequests.push(
          ...createBattleHitPresentation({
            worldPosition: projectile.position,
            noiseLevel: clamp01(battle.noiseState.noiseLevel + projectile.noiseDamage),
          }),
        )
        continue
      }
      remainingProjectiles.push(projectile)
      continue
    }

    if (projectile.meleeSweepDamage && projectile.meleeSweepDamage > 0) {
      applyAnchoredMeleeSweepDamage(battle, projectile)
    }

    if (projectile.nonColliding) {
      remainingProjectiles.push(projectile)
      continue
    }

    let hitEnemy = false
    for (const enemy of battle.enemies) {
      if (enemy.hp <= 0) {
        continue
      }
      if (projectile.hitEnemyInstanceIds?.includes(enemy.enemyInstanceId)) {
        continue
      }
      if (!isWithinRadius(projectile.position, enemy.position, projectile.radius + enemy.radius)) {
        continue
      }
      enemy.hp -= projectile.damage
      events.push({ type: "playerProjectileHit", enemyId: enemy.enemyId })
      if (projectile.piercing) {
        projectile.hitEnemyInstanceIds = [
          ...(projectile.hitEnemyInstanceIds ?? []),
          enemy.enemyInstanceId,
        ]
      }
      if (projectile.burnDamagePerSec && projectile.burnDurationMs) {
        enemy.burnDamagePerSec = projectile.burnDamagePerSec
        enemy.burnUntilMs = battle.elapsedMs + projectile.burnDurationMs
      }
      if (projectile.explosiveRadius) {
        const explosionVisual = detonatePlayerProjectile({
          battle,
          projectile: {
            ...projectile,
            position: { ...projectile.position },
          },
          projectiles: input.content.projectiles,
          nextInstanceId: input.nextInstanceId,
        })
        if (explosionVisual) {
          spawnedVisualProjectiles.push(explosionVisual)
        }
      }
      hitEnemy = true
      if (!projectile.piercing) {
        break
      }
    }
    if (!hitEnemy || projectile.piercing) {
      remainingProjectiles.push(projectile)
    }
  }
  battle.projectiles = [...remainingProjectiles, ...spawnedVisualProjectiles]

  const survivors: InternalEnemyState[] = []
  for (const enemy of battle.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy)
      continue
    }
    const definition = input.content.enemies[enemy.enemyId]
    const analysisDelta = definition?.analysisValue ?? 0
    battle.destroyedAnalysisValue += analysisDelta
    presentationRequests.push(
      ...createBattleNoiseSourceClearPresentation({
        enemyId: enemy.enemyId,
        worldPosition: enemy.position,
        analysisDelta,
      }),
    )
    if ((definition?.dropSelfRepairPoints ?? 0) > 0) {
      input.spawnSelfRepairPickup(enemy.position, definition?.dropSelfRepairPoints ?? 0)
    }
    const enemyDestroyedHookResult = runSubsystemHooks({
      bindings: battle.bindings,
      context: {
        hook: "onEnemyDestroyed",
        enemyId: enemy.enemyId,
        analysisValue: definition?.analysisValue ?? 0,
        resolvedLoadout: battle.loadout,
      },
    })
    battle.destroyedAnalysisValue +=
      Math.max(0, enemyDestroyedHookResult.analysisDelta ?? 0) * battle.mission.analysisTotal
    effectRequests.push(...(enemyDestroyedHookResult.effectRequests ?? []))
    events.push({
      type: "enemyDestroyed",
      enemyId: enemy.enemyId,
    })
  }
  battle.enemies = survivors

  for (const enemy of battle.enemies) {
    if (
      battle.noiseState.invincibleUntilMs <= battle.elapsedMs &&
      isWithinRadius(enemy.position, battle.playerPosition, enemy.radius + input.resolvePlayerHitRadius())
    ) {
      playerNoiseDamage += (input.content.enemies[enemy.enemyId]?.collisionDamage ?? 0) / 100
    }
  }

  return {
    playerNoiseDamage,
    events,
    presentationRequests,
    effectRequests,
  }
}

function applyAreaProjectileEffects(input: {
  battle: InternalBattleState
  dtMs: number
}): void {
  const dtSeconds = input.dtMs / 1000
  for (const projectile of input.battle.projectiles) {
    if (projectile.side !== "player" || projectile.spawnDelayMs > 0) {
      continue
    }
    if (projectile.areaClearsEnemyProjectiles) {
      input.battle.projectiles = input.battle.projectiles.filter(
        (candidate) =>
          candidate.side !== "enemy" ||
          candidate.nonColliding ||
          !isWithinRadius(candidate.position, projectile.position, projectile.radius),
      )
    }
    if (!projectile.areaDamagePerSecond || projectile.areaDamagePerSecond <= 0) {
      continue
    }
    // 爆発の残り半分の威力は、表示されている範囲内へ時間比例で入れます。
    for (const enemy of input.battle.enemies) {
      if (enemy.hp <= 0) {
        continue
      }
      if (isWithinRadius(enemy.position, projectile.position, enemy.radius + projectile.radius)) {
        enemy.hp -= projectile.areaDamagePerSecond * dtSeconds
      }
    }
  }
}

function applyAnchoredMeleeSweepDamage(
  battle: InternalBattleState,
  projectile: InternalProjectileState,
): void {
  const meleeSweepDamage = projectile.meleeSweepDamage
  if (!meleeSweepDamage || meleeSweepDamage <= 0) {
    return
  }

  const rawProgress =
    projectile.initialLifetimeMs && projectile.initialLifetimeMs > 0
      ? clamp01((projectile.ageMs ?? 0) / projectile.initialLifetimeMs)
      : 1
  const swingPhase = clamp01((rawProgress - 0.08) / 0.74)
  if (rawProgress < 0.06 || rawProgress > 0.9 || swingPhase <= 0) {
    return
  }

  const baseAngle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
  const sweepSpan = 2.08
  const bladeAngle = baseAngle - sweepSpan * 0.5 + sweepSpan * easeInOutCubic(swingPhase)
  const range = projectile.meleeSweepRange ?? projectile.radius
  const halfArcRadians = ((projectile.meleeSweepArcDeg ?? 32) * Math.PI) / 360

  for (const enemy of battle.enemies) {
    if (enemy.hp <= 0) {
      continue
    }
    if (projectile.meleeSweepHitEnemyInstanceIds?.includes(enemy.enemyInstanceId)) {
      continue
    }

    const toEnemy = {
      x: enemy.position.x - projectile.position.x,
      y: enemy.position.y - projectile.position.y,
    }
    const distance = Math.hypot(toEnemy.x, toEnemy.y)
    if (distance > range + enemy.radius) {
      continue
    }

    const angularAllowance = Math.max(
      halfArcRadians,
      Math.asin(Math.min(1, enemy.radius / Math.max(1, distance))) + 0.08,
    )
    if (distance > 24 && angleDifference(Math.atan2(toEnemy.y, toEnemy.x), bladeAngle) > angularAllowance) {
      continue
    }

    enemy.hp -= meleeSweepDamage
    projectile.meleeSweepHitEnemyInstanceIds = [
      ...(projectile.meleeSweepHitEnemyInstanceIds ?? []),
      enemy.enemyInstanceId,
    ]
    if (projectile.burnDamagePerSec && projectile.burnDurationMs) {
      enemy.burnDamagePerSec = projectile.burnDamagePerSec
      enemy.burnUntilMs = battle.elapsedMs + projectile.burnDurationMs
    }
  }
}

function easeInOutCubic(value: number): number {
  const clamped = clamp01(value)
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

function angleDifference(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)))
}

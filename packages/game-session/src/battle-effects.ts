import type {
  ContentBundle,
  PresentationRequest,
  RuntimeEffectRequest,
} from "@magnolia/contracts"
import type { RuntimeModifierPatch } from "./equipment-runtime"
import type {
  InternalBattleState,
  InternalProjectileState,
} from "./battle-state"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  findNearestEnemyInRange,
  hasEnemyWithinRange,
  resolveHitRadius,
  rotateVector,
} from "./battle-world"
import {
  isWithinRadius,
  normalizeVector,
} from "./explore-world"

export function applyBattleEffectRequests(input: {
  battle: InternalBattleState
  effectRequests: RuntimeEffectRequest[]
  modifierPatch?: RuntimeModifierPatch
  projectiles: ContentBundle["projectiles"]
  nextInstanceId: (prefix: string) => string
  mainCadenceMultiplier: number
}): {
  presentationRequests: PresentationRequest[]
} {
  const presentationRequests: PresentationRequest[] = []

  for (const request of input.effectRequests) {
    switch (request.kind) {
      case "spawnProjectile":
        spawnProjectilesFromRequest({
          battle: input.battle,
          request,
          modifierPatch: input.modifierPatch ?? {},
          projectiles: input.projectiles,
          nextInstanceId: input.nextInstanceId,
        })
        break
      case "spawnBarrier":
        input.battle.barrier = {
          barrierId: request.barrierId,
          radius: request.radius,
          remainingMs: request.durationMs,
          maxMs: request.durationMs,
          moveSpeedMultiplier: request.moveSpeedMultiplier ?? 1,
          allowAttackDuringUse: request.allowAttackDuringUse,
          blocksEnemyBullets: request.blocksEnemyBullets,
        }
        break
      case "spawnSupportField":
        input.battle.supportFields.push({
          fieldInstanceId: input.nextInstanceId(request.fieldId),
          fieldId: request.fieldId,
          position: { ...request.position },
          velocity: { x: 0, y: -request.launchSpeed },
          radius: request.radius,
          remainingMs: request.durationMs,
          dpsInField: request.dpsInField ?? 0,
          blocksEnemyBullets: request.blocksEnemyBullets ?? false,
          blocksMagneticDisaster: request.blocksMagneticDisaster ?? false,
          mainCadenceMultiplier: request.mainCadenceMultiplier ?? 1,
        })
        break
      case "applyCooldown":
        if (request.slot === "main") {
          input.battle.mainCooldownMs = request.durationMs * input.mainCadenceMultiplier
        }
        if (request.slot === "sub") {
          input.battle.subCooldownMs = request.durationMs
        }
        break
      case "playEffect":
        // 見た目の詳細は PresentationRequest へ寄せる前提です。
        // 現在は対応する request 型がないため、ここでは状態を変えません。
        break
      case "clearEnemyProjectiles":
        input.battle.projectiles = input.battle.projectiles.filter(
          (projectile) =>
            projectile.side !== "enemy" ||
            !isWithinRadius(
              projectile.position,
              request.position ?? input.battle.playerPosition,
              request.radius ?? 9999,
            ),
        )
        break
    }
  }

  return {
    presentationRequests,
  }
}

export function updateBattleProjectiles(input: {
  battle: InternalBattleState
  dtMs: number
  statModifiers: Record<string, number> | undefined
  projectiles: ContentBundle["projectiles"]
  nextInstanceId: (prefix: string) => string
}): void {
  const dtSeconds = input.dtMs / 1000
  const remainingProjectiles: InternalProjectileState[] = []
  const spawnedVisualProjectiles: InternalProjectileState[] = []

  for (const projectile of input.battle.projectiles) {
    if (projectile.spawnDelayMs > 0) {
      projectile.spawnDelayMs -= input.dtMs
      remainingProjectiles.push(projectile)
      continue
    }

    if (
      projectile.side === "player" &&
      input.statModifiers?.homingStrength &&
      input.statModifiers.homingRange
    ) {
      const nearestEnemy = findNearestEnemyInRange(
        input.battle.enemies,
        projectile.position,
        input.statModifiers.homingRange,
      )
      if (nearestEnemy) {
        const targetDirection = normalizeVector({
          x: nearestEnemy.position.x - projectile.position.x,
          y: nearestEnemy.position.y - projectile.position.y,
        })
        const currentDirection = normalizeVector(projectile.velocity)
        const homingStrength = Math.min(1, input.statModifiers.homingStrength * dtSeconds)
        const mixedDirection = normalizeVector({
          x: currentDirection.x * (1 - homingStrength) + targetDirection.x * homingStrength,
          y: currentDirection.y * (1 - homingStrength) + targetDirection.y * homingStrength,
        })
        const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
        projectile.velocity = {
          x: mixedDirection.x * speed,
          y: mixedDirection.y * speed,
        }
      }
    }

    projectile.position.x += projectile.velocity.x * dtSeconds
    projectile.position.y += projectile.velocity.y * dtSeconds
    projectile.remainingMs -= input.dtMs
    if (typeof projectile.detonationDelayMs === "number") {
      projectile.detonationDelayMs -= input.dtMs
      if (projectile.detonationDelayMs <= 0) {
        const explosionVisual = detonatePlayerProjectile({
          battle: input.battle,
          projectile,
          projectiles: input.projectiles,
          nextInstanceId: input.nextInstanceId,
        })
        if (explosionVisual) {
          spawnedVisualProjectiles.push(explosionVisual)
        }
        continue
      }
    }
    if (projectile.remainingMs <= 0) {
      if (projectile.side === "player" && projectile.explosiveRadius) {
        const explosionVisual = detonatePlayerProjectile({
          battle: input.battle,
          projectile,
          projectiles: input.projectiles,
          nextInstanceId: input.nextInstanceId,
        })
        if (explosionVisual) {
          spawnedVisualProjectiles.push(explosionVisual)
        }
      }
      continue
    }
    if (
      projectile.position.x < -80 ||
      projectile.position.x > BATTLE_WIDTH + 80 ||
      projectile.position.y < -80 ||
      projectile.position.y > BATTLE_HEIGHT + 80
    ) {
      continue
    }
    remainingProjectiles.push(projectile)
  }

  input.battle.projectiles = [...remainingProjectiles, ...spawnedVisualProjectiles]
}

export function detonatePlayerProjectile(input: {
  battle: InternalBattleState
  projectile: InternalProjectileState
  projectiles: ContentBundle["projectiles"]
  nextInstanceId: (prefix: string) => string
}): InternalProjectileState | null {
  if (!input.projectile.explosiveRadius || input.projectile.explosiveRadius <= 0) {
    return null
  }

  const damageMultiplier = input.projectile.explosionDamageMultiplier ?? 0.75
  const explosionDamage = input.projectile.damage * damageMultiplier

  for (const enemy of input.battle.enemies) {
    if (
      isWithinRadius(
        enemy.position,
        input.projectile.position,
        enemy.radius + input.projectile.explosiveRadius,
      )
    ) {
      enemy.hp -= explosionDamage
    }
  }

  if (!input.projectile.explosionVisualProjectileId) {
    return null
  }

  const projectileSpec = input.projectiles[input.projectile.explosionVisualProjectileId]
  return {
    projectileInstanceId: input.nextInstanceId(input.projectile.explosionVisualProjectileId),
    projectileId: input.projectile.explosionVisualProjectileId,
    side: "player",
    position: { ...input.projectile.position },
    velocity: { x: 0, y: 0 },
    radius: input.projectile.explosiveRadius,
    remainingMs: projectileSpec?.lifetimeMs ?? 180,
    spawnDelayMs: 0,
    damage: 0,
    noiseDamage: 0,
    nonColliding: true,
  }
}

function spawnProjectilesFromRequest(input: {
  battle: InternalBattleState
  request: Extract<RuntimeEffectRequest, { kind: "spawnProjectile" }>
  modifierPatch: RuntimeModifierPatch
  projectiles: ContentBundle["projectiles"]
  nextInstanceId: (prefix: string) => string
}): void {
  const projectileSpec = input.projectiles[input.request.projectileId]
  const burnEnabled = Boolean(input.modifierPatch.visibilityModifiers?.burnEnabled)
  const burnDamagePerSec = burnEnabled
    ? input.modifierPatch.statModifiers?.burnDamagePerSec
    : undefined
  const burnDurationMs = burnEnabled
    ? input.modifierPatch.statModifiers?.burnDurationMs
    : undefined
  const spreadDeg = input.request.spreadDeg ?? 0
  const count = Math.max(1, input.request.count)
  for (let index = 0; index < count; index += 1) {
    const spreadOffset =
      count === 1 ? 0 : ((index / (count - 1)) * spreadDeg - spreadDeg / 2) * (Math.PI / 180)
    const direction = rotateVector(normalizeVector(input.request.direction), spreadOffset)
    input.battle.projectiles.push({
      projectileInstanceId: input.nextInstanceId(input.request.projectileId),
      projectileId: input.request.projectileId,
      side: projectileSpec?.side ?? "player",
      position: { ...input.request.position },
      velocity: {
        x: direction.x * input.request.speed,
        y: direction.y * input.request.speed,
      },
      radius: resolveHitRadius(projectileSpec?.hitboxPresetId),
      remainingMs: input.request.lifetimeMs ?? projectileSpec?.lifetimeMs ?? 2000,
      damage: input.request.damage ?? projectileSpec?.damage ?? 0,
      noiseDamage: input.request.noiseDamage ?? projectileSpec?.noiseDamage ?? 0,
      explosiveRadius:
        input.request.params && typeof input.request.params.explosionRadius === "number"
          ? input.request.params.explosionRadius
          : undefined,
      burnDamagePerSec,
      burnDurationMs,
      spawnDelayMs: input.request.delayMs ?? 0,
      detonationDelayMs:
        input.request.params && typeof input.request.params.explosionDelayMs === "number"
          ? input.request.params.explosionDelayMs
          : undefined,
      explosionDamageMultiplier:
        input.request.params && typeof input.request.params.explosionDamageMultiplier === "number"
          ? input.request.params.explosionDamageMultiplier
          : undefined,
      explosionVisualProjectileId:
        input.request.params && typeof input.request.params.explosionVisualProjectileId === "string"
          ? input.request.params.explosionVisualProjectileId
          : undefined,
      nonColliding:
        input.request.params && typeof input.request.params.visualOnly === "boolean"
          ? input.request.params.visualOnly
          : false,
    })
  }

  if (
    input.request.params?.meleeEnabled &&
    typeof input.request.params.meleeProjectileId === "string" &&
    hasEnemyWithinRange(
      input.battle.enemies,
      input.request.position,
      typeof input.request.params.meleeRange === "number" ? input.request.params.meleeRange : 80,
    )
  ) {
    const meleeProjectileId = input.request.params.meleeProjectileId
    const meleeProjectileSpec = input.projectiles[meleeProjectileId]
    const meleeCount =
      typeof input.request.params.meleeShotCount === "number" ? input.request.params.meleeShotCount : 3
    const meleeSpreadDeg =
      typeof input.request.params.meleeSpreadDeg === "number" ? input.request.params.meleeSpreadDeg : 120

    for (let index = 0; index < meleeCount; index += 1) {
      const spreadOffset =
        meleeCount === 1
          ? 0
          : ((index / (meleeCount - 1)) * meleeSpreadDeg - meleeSpreadDeg / 2) *
            (Math.PI / 180)
      const direction = rotateVector(normalizeVector(input.request.direction), spreadOffset)
      input.battle.projectiles.push({
        projectileInstanceId: input.nextInstanceId(meleeProjectileId),
        projectileId: meleeProjectileId,
        side: meleeProjectileSpec?.side ?? "player",
        position: { ...input.request.position },
        velocity: {
          x: direction.x * 320,
          y: direction.y * 320,
        },
        radius: resolveHitRadius(meleeProjectileSpec?.hitboxPresetId),
        remainingMs: 150,
        spawnDelayMs:
          (input.request.delayMs ?? 0) +
          index *
            (typeof input.request.params.meleeSequentialDelayMs === "number"
              ? input.request.params.meleeSequentialDelayMs
              : 0),
        damage:
          typeof input.request.params.meleeDamage === "number"
            ? input.request.params.meleeDamage
            : 8,
        noiseDamage: meleeProjectileSpec?.noiseDamage ?? 0,
        burnDamagePerSec,
        burnDurationMs,
        nonColliding: false,
      })
    }
  }
}

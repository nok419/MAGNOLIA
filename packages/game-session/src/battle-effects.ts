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
  clamp01,
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
  hitboxPresets: ContentBundle["contentHitboxPresets"]
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
          hitboxPresets: input.hitboxPresets,
          nextInstanceId: input.nextInstanceId,
          mainCadenceMultiplier: input.mainCadenceMultiplier,
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
  hitboxPresets: ContentBundle["contentHitboxPresets"]
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

    projectile.ageMs = (projectile.ageMs ?? 0) + input.dtMs
    applyBendTrajectory(projectile)
    if (projectile.anchorToPlayer) {
      projectile.position = { ...input.battle.playerPosition }
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
        const homingStrength = Math.min(
          1,
          (1 - Math.exp(-input.statModifiers.homingStrength * dtSeconds)) * 2.2,
        )
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

    if (!projectile.anchorToPlayer) {
      projectile.position.x += projectile.velocity.x * dtSeconds
      projectile.position.y += projectile.velocity.y * dtSeconds
    }
    projectile.remainingMs -= input.dtMs
    spawnedVisualProjectiles.push(
      ...spawnTrailExplosions({
        battle: input.battle,
        projectile,
        dtMs: input.dtMs,
        projectiles: input.projectiles,
        nextInstanceId: input.nextInstanceId,
      }),
    )
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
  const areaDamageDurationMs = Math.max(0, input.projectile.explosionAreaDamageDurationMs ?? 0)
  const areaDamage = input.projectile.damage * (input.projectile.explosionAreaDamageMultiplier ?? 0)

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

  if (input.projectile.explosionClearsEnemyProjectiles) {
    const explosionRadius = input.projectile.explosiveRadius
    // キャリア爆発は静音波と同じ範囲で敵弾を消します。磁気災害への抵抗は support field 側だけに残します。
    input.battle.projectiles = input.battle.projectiles.filter(
      (projectile) =>
        projectile.side !== "enemy" ||
        !isWithinRadius(
          projectile.position,
          input.projectile.position,
          explosionRadius,
        ),
    )
  }

  if (!input.projectile.explosionVisualProjectileId) {
    return null
  }

  const projectileSpec = input.projectiles[input.projectile.explosionVisualProjectileId]
  const visualLifetimeMs = Math.max(projectileSpec?.lifetimeMs ?? 180, areaDamageDurationMs)
  return {
    projectileInstanceId: input.nextInstanceId(input.projectile.explosionVisualProjectileId),
    projectileId: input.projectile.explosionVisualProjectileId,
    side: "player",
    position: { ...input.projectile.position },
    velocity: { x: 0, y: 0 },
    radius: input.projectile.explosiveRadius,
    remainingMs: visualLifetimeMs,
    initialLifetimeMs: visualLifetimeMs,
    ageMs: 0,
    spawnDelayMs: 0,
    damage: 0,
    noiseDamage: 0,
    nonColliding: true,
    areaDamagePerSecond:
      areaDamage > 0 && areaDamageDurationMs > 0 ? areaDamage / (areaDamageDurationMs / 1000) : undefined,
    areaClearsEnemyProjectiles: Boolean(input.projectile.explosionClearsEnemyProjectiles),
  }
}

function applyBendTrajectory(projectile: InternalProjectileState): void {
  if (
    !projectile.preBendVelocity ||
    !projectile.postBendVelocity ||
    typeof projectile.bendAfterMs !== "number"
  ) {
    return
  }

  const bendDurationMs = Math.max(1, projectile.bendDurationMs ?? 80)
  const progress = clamp01(((projectile.ageMs ?? 0) - projectile.bendAfterMs) / bendDurationMs)
  if (progress <= 0) {
    projectile.velocity = { ...projectile.preBendVelocity }
    return
  }

  // 折れ曲がりを短い補間にして、菱形の角は見せつつ弾速の急変だけを抑えます。
  const eased = progress * progress * (3 - 2 * progress)
  const mixed = normalizeVector({
    x: projectile.preBendVelocity.x * (1 - eased) + projectile.postBendVelocity.x * eased,
    y: projectile.preBendVelocity.y * (1 - eased) + projectile.postBendVelocity.y * eased,
  })
  const speed = Math.hypot(projectile.preBendVelocity.x, projectile.preBendVelocity.y)
  projectile.velocity = {
    x: mixed.x * speed,
    y: mixed.y * speed,
  }
}

function spawnTrailExplosions(input: {
  battle: InternalBattleState
  projectile: InternalProjectileState
  dtMs: number
  projectiles: ContentBundle["projectiles"]
  nextInstanceId: (prefix: string) => string
}): InternalProjectileState[] {
  if (
    input.projectile.side !== "player" ||
    !input.projectile.trailExplosionIntervalMs ||
    !input.projectile.trailExplosionRadius ||
    !input.projectile.trailExplosionVisualProjectileId
  ) {
    return []
  }

  const visuals: InternalProjectileState[] = []
  input.projectile.trailExplosionTimerMs =
    (input.projectile.trailExplosionTimerMs ?? input.projectile.trailExplosionIntervalMs) -
    input.dtMs

  // dt が大きいフレームでも爆発の個数を保つため、蓄積タイマーで処理します。
  while (input.projectile.trailExplosionTimerMs <= 0) {
    const explosionVisual = detonatePlayerProjectile({
      battle: input.battle,
      projectile: {
        ...input.projectile,
        explosiveRadius: input.projectile.trailExplosionRadius,
        explosionDamageMultiplier: input.projectile.trailExplosionDamageMultiplier,
        explosionAreaDamageMultiplier: input.projectile.trailExplosionAreaDamageMultiplier,
        explosionAreaDamageDurationMs: input.projectile.trailExplosionAreaDamageDurationMs,
        explosionClearsEnemyProjectiles: input.projectile.trailExplosionClearsEnemyProjectiles,
        explosionVisualProjectileId: input.projectile.trailExplosionVisualProjectileId,
      },
      projectiles: input.projectiles,
      nextInstanceId: input.nextInstanceId,
    })
    if (explosionVisual) {
      visuals.push(explosionVisual)
    }
    input.projectile.trailExplosionTimerMs += input.projectile.trailExplosionIntervalMs
  }

  return visuals
}

function applyMeleeSweepDamage(input: {
  battle: InternalBattleState
  origin: { x: number; y: number }
  direction: { x: number; y: number }
  range: number
  arcDeg: number
  damage: number
  burnDamagePerSec?: number
  burnDurationMs?: number
}): string[] {
  const forward = normalizeVector(input.direction)
  const halfArcRadians = (Math.max(1, input.arcDeg) * Math.PI) / 360
  const hitEnemyInstanceIds: string[] = []

  for (const enemy of input.battle.enemies) {
    const toEnemy = {
      x: enemy.position.x - input.origin.x,
      y: enemy.position.y - input.origin.y,
    }
    const distance = Math.hypot(toEnemy.x, toEnemy.y)
    if (distance > input.range + enemy.radius) {
      continue
    }

    const targetDirection = normalizeVector(toEnemy)
    const dot = Math.max(
      -1,
      Math.min(1, forward.x * targetDirection.x + forward.y * targetDirection.y),
    )
    const angle = Math.acos(dot)
    if (angle > halfArcRadians) {
      continue
    }

    enemy.hp -= input.damage
    hitEnemyInstanceIds.push(enemy.enemyInstanceId)
    if (input.burnDamagePerSec && input.burnDurationMs) {
      enemy.burnDamagePerSec = input.burnDamagePerSec
      enemy.burnUntilMs = input.battle.elapsedMs + input.burnDurationMs
    }
  }

  return hitEnemyInstanceIds
}

function readRequestNumericParam(
  params: Record<string, number | string | boolean> | undefined,
  key: string,
  fallback: number,
): number {
  const value = params?.[key]
  return typeof value === "number" ? value : fallback
}

function spawnProjectilesFromRequest(input: {
  battle: InternalBattleState
  request: Extract<RuntimeEffectRequest, { kind: "spawnProjectile" }>
  modifierPatch: RuntimeModifierPatch
  projectiles: ContentBundle["projectiles"]
  hitboxPresets: ContentBundle["contentHitboxPresets"]
  nextInstanceId: (prefix: string) => string
  mainCadenceMultiplier: number
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
    const baseDirection = normalizeVector(input.request.direction)
    const direction = rotateVector(baseDirection, spreadOffset)
    const lifetimeMs = input.request.lifetimeMs ?? projectileSpec?.lifetimeMs ?? 2000
    const trailExplosionEnabled = Boolean(input.request.params?.trailExplosion)
    const trailExplosionIntervalMs = readRequestNumericParam(
      input.request.params,
      "trailExplosionIntervalMs",
      0,
    )
    const foldSideProjectiles =
      Boolean(input.request.params?.foldSideProjectiles) &&
      count > 1 &&
      Math.abs(spreadOffset) > 0.001
    // 菱形弾道は左右弾だけに曲げ先を持たせ、中央弾は基準線として直進させます。
    const postBendDirection = foldSideProjectiles
      ? rotateVector(baseDirection, -spreadOffset)
      : undefined
    input.battle.projectiles.push({
      projectileInstanceId: input.nextInstanceId(input.request.projectileId),
      projectileId: input.request.projectileId,
      side: projectileSpec?.side ?? "player",
      position: { ...input.request.position },
      velocity: {
        x: direction.x * input.request.speed,
        y: direction.y * input.request.speed,
      },
      radius: resolveHitRadius(projectileSpec ? input.hitboxPresets[projectileSpec.hitboxPresetId] : undefined),
      remainingMs: lifetimeMs,
      initialLifetimeMs: lifetimeMs,
      ageMs: 0,
      damage: input.request.damage ?? projectileSpec?.damage ?? 0,
      noiseDamage: input.request.noiseDamage ?? projectileSpec?.noiseDamage ?? 0,
      preBendVelocity: foldSideProjectiles
        ? {
            x: direction.x * input.request.speed,
            y: direction.y * input.request.speed,
          }
        : undefined,
      postBendVelocity: postBendDirection
        ? {
            x: postBendDirection.x * input.request.speed,
            y: postBendDirection.y * input.request.speed,
          }
        : undefined,
      bendAfterMs: foldSideProjectiles
        ? readRequestNumericParam(input.request.params, "foldBendAfterMs", 140)
        : undefined,
      bendDurationMs: foldSideProjectiles
        ? readRequestNumericParam(input.request.params, "foldBendDurationMs", 70)
        : undefined,
      trailExplosionIntervalMs:
        trailExplosionEnabled && trailExplosionIntervalMs > 0 ? trailExplosionIntervalMs : undefined,
      trailExplosionTimerMs:
        trailExplosionEnabled && trailExplosionIntervalMs > 0 ? trailExplosionIntervalMs : undefined,
      trailExplosionRadius:
        trailExplosionEnabled
          ? readRequestNumericParam(input.request.params, "explosionRadius", 30)
          : undefined,
      trailExplosionDamageMultiplier:
        trailExplosionEnabled
          ? readRequestNumericParam(input.request.params, "explosionDamageMultiplier", 0.75)
          : undefined,
      trailExplosionAreaDamageMultiplier:
        trailExplosionEnabled
          ? readRequestNumericParam(input.request.params, "explosionAreaDamageMultiplier", 0)
          : undefined,
      trailExplosionAreaDamageDurationMs:
        trailExplosionEnabled
          ? readRequestNumericParam(input.request.params, "explosionAreaDamageDurationMs", 0)
          : undefined,
      trailExplosionClearsEnemyProjectiles:
        trailExplosionEnabled
          ? Boolean(input.request.params?.explosionClearsEnemyProjectiles)
          : undefined,
      trailExplosionVisualProjectileId:
        trailExplosionEnabled &&
        typeof input.request.params?.explosionVisualProjectileId === "string"
          ? input.request.params.explosionVisualProjectileId
          : undefined,
      explosiveRadius:
        !trailExplosionEnabled &&
        input.request.params &&
        typeof input.request.params.explosionRadius === "number"
          ? input.request.params.explosionRadius
          : undefined,
      burnDamagePerSec,
      burnDurationMs,
      inversePhaseVisual: Boolean(input.modifierPatch.visibilityModifiers?.inversePhaseVisual),
      spawnDelayMs: input.request.delayMs ?? 0,
      detonationDelayMs:
        !trailExplosionEnabled &&
        input.request.params &&
        typeof input.request.params.explosionDelayMs === "number"
          ? input.request.params.explosionDelayMs
          : undefined,
      explosionDamageMultiplier:
        input.request.params && typeof input.request.params.explosionDamageMultiplier === "number"
          ? input.request.params.explosionDamageMultiplier
          : undefined,
      explosionAreaDamageMultiplier:
        input.request.params && typeof input.request.params.explosionAreaDamageMultiplier === "number"
          ? input.request.params.explosionAreaDamageMultiplier
          : undefined,
      explosionAreaDamageDurationMs:
        input.request.params && typeof input.request.params.explosionAreaDamageDurationMs === "number"
          ? input.request.params.explosionAreaDamageDurationMs
          : undefined,
      explosionClearsEnemyProjectiles:
        input.request.params && Boolean(input.request.params.explosionClearsEnemyProjectiles),
      explosionVisualProjectileId:
        input.request.params && typeof input.request.params.explosionVisualProjectileId === "string"
          ? input.request.params.explosionVisualProjectileId
          : undefined,
      nonColliding:
        Boolean(input.request.params?.visualOnly),
      piercing: Boolean(input.request.params?.piercing),
    })
  }

  if (
    input.request.params?.meleeEnabled &&
    typeof input.request.params.meleeProjectileId === "string" &&
    (input.battle.mainMeleeCooldownMs ?? 0) <= 0
  ) {
    const meleeProjectileId = input.request.params.meleeProjectileId
    const meleeProjectileSpec = input.projectiles[meleeProjectileId]
    const meleeStyle =
      typeof input.request.params.meleeStyle === "string" ? input.request.params.meleeStyle : "burst"
    const meleeRange = readRequestNumericParam(input.request.params, "meleeRange", 80)
    const meleeCollisionRange = readRequestNumericParam(
      input.request.params,
      "meleeCollisionRange",
      meleeRange * 1.8,
    )
    const meleeCollisionArcDeg = readRequestNumericParam(input.request.params, "meleeCollisionArcDeg", 32)
    const meleeDamage = readRequestNumericParam(input.request.params, "meleeDamage", 8)
    const meleeSpreadDeg = readRequestNumericParam(input.request.params, "meleeSpreadDeg", 120)
    if (!hasEnemyWithinRange(input.battle.enemies, input.request.position, meleeCollisionRange)) {
      return
    }

    if (meleeStyle === "swordSweep") {
      // 近接は円弧状の弾をばら撒かず、前方扇形の判定と一つの表示用スイープに分けます。
      const hitEnemyInstanceIds = applyMeleeSweepDamage({
        battle: input.battle,
        origin: input.request.position,
        direction: input.request.direction,
        range: meleeCollisionRange,
        arcDeg: meleeSpreadDeg,
        damage: meleeDamage,
        burnDamagePerSec,
        burnDurationMs,
      })

      const sweepDurationMs = readRequestNumericParam(
        input.request.params,
        "meleeSweepDurationMs",
        380,
      )
      input.battle.projectiles.push({
        projectileInstanceId: input.nextInstanceId(meleeProjectileId),
        projectileId: meleeProjectileId,
        side: meleeProjectileSpec?.side ?? "player",
        position: { ...input.request.position },
        velocity: normalizeVector(input.request.direction),
        radius: meleeRange,
        remainingMs: sweepDurationMs,
        initialLifetimeMs: sweepDurationMs,
        ageMs: 0,
        spawnDelayMs: input.request.delayMs ?? 0,
        damage: 0,
        noiseDamage: 0,
        nonColliding: true,
        anchorToPlayer: true,
        meleeSweepDamage: meleeDamage,
        meleeSweepRange: meleeCollisionRange,
        meleeSweepArcDeg: meleeCollisionArcDeg,
        meleeSweepHitEnemyInstanceIds: hitEnemyInstanceIds,
        burnDamagePerSec,
        burnDurationMs,
        inversePhaseVisual: Boolean(input.modifierPatch.visibilityModifiers?.inversePhaseVisual),
      })
      // main 弾の連射とは別に、近接の一振りだけを重く遅くします。
      input.battle.mainMeleeCooldownMs =
        readRequestNumericParam(input.request.params, "meleeCooldownMs", 760) *
        input.mainCadenceMultiplier
      return
    }

    const meleeCount =
      typeof input.request.params.meleeShotCount === "number" ? input.request.params.meleeShotCount : 3

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
        radius: resolveHitRadius(meleeProjectileSpec ? input.hitboxPresets[meleeProjectileSpec.hitboxPresetId] : undefined),
        remainingMs: 150,
        spawnDelayMs:
          (input.request.delayMs ?? 0) +
          index *
            (typeof input.request.params.meleeSequentialDelayMs === "number"
              ? input.request.params.meleeSequentialDelayMs
              : 0),
        damage:
          meleeDamage,
        noiseDamage: meleeProjectileSpec?.noiseDamage ?? 0,
        burnDamagePerSec,
        burnDurationMs,
        nonColliding: false,
      })
    }
  }
}

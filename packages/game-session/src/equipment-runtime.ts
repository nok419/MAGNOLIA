import type {
  BattlePhase,
  EnemyId,
  EffectSpec,
  EffectId,
  EquipmentId,
  EquipmentMaster,
  EquipmentSlot,
  MissionId,
  SubsystemIndex,
  SubsystemHookKind,
  ProfileRow,
  RuntimeEffectRequest,
  Vector2,
} from "@magnolia/contracts"

export type ResolvedEquipmentBinding = {
  equipmentId: EquipmentId
  slot: EquipmentSlot
  subsystemIndex?: SubsystemIndex
  level: number
  runtimeHandlerId?: string
  passiveEffects: EffectSpec[]
  activeEffects: EffectSpec[]
}

export type ResolvedLoadout = {
  main?: ResolvedEquipmentBinding
  sub?: ResolvedEquipmentBinding
  os?: ResolvedEquipmentBinding
  subsystems: [ResolvedEquipmentBinding | undefined, ResolvedEquipmentBinding | undefined]
}

export type MainWeaponContext = {
  playerPosition: Vector2
  facing: Vector2
  resolvedLoadout: ResolvedLoadout
  frameTimeMs: number
}

export type SubWeaponContext = MainWeaponContext & {
  stock: number
}

export type PassiveEffectContext = {
  phase: BattlePhase
  resolvedLoadout: ResolvedLoadout
}

export type PassiveEffectHandlerInput = PassiveEffectContext & {
  source: ResolvedEquipmentBinding
  effect: EffectSpec
}

export type SubsystemHookContext =
  | {
      hook: "onExploreStep"
      frameTimeMs: number
      resolvedLoadout: ResolvedLoadout
    }
  | {
      hook: "onBattleStep"
      frameTimeMs: number
      resolvedLoadout: ResolvedLoadout
    }
  | {
      hook: "onPlayerHit"
      noiseDamage: number
      worldPosition: Vector2
      resolvedLoadout: ResolvedLoadout
    }
  | {
      hook: "onEnemyDestroyed"
      enemyId: EnemyId
      analysisValue: number
      resolvedLoadout: ResolvedLoadout
    }
  | {
      hook: "onMissionStart"
      missionId: MissionId
      resolvedLoadout: ResolvedLoadout
    }
  | {
      hook: "onMissionEnd"
      missionId: MissionId
      cleared: boolean
      resolvedLoadout: ResolvedLoadout
    }

export type SubsystemHookHandlerInput = SubsystemHookContext & {
  source: ResolvedEquipmentBinding
  effect: EffectSpec
}

export type RuntimeModifierPatch = {
  statModifiers?: Record<string, number>
  visibilityModifiers?: Record<string, boolean>
}

export type SubsystemHookResult = {
  modifierPatch?: RuntimeModifierPatch
  effectRequests?: RuntimeEffectRequest[]
  analysisDelta?: number
  noiseDelta?: number
}

export type MainWeaponHandler = (input: MainWeaponContext) => RuntimeEffectRequest[]
export type SubWeaponHandler = (input: SubWeaponContext) => RuntimeEffectRequest[]
export type PassiveEffectHandler = (input: PassiveEffectHandlerInput) => RuntimeModifierPatch
export type BoundPassiveEffectHandler = (input: PassiveEffectContext) => RuntimeModifierPatch
export type SubsystemHookHandler = (input: SubsystemHookHandlerInput) => SubsystemHookResult
export type BoundSubsystemHookHandler = (input: SubsystemHookContext) => SubsystemHookResult

export type EquipmentRuntimeRegistry = {
  mainWeapons: Record<string, MainWeaponHandler>
  subWeapons: Record<string, SubWeaponHandler>
  passiveHandlers: Record<string, PassiveEffectHandler>
  subsystemHooks: Record<string, SubsystemHookHandler>
}

export type EquipmentRuntimeBindings = {
  fireMainWeapon?: MainWeaponHandler
  useSubWeapon?: SubWeaponHandler
  applyExplorePassives: BoundPassiveEffectHandler[]
  applyBattlePassives: BoundPassiveEffectHandler[]
  subsystemHooks: Record<SubsystemHookKind, BoundSubsystemHookHandler[]>
}

export function resolveLoadout(input: {
  equipped: ProfileRow["equipped"]
  equipmentLevels?: ProfileRow["equipmentLevels"]
  equipment: Record<EquipmentId, EquipmentMaster>
  effects: Record<EffectId, EffectSpec>
}): ResolvedLoadout {
  return {
    main: resolveEquipmentBinding(
      "main",
      input.equipped.main,
      input.equipmentLevels,
      input.equipment,
      input.effects,
    ),
    sub: resolveEquipmentBinding(
      "sub",
      input.equipped.sub,
      input.equipmentLevels,
      input.equipment,
      input.effects,
    ),
    os: resolveEquipmentBinding(
      "os",
      input.equipped.os,
      input.equipmentLevels,
      input.equipment,
      input.effects,
    ),
    // subsystem は 2 枠固定のため、保存順をそのまま保持して解決します。
    subsystems: [
      resolveEquipmentBinding(
        "subsystem",
        input.equipped.subsystems[0] ?? undefined,
        input.equipmentLevels,
        input.equipment,
        input.effects,
        0,
      ),
      resolveEquipmentBinding(
        "subsystem",
        input.equipped.subsystems[1] ?? undefined,
        input.equipmentLevels,
        input.equipment,
        input.effects,
        1,
      ),
    ],
  }
}

export function createEquipmentRuntimeBindings(input: {
  loadout: ResolvedLoadout
  registry: EquipmentRuntimeRegistry
}): EquipmentRuntimeBindings {
  return {
    // 呼び出し元は slot ごとの装備 ID を知らずに済むよう、ここで handler を束ねます。
    fireMainWeapon: resolveMainWeaponHandler(input.loadout.main, input.registry),
    useSubWeapon: resolveSubWeaponHandler(input.loadout.sub, input.registry),
    applyExplorePassives: resolvePassiveHandlers(input.loadout, input.registry, "explore"),
    applyBattlePassives: resolvePassiveHandlers(input.loadout, input.registry, "battle"),
    subsystemHooks: resolveSubsystemHookHandlers(input.loadout, input.registry),
  }
}

export function fireEquippedMainWeapon(input: {
  bindings: EquipmentRuntimeBindings
  context: MainWeaponContext
}): RuntimeEffectRequest[] {
  return input.bindings.fireMainWeapon?.(input.context) ?? []
}

export function useEquippedSubWeapon(input: {
  bindings: EquipmentRuntimeBindings
  context: SubWeaponContext
}): RuntimeEffectRequest[] {
  return input.bindings.useSubWeapon?.(input.context) ?? []
}

export function applyEquippedPassives(input: {
  bindings: EquipmentRuntimeBindings
  context: PassiveEffectContext
}): RuntimeModifierPatch {
  const handlers =
    input.context.phase === "explore"
      ? input.bindings.applyExplorePassives
      : input.bindings.applyBattlePassives

  return handlers.reduce<RuntimeModifierPatch>((accumulator, handler) => {
    const patch = handler(input.context)
    return mergeRuntimeModifierPatch(accumulator, patch)
  }, {})
}

export function runSubsystemHooks(input: {
  bindings: EquipmentRuntimeBindings
  context: SubsystemHookContext
}): SubsystemHookResult {
  const handlers = input.bindings.subsystemHooks[input.context.hook]

  return handlers.reduce<SubsystemHookResult>((accumulator, handler) => {
    const result = handler(input.context)
    return mergeSubsystemHookResult(accumulator, result)
  }, {})
}

export function fireDefaultMainShot(input: {
  playerPosition: Vector2
  facing: Vector2
  shotLevel: number
  resolvedLoadout: ResolvedLoadout
}): RuntimeEffectRequest[] {
  const mainShotEffect = input.resolvedLoadout.main?.activeEffects.find(
    (effect) => effect.effectKind === "mainShot",
  )
  const speed = readNumericParam(mainShotEffect, "projectileSpeed", 920)
  // main の content は cadenceMs で発射間隔を持つため、旧 cooldownMs と両対応にします。
  const cooldownMs = readNumericParam(
    mainShotEffect,
    "cadenceMs",
    readNumericParam(mainShotEffect, "cooldownMs", 160),
  )
  const projectileId = String(mainShotEffect?.params?.projectileId ?? "projectile.player.default")
  // 装備強化で弾数を増やせるよう、shotLevel ではなく effect 側の shotCount を優先します。
  const count = Math.max(1, readNumericParam(mainShotEffect, "shotCount", input.shotLevel))
  const requests: RuntimeEffectRequest[] = [
    {
      kind: "spawnProjectile",
      projectileId,
      position: input.playerPosition,
      direction: normalizeVector(input.facing),
      speed,
      count,
      spreadDeg: readNumericParam(mainShotEffect, "spreadDeg", 0),
      damage: readNumericParam(mainShotEffect, "damage", 10),
      params: {
        foldSideProjectiles: Boolean(mainShotEffect?.params?.foldSideProjectiles),
        foldBendAfterMs: readNumericParam(mainShotEffect, "foldBendAfterMs", 140),
        foldBendDurationMs: readNumericParam(mainShotEffect, "foldBendDurationMs", 70),
        meleeEnabled: Boolean(mainShotEffect?.params?.meleeEnabled),
        meleeStyle: String(mainShotEffect?.params?.meleeStyle ?? "burst"),
        meleeRange: readNumericParam(mainShotEffect, "meleeRange", 80),
        meleeProjectileId: String(
          mainShotEffect?.params?.meleeProjectileId ?? "proj_player_pulse_melee",
        ),
        meleeDamage: readNumericParam(mainShotEffect, "meleeDamage", 8),
        meleeSpreadDeg: readNumericParam(mainShotEffect, "meleeSpreadDeg", 120),
        meleeCollisionRange: readNumericParam(
          mainShotEffect,
          "meleeCollisionRange",
          readNumericParam(mainShotEffect, "meleeRange", 80) * 1.8,
        ),
        meleeCollisionArcDeg: readNumericParam(mainShotEffect, "meleeCollisionArcDeg", 32),
        meleeShotCount: readNumericParam(mainShotEffect, "meleeShotCount", 5),
        meleeSequentialDelayMs: readNumericParam(mainShotEffect, "meleeSequentialDelayMs", 30),
        meleeSweepDurationMs: readNumericParam(mainShotEffect, "meleeSweepDurationMs", 560),
        meleeCooldownMs: readNumericParam(mainShotEffect, "meleeCooldownMs", 760),
      },
    },
  ]

  requests.push(
    {
      kind: "playEffect",
      effectId: "effect.player.main-shot.muzzle",
      position: input.playerPosition,
    },
    {
      kind: "applyCooldown",
      slot: "main",
      durationMs: cooldownMs,
    },
  )

  return requests
}

function resolveEquipmentBinding(
  slot: EquipmentSlot,
  equipmentId: EquipmentId | undefined,
  equipmentLevels: ProfileRow["equipmentLevels"] | undefined,
  equipment: Record<EquipmentId, EquipmentMaster>,
  effects: Record<EffectId, EffectSpec>,
  subsystemIndex?: SubsystemIndex,
): ResolvedEquipmentBinding | undefined {
  if (!equipmentId) {
    return undefined
  }

  const definition = equipment[equipmentId]
  if (!definition) {
    return undefined
  }

  // save 側の装備配置がマスター定義と食い違う場合は、不正な組み合わせとして無視します。
  if (definition.slot !== slot) {
    return undefined
  }

  const level = resolveEquipmentLevel(equipmentId, definition, equipmentLevels)
  const levelOverrides = resolveLevelOverrides(definition, level)
  const activeEffects = definition.activeEffectIds
    .map((effectId) => effects[effectId])
    .filter((effect): effect is EffectSpec => Boolean(effect))
    .map((effect) => applyLevelOverrides(effect, levelOverrides))
  const passiveEffects = definition.passiveEffectIds
    .map((effectId) => effects[effectId])
    .filter((effect): effect is EffectSpec => Boolean(effect))
    .map((effect) => applyLevelOverrides(effect, levelOverrides))

  return {
    equipmentId,
    slot,
    subsystemIndex,
    level,
    runtimeHandlerId: definition.runtimeHandlerId,
    activeEffects,
    passiveEffects,
  }
}

function resolveMainWeaponHandler(
  binding: ResolvedEquipmentBinding | undefined,
  registry: EquipmentRuntimeRegistry,
): MainWeaponHandler | undefined {
  if (!binding) {
    return undefined
  }

  const handlerId = binding.runtimeHandlerId ?? findRuntimeHandlerId(binding.activeEffects, "mainShot")
  if (!handlerId) {
    return undefined
  }

  return registry.mainWeapons[handlerId]
}

function resolveSubWeaponHandler(
  binding: ResolvedEquipmentBinding | undefined,
  registry: EquipmentRuntimeRegistry,
): SubWeaponHandler | undefined {
  if (!binding) {
    return undefined
  }

  const handlerId =
    binding.runtimeHandlerId ??
    findRuntimeHandlerId(binding.activeEffects, "subArmBurst") ??
    findRuntimeHandlerId(binding.activeEffects, "subArmField")
  if (!handlerId) {
    return undefined
  }

  return registry.subWeapons[handlerId]
}

function resolvePassiveHandlers(
  loadout: ResolvedLoadout,
  registry: EquipmentRuntimeRegistry,
  phase: BattlePhase,
): BoundPassiveEffectHandler[] {
  const handlers: BoundPassiveEffectHandler[] = []

  for (const binding of toBindings(loadout)) {
    for (const effect of binding.passiveEffects) {
      const handlerId = effect.runtimeHandlerId
      if (!handlerId) {
        continue
      }

      const handler = registry.passiveHandlers[handlerId]
      if (!handler) {
        continue
      }

      // 戦闘専用効果を探索側へ漏らさないため、phase ごとに適用先を分けます。
      if (phase === "explore" && isBattleOnlyPassive(effect)) {
        continue
      }

      handlers.push((context) =>
        handler({
          ...context,
          source: binding,
          effect,
        }),
      )
    }
  }

  return handlers
}

function resolveSubsystemHookHandlers(
  loadout: ResolvedLoadout,
  registry: EquipmentRuntimeRegistry,
): Record<SubsystemHookKind, BoundSubsystemHookHandler[]> {
  const handlers = createEmptySubsystemHookMap()

  for (const binding of loadout.subsystems) {
    if (!binding) {
      continue
    }

    for (const effect of binding.passiveEffects) {
      if (!effect.hookKind || !effect.runtimeHandlerId) {
        continue
      }

      const handler = registry.subsystemHooks[effect.runtimeHandlerId]
      if (!handler) {
        continue
      }

      // subsystem 固有の契機はここで束ね、scene 側に装備 ID 分岐を出さないようにします。
      handlers[effect.hookKind].push((context) =>
        handler({
          ...context,
          source: binding,
          effect,
        }),
      )
    }
  }

  return handlers
}

function findRuntimeHandlerId(
  effects: EffectSpec[],
  targetKind: EffectSpec["effectKind"],
): string | undefined {
  return effects.find((effect) => effect.effectKind === targetKind)?.runtimeHandlerId
}

function toBindings(loadout: ResolvedLoadout): ResolvedEquipmentBinding[] {
  return [loadout.main, loadout.sub, loadout.os, ...loadout.subsystems].filter(
    (binding): binding is ResolvedEquipmentBinding => Boolean(binding),
  )
}

function isBattleOnlyPassive(effect: EffectSpec): boolean {
  return effect.effectKind === "noiseGuard" || effect.effectKind === "cooldownModifier"
}

function mergeRuntimeModifierPatch(
  left: RuntimeModifierPatch,
  right: RuntimeModifierPatch,
): RuntimeModifierPatch {
  const statModifiers = mergeNumericRecords(left.statModifiers, right.statModifiers)
  const visibilityModifiers = mergeBooleanRecords(left.visibilityModifiers, right.visibilityModifiers)

  return {
    statModifiers,
    visibilityModifiers,
  }
}

function mergeSubsystemHookResult(
  left: SubsystemHookResult,
  right: SubsystemHookResult,
): SubsystemHookResult {
  return {
    modifierPatch: mergeRuntimeModifierPatch(
      left.modifierPatch ?? {},
      right.modifierPatch ?? {},
    ),
    effectRequests: [...(left.effectRequests ?? []), ...(right.effectRequests ?? [])],
    analysisDelta: (left.analysisDelta ?? 0) + (right.analysisDelta ?? 0),
    noiseDelta: (left.noiseDelta ?? 0) + (right.noiseDelta ?? 0),
  }
}

function mergeNumericRecords(
  left?: Record<string, number>,
  right?: Record<string, number>,
): Record<string, number> | undefined {
  if (!left && !right) {
    return undefined
  }

  const merged: Record<string, number> = { ...(left ?? {}) }
  for (const [key, value] of Object.entries(right ?? {})) {
    merged[key] = (merged[key] ?? 0) + value
  }
  return merged
}

function mergeBooleanRecords(
  left?: Record<string, boolean>,
  right?: Record<string, boolean>,
): Record<string, boolean> | undefined {
  if (!left && !right) {
    return undefined
  }

  const merged: Record<string, boolean> = { ...(left ?? {}) }
  for (const [key, value] of Object.entries(right ?? {})) {
    merged[key] = Boolean(merged[key] || value)
  }
  return merged
}

function readNumericParam(
  effect: EffectSpec | undefined,
  key: string,
  fallback: number,
): number {
  const value = effect?.params?.[key]
  return typeof value === "number" ? value : fallback
}

function normalizeVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  if (length === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function resolveEquipmentLevel(
  equipmentId: EquipmentId,
  equipment: EquipmentMaster,
  equipmentLevels: ProfileRow["equipmentLevels"] | undefined,
): number {
  const requestedLevel = equipmentLevels?.[equipmentId] ?? 0
  return Math.max(0, Math.min(requestedLevel, equipment.maxLevel))
}

function resolveLevelOverrides(
  equipment: EquipmentMaster,
  level: number,
): Record<string, number> {
  const overrides: Record<string, number> = {}

  // レベル 1 から順に上書きを畳み込むことで、後段レベルの値が最終値になります。
  for (const levelParams of equipment.levelParams) {
    if (levelParams.level > level) {
      continue
    }

    Object.assign(overrides, levelParams.effectOverrides)
  }

  return overrides
}

function applyLevelOverrides(
  effect: EffectSpec,
  levelOverrides: Record<string, number>,
): EffectSpec {
  if (Object.keys(levelOverrides).length === 0) {
    return effect
  }

  return {
    ...effect,
    params: {
      ...(effect.params ?? {}),
      ...levelOverrides,
    },
  }
}

export const defaultEquipmentRuntimeRegistry: EquipmentRuntimeRegistry = {
  mainWeapons: {
    "weapon.main.pulse": (input) =>
      fireDefaultMainShot({
        playerPosition: input.playerPosition,
        facing: input.facing,
        shotLevel: 1,
        resolvedLoadout: input.resolvedLoadout,
      }),
    "weapon.main.carrier": (input) => {
      const mainShotEffect = input.resolvedLoadout.main?.activeEffects.find(
        (effect) => effect.effectKind === "mainShot",
      )
      const cooldownMs = readNumericParam(mainShotEffect, "cadenceMs", 300)
      return [
        {
          kind: "spawnProjectile",
          projectileId: String(
            mainShotEffect?.params?.projectileId ?? "proj_player_carrier",
          ),
          position: input.playerPosition,
          direction: normalizeVector(input.facing),
          speed: readNumericParam(mainShotEffect, "projectileSpeed", 760),
          count: Math.max(1, readNumericParam(mainShotEffect, "shotCount", 1)),
          spreadDeg: readNumericParam(mainShotEffect, "spreadDeg", 0),
          damage: readNumericParam(mainShotEffect, "damage", 15),
          lifetimeMs: readNumericParam(mainShotEffect, "lifetimeMs", 1800),
          params: {
            // キャリアは本体を消さず、進路上へ周期的な爆発を残す主兵装として扱います。
            piercing: true,
            trailExplosion: Boolean(mainShotEffect?.params?.trailExplosion),
            explosionRadius: readNumericParam(mainShotEffect, "explosionRadius", 30),
            trailExplosionIntervalMs: readNumericParam(
              mainShotEffect,
              "trailExplosionIntervalMs",
              180,
            ),
            explosionDamageMultiplier: readNumericParam(
              mainShotEffect,
              "explosionDamageMultiplier",
              0.75,
            ),
            explosionAreaDamageMultiplier: readNumericParam(
              mainShotEffect,
              "explosionAreaDamageMultiplier",
              0,
            ),
            explosionAreaDamageDurationMs: readNumericParam(
              mainShotEffect,
              "explosionAreaDamageDurationMs",
              0,
            ),
            explosionClearsEnemyProjectiles: Boolean(
              mainShotEffect?.params?.explosionClearsEnemyProjectiles,
            ),
            explosionVisualProjectileId: String(
              mainShotEffect?.params?.explosionVisualProjectileId ??
                "proj_player_carrier_blast",
            ),
          },
        },
        {
          kind: "playEffect",
          effectId: "effect.player.main-shot.carrier",
          position: input.playerPosition,
        },
        {
          kind: "applyCooldown",
          slot: "main",
          durationMs: cooldownMs,
        },
      ]
    },
    "weapon.main.default": (input) =>
      fireDefaultMainShot({
        playerPosition: input.playerPosition,
        facing: input.facing,
        shotLevel: 1,
        resolvedLoadout: input.resolvedLoadout,
      }),
  },
  subWeapons: {
    "sub.default.burst": (input) => {
      const burstEffect = input.resolvedLoadout.sub?.activeEffects.find(
        (effect) => effect.effectKind === "subArmBurst",
      )

      return [
        {
          kind: "playEffect",
          effectId: "effect.player.sub.burst",
          position: input.playerPosition,
        },
        {
          kind: "applyCooldown",
          slot: "sub",
          durationMs: readNumericParam(burstEffect, "cooldownMs", 2500),
        },
      ]
    },
    "sub.barrier.noise_canceller": (input) => {
      const fieldEffect = input.resolvedLoadout.sub?.activeEffects.find(
        (effect) => effect.effectKind === "subArmField",
      )

      return [
        {
          kind: "spawnBarrier",
          barrierId: "barrier.noise_canceller",
          position: input.playerPosition,
          radius: readNumericParam(fieldEffect, "radius", 48),
          durationMs: readNumericParam(fieldEffect, "maxDurationMs", 1200),
          moveSpeedMultiplier: readNumericParam(fieldEffect, "moveSpeedMultiplier", 0.8),
          blocksEnemyBullets: Boolean(fieldEffect?.params?.blocksEnemyBullets),
          allowAttackDuringUse: Boolean(fieldEffect?.params?.allowAttackDuringUse),
        },
        {
          kind: "applyCooldown",
          slot: "sub",
          durationMs: readNumericParam(fieldEffect, "cooldownMs", 3000),
        },
      ]
    },
    "sub.field.silent_wave": (input) => {
      const fieldEffect = input.resolvedLoadout.sub?.activeEffects.find(
        (effect) => effect.effectKind === "subArmField",
      )
      const direction = normalizeVector(input.facing)
      const fieldPosition = {
        // バリアとの差を明確にするため、静音波は自機の少し前へ射出して展開します。
        x: input.playerPosition.x + direction.x * readNumericParam(fieldEffect, "spawnOffset", 72),
        y: input.playerPosition.y + direction.y * readNumericParam(fieldEffect, "spawnOffset", 72),
      }
      const fieldRadius = readNumericParam(fieldEffect, "radius", 60)

      return [
        {
          kind: "spawnSupportField",
          fieldId: "field.silent_wave",
          position: fieldPosition,
          radius: fieldRadius,
          durationMs: readNumericParam(fieldEffect, "durationMs", 5000),
          launchSpeed: readNumericParam(fieldEffect, "launchSpeed", 110),
          dpsInField: readNumericParam(fieldEffect, "dpsInField", 5),
          blocksEnemyBullets: Boolean(fieldEffect?.params?.blocksEnemyBullets),
          blocksMagneticDisaster: Boolean(fieldEffect?.params?.blocksMagneticDisaster),
          mainCadenceMultiplier: readNumericParam(fieldEffect, "mainCadenceMultiplier", 1.5),
          driftsWithScroll: Boolean(fieldEffect?.params?.driftsWithScroll),
        },
        {
          // 展開直後に field 内の敵弾を掃くことで、静音波を barrier と見分けやすくします。
          kind: "clearEnemyProjectiles",
          position: fieldPosition,
          radius: fieldRadius,
        },
        {
          kind: "applyCooldown",
          slot: "sub",
          durationMs: readNumericParam(fieldEffect, "cooldownMs", 12000),
        },
      ]
    },
  },
  passiveHandlers: {
    "os.magnolia.core": ({ effect }) => ({
      visibilityModifiers: {
        mapRevealEnabled: Boolean(effect.params?.unlocksAreaVision),
        hudEnabled: Boolean(effect.params?.unlocksHud),
        equipmentEnabled: Boolean(effect.params?.unlocksEquipmentAccess),
        minimapEnabled: Boolean(effect.params?.unlocksMinimapDisplay),
        strengthMeterEnabled: Boolean(effect.params?.unlocksStrengthMeter),
        infoPanelEnabled: Boolean(effect.params?.unlocksInfoPanel),
      },
    }),
    "os.analysis.boost": ({ effect }) => ({
      statModifiers: {
        analysisBonus: readNumericParam(effect, "analysisBonus", 0.05),
      },
    }),
    "subsystem.map.reveal": ({ effect }) => ({
      statModifiers: {
        mapRevealRadius: readNumericParam(effect, "extraRadius", 1),
      },
      visibilityModifiers: {
        mapRevealEnabled: true,
      },
    }),
    "subsystem.movement.focus": ({ effect }) => ({
      statModifiers: {
        focusSpeedMultiplier: readNumericParam(effect, "focusSpeedMultiplier", 0.5),
      },
      visibilityModifiers: {
        focusMovementEnabled: Boolean(effect.params?.enableFocusMovement),
      },
    }),
    "subsystem.shot.modifier.homing": ({ effect }) => ({
      statModifiers: {
        homingStrength: readNumericParam(effect, "homingStrength", 0.3),
        homingRange: readNumericParam(effect, "homingRange", 150),
      },
    }),
    "subsystem.shot.modifier.burn": ({ effect }) => ({
      statModifiers: {
        burnDamagePerSec: readNumericParam(effect, "burnDamagePerSec", 3),
        burnDurationMs: readNumericParam(effect, "burnDurationMs", 3000),
      },
      visibilityModifiers: {
        burnEnabled: Boolean(effect.params?.addBurnOnHit),
        inversePhaseVisual: true,
      },
    }),
  },
  subsystemHooks: {
    "subsystem.analysis.ramp": ({ effect }) => ({
      analysisDelta: readNumericParam(effect, "analysisDeltaPerStep", 0.002),
    }),
    "subsystem.noise.gate": ({ effect }) => ({
      noiseDelta: -readNumericParam(effect, "noiseReduction", 0.08),
    }),
  },
}

function createEmptySubsystemHookMap(): Record<SubsystemHookKind, BoundSubsystemHookHandler[]> {
  return {
    onExploreStep: [],
    onBattleStep: [],
    onPlayerHit: [],
    onEnemyDestroyed: [],
    onMissionStart: [],
    onMissionEnd: [],
  }
}

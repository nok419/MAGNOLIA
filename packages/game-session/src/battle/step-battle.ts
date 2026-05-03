import type {
  AreaId,
  BattleFrameInput,
  BattleFrameResult,
  BattleSnapshot,
  ContentBundle,
  DifficultyModifiers,
  DomainEvent,
  EffectSpec,
  MissionState,
  ProfileAggregate,
  RootSnapshot,
  RuntimeEffectRequest,
  SaveRepository,
  TimeRange,
  TransmissionId,
  TransmissionProgressRow,
  Vector2,
} from "@magnolia/contracts"
import {
  applyEquippedPassives,
  fireEquippedMainWeapon,
  runSubsystemHooks,
  type RuntimeModifierPatch,
  useEquippedSubWeapon,
} from "../equipment-runtime"
import type { InternalBarrierState, InternalBattleState } from "../battle-state"
import { stepBattlefieldHazards } from "../hazards"
import {
  appendTimeRange,
  computeRecoverableArchiveHeardRanges,
  computeRestorationRate,
} from "../progression"
import {
  createBattleInvincibleStartPresentation,
  createBattleNoiseClearPresentation,
  createBattleNoisePeakPresentation,
  createBattleSubtitleDamagePresentation,
  flattenPresentationRequests,
} from "../presentation"
import { clampToRect, normalizeVector } from "../explore-world"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  isCircleInsideCircle,
} from "../battle-world"
import { clamp01 } from "../math"
import { getActiveBattleChunk } from "./battle-render-state"
import { resolveBattleCollisions as resolveBattleCollisionsFromSystem } from "./collision-system"
import { finalizeBattleMission } from "./battle-result-system"

type BattlePresentationRequests = ReturnType<typeof flattenPresentationRequests>

const PLAYER_HIT_TRANSCRIPT_DAMAGE_MS = 1200

export type BattleStepHost = {
  content: ContentBundle
  snapshot: {
    createBattleSnapshot: () => BattleSnapshot
  }
  profile: {
    advanceProfilePlayTime: (dtMs: number) => void
  }
  mission: {
    advanceMissionPhase: (battle: InternalBattleState) => void
    spawnMissionEnemies: (battle: InternalBattleState, previousElapsedMs: number) => void
    collectMissionBeatPresentationRequests: (
      battle: InternalBattleState,
      previousElapsedMs: number,
    ) => BattlePresentationRequests
    buildMissionState: () => MissionState
    saveMissionRun: SaveRepository["saveMissionRun"]
    getOrCreateTransmissionProgress: (
      transmissionId: TransmissionId,
      areaId: AreaId,
    ) => TransmissionProgressRow
    grantEquipment: (equipmentIds: string[]) => void
  }
  effects: {
    applyEffectRequests: (
      battle: InternalBattleState,
      effectRequests: RuntimeEffectRequest[],
      battlePassives: RuntimeModifierPatch,
    ) => { events: DomainEvent[]; presentationRequests: BattlePresentationRequests }
    updateSupportFields: (battle: InternalBattleState, dtMs: number) => void
    applyMagneticDisasterEffects: (battle: InternalBattleState, dtMs: number) => void
  }
  actors: {
    updateEnemies: (battle: InternalBattleState, dtMs: number) => DomainEvent[]
    updateProjectiles: (
      battle: InternalBattleState,
      dtMs: number,
      statModifiers: Record<string, number> | undefined,
    ) => void
  }
  pickups: {
    updatePickups: (battle: InternalBattleState, dtMs: number) => void
    spawnSelfRepairPickup: (
      battle: InternalBattleState,
      position: Vector2,
      amount: number,
    ) => void
  }
  fragments: {
    maybeSpawnBattleFragment: (input: {
      battle: InternalBattleState
      audioWindow: TimeRange
      strength: number
    }) => void
    updateBattleFragments: (
      battle: InternalBattleState,
      dtMs: number,
    ) => BattlePresentationRequests
  }
  player: {
    resolvePlayerHitRadius: () => number
    readMainCadenceMultiplier: (battle: InternalBattleState) => number
  }
  difficulty: {
    resolveDifficultyModifiers: () => DifficultyModifiers
  }
  audio: {
    resolveAudioWindow: (battle: InternalBattleState, dtMs: number) => TimeRange | null
  }
  ids: {
    nextInstanceId: (prefix: string) => string
  }
}

export function stepBattleFrame(input: {
  frameInput: BattleFrameInput
  battle: InternalBattleState | null
  screen: RootSnapshot["screen"]
  activeProfile: ProfileAggregate | null
  host: BattleStepHost
}): BattleFrameResult {
  const { frameInput, battle, host } = input
  if (!battle || input.screen !== "battle") {
    return {
      snapshot: host.snapshot.createBattleSnapshot(),
      events: [],
      effectRequests: [],
      presentationRequests: [],
    }
  }

  const dtSeconds = frameInput.dtMs / 1000
  const previousElapsedMs = battle.elapsedMs
  if (input.activeProfile) {
    host.profile.advanceProfilePlayTime(frameInput.dtMs)
  }
  battle.elapsedMs += frameInput.dtMs
  battle.mainCooldownMs = Math.max(0, battle.mainCooldownMs - frameInput.dtMs)
  battle.mainMeleeCooldownMs = Math.max(0, (battle.mainMeleeCooldownMs ?? 0) - frameInput.dtMs)
  battle.subCooldownMs = Math.max(0, battle.subCooldownMs - frameInput.dtMs)

  const battlePassives = applyEquippedPassives({
    bindings: battle.bindings,
    context: {
      phase: "battle",
      resolvedLoadout: battle.loadout,
    },
  })
  const focusSpeedMultiplier =
    frameInput.focus && battlePassives.visibilityModifiers?.focusMovementEnabled
      ? battlePassives.statModifiers?.focusSpeedMultiplier ?? 0.5
      : 1
  const baseMoveSpeed =
    frameInput.focus && battlePassives.visibilityModifiers?.focusMovementEnabled
      ? host.content.playerShipSpec.focusMoveSpeed ?? 140
      : host.content.playerShipSpec.baseMoveSpeed ?? 240
  const playerSpeed =
    baseMoveSpeed * focusSpeedMultiplier * (battle.barrier?.moveSpeedMultiplier ?? 1)
  const moveDirection = normalizeVector(frameInput.move)
  battle.playerPosition = clampToRect(
    {
      x: battle.playerPosition.x + moveDirection.x * playerSpeed * dtSeconds,
      y: battle.playerPosition.y + moveDirection.y * playerSpeed * dtSeconds,
    },
    { x: 8, y: 8, width: BATTLE_WIDTH - 16, height: BATTLE_HEIGHT - 16 },
  )

  host.mission.advanceMissionPhase(battle)
  host.mission.spawnMissionEnemies(battle, previousElapsedMs)
  const missionBeatPresentationRequests = host.mission.collectMissionBeatPresentationRequests(
    battle,
    previousElapsedMs,
  )

  const battleHookResult = runSubsystemHooks({
    bindings: battle.bindings,
    context: {
      hook: "onBattleStep",
      frameTimeMs: frameInput.dtMs,
      resolvedLoadout: battle.loadout,
    },
  })
  battle.destroyedAnalysisValue += Math.max(0, battleHookResult.analysisDelta ?? 0) * battle.mission.analysisTotal

  const effectRequests: RuntimeEffectRequest[] = [...(battleHookResult.effectRequests ?? [])]
  const events: DomainEvent[] = []
  const canFireMain = !battle.barrier || battle.barrier.allowAttackDuringUse
  if (frameInput.fireMain && battle.mainCooldownMs <= 0 && canFireMain) {
    const mainHandlerId = battle.loadout.main?.runtimeHandlerId
    const mainEquipmentId = battle.loadout.main?.equipmentId
    const mainEventContext = {
      ...(mainEquipmentId ? { equipmentId: mainEquipmentId } : {}),
      ...(mainHandlerId ? { runtimeHandlerId: mainHandlerId } : {}),
    }
    const mainWeaponRequests = fireEquippedMainWeapon({
      bindings: battle.bindings,
      context: {
        playerPosition: battle.playerPosition,
        facing: { x: 0, y: -1 },
        frameTimeMs: frameInput.dtMs,
        resolvedLoadout: battle.loadout,
      },
    })
    if (mainWeaponRequests.some((request) => request.kind === "spawnProjectile")) {
      events.push({ type: "playerMainWeaponFired", ...mainEventContext })
    }
    effectRequests.push(...mainWeaponRequests)
  }

  const subJustPressed = frameInput.fireSub && !battle.previousSubPressed
  const subHandlerId = battle.loadout.sub?.runtimeHandlerId
  const subEquipmentId = battle.loadout.sub?.equipmentId
  const subEventContext = {
    ...(subEquipmentId ? { equipmentId: subEquipmentId } : {}),
    ...(subHandlerId ? { runtimeHandlerId: subHandlerId } : {}),
  }
  if (
    frameInput.fireSub &&
    battle.subCooldownMs <= 0 &&
    ((subHandlerId === "sub.barrier.noise_canceller" && !battle.barrier) ||
      (subHandlerId !== "sub.barrier.noise_canceller" && subJustPressed))
  ) {
    const subWeaponRequests = useEquippedSubWeapon({
      bindings: battle.bindings,
      context: {
        playerPosition: battle.playerPosition,
        facing: { x: 0, y: -1 },
        frameTimeMs: frameInput.dtMs,
        resolvedLoadout: battle.loadout,
        stock: battle.loadout.sub?.level ?? 1,
      },
    })
    if (subWeaponRequests.some((request) => request.kind === "spawnBarrier")) {
      events.push({ type: "playerBarrierStarted", ...subEventContext })
    } else if (subWeaponRequests.length > 0) {
      events.push({ type: "playerSubWeaponUsed", ...subEventContext })
    }
    effectRequests.push(...subWeaponRequests)
  }
  battle.previousSubPressed = frameInput.fireSub

  // 長押し型の barrier は、右クリックを離した時点で終了し cooldown を開始します。
  // 残り時間が多いほど cooldown を短くし、短く使った時の取り回しを残します。
  if (battle.barrier && !frameInput.fireSub && battle.barrier.remainingMs > 0) {
    applyBarrierStopCooldown({
      battle,
      barrier: battle.barrier,
      activeEffects: battle.loadout.sub?.activeEffects,
      fallbackCooldownMs:
        host.content.equipment[battle.loadout.sub?.equipmentId ?? ""]?.active?.cooldownMs ?? 3000,
      consumedRatio:
        (battle.barrier.maxMs - battle.barrier.remainingMs) / Math.max(1, battle.barrier.maxMs),
    })
    battle.barrier = undefined
    events.push({ type: "playerBarrierStopped", ...subEventContext })
  }

  const spawnedEffects = host.effects.applyEffectRequests(battle, effectRequests, battlePassives)
  const barrierBeforeSupportUpdate = battle.barrier
  host.effects.updateSupportFields(battle, frameInput.dtMs)
  if (barrierBeforeSupportUpdate && !battle.barrier) {
    applyBarrierStopCooldown({
      battle,
      barrier: barrierBeforeSupportUpdate,
      activeEffects: battle.loadout.sub?.activeEffects,
      fallbackCooldownMs:
        host.content.equipment[battle.loadout.sub?.equipmentId ?? ""]?.active?.cooldownMs ?? 3000,
      consumedRatio: 1,
    })
    events.push({ type: "playerBarrierStopped", ...subEventContext })
  }
  const enemyEvents = host.actors.updateEnemies(battle, frameInput.dtMs)
  host.actors.updateProjectiles(battle, frameInput.dtMs, battlePassives.statModifiers)
  host.pickups.updatePickups(battle, frameInput.dtMs)

  const difficultyModifiers = host.difficulty.resolveDifficultyModifiers()
  const hazardResult = stepBattlefieldHazards({
    mission: battle.mission,
    missionState: host.mission.buildMissionState(),
    playerPosition: battle.playerPosition,
    dtMs: frameInput.dtMs,
    difficultyModifiers,
  })
  battle.hazards = hazardResult.missionState.hazards
  host.effects.applyMagneticDisasterEffects(battle, frameInput.dtMs)

  const playerHitRadius = host.player.resolvePlayerHitRadius()
  const collisionEvents = resolveBattleCollisionsFromSystem({
    battle,
    dtMs: frameInput.dtMs,
    content: host.content,
    resolvePlayerHitRadius: () => playerHitRadius,
    spawnSelfRepairPickup: (position, amount) => host.pickups.spawnSelfRepairPickup(battle, position, amount),
    nextInstanceId: (prefix) => host.ids.nextInstanceId(prefix),
  })
  if (collisionEvents.effectRequests.length > 0) {
    effectRequests.push(...collisionEvents.effectRequests)
    host.effects.applyEffectRequests(battle, collisionEvents.effectRequests, battlePassives)
  }

  const fieldProtectsFromMagneticDisaster = battle.supportFields.some(
    (field) =>
      field.blocksMagneticDisaster &&
      isCircleInsideCircle(battle.playerPosition, playerHitRadius, field.position, field.radius),
  )

  battle.noiseState.noiseLevel = clamp01(
    battle.noiseState.noiseLevel -
      host.content.playerShipSpec.noiseDecayRate *
        dtSeconds *
        (difficultyModifiers.noiseDecayRateMultiplier ?? 1),
  )

  let inflictedNoise =
    collisionEvents.playerNoiseDamage * (difficultyModifiers.enemyNoiseDamageMultiplier ?? 1)
  if (!fieldProtectsFromMagneticDisaster) {
    inflictedNoise += hazardResult.playerNoiseDamage
  }
  let receivedRestorationDamage = false
  if (inflictedNoise > 0 && battle.noiseState.invincibleUntilMs <= battle.elapsedMs) {
    const hitHookResult = runSubsystemHooks({
      bindings: battle.bindings,
      context: {
        hook: "onPlayerHit",
        noiseDamage: inflictedNoise,
        worldPosition: battle.playerPosition,
        resolvedLoadout: battle.loadout,
      },
    })
    effectRequests.push(...(hitHookResult.effectRequests ?? []))
    const totalNoiseDamage = Math.max(0, inflictedNoise + (hitHookResult.noiseDelta ?? 0))
    battle.noiseState.noiseLevel = clamp01(battle.noiseState.noiseLevel + totalNoiseDamage)
    battle.noiseState.invincibleUntilMs =
      battle.elapsedMs + host.content.playerShipSpec.invincibilityMs
    receivedRestorationDamage = totalNoiseDamage > 0
    if (hitHookResult.effectRequests?.length) {
      host.effects.applyEffectRequests(battle, hitHookResult.effectRequests, battlePassives)
    }
  }

  const currentAudible = battle.noiseState.noiseLevel < battle.noiseState.hearingThreshold
  battle.newlyLostRange = undefined
  battle.newlyRecoveredRange = undefined
  const audioWindow = host.audio.resolveAudioWindow(battle, frameInput.dtMs)
  let damagedAudioWindow: TimeRange | null = null
  if (audioWindow && battle.phase === "playing") {
    if (currentAudible && !receivedRestorationDamage) {
      battle.heardRanges = appendTimeRange(battle.heardRanges, audioWindow)
    } else {
      // 被弾フレームだけを欠損にすると結果画面では丸めで 100% に見えます。
      // そのため、実際に被弾した場合は短い通信ブロックとして欠損を残します。
      damagedAudioWindow = receivedRestorationDamage
        ? expandAudioWindowForHitDamage(audioWindow, battle.transcript)
        : audioWindow
      battle.damageRanges = appendTimeRange(battle.damageRanges, damagedAudioWindow)
      battle.newlyLostRange = damagedAudioWindow
    }
    battle.restorationRate = computeRestorationRate(
      computeRecoverableArchiveHeardRanges({
        heardRanges: battle.heardRanges,
        seededHeardRanges: battle.seededHeardRanges,
        damageRanges: battle.damageRanges,
      }),
      battle.transcript,
    )
  }

  if (audioWindow && battle.phase === "playing" && (!currentAudible || receivedRestorationDamage)) {
    host.fragments.maybeSpawnBattleFragment({
      battle,
      audioWindow: damagedAudioWindow ?? audioWindow,
      strength: receivedRestorationDamage ? 1 : clamp01(
        battle.noiseState.noiseLevel / Math.max(0.01, battle.noiseState.hearingThreshold),
      ),
    })
  }
  const fragmentPresentationRequests = host.fragments.updateBattleFragments(battle, frameInput.dtMs)

  const presentationRequests = flattenPresentationRequests([
    collisionEvents.presentationRequests,
    battle.newlyLostRange && getActiveBattleChunk(battle)
      ? createBattleSubtitleDamagePresentation({
          chunkId: getActiveBattleChunk(battle)?.chunkId ?? "",
          range: battle.newlyLostRange,
        })
      : [],
    currentAudible && !battle.previousNoiseAudible
      ? createBattleNoiseClearPresentation()
      : !currentAudible && battle.previousNoiseAudible
        ? createBattleNoisePeakPresentation()
        : [],
    battle.noiseState.invincibleUntilMs > battle.elapsedMs && inflictedNoise > 0
      ? createBattleInvincibleStartPresentation({
          durationMs: host.content.playerShipSpec.invincibilityMs,
        })
      : [],
    fragmentPresentationRequests,
    spawnedEffects.presentationRequests,
    missionBeatPresentationRequests,
  ])
  battle.previousNoiseAudible = currentAudible

  battle.cleared = battle.phase === "outro" && battle.elapsedMs >= battle.mission.durationMs
  if (battle.cleared && !battle.activeResult) {
    if (!input.activeProfile) {
      throw new Error("active profile is required to finalize mission")
    }
    const finalizedMission = finalizeBattleMission({
      battle,
      activeProfile: input.activeProfile,
      difficultyModifiers: host.difficulty.resolveDifficultyModifiers(),
      getOrCreateTransmissionProgress: (transmissionId, areaId) =>
        host.mission.getOrCreateTransmissionProgress(transmissionId, areaId),
      grantEquipment: (equipmentIds) => host.mission.grantEquipment(equipmentIds),
    })
    battle.activeResult = finalizedMission.result
    events.push({ type: "missionCleared", missionId: battle.mission.missionId })
    void host.mission.saveMissionRun(finalizedMission.missionRun)
  }

  return {
    snapshot: host.snapshot.createBattleSnapshot(),
    events: [...events, ...enemyEvents, ...spawnedEffects.events, ...collisionEvents.events],
    effectRequests,
    presentationRequests,
  }
}

function expandAudioWindowForHitDamage(
  audioWindow: TimeRange,
  transcript: { endMs: number }[],
): TimeRange {
  const transcriptEndMs = transcript[transcript.length - 1]?.endMs ?? audioWindow.endMs
  const startMs = Math.max(0, Math.min(audioWindow.startMs, transcriptEndMs))
  const endMs = Math.min(
    transcriptEndMs,
    Math.max(audioWindow.endMs, startMs + PLAYER_HIT_TRANSCRIPT_DAMAGE_MS),
  )
  return endMs > startMs ? { startMs, endMs } : audioWindow
}

function applyBarrierStopCooldown(input: {
  battle: InternalBattleState
  barrier: InternalBarrierState
  activeEffects: EffectSpec[] | undefined
  fallbackCooldownMs: number
  consumedRatio: number
}): void {
  const baseCooldownMs = input.barrier.cooldownMs ?? readSubCooldownMs(
    input.activeEffects,
    input.fallbackCooldownMs,
  )
  input.battle.subCooldownMs = Math.max(0, baseCooldownMs * clamp01(input.consumedRatio))
}

function readSubCooldownMs(
  activeEffects: EffectSpec[] | undefined,
  fallback: number,
): number {
  const cooldownEffect = activeEffects?.find(
    (effect) => effect.effectKind === "subArmBurst" || effect.effectKind === "subArmField",
  )
  const value = cooldownEffect?.params?.cooldownMs
  return typeof value === "number" ? value : fallback
}

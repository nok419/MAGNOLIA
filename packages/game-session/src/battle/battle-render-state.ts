import type {
  ContentBundle,
  EffectSpec,
  EquipmentSlot,
  MissionId,
  MissionResult,
  TimeRange,
  TranscriptChunk,
  TranscriptViewChunk,
} from "@magnolia/contracts"
import {
  computeRecoverableArchiveHeardRanges,
  transcriptSpansFromTimeRanges,
} from "../progression"
import { buildTranscriptViewChunks } from "../selectors"
import type { InternalBattleState } from "../battle-state"
import { buildBattleHazardViewModels } from "../hazards"
import type {
  BattlePickupRenderState,
  BattleRenderState,
  BattleResultViewModel,
  EnemyRenderState,
  HazardRenderState,
  ProjectileRenderState,
  SubtitleRenderState,
  SubtitleWaveInterferenceState,
  SupportFieldRenderState,
} from "../runtime-types"
import { resolveHitRadius } from "../battle-world"
import { clamp01 } from "../math"

const DEMO_MISSION_TOTAL_COUNT = 3

export function buildBattleRenderState(input: {
  battle: InternalBattleState
  content: ContentBundle
  clearedMissionIds?: readonly MissionId[]
  equippedMainId?: string
  equippedSubId?: string
}): BattleRenderState {
  const resultTranscriptPreview = input.battle.activeResult
    ? buildTranscriptViewChunks(input.battle.transcript, input.battle.activeResult.transcriptSpans)
    : undefined

  return {
    missionId: input.battle.mission.missionId,
    backgroundPresetId: input.battle.mission.backgroundPresetId,
    background: resolveBackgroundPreset(input.content, input.battle.mission.backgroundPresetId),
    missionDurationMs: input.battle.mission.durationMs,
    elapsedMs: input.battle.elapsedMs,
    currentChunkId: getActiveBattleChunk(input.battle)?.chunkId,
    currentChunkProtectedRatio: computeCurrentChunkProtectedRatio(input.battle),
    noiseLevel: input.battle.noiseState.noiseLevel,
    hearingThreshold: input.battle.noiseState.hearingThreshold,
    analysisRate: clamp01(input.battle.destroyedAnalysisValue / Math.max(1, input.battle.mission.analysisTotal)),
    newlyLostRange: input.battle.newlyLostRange,
    newlyRecoveredRange: input.battle.newlyRecoveredRange,
    player: {
      position: input.battle.playerPosition,
      hitboxPresetId: input.content.playerShipSpec.hitboxPresetId,
      hitbox: resolveHitboxPreset(input.content, input.content.playerShipSpec.hitboxPresetId),
      radius: resolvePlayerHitRadius(input.content),
      invincible: input.battle.noiseState.invincibleUntilMs > input.battle.elapsedMs,
      noiseLevel: input.battle.noiseState.noiseLevel,
      barrierRadius: input.battle.barrier?.radius,
      barrierState: input.battle.barrier
        ? {
            remainingMs: input.battle.barrier.remainingMs,
            maxMs: input.battle.barrier.maxMs,
            active: true,
          }
        : undefined,
      subCooldownMs: input.battle.subCooldownMs,
      subMaxCooldownMs: input.battle.loadout.sub?.equipmentId
        ? readSubCooldownMs(
            input.battle.loadout.sub.activeEffects,
            input.content.equipment[input.battle.loadout.sub.equipmentId]?.active?.cooldownMs ?? 0,
          )
        : 0,
    },
    enemies: input.battle.enemies.map<EnemyRenderState>((enemy) => {
      const definition = input.content.enemies[enemy.enemyId]
      if (!definition) {
        throw new Error(`Missing enemy ${enemy.enemyId} for battle renderState.`)
      }
      return {
        visualPresetId: definition.visualPresetId,
        visual: resolveEnemyVisualPreset(input.content, definition.visualPresetId),
        hitboxPresetId: definition.hitboxPresetId,
        hitbox: resolveHitboxPreset(input.content, definition.hitboxPresetId),
        enemyInstanceId: enemy.enemyInstanceId,
        enemyId: enemy.enemyId,
        position: enemy.position,
        radius: enemy.radius,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        burning: enemy.burnUntilMs > input.battle.elapsedMs,
      }
    }),
    projectiles: input.battle.projectiles
      .filter((projectile) => projectile.spawnDelayMs <= 0)
      .map<ProjectileRenderState>((projectile) => {
        const projectileDefinition = input.content.projectiles[projectile.projectileId]
        if (!projectileDefinition) {
          throw new Error(`Missing projectile ${projectile.projectileId} for battle renderState.`)
        }
        return {
          visualPresetId: projectileDefinition.visualPresetId,
          visual: resolveProjectileVisualPreset(input.content, projectileDefinition.visualPresetId),
          hitboxPresetId: projectileDefinition.hitboxPresetId,
          hitbox: resolveHitboxPreset(input.content, projectileDefinition.hitboxPresetId),
          renderEffects: buildProjectileRenderEffects({
            inversePhaseVisual: projectile.inversePhaseVisual,
            visualPresetId: projectileDefinition.visualPresetId,
          }),
          projectileInstanceId: projectile.projectileInstanceId,
          projectileId: projectile.projectileId,
          side: projectile.side,
          position: projectile.position,
          velocity: projectile.velocity,
          radius: projectile.radius,
          progress:
            projectile.initialLifetimeMs && projectile.initialLifetimeMs > 0
              ? clamp01((projectile.ageMs ?? 0) / projectile.initialLifetimeMs)
              : undefined,
          inversePhaseVisual: projectile.inversePhaseVisual,
        }
      }),
    supportFields: input.battle.supportFields.map<SupportFieldRenderState>((field) => ({
      fieldInstanceId: field.fieldInstanceId,
      fieldId: field.fieldId,
      position: field.position,
      radius: field.radius,
      remainingMs: field.remainingMs,
      blocksEnemyBullets: field.blocksEnemyBullets,
      blocksMagneticDisaster: field.blocksMagneticDisaster,
    })),
    pickups: input.battle.pickups.map<BattlePickupRenderState>((pickup) => ({
      pickupInstanceId: pickup.pickupInstanceId,
      kind: pickup.kind,
      position: pickup.position,
      radius: pickup.radius,
      amount: pickup.amount,
    })),
    fragments: input.battle.fragments.map((fragment) => ({
      fragmentId: fragment.fragmentId,
      chunkId: fragment.chunkId,
      sourceChunkId: fragment.chunkId,
      startRatio: fragment.startRatio,
      endRatio: fragment.endRatio,
      x: fragment.position.x,
      y: fragment.position.y,
      originX: fragment.originPosition?.x,
      originY: fragment.originPosition?.y,
      createdAtMs: fragment.createdAtMs,
      expiresAtMs: fragment.expiresAtMs,
      strength: fragment.strength,
    })),
    hazards: buildBattleHazardViewModels({
      hazards: input.battle.hazards,
    }).map<HazardRenderState>((hazard) => ({
      hazardId: hazard.hazardId,
      phase: hazard.phase,
      phaseProgress: hazard.phaseProgress,
      visualPresetId: hazard.visualPresetId,
      visual: resolveHazardVisualPreset(input.content, hazard.visualPresetId),
      position: { x: hazard.area.x, y: hazard.area.y },
      size: { width: hazard.area.width, height: hazard.area.height },
    })),
    activeSubtitle: getActiveSubtitle(input.battle),
    pendingResult: input.battle.activeResult,
    resultTranscriptPreview,
    resultViewModel:
      input.battle.activeResult && resultTranscriptPreview
        ? buildBattleResultViewModel({
            result: input.battle.activeResult,
            transcriptView: resultTranscriptPreview,
            content: input.content,
            clearedMissionIds: input.clearedMissionIds ?? [],
          })
        : undefined,
    transmissionAudio: {
      transmissionId: input.battle.transmission.transmissionId,
      audioAssetId: input.battle.transmission.audioAssetId,
      audioPlaybackMs: input.battle.audioPlaybackMs,
      audioStartDelayMs: input.battle.mission.audioStartDelayMs,
      phase: input.battle.activeResult ? "result" : input.battle.phase,
      // session 側は仮想時計だけを持ちます。Web 側で画面停止中に pause を上書きします。
      isPaused: false,
    },
    equippedMainId: input.equippedMainId,
    equippedSubId: input.equippedSubId,
  }
}

function readSubCooldownMs(activeEffects: EffectSpec[], fallback: number): number {
  const cooldownEffect = activeEffects.find(
    (effect) => effect.effectKind === "subArmBurst" || effect.effectKind === "subArmField",
  )
  const value = cooldownEffect?.params?.cooldownMs
  return typeof value === "number" ? value : fallback
}

export function getActiveBattleChunk(battle: InternalBattleState): TranscriptChunk | undefined {
  return battle.transcript.find(
    (chunk) =>
      chunk.startMs <= battle.audioPlaybackMs &&
      chunk.endMs > battle.audioPlaybackMs,
  )
}

function computeCurrentChunkProtectedRatio(battle: InternalBattleState): number {
  const activeChunk = getActiveBattleChunk(battle)
  if (!activeChunk) {
    return 0
  }
  const recoverableRanges = computeRecoverableArchiveHeardRanges({
    heardRanges: battle.heardRanges,
    seededHeardRanges: battle.seededHeardRanges,
    damageRanges: battle.damageRanges,
  })
  return clamp01(
    computeOverlapDuration(recoverableRanges, {
      startMs: activeChunk.startMs,
      endMs: activeChunk.endMs,
    }) / Math.max(1, activeChunk.endMs - activeChunk.startMs),
  )
}

function getActiveSubtitle(battle: InternalBattleState): SubtitleRenderState | undefined {
  const activeChunk = getActiveBattleChunk(battle)
  if (!activeChunk) {
    return undefined
  }
  const audible = battle.noiseState.noiseLevel < battle.noiseState.hearingThreshold
  const protectedSpans = transcriptSpansFromTimeRanges(
    battle.transcript,
    computeRecoverableArchiveHeardRanges({
      heardRanges: battle.heardRanges,
      seededHeardRanges: battle.seededHeardRanges,
      damageRanges: battle.damageRanges,
    }),
  ).filter((span) => span.chunkId === activeChunk.chunkId)
  const damagedSpans = transcriptSpansFromTimeRanges(
    battle.transcript,
    battle.damageRanges,
  ).filter((span) => span.chunkId === activeChunk.chunkId)
  const progress = clamp01(
    (battle.audioPlaybackMs - activeChunk.startMs) /
    Math.max(1, activeChunk.endMs - activeChunk.startMs),
  )
  return {
    transmissionId: battle.transmission.transmissionId,
    chunkId: activeChunk.chunkId,
    speakerLabel: activeChunk.speakerLabel,
    text: activeChunk.text,
    audible,
    protectedSpans,
    damagedSpans,
    waveInterference: buildWaveInterferenceForSubtitle(battle, activeChunk, progress),
    noiseLevel: battle.noiseState.noiseLevel,
    hearingThreshold: battle.noiseState.hearingThreshold,
    progress,
  }
}

function buildWaveInterferenceForSubtitle(
  battle: InternalBattleState,
  activeChunk: TranscriptChunk,
  progress: number,
): SubtitleWaveInterferenceState | undefined {
  const activeChunkIndex = battle.transcript.findIndex(
    (chunk) => chunk.chunkId === activeChunk.chunkId,
  )
  if (activeChunkIndex <= 0) {
    return undefined
  }

  const previousChunk = battle.transcript[activeChunkIndex - 1]
  const previousTextStartMs = battle.mission.audioStartDelayMs + previousChunk.startMs
  const currentTextStartMs = battle.mission.audioStartDelayMs + activeChunk.startMs
  // 直前の本文表示から現在の本文表示までに出た wave を、次の本文を乱す対象にします。
  // 被弾欠損とは別の一時表示なので、damageRanges や復元率には混ぜません。
  const precedingWaves = battle.mission.waves.filter(
    (wave) => wave.atMs >= previousTextStartMs && wave.atMs < currentTextStartMs,
  )
  if (precedingWaves.length === 0) {
    return undefined
  }

  const summary = precedingWaves.reduce(
    (total, wave) => {
      const performance = battle.wavePerformance?.[wave.waveId]
      total.expectedEnemyCount += performance?.expectedEnemyCount ?? wave.entries.length
      total.destroyedEnemyCount += performance?.destroyedSpawnIds.size ?? 0
      return total
    },
    { expectedEnemyCount: 0, destroyedEnemyCount: 0 },
  )
  if (summary.expectedEnemyCount <= 0) {
    return undefined
  }

  const missRate = clamp01(
    1 - summary.destroyedEnemyCount / Math.max(1, summary.expectedEnemyCount),
  )
  if (missRate <= 0.001) {
    return undefined
  }

  const mode = readWaveInterferenceMode(missRate)
  const recoveryRatio = readWaveInterferenceRecoveryRatio(mode, progress)
  const recoveryStrength =
    mode === "readableGlitch" ? 0.86 : mode === "recovering" ? 0.58 : 0.12
  const effectiveMissRate = clamp01(missRate * (1 - recoveryRatio * recoveryStrength))
  if (effectiveMissRate <= 0.015) {
    return undefined
  }

  return {
    ...summary,
    missRate,
    effectiveMissRate,
    recoveryRatio,
    mode,
  }
}

function readWaveInterferenceMode(
  missRate: number,
): SubtitleWaveInterferenceState["mode"] {
  if (missRate <= 0.25) {
    return "readableGlitch"
  }
  if (missRate <= 0.55) {
    return "recovering"
  }
  return "heavy"
}

function readWaveInterferenceRecoveryRatio(
  mode: SubtitleWaveInterferenceState["mode"],
  progress: number,
): number {
  if (mode === "readableGlitch") {
    return clamp01((progress - 0.12) / 0.54)
  }
  if (mode === "recovering") {
    return clamp01((progress - 0.18) / 0.72)
  }
  return clamp01((progress - 0.62) / 1.2)
}

function resolvePlayerHitRadius(content: ContentBundle): number {
  return resolveHitRadius(resolveHitboxPreset(content, content.playerShipSpec.hitboxPresetId))
}

function resolveHitboxPreset(content: ContentBundle, hitboxPresetId: string) {
  const preset = content.contentHitboxPresets[hitboxPresetId]
  if (!preset) {
    throw new Error(`Missing hitbox preset ${hitboxPresetId}.`)
  }
  return preset
}

function resolveBackgroundPreset(content: ContentBundle, backgroundPresetId: string) {
  const preset = content.backgroundPresets[backgroundPresetId]
  if (!preset) {
    throw new Error(`Missing background preset ${backgroundPresetId}.`)
  }
  return preset
}

function resolveEnemyVisualPreset(content: ContentBundle, visualPresetId: string) {
  const preset = content.contentVisualPresets[visualPresetId]
  if (!preset || preset.category !== "enemy") {
    throw new Error(`Missing enemy visual preset ${visualPresetId}.`)
  }
  return preset
}

function resolveProjectileVisualPreset(content: ContentBundle, visualPresetId: string) {
  const preset = content.contentVisualPresets[visualPresetId]
  if (!preset || preset.category !== "projectile") {
    throw new Error(`Missing projectile visual preset ${visualPresetId}.`)
  }
  return preset
}

function resolveHazardVisualPreset(content: ContentBundle, visualPresetId: string) {
  const preset = content.contentVisualPresets[visualPresetId]
  if (!preset || preset.category !== "hazard") {
    throw new Error(`Missing hazard visual preset ${visualPresetId}.`)
  }
  return preset
}

function buildBattleResultViewModel(input: {
  result: MissionResult
  transcriptView: TranscriptViewChunk[]
  content: ContentBundle
  clearedMissionIds: readonly MissionId[]
}): BattleResultViewModel {
  return {
    analysisRate: input.result.analysisRate,
    restorationRate: input.result.restorationRate,
    selfRepairPointsEarned: input.result.selfRepairPointsEarned,
    newHeardRangeMs: input.result.newHeardRangeMs,
    demoClearProgress: {
      clearedMissionCount: new Set(input.clearedMissionIds).size,
      totalMissionCount: DEMO_MISSION_TOTAL_COUNT,
    },
    transcriptPreview: selectBattleResultTranscriptPreview(input.transcriptView),
    grantedEquipment: input.result.grantedEquipmentIds.flatMap((equipmentId) => {
      const equipment = input.content.equipment[equipmentId]
      return equipment
        ? [
            {
              equipmentId: equipment.equipmentId,
              name: equipment.name,
              slot: equipment.slot,
              slotLabel: readEquipmentSlotShortLabel(equipment.slot),
            },
          ]
        : []
    }),
  }
}

function selectBattleResultTranscriptPreview(chunks: TranscriptViewChunk[]): TranscriptViewChunk[] {
  const restored = chunks.filter((chunk) => chunk.restorationRatio > 0)
  return (restored.length > 0 ? restored : chunks).slice(0, 4)
}

function computeOverlapDuration(ranges: TimeRange[], target: TimeRange): number {
  return ranges.reduce((total, range) => {
    const startMs = Math.max(range.startMs, target.startMs)
    const endMs = Math.min(range.endMs, target.endMs)
    return total + Math.max(0, endMs - startMs)
  }, 0)
}

function readEquipmentSlotShortLabel(slot: EquipmentSlot): string {
  switch (slot) {
    case "main":
      return "メイン"
    case "sub":
      return "サブ"
    case "os":
      return "OS"
    case "subsystem":
      return "サブシステム"
  }
}

function buildProjectileRenderEffects(input: {
  inversePhaseVisual?: boolean
  visualPresetId?: string
}): string[] | undefined {
  if (!input.inversePhaseVisual) {
    return undefined
  }
  // melee は軌跡自体を inverse phase として描くため、通常弾用の外周 aura は付けません。
  if (input.visualPresetId === "vis_bullet_player_melee") {
    return ["inversePhase", "meleeSweep"]
  }
  return ["inversePhase", "inversePhaseAura"]
}

import {
  createEmptyMetadataUnlocked,
} from "@magnolia/contracts"
import type {
  ArchiveAccessState,
  AreaId,
  AreaMaster,
  AreaProgressRow,
  ConditionId,
  ConditionSpec,
  ContentBundle,
  CollectibleMapNode,
  EffectSpec,
  EquipmentId,
  EquipmentMaster,
  EquipmentSlot,
  FeatureAccessState,
  ExploreSnapshot,
  MapId,
  MissionId,
  MissionMaster,
  MissionReplaySeed,
  MissionState,
  ProfileAggregate,
  ProfileRow,
  TimeRange,
  TranscriptChunk,
  TranscriptSpan,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
  WorldMapNodeId,
  WorldMapVisibilityState,
  ExploreMapViewModel,
} from "@magnolia/contracts"
import { evaluateCondition } from "./conditions"
import type { ResolvedEquipmentBinding, ResolvedLoadout } from "./equipment-runtime"
import { computeAreaBounds } from "./explore-world"
import {
  computeAreaCompletionRate,
  hasUnlockedTransmissionMetadata,
  isTransmissionSignalIdentified,
  mergeRanges,
  mergeTranscriptSpans,
  readTransmissionCompletionState,
  readTranscriptChunkRestorationRatio,
  transcriptSpansFromTimeRanges,
} from "./progression"
import type { BattleRenderState, ExploreRenderState, Rect } from "./runtime-types"

const WORLD_CELL_SIZE = 20
const WORLD_BITMAP_ORIGIN_X = -640
const WORLD_BITMAP_ORIGIN_Y = -520

export type EquipmentHintSelector = {
  unseenEquipmentIds: EquipmentId[]
  missionRewardEquipmentIds: EquipmentId[]
  shouldShowEquipmentHint: boolean
}

export type WorldMapAreaViewModel = {
  areaId: AreaId
  name: string
  completionRate: number
  position: Vector2
  bounds: Rect
}

export type WorldMapTransmissionViewModel = {
  nodeId: WorldMapNodeId
  areaId: AreaId
  transmissionId: TransmissionId
  title: string
  sender: string
  recipient: string
  titleUnlocked: boolean
  senderUnlocked: boolean
  recipientUnlocked: boolean
  restorationRate: number
  state: "locked" | "partial" | "complete"
  position: Vector2
}

export type WorldMapCollectibleViewModel = {
  nodeId: WorldMapNodeId
  areaId: AreaId
  collectibleKind: CollectibleMapNode["collectibleKind"]
  position: Vector2
}

export type WorldMapViewModel = {
  mapId: MapId
  currentAreaId?: AreaId
  playerPosition: Vector2
  playerFacing: Vector2
  visionRadius: number
  worldBounds: Rect
  fogBitmap: string
  visibleAreas: WorldMapAreaViewModel[]
  visibleTransmissions: WorldMapTransmissionViewModel[]
  visibleCollectibles: WorldMapCollectibleViewModel[]
}

export type BattleResultRewardViewModel = {
  equipmentId: EquipmentId
  name: string
  slotLabel: string
}

export type BattleResultViewModel = {
  progress: number
  progressPercent: number
  remainingSeconds: number
  transcriptPreview: NonNullable<BattleRenderState["resultTranscriptPreview"]>
  grantedEquipment: BattleResultRewardViewModel[]
}

export type ExploreInteractionTargets = {
  transmissions: ExploreRenderState["visibleTransmissions"]
  warps: ExploreRenderState["visibleWarps"]
  collectibles: ExploreRenderState["visibleCollectibles"]
}

export function selectWorldMapViewModel(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  mapLogic: WorldMapLogic
}): WorldMapViewModel {
  const transmissionProgressById = toProgressRecord(input.profileAggregate.transmissionProgress)
  const visibleAreaIdSet = new Set(input.snapshot.featureAccess.visibleAreaIds)
  const visibleTransmissionNodeIdSet = new Set(input.snapshot.map.visibleTransmissionNodeIds)
  const visibleCollectibleNodeIdSet = new Set(input.snapshot.map.visibleCollectibleNodeIds)

  const visibleAreas = input.mapLogic.areaNodes
    .filter((node) => visibleAreaIdSet.has(node.areaId))
    .map<WorldMapAreaViewModel>((node) => {
      const area = input.content.areas[node.areaId]
      return {
        areaId: node.areaId,
        name: area?.name ?? node.areaId,
        completionRate: computeAreaCompletionRate({
          area,
          transmissionProgress: transmissionProgressById,
        }),
        position: { x: node.x, y: node.y },
        bounds: computeAreaBounds(input.mapLogic, node.areaId, input.renderState.worldBounds),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))

  const visibleTransmissions = input.mapLogic.transmissionNodes
    .filter((node) => visibleTransmissionNodeIdSet.has(node.nodeId))
    .map<WorldMapTransmissionViewModel>((node) => {
      const transmission = input.content.transmissions[node.transmissionId]
      const progress = transmissionProgressById[node.transmissionId]
      return {
        nodeId: node.nodeId,
        areaId: node.areaId,
        transmissionId: node.transmissionId,
        title: transmission?.title ?? node.transmissionId,
        sender: transmission?.sender ?? "???",
        recipient: transmission?.recipient ?? "???",
        titleUnlocked: Boolean(progress?.metadataUnlocked.title),
        senderUnlocked: Boolean(progress?.metadataUnlocked.sender),
        recipientUnlocked: Boolean(progress?.metadataUnlocked.recipient),
        restorationRate: progress?.archiveRestorationRate ?? 0,
        state: readTransmissionCompletionState(progress),
        position: { x: node.x, y: node.y },
      }
    })

  const visibleCollectibles = input.mapLogic.collectibleNodes
    .filter((node) => visibleCollectibleNodeIdSet.has(node.nodeId))
    .map<WorldMapCollectibleViewModel>((node) => ({
      nodeId: node.nodeId,
      areaId: node.areaId,
      collectibleKind: node.collectibleKind,
      position: { x: node.x, y: node.y },
    }))

  return {
    mapId: input.mapLogic.mapId,
    currentAreaId: input.snapshot.hud.currentAreaId,
    playerPosition: input.snapshot.playerPosition,
    playerFacing: input.renderState.playerFacing,
    visionRadius: input.renderState.visionRadius,
    worldBounds: input.renderState.worldBounds,
    fogBitmap: input.snapshot.map.fogBitmap,
    visibleAreas,
    visibleTransmissions,
    visibleCollectibles,
  }
}

export function selectBattleResultViewModel(input: {
  content: ContentBundle
  renderState: BattleRenderState
}): BattleResultViewModel {
  const progress = input.renderState.missionDurationMs > 0
    ? Math.max(0, Math.min(1, input.renderState.elapsedMs / input.renderState.missionDurationMs))
    : 0
  const grantedEquipment = (input.renderState.pendingResult?.grantedEquipmentIds ?? [])
    .flatMap<BattleResultRewardViewModel>((equipmentId) => {
      const equipment = input.content.equipment[equipmentId]
      if (!equipment) {
        return []
      }
      return [{
        equipmentId,
        name: equipment.name,
        slotLabel: readEquipmentSlotLabel(equipment.slot),
      }]
    })

  return {
    progress,
    progressPercent: Math.round(progress * 100),
    remainingSeconds: Math.ceil(
      Math.max(0, input.renderState.missionDurationMs - input.renderState.elapsedMs) / 1000,
    ),
    transcriptPreview: selectResultTranscriptPreview(input.renderState.resultTranscriptPreview),
    grantedEquipment,
  }
}

export function selectExploreInteractionTargets(
  renderState: ExploreRenderState | null,
): ExploreInteractionTargets {
  return {
    transmissions: renderState?.visibleTransmissions ?? [],
    warps: renderState?.visibleWarps ?? [],
    collectibles: renderState?.visibleCollectibles ?? [],
  }
}

function selectResultTranscriptPreview(
  chunks: BattleRenderState["resultTranscriptPreview"],
): NonNullable<BattleRenderState["resultTranscriptPreview"]> {
  const restored = (chunks ?? []).filter((chunk) => chunk.restorationRatio > 0)
  const source = restored.length > 0 ? restored : chunks ?? []
  const important = source.filter((chunk) => chunk.importance && chunk.importance !== "normal")
  const regular = source.filter((chunk) => !important.includes(chunk))
  return [...important, ...regular].slice(0, 4)
}

function readEquipmentSlotLabel(slot: EquipmentSlot): string {
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

function toProgressRecord(
  progressRows: ProfileAggregate["transmissionProgress"],
): Record<TransmissionId, TransmissionProgressRow> {
  return Object.fromEntries(
    progressRows.map((row) => [row.transmissionId, row]),
  ) as Record<TransmissionId, TransmissionProgressRow>
}

export function selectEquipmentHint(input: {
  content: ContentBundle | null
  profile: ProfileAggregate | null
  seenEquipmentIds: EquipmentId[]
}): EquipmentHintSelector {
  const profile = input.profile?.profile
  if (!input.content || !profile) {
    return {
      unseenEquipmentIds: [],
      missionRewardEquipmentIds: [],
      shouldShowEquipmentHint: false,
    }
  }

  const seenEquipmentIds = new Set(input.seenEquipmentIds)
  const unseenEquipmentIds = profile.ownedEquipmentIds.filter((id) => !seenEquipmentIds.has(id))
  const unseenEquipmentIdSet = new Set(unseenEquipmentIds)
  const missionRewardEquipmentIds = selectClearedMissionRewardEquipmentIds({
    content: input.content,
    profile,
  })
  const shouldShowEquipmentHint = missionRewardEquipmentIds.some((equipmentId) => {
    const equipment = input.content?.equipment[equipmentId]
    if (!equipment) {
      return false
    }
    return (
      unseenEquipmentIdSet.has(equipmentId) &&
      !isEquipmentEquipped(profile, equipmentId, equipment.slot)
    )
  })

  return {
    unseenEquipmentIds,
    missionRewardEquipmentIds,
    shouldShowEquipmentHint,
  }
}

function selectClearedMissionRewardEquipmentIds(input: {
  content: ContentBundle
  profile: ProfileRow
}): EquipmentId[] {
  const clearedMissionIds = new Set(input.profile.clearedMissionIds)
  const ownedEquipmentIds = new Set(input.profile.ownedEquipmentIds)
  const rewardEquipmentIds = Object.values(input.content.transmissions)
    .filter((transmission) => clearedMissionIds.has(transmission.missionId))
    .flatMap((transmission) => transmission.rewardEquipmentIds ?? [])
    .filter((equipmentId) => ownedEquipmentIds.has(equipmentId))

  return Array.from(new Set(rewardEquipmentIds))
}

function isEquipmentEquipped(
  profile: ProfileRow,
  equipmentId: EquipmentId,
  slot: EquipmentSlot,
): boolean {
  switch (slot) {
    case "main":
      return profile.equipped.main === equipmentId
    case "sub":
      return profile.equipped.sub === equipmentId
    case "os":
      return profile.equipped.os === equipmentId
    case "subsystem":
      return profile.equipped.subsystems.includes(equipmentId)
  }
}

export function buildFeatureAccessState(input: {
  profile: ProfileRow
  loadout: ResolvedLoadout
  areas: Record<AreaId, AreaMaster>
  transmissions: Record<TransmissionId, TransmissionMaster>
  missions: Record<MissionId, MissionMaster>
  equipment: Record<EquipmentId, EquipmentMaster>
  conditions: Record<ConditionId, ConditionSpec>
  areaProgress: Record<AreaId, AreaProgressRow>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): FeatureAccessState {
  const visibleAreaIds = Object.values(input.areas)
    .filter((area) => isVisible(area.visibilityConditionId, input))
    .filter(
      (area) =>
        isVisible(area.unlockConditionId, input) ||
        isAreaDiscovered(input.areaProgress[area.areaId]),
    )
    .map((area) => area.areaId)

  const visibleTransmissionIds = Object.values(input.transmissions)
    .filter((transmission) => visibleAreaIds.includes(transmission.areaId))
    .filter((transmission) => isVisible(transmission.visibilityConditionId, input))
    .filter(
      (transmission) =>
        isVisible(transmission.unlockConditionId, input) ||
        Boolean(input.transmissionProgress[transmission.transmissionId]),
    )
    .map((transmission) => transmission.transmissionId)

  const accessibleTransmissionIds = Object.values(input.transmissions)
    .filter((transmission) => visibleTransmissionIds.includes(transmission.transmissionId))
    .filter((transmission) => isVisible(transmission.accessConditionId, input))
    .map((transmission) => transmission.transmissionId)

  const visibleEquipmentIds = Object.values(input.equipment)
    .filter((equipment) => isVisible(equipment.visibilityConditionId, input))
    .map((equipment) => equipment.equipmentId)

  const visibleMissionIds = Object.values(input.missions)
    .filter((mission) => {
      const transmission = mission.transmissionId
        ? input.transmissions[mission.transmissionId]
        : undefined
      return transmission ? visibleAreaIds.includes(transmission.areaId) : true
    })
    .filter((mission) => isVisible(mission.visibilityConditionId, input))
    .map((mission) => mission.missionId)

  const startableMissionIds = Object.values(input.missions)
    .filter((mission) => visibleMissionIds.includes(mission.missionId))
    .filter((mission) => isVisible(mission.startConditionId, input))
    .map((mission) => mission.missionId)

  const passiveEffects = collectPassiveEffects(input.loadout)
  const mapUiUnlocked =
    input.profile.unlockedFlags.includes("ui.map.enabled") ||
    hasVisibilityUnlock(passiveEffects, "unlocksAreaVision")
  // アーカイブは最初から開ける前提にし、未開放通信は selector 側で空として返します。
  const archiveUiUnlocked = true
  // 装備画面はチュートリアル前から開ける前提にし、初期OS「破損」から MAGNOLIA へ換装できるようにします。
  const equipmentUiUnlocked = true
  const hudEnabled = hasVisibilityUnlock(passiveEffects, "unlocksHud")
  const minimapEnabled = hasVisibilityUnlock(passiveEffects, "unlocksMinimapDisplay")
  const strengthMeterEnabled = hasVisibilityUnlock(
    passiveEffects,
    "unlocksStrengthMeter",
  )
  const infoPanelEnabled = hasVisibilityUnlock(passiveEffects, "unlocksInfoPanel")

  return {
    canOpenMap: mapUiUnlocked,
    canOpenArchive: archiveUiUnlocked,
    canOpenEquipment: equipmentUiUnlocked,
    mapVisionUnlocked:
      mapUiUnlocked ||
      hasEffectKind(passiveEffects, "mapReveal") ||
      hasEffectKind(passiveEffects, "conditionalVision"),
    compassEnabled: hasEffectKind(passiveEffects, "compass"),
    hudEnabled,
    minimapEnabled,
    strengthMeterEnabled,
    infoPanelEnabled,
    visibleAreaIds,
    visibleTransmissionIds,
    accessibleTransmissionIds,
    visibleEquipmentIds,
    visibleMissionIds,
    startableMissionIds,
  }
}

export function buildWorldMapVisibilityState(input: {
  revealBitmap: string
  mapLogic: WorldMapLogic
  loadout: ResolvedLoadout
  featureAccess: FeatureAccessState
  profile: ProfileRow
  conditions: Record<ConditionId, ConditionSpec>
  areaProgress: Record<AreaId, AreaProgressRow>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): WorldMapVisibilityState {
  const decoded = decodeRevealBitmap(input.revealBitmap)
  const effectDrivenVision = collectVisionOverrides(input.loadout)
  const visibleCellKeys = applyVisionRadius(
    decoded.visibleCellKeys,
    decoded.width,
    decoded.height,
    effectDrivenVision.extraRadius,
  )
  const visibleCellSet = new Set(visibleCellKeys)
  const extraNodeIds = effectDrivenVision.extraNodeIds

  // 未探索座標や未到達ノードを UI に渡さないため、ここで可視セルと可視 node を確定します。
  const visibleAreaNodeIds = input.mapLogic.areaNodes
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) || extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleTransmissionNodeIds = input.mapLogic.transmissionNodes
    .filter((node) =>
      input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId),
    )
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter((node) => isWorldNodeVisible(node.accessConditionId, input))
    .filter(
      (node) =>
        (
          visibleCellSet.has(toWorldCellKey(node.x, node.y)) &&
          isTransmissionSignalIdentified(input.transmissionProgress[node.transmissionId])
        ) ||
        extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleWarpNodeIds = input.mapLogic.warpNodes
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.warpTargetAreaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter((node) => isWorldNodeVisible(node.accessConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) || extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleCollectibleNodeIds = input.mapLogic.collectibleNodes
    .filter((node) => !input.profile.collectedNodeIds.includes(node.nodeId))
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) || extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  return {
    fogBitmap: encodeFogBitmap(decoded.width, decoded.height, visibleCellSet),
    visibleCellKeys: Array.from(visibleCellSet).sort(),
    visibleAreaNodeIds,
    visibleTransmissionNodeIds,
    visibleWarpNodeIds,
    visibleCollectibleNodeIds,
  }
}

export function selectVisibleWorldMapSnapshot(input: {
  mapState: WorldMapVisibilityState
  playerPosition: { x: number; y: number }
  mapLogic: WorldMapLogic
}): ExploreMapViewModel {
  // UI には selector 済みの node id 群しか渡さず、全ノード一覧を参照させません。
  void input.mapLogic

  return {
    playerPosition: input.playerPosition,
    visibleAreaNodeIds: input.mapState.visibleAreaNodeIds,
    visibleTransmissionNodeIds: input.mapState.visibleTransmissionNodeIds,
    visibleWarpNodeIds: input.mapState.visibleWarpNodeIds,
    visibleCollectibleNodeIds: input.mapState.visibleCollectibleNodeIds,
    fogBitmap: input.mapState.fogBitmap,
  }
}

export function buildArchiveAccessState(input: {
  areaId: AreaId
  transmissionId: TransmissionId
  profile: ProfileRow
  transmission: TransmissionMaster
  transmissionProgress: TransmissionProgressRow | null
  chunks: TranscriptChunk[]
}): ArchiveAccessState {
  void input.profile
  void input.transmission

  const progress =
    input.transmissionProgress ??
    createEmptyTransmissionProgress(
      input.profile.profileId,
      input.areaId,
      input.transmissionId,
    )
  const restoredSpans = readRestoredTranscriptSpans(input.chunks, progress)
  const hasTranscriptProgress = restoredSpans.length > 0 || progress.heardRanges.length > 0
  // いったん本文を一部でも復元した通信は、欠けた本文として全体像を返します。
  // UI 側は content を直接読まず、ここで伏せ字化済みの text だけを表示します。
  const transcriptView = hasTranscriptProgress
    ? buildTranscriptViewChunks(input.chunks, restoredSpans)
    : []

  return {
    visibleAreaIds:
      hasTranscriptProgress || hasUnlockedTransmissionMetadata(progress)
        ? [input.areaId]
        : [],
    visibleTransmissionIds:
      hasTranscriptProgress || hasUnlockedTransmissionMetadata(progress)
        ? [input.transmissionId]
        : [],
    metadataUnlocked: progress.metadataUnlocked,
    transcriptView,
  }
}

export function buildTranscriptViewChunks(
  chunks: TranscriptChunk[],
  restoredSpans: TranscriptSpan[],
) {
  return chunks.map((chunk) => {
    const chunkSpans = restoredSpans.filter((span) => span.chunkId === chunk.chunkId)
    const restorationRatio = readTranscriptChunkRestorationRatio(chunk, chunkSpans)
    return {
      ...chunk,
      text: maskTranscriptChunkText(chunk.text, chunkSpans, restorationRatio),
      audible: restorationRatio >= 0.85,
      restorationRatio,
      restoredSpans: chunkSpans,
    }
  })
}

function readRestoredTranscriptSpans(
  chunks: TranscriptChunk[],
  progress: TransmissionProgressRow,
): TranscriptSpan[] {
  if (progress.transcriptSpans.length > 0) {
    return mergeTranscriptSpans(progress.transcriptSpans)
  }
  return transcriptSpansFromTimeRanges(chunks, progress.heardRanges)
}

function maskTranscriptChunkText(
  text: string,
  spans: TranscriptSpan[],
  restorationRatio: number,
): string {
  if (restorationRatio >= 0.85) {
    return text
  }
  const glyphs = Array.from(text)
  if (glyphs.length === 0) {
    return text
  }
  const mergedSpans = mergeTranscriptSpans(spans)
  return glyphs
    .map((glyph, index) => {
      if (/\s/u.test(glyph)) {
        return glyph
      }
      const ratio = (index + 0.5) / glyphs.length
      return mergedSpans.some((span) => ratio >= span.startRatio && ratio <= span.endRatio)
        ? glyph
        : "█"
    })
    .join("")
}

export function createMissionReplaySeed(input: {
  transmissionProgress: TransmissionProgressRow | null
}): MissionReplaySeed {
  const progress = input.transmissionProgress
  return {
    seededHeardRanges: mergeRanges(progress?.heardRanges ?? []),
    seededRestorationRate: progress?.archiveRestorationRate ?? 0,
  }
}

export function seedMissionStateWithReplayProgress(input: {
  missionState: MissionState
  replaySeed: MissionReplaySeed
}): MissionState {
  return {
    ...input.missionState,
    // 再挑戦では過去に確保した区間を失わず、今回分だけを上乗せできる形にします。
    heardRanges: mergeRanges([
      ...input.replaySeed.seededHeardRanges,
      ...input.missionState.heardRanges,
    ]),
    seededHeardRanges: mergeRanges([
      ...input.missionState.seededHeardRanges,
      ...input.replaySeed.seededHeardRanges,
    ]),
    restorationRate: Math.max(
      input.missionState.restorationRate,
      input.replaySeed.seededRestorationRate,
    ),
  }
}

function isVisible(
  conditionId: ConditionId | undefined,
  input: {
    profile: ProfileRow
    loadout: ResolvedLoadout
    conditions: Record<ConditionId, ConditionSpec>
    areaProgress: Record<AreaId, AreaProgressRow>
    transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  },
): boolean {
  if (!conditionId) {
    return true
  }

  return evaluateCondition({
    conditionId,
    conditions: input.conditions,
    profile: input.profile,
    areaProgress: input.areaProgress,
    transmissionProgress: input.transmissionProgress,
    resolvedLoadout: input.loadout,
  })
}

function isWorldNodeVisible(
  conditionId: ConditionId | undefined,
  input: {
    loadout: ResolvedLoadout
    profile: ProfileRow
    conditions: Record<ConditionId, ConditionSpec>
    areaProgress: Record<AreaId, AreaProgressRow>
    transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  },
): boolean {
  if (!conditionId) {
    return true
  }

  return evaluateCondition({
    conditionId,
    conditions: input.conditions,
    profile: input.profile,
    areaProgress: input.areaProgress,
    transmissionProgress: input.transmissionProgress,
    resolvedLoadout: input.loadout,
  })
}

function collectPassiveEffects(loadout: ResolvedLoadout): EffectSpec[] {
  return [loadout.main, loadout.sub, loadout.os, ...loadout.subsystems]
    .filter((binding): binding is ResolvedEquipmentBinding => Boolean(binding))
    .flatMap((binding) => binding.passiveEffects)
}

function hasEffectKind(
  effects: EffectSpec[],
  targetKind: EffectSpec["effectKind"],
): boolean {
  return effects.some((effect) => effect.effectKind === targetKind)
}

function hasVisibilityUnlock(
  effects: EffectSpec[],
  key:
    | "unlocksAreaVision"
    | "unlocksArchiveAccess"
    | "unlocksEquipmentAccess"
    | "unlocksHud"
    | "unlocksMinimapDisplay"
    | "unlocksStrengthMeter"
    | "unlocksInfoPanel",
): boolean {
  return effects.some((effect) => effect.params?.[key] === true)
}

function collectVisionOverrides(loadout: ResolvedLoadout): {
  extraRadius: number
  extraNodeIds: Set<WorldMapNodeId>
} {
  const passiveEffects = collectPassiveEffects(loadout)
  let extraRadius = 0
  const extraNodeIds = new Set<WorldMapNodeId>()

  for (const effect of passiveEffects) {
    if (effect.effectKind !== "mapReveal" && effect.effectKind !== "conditionalVision") {
      continue
    }

    const radius = effect.params?.extraRadius
    if (typeof radius === "number" && radius > extraRadius) {
      extraRadius = radius
    }

    const nodeIds = effect.params?.nodeIds
    if (typeof nodeIds === "string") {
      for (const nodeId of nodeIds.split(",").map((value) => value.trim()).filter(Boolean)) {
        extraNodeIds.add(nodeId)
      }
    }
  }

  return { extraRadius, extraNodeIds }
}

function isAreaDiscovered(progress: AreaProgressRow | undefined): boolean {
  return Boolean(progress?.discoveredAt)
}

function decodeRevealBitmap(bitmap: string): {
  width: number
  height: number
  visibleCellKeys: string[]
} {
  const rows = bitmap
    .trim()
    .split(/\r?\n|\|/)
    .map((row) => row.trim())
    .filter(Boolean)

  const width = rows[0]?.length ?? 0
  const visibleCellKeys: string[] = []

  rows.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "1") {
        visibleCellKeys.push(toCellKey(x, y))
      }
    })
  })

  return {
    width,
    height: rows.length,
    visibleCellKeys,
  }
}

function applyVisionRadius(
  baseVisibleCellKeys: string[],
  width: number,
  height: number,
  extraRadius: number,
): string[] {
  const visibleCellSet = new Set(baseVisibleCellKeys)
  if (extraRadius <= 0) {
    return Array.from(visibleCellSet)
  }

  for (const key of baseVisibleCellKeys) {
    const [x, y] = fromCellKey(key)
    for (let dy = -extraRadius; dy <= extraRadius; dy += 1) {
      for (let dx = -extraRadius; dx <= extraRadius; dx += 1) {
        const nextX = x + dx
        const nextY = y + dy
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue
        }
        visibleCellSet.add(toCellKey(nextX, nextY))
      }
    }
  }

  return Array.from(visibleCellSet)
}

function encodeFogBitmap(
  width: number,
  height: number,
  visibleCellKeys: Set<string>,
): string {
  const rows: string[] = []

  for (let y = 0; y < height; y += 1) {
    let row = ""
    for (let x = 0; x < width; x += 1) {
      row += visibleCellKeys.has(toCellKey(x, y)) ? "1" : "0"
    }
    rows.push(row)
  }

  return rows.join("|")
}

function toCellKey(x: number, y: number): string {
  return `${x},${y}`
}

function toWorldCellKey(worldX: number, worldY: number): string {
  // revealBitmap はセル座標で保存しているため、world map 上の node 座標も同じセル系へ写して判定します。
  const x = Math.max(0, Math.floor((worldX - WORLD_BITMAP_ORIGIN_X) / WORLD_CELL_SIZE))
  const y = Math.max(0, Math.floor((worldY - WORLD_BITMAP_ORIGIN_Y) / WORLD_CELL_SIZE))
  return toCellKey(x, y)
}

function fromCellKey(key: string): [number, number] {
  const [x, y] = key.split(",").map((value) => Number(value))
  return [x, y]
}

function createEmptyTransmissionProgress(
  profileId: ProfileRow["profileId"],
  areaId: AreaId,
  transmissionId: TransmissionId,
): TransmissionProgressRow {
  return {
    profileId,
    transmissionId,
    areaId,
    clearCount: 0,
    bestAnalysisRate: 0,
    bestRunRestorationRate: 0,
    archiveRestorationRate: 0,
    heardRanges: [],
    transcriptSpans: [],
    metadataUnlocked: createEmptyMetadataUnlocked(),
  }
}

function isChunkHeard(chunk: TranscriptChunk, heardRanges: TimeRange[]): boolean {
  return heardRanges.some(
    (range) => range.startMs <= chunk.startMs && range.endMs >= chunk.endMs,
  )
}

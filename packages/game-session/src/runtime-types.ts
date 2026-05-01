import type {
  AreaId,
  BattleFragmentViewModel,
  BackgroundPreset,
  ContentHitboxPreset,
  EquipmentId,
  EquipmentSlot,
  EnemyContentVisualPreset,
  ExploreScanPulseViewModel,
  ExploreSignalHintViewModel,
  HazardId,
  HazardContentVisualPreset,
  HazardPhase,
  HitboxPresetId,
  MapId,
  MissionId,
  MissionResult,
  MissionPhase,
  ProjectileContentVisualPreset,
  TimeRange,
  TranscriptSpan,
  TranscriptViewChunk,
  ThemeId,
  TransmissionId,
  Vector2,
  VisualPresetId,
  WorldMapNodeId,
} from "@magnolia/contracts"

// ここは gameplay と描画の境界です。
// frontend / art 側は session 内部状態を直接読むのではなく、
// 必要な見た目用情報をこの renderState へ追加して受け取る前提にします。

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type ExploreNodeRenderState = {
  nodeId: WorldMapNodeId
  x: number
  y: number
  label?: string
  interactionRadius?: number
  state?: "locked" | "available" | "partial" | "complete"
  markerKind?: "equipment" | "resource" | "investigation"
}

export type ExploreInteractionTargetViewModel = {
  nodeId: WorldMapNodeId
  kind: "transmission" | "collectible" | "warp"
  worldPosition: Vector2
  visible: boolean
  clickable: boolean
  interactionRadius: number
  screenHintPriority: number
  markerKind?: ExploreNodeRenderState["markerKind"]
}

export type ExploreRenderState = {
  worldBounds: Rect
  currentAreaId?: AreaId
  currentAreaName: string
  currentThemeId?: ThemeId
  playerPosition: Vector2
  playerFacing: Vector2
  visionRadius: number
  areaBounds: Rect
  visibleTransmissions: ExploreNodeRenderState[]
  visibleWarps: ExploreNodeRenderState[]
  visibleCollectibles: ExploreNodeRenderState[]
  interactionTargets: ExploreInteractionTargetViewModel[]
  nearestTransmissionStrength: number
  /** 全通信（クリア済み含む）に対する近接度。波形表示用。 */
  nearestAnyTransmissionStrength: number
  playerVelocity: Vector2
  movementMode: "normal" | "wideScan" | "precisionReceive"
  signalStability: number
  scanCooldownRatio?: number
  elapsedMs: number
  signalHints: ExploreSignalHintViewModel[]
  scanPulses: ExploreScanPulseViewModel[]
  shouldShowScanHint: boolean
  tutorialRestricted: boolean
}

export type WorldMapAreaViewModel = {
  areaId: AreaId
  name: string
  position: Vector2
  bounds: Rect
  completionRate: number
  selected: boolean
}

export type WorldMapTransmissionViewModel = {
  nodeId: WorldMapNodeId
  areaId: AreaId
  transmissionId: TransmissionId
  title: string
  sender: string
  recipient: string
  restorationRate: number
  position: Vector2
  state: "locked" | "available" | "partial" | "complete"
  selected: boolean
}

export type WorldMapCollectibleViewModel = {
  nodeId: WorldMapNodeId
  areaId: AreaId
  position: Vector2
  markerKind: "equipment" | "resource" | "investigation"
}

export type WorldMapWarpViewModel = {
  nodeId: WorldMapNodeId
  areaId: AreaId
  targetAreaId: AreaId
  position: Vector2
}

export type WorldMapViewModel = {
  mapId: MapId
  fogBitmap: string
  worldBounds: Rect
  focusBounds: Rect
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  areas: WorldMapAreaViewModel[]
  transmissions: WorldMapTransmissionViewModel[]
  collectibles: WorldMapCollectibleViewModel[]
  warps: WorldMapWarpViewModel[]
  player: { areaId?: AreaId; position: Vector2; facing: Vector2; visionRadius: number }
}

export type MiniMapViewModel = {
  fogBitmap: string
  worldBounds: Rect
  player: {
    position: Vector2
    facing: Vector2
    visionRadius: number
    tutorialRestricted: boolean
  }
  transmissions: Array<{
    nodeId: WorldMapNodeId
    position: Vector2
    state: "locked" | "available" | "partial" | "complete"
  }>
  collectibles: Array<{
    nodeId: WorldMapNodeId
    position: Vector2
    markerKind: "equipment" | "resource" | "investigation"
  }>
  signalHints: ExploreRenderState["signalHints"]
}

export function buildMiniMapViewModel(input: {
  snapshot: { map: { fogBitmap: string } }
  renderState: ExploreRenderState
}): MiniMapViewModel {
  // MiniMap は session が公開した探索 renderState だけを読み、content から未発見情報を逆引きしません。
  return {
    fogBitmap: input.snapshot.map.fogBitmap,
    worldBounds: input.renderState.worldBounds,
    player: {
      position: input.renderState.playerPosition,
      facing: input.renderState.playerFacing,
      visionRadius: input.renderState.visionRadius,
      tutorialRestricted: input.renderState.tutorialRestricted,
    },
    transmissions: input.renderState.visibleTransmissions.map((node) => ({
      nodeId: node.nodeId,
      position: { x: node.x, y: node.y },
      state: node.state ?? "locked",
    })),
    collectibles: input.renderState.visibleCollectibles.map((node) => ({
      nodeId: node.nodeId,
      position: { x: node.x, y: node.y },
      markerKind: node.markerKind ?? "investigation",
    })),
    signalHints: input.renderState.signalHints,
  }
}

export type PlayerRenderState = {
  position: Vector2
  hitboxPresetId: HitboxPresetId
  hitbox: ContentHitboxPreset
  radius: number
  invincible: boolean
  noiseLevel: number
  barrierRadius?: number
  barrierState?: {
    remainingMs: number
    maxMs: number
    active: boolean
  }
  subCooldownMs: number
  subMaxCooldownMs: number
}

export type EnemyRenderState = {
  enemyInstanceId: string
  enemyId: string
  visualPresetId: VisualPresetId
  visual: EnemyContentVisualPreset
  hitboxPresetId: HitboxPresetId
  hitbox: ContentHitboxPreset
  noiseBandKind?: "subtitle" | "speaker" | "metadata" | "fragment" | "waveform"
  position: Vector2
  radius: number
  hp: number
  maxHp: number
  burning: boolean
}

export type ProjectileRenderState = {
  projectileInstanceId: string
  projectileId: string
  visualPresetId: VisualPresetId
  visual: ProjectileContentVisualPreset
  hitboxPresetId: HitboxPresetId
  hitbox: ContentHitboxPreset
  renderEffects?: string[]
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
  progress?: number
  inversePhaseVisual?: boolean
}

export type SupportFieldRenderState = {
  fieldInstanceId: string
  fieldId: string
  position: Vector2
  radius: number
  remainingMs: number
  blocksEnemyBullets: boolean
  blocksMagneticDisaster: boolean
}

export type BattlePickupRenderState = {
  pickupInstanceId: string
  kind: "selfRepairPoints"
  position: Vector2
  radius: number
  amount: number
}

export type SubtitleRenderState = {
  transmissionId: TransmissionId
  chunkId: string
  speakerLabel?: string
  text: string
  audible: boolean
  protectedSpans: TranscriptSpan[]
  damagedSpans: TranscriptSpan[]
  noiseLevel: number
  hearingThreshold: number
  progress: number
}

export type HazardRenderState = {
  hazardId: HazardId
  phase: HazardPhase
  phaseProgress: number
  visualPresetId: VisualPresetId
  visual: HazardContentVisualPreset
  position: Vector2
  size: { width: number; height: number }
}

export type BattleResultEquipmentViewModel = {
  equipmentId: EquipmentId
  name: string
  slot: EquipmentSlot
  slotLabel: string
}

export type BattleResultViewModel = {
  analysisRate: number
  restorationRate: number
  selfRepairPointsEarned: number
  newHeardRangeMs: number
  grantedEquipment: BattleResultEquipmentViewModel[]
  transcriptPreview: TranscriptViewChunk[]
}

export type TransmissionAudioSyncState = {
  transmissionId: TransmissionId
  audioAssetId?: string
  audioPlaybackMs: number
  audioStartDelayMs: number
  phase: MissionPhase | "result"
  isPaused: boolean
}

export type BattleRenderState = {
  missionId: MissionId
  backgroundPresetId: VisualPresetId
  background: BackgroundPreset
  missionDurationMs: number
  elapsedMs: number
  currentChunkId?: string
  currentChunkProtectedRatio: number
  noiseLevel: number
  hearingThreshold: number
  analysisRate: number
  newlyLostRange?: TimeRange
  newlyRecoveredRange?: TimeRange
  player: PlayerRenderState
  enemies: EnemyRenderState[]
  projectiles: ProjectileRenderState[]
  supportFields: SupportFieldRenderState[]
  pickups: BattlePickupRenderState[]
  fragments: BattleFragmentViewModel[]
  hazards: HazardRenderState[]
  activeSubtitle?: SubtitleRenderState
  pendingResult?: MissionResult
  resultTranscriptPreview?: TranscriptViewChunk[]
  resultViewModel?: BattleResultViewModel
  transmissionAudio: TransmissionAudioSyncState
  equippedMainId?: EquipmentId
  equippedSubId?: EquipmentId
}

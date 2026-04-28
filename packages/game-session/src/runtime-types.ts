import type {
  AreaId,
  BattleFragmentViewModel,
  BulletVisualRoleSpec,
  EquipmentId,
  EquipmentSlot,
  ExploreScanPulseViewModel,
  ExploreSignalHintViewModel,
  HazardId,
  HazardPhase,
  MissionId,
  MissionResult,
  MissionVisualProfile,
  ProjectileVisualRole,
  TranscriptViewChunk,
  ThemeId,
  TransmissionId,
  Vector2,
  VisualProfileId,
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

export type ExploreInteractionTargetRenderState = {
  nodeId: WorldMapNodeId
  x: number
  y: number
  radius: number
  distanceToPlayer: number
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
  interactionTargets: ExploreInteractionTargetRenderState[]
  nearestTransmissionStrength: number
  /** 全通信（クリア済み含む）に対する近接度。波形表示用。 */
  nearestAnyTransmissionStrength: number
  elapsedMs: number
  signalHints: ExploreSignalHintViewModel[]
  scanPulses: ExploreScanPulseViewModel[]
  /** User Interface（UI）の初回 scan 誘導は session 側の進行状態で一度だけ許可します。 */
  shouldShowScanHint: boolean
  tutorialRestricted: boolean
}

export type PlayerRenderState = {
  position: Vector2
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
  position: Vector2
  radius: number
  hp: number
  maxHp: number
  burning: boolean
}

export type ProjectileRenderState = {
  projectileInstanceId: string
  projectileId: string
  visualRole?: ProjectileVisualRole
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
  progress?: number
  meleeSweep?: {
    arcDeg: number
  }
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

export type BattleRewardEquipmentRenderState = {
  equipmentId: EquipmentId
  name: string
  slot: EquipmentSlot
}

export type SubtitleRenderState = {
  transmissionId: TransmissionId
  chunkId: string
  speakerLabel?: string
  text: string
  audible: boolean
  noiseLevel: number
  hearingThreshold: number
  progress: number
}

export type HazardRenderState = {
  hazardId: HazardId
  phase: HazardPhase
  phaseProgress: number
  position: Vector2
  size: { width: number; height: number }
}

export type BattleRenderState = {
  missionId: MissionId
  visualProfileId?: VisualProfileId
  missionVisualProfile?: MissionVisualProfile
  bulletVisualRoles?: Partial<Record<ProjectileVisualRole, BulletVisualRoleSpec>>
  missionDurationMs: number
  elapsedMs: number
  player: PlayerRenderState
  enemies: EnemyRenderState[]
  projectiles: ProjectileRenderState[]
  supportFields: SupportFieldRenderState[]
  pickups: BattlePickupRenderState[]
  fragments: BattleFragmentViewModel[]
  hazards: HazardRenderState[]
  activeSubtitle?: SubtitleRenderState
  pendingResult?: MissionResult
  grantedEquipment?: BattleRewardEquipmentRenderState[]
  resultTranscriptPreview?: TranscriptViewChunk[]
  equippedMainId?: EquipmentId
  equippedSubId?: EquipmentId
}

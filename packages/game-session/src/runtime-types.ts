import type {
  AreaId,
  EquipmentId,
  HazardId,
  HazardPhase,
  MissionId,
  MissionResult,
  ThemeId,
  TransmissionId,
  Vector2,
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
  state?: "locked" | "available" | "partial" | "complete"
  markerKind?: "equipment" | "resource" | "investigation"
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
  nearestTransmissionStrength: number
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
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
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
  missionDurationMs: number
  elapsedMs: number
  player: PlayerRenderState
  enemies: EnemyRenderState[]
  projectiles: ProjectileRenderState[]
  supportFields: SupportFieldRenderState[]
  pickups: BattlePickupRenderState[]
  hazards: HazardRenderState[]
  activeSubtitle?: SubtitleRenderState
  pendingResult?: MissionResult
  equippedMainId?: EquipmentId
  equippedSubId?: EquipmentId
}

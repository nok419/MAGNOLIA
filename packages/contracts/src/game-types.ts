export type SaveSlotId = 1 | 2 | 3

export type AreaId = string
export type TransmissionId = string
export type MissionId = string
export type EquipmentId = string
export type EffectId = string
export type EnemyId = string
export type HazardId = string
export type BulletPatternId = string
export type ProjectileId = string
export type VisualPresetId = string
export type HitboxPresetId = string
export type ThemeId = string
export type MapId = string
export type ConditionId = string
export type ProfileId = string
export type WorldMapNodeId = string
export type TranscriptChunkId = string

export type Difficulty = "calm" | "terminal"
export type VolumeLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7
/**
 * 自機見た目のプレゼンテーション・バリアント。
 * 描画ロジックは `apps/web/src/app/ship-renderer.ts` に一元化されており、
 * バリアントはビジュアルの層数・装飾だけを切り替える（当たり判定やサイズには影響しない）。
 *
 * - "solid": 三角形を基調にした視認性重視の高速機体。戦闘中の可読性を最優先する。
 * - "art":   装備画面 / 探索時のコンテクスト向けに、別設計の多層面と
 *            内部導線を加えたバージョン。サイズ上の扱いは solid と共有する。
 *
 * バックエンド側でバリデーションを行う場合、許容値は "solid" | "art" の 2 つのみ。
 * 将来バリアントを追加する際はこの union と `apps/web/src/app/ship-renderer.ts` の
 * レンダラを同時に拡張する運用を守る（片方だけの追加は既存セーブを破壊する）。
 */
export type ShipVariant = "solid" | "art"
export type EquipmentSlot = "main" | "sub" | "os" | "subsystem"
export type PrimaryEquipmentSlot = Exclude<EquipmentSlot, "subsystem">
export type SubsystemIndex = 0 | 1
export type BattlePhase = "explore" | "battle"
export type MissionPhase = "intro" | "playing" | "outro"
export type HazardPhase = "telegraph" | "active" | "fading"
export type SubsystemHookKind =
  | "onExploreStep"
  | "onBattleStep"
  | "onPlayerHit"
  | "onEnemyDestroyed"
  | "onMissionStart"
  | "onMissionEnd"

export type EquippedItems = {
  main?: EquipmentId
  sub?: EquipmentId
  os?: EquipmentId
  subsystems: [EquipmentId | null, EquipmentId | null]
}

export type Vector2 = {
  x: number
  y: number
}

export type TimeRange = {
  startMs: number
  endMs: number
}

export type TranscriptSpan = {
  chunkId: TranscriptChunkId
  startRatio: number
  endRatio: number
}

export type BattleFragmentViewModel = {
  fragmentId: string
  chunkId: TranscriptChunkId
  startRatio: number
  endRatio: number
  x: number
  y: number
  expiresAtMs: number
  strength: number
}

export type ExploreSignalHintViewModel = {
  nodeId: WorldMapNodeId
  kind: "transmission" | "collectible" | "equipment" | "repair"
  category?: "private" | "broadcast" | "automated" | "maintenance"
  bearingRad: number
  distanceBand: "near" | "mid" | "far"
  strength: number
  confidence: number
  expiresAtMs?: number
}

export type ExploreScanPulseViewModel = {
  pulseId: string
  startedAtMs: number
  radius: number
  durationMs: number
}

export type MetadataUnlocked = {
  title: boolean
  sender: boolean
  recipient: boolean
  sentAt: boolean
}

export function createEmptyEquippedItems(): EquippedItems {
  return {
    main: undefined,
    sub: undefined,
    os: undefined,
    subsystems: [null, null],
  }
}

export function createEmptyMetadataUnlocked(): MetadataUnlocked {
  return {
    title: false,
    sender: false,
    recipient: false,
    sentAt: false,
  }
}

export type NoiseState = {
  noiseLevel: number
  decayRate: number
  hearingThreshold: number
  invincibleUntilMs: number
}

export type SettingsKeybindings = {
  moveUp: string
  moveDown: string
  moveLeft: string
  moveRight: string
  fireMain: string
  fireSub: string
  interact: string
  scan: string
  dash: string
  openMap: string
  openArchive: string
  openEquipment: string
  openSettings: string
}

export type DifficultyModifiers = {
  difficulty: Difficulty
  enemyHpMultiplier: number
  enemyNoiseDamageMultiplier: number
  enemyCadenceMultiplier: number
  noiseDecayRateMultiplier: number
  hearingThresholdOffset: number
  selfRepairPointMultiplier: number
  scoreMultiplier: number
}

export type PlayerShipSpec = {
  baseMoveSpeed: number
  focusMoveSpeed: number
  hitboxPresetId: HitboxPresetId
  invincibilityMs: number
  meleeInvincibilityMs: number
  hearingThreshold: number
  noiseDecayRate: number
  baseExploreSpeed: number
  exploreDashSpeed: number
}

export type AreaMaster = {
  areaId: AreaId
  name: string
  mapId: MapId
  worldPosition: Vector2
  initialState: "locked" | "visible"
  transmissionIds: TransmissionId[]
  unlockConditionId?: ConditionId
  visibilityConditionId?: ConditionId
  themeId: ThemeId
  firstVisitPresentationId?: string
}

export type AreaMapNode = {
  type: "area"
  nodeId: WorldMapNodeId
  x: number
  y: number
  areaId: AreaId
  labelPosition?: Vector2
  minimapVisibleByDefault: boolean
  visibilityConditionId?: ConditionId
}

export type TransmissionMapNode = {
  type: "transmission"
  nodeId: WorldMapNodeId
  x: number
  y: number
  transmissionId: TransmissionId
  areaId: AreaId
  interactionRadius: number
  panelKind: "transmission"
  visibilityConditionId?: ConditionId
  accessConditionId?: ConditionId
}

export type WarpMapNode = {
  type: "warp"
  nodeId: WorldMapNodeId
  x: number
  y: number
  areaId: AreaId
  warpTargetAreaId: AreaId
  interactionRadius: number
  visibilityConditionId?: ConditionId
  accessConditionId?: ConditionId
}

export type CollectibleMapNode = {
  type: "collectible"
  nodeId: WorldMapNodeId
  x: number
  y: number
  areaId: AreaId
  collectibleKind: "selfRepairPoints" | "hiddenEquipment"
  selfRepairPointAmount?: number
  equipmentId?: EquipmentId
  interactionRadius: number
  visibilityConditionId?: ConditionId
  visualHint: "glow"
}

export type WorldMapLogic = {
  mapId: MapId
  playerSpawnNodeId: WorldMapNodeId
  areaNodes: AreaMapNode[]
  transmissionNodes: TransmissionMapNode[]
  warpNodes: WarpMapNode[]
  collectibleNodes: CollectibleMapNode[]
}

export type TransmissionMaster = {
  transmissionId: TransmissionId
  areaId: AreaId
  missionId: MissionId
  category: "private" | "broadcast" | "automated" | "maintenance"
  title: string
  sender: string
  recipient: string
  sentAt: string
  subjectTags: string[]
  audioAssetId?: string
  transcriptChunkIds: TranscriptChunkId[]
  visibilityConditionId?: ConditionId
  accessConditionId?: ConditionId
  unlockConditionId?: ConditionId
  metadataUnlockThresholds: {
    title: number
    sender: number
    recipient: number
    sentAt: number
  }
  rewardEquipmentIds?: EquipmentId[]
}

export type TranscriptChunk = {
  chunkId: TranscriptChunkId
  transmissionId: TransmissionId
  lineId: string
  startMs: number
  endMs: number
  speakerLabel?: string
  text: string
}

export type TranscriptViewChunk = TranscriptChunk & {
  audible: boolean
  restorationRatio: number
  restoredSpans: TranscriptSpan[]
}

export type MissionMaster = {
  missionId: MissionId
  transmissionId: TransmissionId
  durationMs: number
  scrollSpeed: number
  backgroundPresetId: VisualPresetId
  playerSpawnId: string
  analysisTotal: number
  visibilityConditionId?: ConditionId
  startConditionId?: ConditionId
  audioStartDelayMs: number
  outroMs: number
  dangerLevel: number
  hearingThresholdOverride?: number
  baseSelfRepairPoints: number
  repeatDecayRate: number
  waves: EnemyWave[]
  hazards: BattlefieldHazardSpec[]
  clearCondition: "surviveUntilEnd"
}

export type BattlefieldHazardSpec = {
  hazardId: HazardId
  kind: "magneticDisaster"
  spawnAtMs: number
  telegraphMs: number
  activeMs: number
  fadeOutMs: number
  tickIntervalMs: number
  noiseDamage: number
  enemyDamagePerSecond?: number
  area: BattlefieldHazardArea
  motion: BattlefieldHazardMotion
  visualPresetId: VisualPresetId
  visibilityConditionId?: ConditionId
}

export type BattlefieldHazardArea = {
  shape: "rect"
  x: number
  y: number
  width: number
  height: number
}

export type BattlefieldHazardMotion =
  | {
      motionKind: "static"
    }
  | {
      motionKind: "linear"
      velocity: Vector2
    }

export type EnemyWave = {
  atMs: number
  entries: EnemySpawn[]
}

export type EnemySpawn = {
  enemyId: EnemyId
  spawnPointId: string
  seed?: number
  overrides?: Record<string, number | string | boolean>
}

export type EnemyArchetype = {
  enemyId: EnemyId
  hp: number
  collisionDamage: number
  analysisValue: number
  behaviorKind: string
  behaviorParams: Record<string, number | string | boolean>
  bulletPatternIds: BulletPatternId[]
  visualPresetId: VisualPresetId
  hitboxPresetId: HitboxPresetId
  deathEffectPresetId?: VisualPresetId
  dropSelfRepairPoints: number
}

export type BulletPattern = {
  bulletPatternId: BulletPatternId
  patternKind: string
  projectileId: ProjectileId
  cadenceMs: number
  burstCount: number
  params: Record<string, number | string | boolean>
}

export type ProjectileSpec = {
  projectileId: ProjectileId
  side: "player" | "enemy"
  damage: number
  noiseDamage: number
  speed: number
  lifetimeMs: number
  visualPresetId: VisualPresetId
  hitboxPresetId: HitboxPresetId
  trailPresetId?: VisualPresetId
}

export type EquipmentUnlockSource =
  | { kind: "initial" }
  | { kind: "purchase"; selfRepairPointCost: number }
  | { kind: "transmissionReward"; transmissionId: TransmissionId }
  | { kind: "mapPickup"; nodeId: WorldMapNodeId }

export type EquipmentLevelParams = {
  level: number
  selfRepairPointCost: number
  effectOverrides: Record<string, number>
}

export type EquipmentMaster = {
  equipmentId: EquipmentId
  slot: EquipmentSlot
  name: string
  iconId: string
  summary: string
  description: string
  flavorText: string
  active?: {
    cooldownMs: number
    stock: number
    inputAction?: string
  }
  runtimeHandlerId?: string
  passiveEffectIds: EffectId[]
  activeEffectIds: EffectId[]
  unlockConditionId?: ConditionId
  visibilityConditionId?: ConditionId
  unlockSource: EquipmentUnlockSource
  maxLevel: number
  levelParams: EquipmentLevelParams[]
}

export type EffectKind =
  | "mainShot"
  | "subArmBurst"
  | "subArmField"
  | "analysisBoost"
  | "noiseGuard"
  | "cooldownModifier"
  | "compass"
  | "mapReveal"
  | "missionReveal"
  | "conditionalVision"
  | "exploreDash"

export type EffectSpec = {
  effectId: EffectId
  effectKind: EffectKind
  runtimeHandlerId?: string
  hookKind?: SubsystemHookKind
  params?: Record<string, number | string | boolean>
}

export type ConditionSpec =
  | {
      conditionId: ConditionId
      kind: "always"
    }
  | {
      conditionId: ConditionId
      kind: "all"
      children: ConditionId[]
    }
  | {
      conditionId: ConditionId
      kind: "any"
      children: ConditionId[]
    }
  | {
      conditionId: ConditionId
      kind: "not"
      child: ConditionId
    }
  | {
      conditionId: ConditionId
      kind: "flagSet"
      flag: string
    }
  | {
      conditionId: ConditionId
      kind: "equipmentEquipped"
      slot?: EquipmentSlot
      subsystemIndex?: SubsystemIndex
      equipmentId?: EquipmentId
    }
  | {
      conditionId: ConditionId
      kind: "missionCleared"
      missionId: MissionId
    }
  | {
      conditionId: ConditionId
      kind: "areaDiscovered"
      areaId: AreaId
    }
  | {
      conditionId: ConditionId
      kind: "analysisAtLeast"
      transmissionId: TransmissionId
      rate: number
    }
  | {
      conditionId: ConditionId
      kind: "restorationAtLeast"
      transmissionId: TransmissionId
      rate: number
    }
  | {
      conditionId: ConditionId
      kind: "saveSlotUsed"
      slotId: SaveSlotId
    }
  | {
      conditionId: ConditionId
      kind: "collectibleCollected"
      nodeId: WorldMapNodeId
    }

export type ShipVisualPreset = {
  visualPresetId: VisualPresetId
  bodyWidth: number
  bodyHeight: number
  wingLength: number
  wingOffsetX: number
  wingOffsetY: number
  glowStrength: number
}

export type EnemyVisualPreset = {
  visualPresetId: VisualPresetId
  coreRadius: number
  orbit1Radius: number
  orbit2Radius: number
  orbit1Width: number
  orbit2Width: number
  orbit1ArcStart: number
  orbit1ArcEnd: number
  orbit2ArcStart: number
  orbit2ArcEnd: number
  orbit1AngularSpeed: number
  orbit2AngularSpeed: number
  iconType: string
  iconAngle: number
  iconGapAngle: number
  glowStrength: number
}

export type BulletVisualPreset = {
  visualPresetId: VisualPresetId
  bodyType: "diamondCluster" | "noiseCluster"
  trailType: "trailA" | "trailB" | "trailC"
  seedBucket: number
  scale: number
  glowStrength: number
}

export type HazardVisualPreset = {
  visualPresetId: VisualPresetId
  kind: "magneticDisaster"
  telegraphColor: string
  activeColor: string
  telegraphFlashHz: number
  noiseScrollSpeed: number
  edgeFeather: number
  telegraphOpacity: number
  activeOpacity: number
}

export type VisualPreset =
  | ShipVisualPreset
  | EnemyVisualPreset
  | BulletVisualPreset
  | HazardVisualPreset

export type HitboxPreset = {
  hitboxPresetId: HitboxPresetId
  shape: "circle" | "ellipse" | "polygon"
  radius?: number
  radiusX?: number
  radiusY?: number
  points?: Vector2[]
}

export type UiThemePreset = {
  themeId: ThemeId
  backgroundColor: string
  panelColor: string
  accentColor: string
  glitchPresetId?: VisualPresetId
  fontFamily: string
}

export type MetaRow = {
  key: "dbSchemaVersion" | "contentRevision"
  value: string
}

export type SettingsRow = {
  id: "default"
  difficulty: Difficulty
  volumes: {
    master: VolumeLevel
    bgm: VolumeLevel
    se: VolumeLevel
    voice: VolumeLevel
  }
  keybindings: SettingsKeybindings
  reduceFlashing: boolean
  lowFrameRateMode: boolean
  /**
   * 自機の見た目バリアント。詳細は `ShipVariant` の JSDoc を参照。
   * 既存セーブにこのフィールドが無い場合、`normalizeSettings` が "solid" を補填する。
   */
  shipVariant: ShipVariant
}

export type SaveSlotRow = {
  slotId: SaveSlotId
  profileId?: ProfileId
  label: string
  updatedAt?: string
  currentAreaId?: AreaId
  playTimeMs: number
}

export type ProfileRow = {
  profileId: ProfileId
  slotId: SaveSlotId
  schemaVersion: number
  createdAt: string
  updatedAt: string
  difficulty: Difficulty
  currentAreaId: AreaId
  playerPosition: Vector2
  equipped: EquippedItems
  ownedEquipmentIds: EquipmentId[]
  equipmentLevels: Partial<Record<EquipmentId, number>>
  selfRepairPoints: number
  collectedNodeIds: WorldMapNodeId[]
  unlockedFlags: string[]
  clearedMissionIds: MissionId[]
}

export type AreaProgressRow = {
  profileId: ProfileId
  areaId: AreaId
  discoveredAt?: string
  nameRevealed: boolean
  revealBitmap: string
  completionRateCache: number
}

export type TransmissionProgressRow = {
  profileId: ProfileId
  transmissionId: TransmissionId
  areaId: AreaId
  firstConnectedAt?: string
  lastPlayedAt?: string
  clearCount: number
  bestAnalysisRate: number
  bestRunRestorationRate: number
  archiveRestorationRate: number
  heardRanges: TimeRange[]
  transcriptSpans: TranscriptSpan[]
  signalConfidence?: number
  signalDiscoveredAt?: string
  metadataUnlocked: MetadataUnlocked
  latestRunId?: number
}

export type MissionRunRow = {
  id?: number
  profileId: ProfileId
  transmissionId: TransmissionId
  missionId: MissionId
  startedAt: string
  finishedAt: string
  rngSeed: number
  analysisRate: number
  restorationRate: number
  heardRanges: TimeRange[]
  transcriptSpans: TranscriptSpan[]
  damageRanges: TimeRange[]
  destroyedAnalysisValue: number
  score: number
  selfRepairPointsEarned: number
  cleared: boolean
}

export type RuntimeEffectRequest =
  | {
      kind: "spawnProjectile"
      projectileId: ProjectileId
      position: Vector2
      direction: Vector2
      speed: number
      count: number
      spreadDeg?: number
      damage?: number
      noiseDamage?: number
      lifetimeMs?: number
      delayMs?: number
      params?: Record<string, number | string | boolean>
    }
  | {
      kind: "spawnBarrier"
      barrierId: string
      position: Vector2
      radius: number
      durationMs: number
      moveSpeedMultiplier?: number
      blocksEnemyBullets: boolean
      allowAttackDuringUse: boolean
    }
  | {
      kind: "spawnSupportField"
      fieldId: string
      position: Vector2
      radius: number
      durationMs: number
      launchSpeed: number
      dpsInField?: number
      blocksEnemyBullets?: boolean
      blocksMagneticDisaster?: boolean
      mainCadenceMultiplier?: number
      driftsWithScroll?: boolean
    }
  | {
      kind: "clearEnemyProjectiles"
      position?: Vector2
      radius?: number
    }
  | {
      kind: "playEffect"
      effectId: string
      position: Vector2
    }
  | {
      kind: "applyCooldown"
      slot: EquipmentSlot
      subsystemIndex?: SubsystemIndex
      durationMs: number
    }

export type MissionReplaySeed = {
  seededHeardRanges: TimeRange[]
  seededRestorationRate: number
}

export type MissionState = {
  missionId: MissionId
  phase: MissionPhase
  elapsedMs: number
  audioPlaybackMs: number
  noiseState: NoiseState
  heardRanges: TimeRange[]
  damageRanges: TimeRange[]
  seededHeardRanges: TimeRange[]
  hazards: BattlefieldHazardState[]
  destroyedAnalysisValue: number
  score: number
  selfRepairPointsEarned: number
  restorationRate: number
  cleared: boolean
}

export type BattlefieldHazardState = {
  hazardId: HazardId
  kind: "magneticDisaster"
  phase: HazardPhase
  phaseProgress: number
  area: BattlefieldHazardArea
  motion: BattlefieldHazardMotion
  tickIntervalMs: number
  noiseDamage: number
  enemyDamagePerSecond: number
  visualPresetId: VisualPresetId
  lastAppliedAtMs?: number
}

export type MissionRewardResult = {
  score: number
  selfRepairPointsEarned: number
  isFirstClear: boolean
  newHeardRangeMs: number
}

export type MissionResult = {
  transmissionId: TransmissionId
  missionId: MissionId
  analysisRate: number
  restorationRate: number
  heardRanges: TimeRange[]
  transcriptSpans: TranscriptSpan[]
  damageRanges: TimeRange[]
  destroyedAnalysisValue: number
  score: number
  selfRepairPointsEarned: number
  newHeardRangeMs: number
  grantedEquipmentIds: EquipmentId[]
  isFirstClear: boolean
  cleared: boolean
}

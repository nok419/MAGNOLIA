import {
  createEmptyEquippedItems,
  createEmptyMetadataUnlocked,
} from "./game-types"
import type {
  AreaId,
  AreaMaster,
  AreaProgressRow,
  BattlePhase,
  BattlefieldHazardArea,
  BattlefieldHazardMotion,
  BulletPattern,
  BulletPatternId,
  CollectibleMapNode,
  ConditionId,
  ConditionSpec,
  ContentClassification,
  ContentIdMigrationMap,
  Difficulty,
  DifficultyModifiers,
  EffectId,
  EffectSpec,
  EnemyArchetype,
  EnemyId,
  HazardId,
  HazardPhase,
  EquippedItems,
  EquipmentId,
  EquipmentMaster,
  EquipmentSlot,
  HitboxPreset,
  HitboxPresetId,
  MapId,
  MetaRow,
  MissionId,
  MissionMaster,
  MissionPhase,
  MissionRunRow,
  ProfileId,
  ProfileRow,
  PrimaryEquipmentSlot,
  ProjectileId,
  ProjectileSpec,
  RuntimeEffectRequest,
  SaveSlotId,
  SaveSlotRow,
  SettingsRow,
  SubsystemIndex,
  ThemeId,
  TranscriptChunkId,
  TranscriptChunk,
  TranscriptViewChunk,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
  UiThemePreset,
  Vector2,
  VisualPreset,
  VisualPresetId,
  WorldMapLogic,
  WorldMapNodeId,
} from "./game-types"
import type {
  PresentationCueId,
  PresentationCueSpec,
  PresentationRequest,
} from "./presentation-types"
import type { SettingsPath, SettingsValue } from "./settings"

export type FeatureAccessState = {
  canOpenMap: boolean
  canOpenArchive: boolean
  canOpenEquipment: boolean
  mapVisionUnlocked: boolean
  compassEnabled: boolean
  hudEnabled: boolean
  minimapEnabled: boolean
  strengthMeterEnabled: boolean
  infoPanelEnabled: boolean
  visibleAreaIds: AreaId[]
  visibleTransmissionIds: TransmissionId[]
  accessibleTransmissionIds: TransmissionId[]
  visibleEquipmentIds: EquipmentId[]
  visibleMissionIds: MissionId[]
  startableMissionIds: MissionId[]
}

export function createEmptyFeatureAccessState(): FeatureAccessState {
  return {
    canOpenMap: false,
    canOpenArchive: false,
    canOpenEquipment: false,
    mapVisionUnlocked: false,
    compassEnabled: false,
    hudEnabled: false,
    minimapEnabled: false,
    strengthMeterEnabled: false,
    infoPanelEnabled: false,
    visibleAreaIds: [],
    visibleTransmissionIds: [],
    accessibleTransmissionIds: [],
    visibleEquipmentIds: [],
    visibleMissionIds: [],
    startableMissionIds: [],
  }
}

export type WorldMapVisibilityState = {
  fogBitmap: string
  visibleCellKeys: string[]
  visibleAreaNodeIds: WorldMapNodeId[]
  visibleTransmissionNodeIds: WorldMapNodeId[]
  visibleWarpNodeIds: WorldMapNodeId[]
  visibleCollectibleNodeIds: WorldMapNodeId[]
}

export type ExploreMapViewModel = {
  playerPosition: Vector2
  visibleAreaNodeIds: WorldMapNodeId[]
  visibleTransmissionNodeIds: WorldMapNodeId[]
  visibleWarpNodeIds: WorldMapNodeId[]
  visibleCollectibleNodeIds: WorldMapNodeId[]
  fogBitmap: string
}

export type ArchiveAccessState = {
  visibleAreaIds: AreaId[]
  visibleTransmissionIds: TransmissionId[]
  metadataUnlocked: TransmissionProgressRow["metadataUnlocked"]
  transcriptView: TranscriptViewChunk[]
}

export function createEmptyArchiveAccessState(): ArchiveAccessState {
  return {
    visibleAreaIds: [],
    visibleTransmissionIds: [],
    metadataUnlocked: createEmptyMetadataUnlocked(),
    transcriptView: [],
  }
}

export type ExploreHudViewModel = {
  currentAreaId?: AreaId
  equipped: EquippedItems
  communicationStrength: number
  compassTargetAreaId?: AreaId
  currentAreaCompletionRate: number
  selfRepairPoints: number
}

export type BattleHudViewModel = {
  missionId: MissionId
  phase: MissionPhase
  analysisRate: number
  restorationRate: number
  noiseLevel: number
  equipped: EquippedItems
  dangerLevel: number
  selfRepairPointsEarned: number
}

export type BattleHazardViewModel = {
  hazardId: HazardId
  kind: "magneticDisaster"
  phase: HazardPhase
  phaseProgress: number
  area: BattlefieldHazardArea
  motion: BattlefieldHazardMotion
  visualPresetId: VisualPresetId
}

export type SaveSlotListViewModel = {
  slots: SaveSlotRow[]
  selectedSlotId?: SaveSlotId
}

export type ExploreSnapshot = {
  screen: "explore"
  playerPosition: Vector2
  map: ExploreMapViewModel
  hud: ExploreHudViewModel
  featureAccess: FeatureAccessState
}

export type MapSnapshot = {
  screen: "map"
  playerPosition: Vector2
  map: ExploreMapViewModel
  hud: ExploreHudViewModel
  featureAccess: FeatureAccessState
}

export type BattleSnapshot = {
  screen: "battle"
  missionId: MissionId
  phase: MissionPhase
  playerPosition: Vector2
  hud: BattleHudViewModel
  hazards: BattleHazardViewModel[]
}

export type ArchiveSnapshot = {
  screen: "archive"
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  access: ArchiveAccessState
}

export type EquipmentPanelViewModel = {
  screen: "equipment"
  ownedEquipmentIds: EquipmentId[]
  equipped: EquippedItems
  equipmentLevels: Partial<Record<EquipmentId, number>>
  selfRepairPoints: number
}

export function createEmptyEquipmentPanelViewModel(): EquipmentPanelViewModel {
  return {
    screen: "equipment",
    ownedEquipmentIds: [],
    equipped: createEmptyEquippedItems(),
    equipmentLevels: {},
    selfRepairPoints: 0,
  }
}

export type RootSnapshot = {
  screen:
    | "title"
    | "slotSelect"
    | "explore"
    | "map"
    | "battle"
    | "archive"
    | "equipment"
    | "settings"
  saveSlots: SaveSlotListViewModel
  explore?: ExploreSnapshot
  map?: MapSnapshot
  battle?: BattleSnapshot
  archive?: ArchiveSnapshot
  equipment?: EquipmentPanelViewModel
}

export type DomainEvent =
  | {
      type: "areaDiscovered"
      areaId: AreaId
    }
  | {
      type: "transmissionUnlocked"
      transmissionId: TransmissionId
    }
  | {
      type: "missionStarted"
      missionId: MissionId
    }
  | {
      type: "enemyDestroyed"
      enemyId: EnemyId
    }
  | {
      type: "analysisRateChanged"
      analysisRate: number
    }
  | {
      type: "transcriptDamaged"
      range: { startMs: number; endMs: number }
    }
  | {
      type: "equipmentEquipped"
      equipmentId: EquipmentId
      slot: PrimaryEquipmentSlot
    }
  | {
      type: "equipmentEquipped"
      equipmentId: EquipmentId
      slot: "subsystem"
      subsystemIndex: SubsystemIndex
    }
  | {
      type: "saveWritten"
      slotId: SaveSlotId
    }
  | {
      type: "collectibleCollected"
      nodeId: WorldMapNodeId
      collectibleKind: CollectibleMapNode["collectibleKind"]
    }

export type ExploreFrameInput = {
  dtMs: number
  move: Vector2
  dashPressed: boolean
  interactPressed: boolean
  scanPressed: boolean
  menuCommand?: "openMap" | "openArchive" | "openEquipment" | "openSettings"
}

export type BattleFrameInput = {
  dtMs: number
  move: Vector2
  fireMain: boolean
  fireSub: boolean
  focus: boolean
  pausePressed: boolean
}

export type ExploreFrameResult = {
  snapshot: ExploreSnapshot
  events: DomainEvent[]
  presentationRequests: PresentationRequest[]
}

export type BattleFrameResult = {
  snapshot: BattleSnapshot
  events: DomainEvent[]
  effectRequests: RuntimeEffectRequest[]
  presentationRequests: PresentationRequest[]
}

export type StartNewGameAtSlotCommand = {
  type: "startNewGameAtSlot"
  slotId: SaveSlotId
  difficulty: Difficulty
}

export type ResumeSaveSlotCommand = {
  type: "resumeSaveSlot"
  slotId: SaveSlotId
}

export type OpenMapCommand = {
  type: "openMap"
}

export type OpenArchiveCommand = {
  type: "openArchive"
}

export type OpenEquipmentCommand = {
  type: "openEquipment"
}

export type OpenSettingsCommand = {
  type: "openSettings"
}

export type ClosePanelCommand = {
  type: "closePanel"
}

export type EquipPrimaryItemCommand = {
  type: "equipItem"
  slot: PrimaryEquipmentSlot
  equipmentId: EquipmentId
}

export type EquipSubsystemItemCommand = {
  type: "equipItem"
  slot: "subsystem"
  equipmentId: EquipmentId
  subsystemIndex: SubsystemIndex
}

export type ChangeSettingCommand = {
  type: "changeSetting"
  path: SettingsPath
  value: SettingsValue
}

export type SaveToCurrentSlotCommand = {
  type: "saveToCurrentSlot"
}

export type SaveToSlotCommand = {
  type: "saveToSlot"
  slotId: SaveSlotId
}

export type StartMissionCommand = {
  type: "startMission"
  missionId: MissionId
}

export type ReturnToExploreCommand = {
  type: "returnToExplore"
}

export type ReturnToTitleCommand = {
  type: "returnToTitle"
}

export type WarpToAreaCommand = {
  type: "warpToArea"
  areaId: AreaId
}

export type UpgradeEquipmentCommand = {
  type: "upgradeEquipment"
  equipmentId: EquipmentId
}

export type PurchaseEquipmentCommand = {
  type: "purchaseEquipment"
  equipmentId: EquipmentId
}

export type CollectItemCommand = {
  type: "collectItem"
  nodeId: WorldMapNodeId
}

export type InteractExploreNodeCommand = {
  type: "interactExploreNode"
  nodeId: WorldMapNodeId
}

export type GameCommand =
  | StartNewGameAtSlotCommand
  | ResumeSaveSlotCommand
  | OpenMapCommand
  | OpenArchiveCommand
  | OpenEquipmentCommand
  | OpenSettingsCommand
  | ClosePanelCommand
  | EquipPrimaryItemCommand
  | EquipSubsystemItemCommand
  | ChangeSettingCommand
  | SaveToCurrentSlotCommand
  | SaveToSlotCommand
  | StartMissionCommand
  | ReturnToExploreCommand
  | ReturnToTitleCommand
  | WarpToAreaCommand
  | UpgradeEquipmentCommand
  | PurchaseEquipmentCommand
  | CollectItemCommand
  | InteractExploreNodeCommand

export type ContentBundle = {
  playerShipSpec: import("./game-types").PlayerShipSpec
  areas: Record<AreaId, AreaMaster>
  mapLogic: Record<MapId, WorldMapLogic>
  transmissions: Record<TransmissionId, TransmissionMaster>
  transcriptChunks: Record<TranscriptChunkId, TranscriptChunk>
  missions: Record<MissionId, MissionMaster>
  enemies: Record<EnemyId, EnemyArchetype>
  bulletPatterns: Record<BulletPatternId, BulletPattern>
  projectiles: Record<ProjectileId, ProjectileSpec>
  equipment: Record<EquipmentId, EquipmentMaster>
  effects: Record<EffectId, EffectSpec>
  conditions: Record<ConditionId, ConditionSpec>
  visuals: Record<VisualPresetId, VisualPreset>
  hitboxes: Record<HitboxPresetId, HitboxPreset>
  themes: Record<ThemeId, UiThemePreset>
  presentationCues: Record<PresentationCueId, PresentationCueSpec>
  difficultyModifiers: Record<Difficulty, DifficultyModifiers>
  contentClassification: ContentClassification
  migratedIds: ContentIdMigrationMap
}

export type ProfileAggregate = {
  profile: ProfileRow
  saveSlot: SaveSlotRow
  areaProgress: AreaProgressRow[]
  transmissionProgress: TransmissionProgressRow[]
  missionRuns: MissionRunRow[]
}

export type SaveRepository = {
  listSaveSlots(): Promise<SaveSlotRow[]>
  loadProfile(profileId: ProfileId): Promise<ProfileAggregate | null>
  loadProfileBySlot(slotId: SaveSlotId): Promise<ProfileAggregate | null>
  createProfileAtSlot(slotId: SaveSlotId, profile: ProfileAggregate): Promise<void>
  saveProfileToSlot(slotId: SaveSlotId, profile: ProfileAggregate): Promise<void>
  saveMissionRun(run: MissionRunRow): Promise<void>
  loadSettings(): Promise<SettingsRow>
  saveSettings(settings: SettingsRow): Promise<void>
  loadMeta(key: MetaRow["key"]): Promise<MetaRow | null>
  saveMeta(row: MetaRow): Promise<void>
  exportProfile(slotId: SaveSlotId): Promise<string>
  importProfile(slotId: SaveSlotId, serialized: string): Promise<ProfileId>
}

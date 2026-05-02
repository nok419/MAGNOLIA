import {
  applySettingChange,
  createEmptyArchiveAccessState,
  createDefaultSaveSlots,
  createDefaultSettings,
  createEmptyEquippedItems,
  createEmptyFeatureAccessState,
  createEmptyMetadataUnlocked,
  normalizeSettings,
} from "@magnolia/contracts"
import type {
  AreaId,
  AreaMaster,
  BattleFrameInput,
  BattleFrameResult,
  BattleSnapshot,
  CollectItemCommand,
  CollectibleMapNode,
  ContentBundle,
  ContentHitboxPreset,
  DomainEvent,
  EquipmentId,
  ExploreFrameInput,
  ExploreFrameResult,
  ExploreScanPulseViewModel,
  ExploreSnapshot,
  GameCommand,
  MissionId,
  ProfileAggregate,
  ProfileRow,
  RootSnapshot,
  RuntimeEffectRequest,
  SaveRepository,
  SaveSlotId,
  SaveSlotRow,
  SettingsPath,
  SettingsRow,
  SettingsValue,
  StartDebugModeCommand,
  StartNewGameAtSlotCommand,
  TimeRange,
  TranscriptChunk,
  TransmissionId,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  applyEquippedPassives,
  createEquipmentRuntimeBindings,
  defaultEquipmentRuntimeRegistry,
  resolveLoadout,
  runSubsystemHooks,
  type RuntimeModifierPatch,
} from "./equipment-runtime"
import {
  applyBattleEffectRequests,
  updateBattleProjectiles,
} from "./battle-effects"
import type {
  InternalBattleState,
  InternalEnemyState,
  InternalPickupState,
} from "./battle-state"
import {
  buildArchiveAccessState,
  buildArchiveViewModel,
  buildFeatureAccessState,
  buildMenuViewModel,
  buildWorldMapVisibilityState,
  createMissionReplaySeed,
  resolveEquipmentEquipState,
  resolveEquipmentPurchaseState,
  resolveEquipmentUpgradeState,
  seedMissionStateWithReplayProgress,
  selectVisibleWorldMapSnapshot,
} from "./selectors"
import {
  computeAreaCompletionRate,
  hasVisibleArchiveContent,
  isTransmissionSignalIdentified,
  readTransmissionCompletionState,
} from "./progression"
import {
  createMissionBeatPresentation,
  createInitialSystemMessagePresentation,
  createRebootSequencePresentation,
  createTransmissionConnectPresentation,
  createTutorialReleasePresentation,
  createWarpTransitionPresentation,
  flattenPresentationRequests,
} from "./presentation"
import {
  computeAreaBounds,
  computeNearestTransmissionStrength,
  computeNearestAnyTransmissionStrength,
  computeRevealCompletionRate,
  computeWorldBounds,
  createExploreRevealViewport,
  findNearbyNode,
  isWithinRadius,
  mergeRevealBitmaps,
  normalizeVector,
  readDisplayArea,
  revealViewportArea,
} from "./explore-world"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  isCircleInsideCircle,
  resolveHitRadius,
  resolveSpawnPoint,
} from "./battle-world"
import { clamp01 } from "./math"
import { fireEnemyPatterns as fireEnemyPatternsFromRegistry } from "./battle/enemy-pattern-system"
import {
  advanceEnemyMovement,
  shouldKeepEnemyInBattle,
} from "./battle/movement-system"
import { spawnMissionEnemies as spawnMissionEnemiesFromSystem } from "./battle/spawn-system"
import { buildBattleRenderState } from "./battle/battle-render-state"
import { stepBattleFrame } from "./battle/step-battle"
import {
  maybeSpawnBattleFragment as maybeSpawnBattleFragmentFromSystem,
  updateBattleFragments as updateBattleFragmentsFromSystem,
} from "./battle/fragments-system"
import {
  applyMagneticDisasterEffects as applyMagneticDisasterEffectsFromSystem,
} from "./battle/hazard-interaction-system"
import {
  DEFAULT_EXPLORE_SCAN_RADIUS,
  DEFAULT_EXPLORE_VISION_RADIUS,
  EXPLORE_SCAN_COOLDOWN_MS,
  buildExploreInteractionTargets,
  buildExploreSignalHints,
  resolveExploreNodeInteractionRadius,
  shouldShowScanTutorialHint,
} from "./explore/explore-session-runtime"
import { stepExploreFrame } from "./explore/step-explore"
import { dispatchGameCommand } from "./command/dispatch-command"
import {
  createDebugProfileAggregate,
  createInitialProfileAggregate,
} from "./profile-factory"
import {
  createBattleSnapshotFromState,
  createEmptyExploreSnapshot,
  createEquipmentSnapshotForProfile,
  createExploreSnapshotForProfile,
  createMapSnapshotFromExplore,
} from "./session-snapshots"
import { toRecord } from "./record-utils"
import type {
  BattleRenderState,
  ExploreNodeRenderState,
  ExploreRenderState,
  WorldMapAreaViewModel,
  WorldMapCollectibleViewModel,
  WorldMapTransmissionViewModel,
  WorldMapViewModel,
  WorldMapWarpViewModel,
  Rect,
} from "./runtime-types"

/**
 * 新規ゲーム開始時にターミナルへ流れるブートログ。
 * 「不調箇所や不完全な初期設定はあるが、かろうじて再起動できた」
 * という世界観を、無機質なシステムログ調で表現する。
 *
 * 文字数ベースで演出時間を算出する都合上、長さが全体のペース感に影響する。
 * 現行では自動完了を ~3〜4 秒に抑え、さらに早めに skip できる前提で短い導入に寄せる。
 */
const BOOT_LINES = [
  "[ MAGNOLIA ] kernel 7.2.4 · signal core",
  "> initialize residual uplink console",
  "",
  "verb 37 / noun 41 ........ recovery program accepted",
  "memory integrity .......... 41% recovered",
  "neural lattice ............ partial / 2 of 8 masked",
  "archive bus ............... offline",
  "network uplink ............ carrier absent",
  "self-repair module ........ cold",
  "",
  "> load fallback profile ....... ok",
  "> mount minimal equipment .... 2 of 6",
  "> attitude reference .......... reconstructed",
  "",
  "> residual carrier acquired",
]

export class MagnoliaGameSession {
  private readonly content: ContentBundle
  private readonly repository: SaveRepository
  private saveSlots: SaveSlotRow[] = createDefaultSaveSlots()
  private settings: SettingsRow = createDefaultSettings()
  private screen: RootSnapshot["screen"] = "title"
  private activeProfile: ProfileAggregate | null = null
  private battleState: InternalBattleState | null = null
  private lastExploreFacing: Vector2 = { x: 0, y: -1 }
  private lastExploreVelocity: Vector2 = { x: 0, y: 0 }
  private lastExploreMovementMode: ExploreRenderState["movementMode"] = "normal"
  private lastExploreSignalStability = 0.58
  private exploreElapsedMs = 0
  private lastExploreScanAtMs = -Infinity
  private exploreScanPulses: ExploreScanPulseViewModel[] = []
  private newlyIdentifiedExploreNodeIds = new Set<WorldMapNodeId>()
  private presentationQueue = [] as ReturnType<typeof flattenPresentationRequests>
  private domainEventQueue: DomainEvent[] = []
  private lastCommandErrorReason: string | undefined
  private archiveSelection: { areaId?: AreaId; transmissionId?: TransmissionId } = {}
  private instanceSerial = 0
  private debugProfileActive = false

  constructor(input: {
    content: ContentBundle
    repository: SaveRepository
  }) {
    this.content = input.content
    this.repository = input.repository
  }

  async initialize(): Promise<void> {
    this.saveSlots = await this.repository.listSaveSlots()
    if (this.saveSlots.length === 0) {
      this.saveSlots = createDefaultSaveSlots()
    }
    const loadedSettings = await this.repository.loadSettings()
    const normalizedSettings = normalizeSettings(loadedSettings)
    this.settings = normalizedSettings
    if (normalizedSettings !== loadedSettings) {
      await this.repository.saveSettings(normalizedSettings)
    }
  }

  getContentBundle(): ContentBundle {
    return this.content
  }

  getProfileAggregate(): ProfileAggregate | null {
    return this.activeProfile
  }

  getArchiveSnapshot() {
    return this.createArchiveSnapshot()
  }

  getExploreSnapshot() {
    return this.createExploreSnapshot()
  }

  getSettings(): SettingsRow {
    return this.settings
  }

  getLastCommandErrorReason(): string | undefined {
    return this.lastCommandErrorReason
  }

  getSnapshot(): RootSnapshot {
    return {
      screen: this.screen,
      saveSlots: {
        slots: this.saveSlots,
        selectedSlotId: this.activeProfile?.profile.slotId,
      },
      explore: this.screen === "explore" ? this.createExploreSnapshot() : undefined,
      map: this.screen === "map" ? this.createMapSnapshot() : undefined,
      battle: this.screen === "battle" ? this.createBattleSnapshot() : undefined,
      archive: this.screen === "archive" ? this.createArchiveSnapshot() : undefined,
      equipment: this.activeProfile ? this.createEquipmentSnapshot() : undefined,
      menu: this.createMenuViewModel(),
    }
  }

  drainPresentationRequests() {
    const queue = [...this.presentationQueue]
    this.presentationQueue = []
    return queue
  }

  drainDomainEvents(): DomainEvent[] {
    const queue = [...this.domainEventQueue]
    this.domainEventQueue = []
    return queue
  }

  getExploreRenderState(): ExploreRenderState | null {
    if (!this.activeProfile) {
      return null
    }

    const featureAccess = this.buildFeatureAccess()
    // area は探索上のクラスター名であり、現行 demo では同じ 1 枚の world map を共有します。
    const currentArea = this.content.areas[this.activeProfile.profile.currentAreaId]
    const mapLogic = currentArea ? this.content.mapLogic[currentArea.mapId] : undefined
    if (!currentArea || !mapLogic) {
      return null
    }
    const worldBounds = computeWorldBounds(mapLogic)
    const displayArea = readDisplayArea({
      mapLogic,
      areas: this.content.areas,
      playerPosition: this.activeProfile.profile.playerPosition,
    })
    const currentAreaBounds = computeAreaBounds(mapLogic, currentArea.areaId, worldBounds)
    const exploreVisionRadius = this.resolveExploreVisionRadius()
    const exploreScanCooldownMs = this.resolveExploreScanCooldownMs()
    const exploreScanRadius = this.resolveExploreScanRadius()
    const mergedRevealBitmap = mergeRevealBitmaps(this.activeProfile.areaProgress)
    const mapState = buildWorldMapVisibilityState({
      revealBitmap: mergedRevealBitmap,
      mapLogic,
      loadout: this.resolveLoadout(),
      featureAccess,
      profile: this.activeProfile.profile,
      conditions: this.content.conditions,
      areaProgress: toRecord(this.activeProfile.areaProgress, "areaId"),
      transmissionProgress: toRecord(this.activeProfile.transmissionProgress, "transmissionId"),
    })
    const nearestTransmissionStrength = computeNearestTransmissionStrength({
      playerPosition: this.activeProfile.profile.playerPosition,
      mapLogic,
      featureAccess,
      transmissions: this.content.transmissions,
      transmissionProgress: toRecord(this.activeProfile.transmissionProgress, "transmissionId"),
      clearedMissionIds: this.activeProfile.profile.clearedMissionIds,
    })
    const nearestAnyTransmissionStrength = computeNearestAnyTransmissionStrength({
      playerPosition: this.activeProfile.profile.playerPosition,
      mapLogic,
      featureAccess,
    })
    const visibleTransmissions = mapLogic.transmissionNodes
      .filter((node) => mapState.visibleTransmissionNodeIds.includes(node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        label: this.content.transmissions[node.transmissionId]?.title,
        interactionRadius: node.interactionRadius,
        state: readTransmissionCompletionState(
          this.activeProfile?.transmissionProgress.find(
            (progress) => progress.transmissionId === node.transmissionId,
          ),
        ),
      }))
    const visibleWarps = mapLogic.warpNodes
      .filter((node) => mapState.visibleWarpNodeIds.includes(node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        label: this.content.areas[node.warpTargetAreaId]?.name,
        interactionRadius: node.interactionRadius,
      }))
    const visibleCollectibles = mapLogic.collectibleNodes
      .filter((node) => mapState.visibleCollectibleNodeIds.includes(node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        interactionRadius: node.interactionRadius,
        markerKind: (
          node.collectibleKind === "hiddenEquipment" ? "equipment" : "resource"
        ) as ExploreNodeRenderState["markerKind"],
        label:
          node.collectibleKind === "hiddenEquipment"
            ? "???"
            : "自己修復ポイント",
      }))
    const interactionTargets = buildExploreInteractionTargets({
      visibleTransmissions,
      visibleWarps,
      visibleCollectibles,
      playerPosition: this.activeProfile.profile.playerPosition,
      visionRadius: exploreVisionRadius,
    })

    return {
      worldBounds,
      currentAreaId: displayArea?.areaId,
      currentAreaName: displayArea?.name ?? "—",
      currentThemeId: displayArea?.themeId,
      playerPosition: this.activeProfile.profile.playerPosition,
      playerFacing: this.lastExploreFacing ?? { x: 0, y: -1 },
      visionRadius: exploreVisionRadius,
      areaBounds: currentAreaBounds,
      visibleTransmissions,
      visibleWarps,
      visibleCollectibles,
      interactionTargets,
      nearestTransmissionStrength,
      nearestAnyTransmissionStrength,
      playerVelocity: this.lastExploreVelocity,
      movementMode: this.lastExploreMovementMode,
      signalStability: this.lastExploreSignalStability,
      scanCooldownRatio: clamp01(
        (this.exploreElapsedMs - this.lastExploreScanAtMs) / exploreScanCooldownMs,
      ),
      elapsedMs: this.exploreElapsedMs,
      signalHints: buildExploreSignalHints({
        content: this.content,
        profileAggregate: this.activeProfile,
        mapLogic,
        featureAccess,
        playerPosition: this.activeProfile.profile.playerPosition,
        exploreElapsedMs: this.exploreElapsedMs,
        lastExploreScanAtMs: this.lastExploreScanAtMs,
        scanRadius: exploreScanRadius,
        newlyIdentifiedExploreNodeIds: this.newlyIdentifiedExploreNodeIds,
      }),
      scanPulses: this.exploreScanPulses.filter(
        (pulse) => this.exploreElapsedMs - pulse.startedAtMs <= pulse.durationMs,
      ),
      shouldShowScanHint: shouldShowScanTutorialHint(this.activeProfile.profile),
      tutorialRestricted: !featureAccess.mapVisionUnlocked,
    }
  }

  getWorldMapViewModel(): WorldMapViewModel | null {
    if (!this.activeProfile) {
      return null
    }

    const currentArea = this.content.areas[this.activeProfile.profile.currentAreaId]
    const mapLogic = currentArea ? this.content.mapLogic[currentArea.mapId] : undefined
    if (!currentArea || !mapLogic) {
      return null
    }

    const featureAccess = this.buildFeatureAccess()
    const worldBounds = computeWorldBounds(mapLogic)
    const mergedRevealBitmap = mergeRevealBitmaps(this.activeProfile.areaProgress)
    const transmissionProgressById = toRecord(
      this.activeProfile.transmissionProgress,
      "transmissionId",
    )
    const mapState = buildWorldMapVisibilityState({
      revealBitmap: mergedRevealBitmap,
      mapLogic,
      loadout: this.resolveLoadout(),
      featureAccess,
      profile: this.activeProfile.profile,
      conditions: this.content.conditions,
      areaProgress: toRecord(this.activeProfile.areaProgress, "areaId"),
      transmissionProgress: transmissionProgressById,
    })
    const selectedAreaId = this.archiveSelection.areaId ?? currentArea.areaId
    const selectedTransmissionId = this.archiveSelection.transmissionId
    const focusSourceBounds = selectedAreaId
      ? computeMapAreaBounds(mapLogic, this.content, selectedAreaId)
      : worldBounds

    return {
      mapId: currentArea.mapId,
      fogBitmap: selectVisibleWorldMapSnapshot({
        mapState,
        playerPosition: this.activeProfile.profile.playerPosition,
        mapLogic,
      }).fogBitmap,
      worldBounds,
      focusBounds: expandRect(
        focusSourceBounds,
        selectedAreaId ? 120 : 60,
      ),
      selectedAreaId,
      selectedTransmissionId,
      areas: featureAccess.visibleAreaIds
        .map((areaId) => this.content.areas[areaId])
        .filter((area): area is AreaMaster => Boolean(area))
        .sort((left, right) => left.name.localeCompare(right.name, "ja"))
        .map<WorldMapAreaViewModel>((area) => {
          const bounds = computeMapAreaBounds(mapLogic, this.content, area.areaId)
          return {
            areaId: area.areaId,
            name: area.name,
            position: area.worldPosition,
            bounds,
            completionRate: computeAreaCompletionRate({
              area,
              transmissionProgress: transmissionProgressById,
            }),
            selected: area.areaId === selectedAreaId,
          }
        }),
      transmissions: mapLogic.transmissionNodes
        .filter((node) => mapState.visibleTransmissionNodeIds.includes(node.nodeId))
        .map<WorldMapTransmissionViewModel>((node) => {
          const transmission = this.content.transmissions[node.transmissionId]
          const progress = transmissionProgressById[node.transmissionId]
          return {
            nodeId: node.nodeId,
            areaId: node.areaId,
            transmissionId: node.transmissionId,
            title: progress?.metadataUnlocked.title ? transmission?.title ?? "???" : "???",
            sender: progress?.metadataUnlocked.sender ? transmission?.sender ?? "???" : "???",
            recipient: progress?.metadataUnlocked.recipient ? transmission?.recipient ?? "???" : "???",
            restorationRate: progress?.archiveRestorationRate ?? 0,
            position: { x: node.x, y: node.y },
            state: readTransmissionCompletionState(progress),
            selected: node.transmissionId === selectedTransmissionId,
          }
        }),
      collectibles: mapLogic.collectibleNodes
        .filter((node) => mapState.visibleCollectibleNodeIds.includes(node.nodeId))
        .map<WorldMapCollectibleViewModel>((node) => ({
          nodeId: node.nodeId,
          areaId: node.areaId,
          position: { x: node.x, y: node.y },
          markerKind: readMapCollectibleMarkerKind(node),
        })),
      warps: mapLogic.warpNodes
        .filter((node) => mapState.visibleWarpNodeIds.includes(node.nodeId))
        .map<WorldMapWarpViewModel>((node) => ({
          nodeId: node.nodeId,
          areaId: node.areaId,
          targetAreaId: node.warpTargetAreaId,
          position: { x: node.x, y: node.y },
        })),
      player: {
        areaId: currentArea.areaId,
        position: this.activeProfile.profile.playerPosition,
        facing: this.lastExploreFacing,
        visionRadius: this.resolveExploreVisionRadius(),
      },
    }
  }

  getBattleRenderState(): BattleRenderState | null {
    if (!this.battleState) {
      return null
    }
    return buildBattleRenderState({
      battle: this.battleState,
      content: this.content,
      clearedMissionIds: this.activeProfile?.profile.clearedMissionIds,
      equippedMainId: this.activeProfile?.profile.equipped.main,
      equippedSubId: this.activeProfile?.profile.equipped.sub,
    })
  }

  async dispatch(command: GameCommand): Promise<RootSnapshot> {
    this.lastCommandErrorReason = undefined
    await dispatchGameCommand(command, {
      startNewGameAtSlot: (nextCommand) => this.handleStartNewGame(nextCommand),
      startDebugMode: (nextCommand) => this.handleStartDebugMode(nextCommand),
      resumeSaveSlot: (nextCommand) => this.handleResumeSaveSlot(nextCommand.slotId),
      openArchive: () => this.handleOpenArchive(),
      openEquipment: () => this.handleOpenEquipment(),
      openSettings: () => this.handleOpenSettings(),
      openMap: () => this.handleOpenMap(),
      closePanel: () => this.handleClosePanel(),
      equipItem: (nextCommand) => this.handleEquipItem(nextCommand),
      unequipItem: (nextCommand) => this.handleUnequipItem(nextCommand),
      purchaseEquipment: (nextCommand) => this.handlePurchaseEquipment(nextCommand.equipmentId),
      upgradeEquipment: (nextCommand) => this.handleUpgradeEquipment(nextCommand.equipmentId),
      startMission: (nextCommand) => this.startMission(nextCommand.missionId),
      returnToExplore: () => this.handleReturnToExplore(),
      returnToTitle: () => this.handleReturnToTitle(),
      warpToArea: (nextCommand) => this.handleWarpToArea(nextCommand.areaId),
      saveToCurrentSlot: () => this.saveCurrentProfile(),
      saveToSlot: (nextCommand) => this.saveProfileToSlot(nextCommand.slotId),
      changeSetting: async (nextCommand) => {
        this.handleSettingChange(nextCommand.path, nextCommand.value)
        await this.repository.saveSettings(this.settings)
      },
      collectItem: (nextCommand) => this.handleCollectItem(nextCommand),
      interactExploreNode: (nextCommand) => this.handleExploreNodeInteraction(nextCommand.nodeId),
    })

    return this.getSnapshot()
  }

  stepExplore(input: ExploreFrameInput): ExploreFrameResult {
    const { result, runtime } = stepExploreFrame({
      frameInput: input,
      screen: this.screen,
      activeProfile: this.activeProfile,
      runtime: {
        lastExploreFacing: this.lastExploreFacing,
        lastExploreVelocity: this.lastExploreVelocity,
        lastExploreMovementMode: this.lastExploreMovementMode,
        lastExploreSignalStability: this.lastExploreSignalStability,
        exploreElapsedMs: this.exploreElapsedMs,
        lastExploreScanAtMs: this.lastExploreScanAtMs,
        exploreScanPulses: this.exploreScanPulses,
        newlyIdentifiedExploreNodeIds: this.newlyIdentifiedExploreNodeIds,
      },
      host: {
        content: this.content,
        equipment: {
          exploreMoveSpeedMultiplier: this.resolveExploreMoveSpeedMultiplier(),
          scanRadius: this.resolveExploreScanRadius(),
          scanCooldownMs: this.resolveExploreScanCooldownMs(),
        },
        snapshot: {
          createExploreSnapshot: () => this.createExploreSnapshot(),
        },
        featureAccess: {
          buildFeatureAccess: () => this.buildFeatureAccess(),
        },
        presentation: {
          revealCurrentArea: (playerPosition) => this.revealCurrentArea(playerPosition),
          handleExploreInteraction: (mapLogic, playerPosition, interactPressed) =>
            this.handleExploreInteraction(mapLogic, playerPosition, interactPressed),
        },
        menu: {
          handleExploreMenu: (frameInput) => this.handleExploreMenu(frameInput),
        },
        progress: {
          getOrCreateTransmissionProgress: (transmissionId, areaId) =>
            this.getOrCreateTransmissionProgress(transmissionId as TransmissionId, areaId),
        },
        ids: {
          nextInstanceId: (prefix) => this.nextInstanceId(prefix),
        },
      },
    })
    this.lastExploreFacing = runtime.lastExploreFacing
    this.lastExploreVelocity = runtime.lastExploreVelocity
    this.lastExploreMovementMode = runtime.lastExploreMovementMode
    this.lastExploreSignalStability = runtime.lastExploreSignalStability
    this.exploreElapsedMs = runtime.exploreElapsedMs
    this.lastExploreScanAtMs = runtime.lastExploreScanAtMs
    this.exploreScanPulses = runtime.exploreScanPulses
    this.newlyIdentifiedExploreNodeIds = runtime.newlyIdentifiedExploreNodeIds
    return result
  }

  stepBattle(input: BattleFrameInput): BattleFrameResult {
    return stepBattleFrame({
      frameInput: input,
      battle: this.battleState,
      screen: this.screen,
      activeProfile: this.activeProfile,
      host: {
        content: this.content,
        snapshot: {
          createBattleSnapshot: () => this.createBattleSnapshot(),
        },
        profile: {
          advanceProfilePlayTime: (dtMs) => {
            if (this.activeProfile) {
              this.activeProfile.saveSlot.playTimeMs += dtMs
            }
          },
        },
        mission: {
          advanceMissionPhase: (battle) => this.advanceMissionPhase(battle),
          spawnMissionEnemies: (battle, previousElapsedMs) =>
            this.spawnMissionEnemies(battle, previousElapsedMs),
          collectMissionBeatPresentationRequests: (battle, previousElapsedMs) =>
            this.collectMissionBeatPresentationRequests(battle, previousElapsedMs),
          buildMissionState: () => this.buildMissionState(),
          saveMissionRun: (missionRun) => this.repository.saveMissionRun(missionRun),
          getOrCreateTransmissionProgress: (transmissionId, areaId) =>
            this.getOrCreateTransmissionProgress(transmissionId, areaId),
          grantEquipment: (equipmentIds) => this.grantEquipment(equipmentIds),
        },
        effects: {
          applyEffectRequests: (battle, effectRequests, battlePassives) =>
            this.applyEffectRequests(battle, effectRequests, battlePassives),
          updateSupportFields: (battle, dtMs) => this.updateSupportFields(battle, dtMs),
          applyMagneticDisasterEffects: (battle, dtMs) =>
            applyMagneticDisasterEffectsFromSystem(battle, dtMs),
        },
        actors: {
          updateEnemies: (battle, dtMs) => this.updateEnemies(battle, dtMs),
          updateProjectiles: (battle, dtMs, statModifiers) =>
            this.updateProjectiles(battle, dtMs, statModifiers),
        },
        pickups: {
          updatePickups: (battle, dtMs) => this.updatePickups(battle, dtMs),
          spawnSelfRepairPickup: (battle, position, amount) =>
            this.spawnSelfRepairPickup(battle, position, amount),
        },
        fragments: {
          maybeSpawnBattleFragment: (fragmentInput) =>
            maybeSpawnBattleFragmentFromSystem({
              ...fragmentInput,
              difficulty: this.settings.difficulty,
              nextInstanceId: (prefix) => this.nextInstanceId(prefix),
            }),
          updateBattleFragments: (battle, dtMs) =>
            updateBattleFragmentsFromSystem({
              battle,
              dtMs,
              playerHitRadius: this.resolvePlayerHitRadius(),
            }),
        },
        player: {
          resolvePlayerHitRadius: () => this.resolvePlayerHitRadius(),
          readMainCadenceMultiplier: (battle) => this.readMainCadenceMultiplier(battle),
        },
        difficulty: {
          resolveDifficultyModifiers: () => this.resolveDifficultyModifiers(),
        },
        audio: {
          resolveAudioWindow: (battle, dtMs) => this.resolveAudioWindow(battle, dtMs),
        },
        ids: {
          nextInstanceId: (prefix) => this.nextInstanceId(prefix),
        },
      },
    })
  }

  selectArchive(areaId: AreaId, transmissionId: TransmissionId): void {
    if (!this.canSelectArchiveTransmission(areaId, transmissionId)) {
      return
    }
    this.archiveSelection = { areaId, transmissionId }
  }

  private resetExploreSignalRuntime(): void {
    this.exploreElapsedMs = 0
    this.lastExploreScanAtMs = -Infinity
    this.exploreScanPulses = []
    this.newlyIdentifiedExploreNodeIds.clear()
  }

  private async handleStartNewGame(command: StartNewGameAtSlotCommand): Promise<void> {
    const aggregate = createInitialProfileAggregate({
      slotId: command.slotId,
      difficulty: command.difficulty,
      content: this.content,
    })
    this.normalizeInitialOs(aggregate.profile)
    this.normalizeOwnedEquipmentLevels(aggregate.profile)
    this.activeProfile = aggregate
    this.debugProfileActive = false
    this.resetExploreSignalRuntime()
    this.screen = "explore"
    await this.repository.createProfileAtSlot(command.slotId, aggregate)
    this.saveSlots = await this.repository.listSaveSlots()
    this.presentationQueue.push(
      ...createInitialSystemMessagePresentation({ lines: BOOT_LINES }),
      ...createRebootSequencePresentation(),
    )
  }

  private async handleResumeSaveSlot(slotId: SaveSlotId): Promise<void> {
    const aggregate = await this.repository.loadProfileBySlot(slotId)
    if (!aggregate) {
      return
    }
    this.normalizeInitialOs(aggregate.profile)
    this.normalizeOwnedEquipmentLevels(aggregate.profile)
    this.activeProfile = aggregate
    this.debugProfileActive = false
    this.resetExploreSignalRuntime()
    this.screen = "explore"
    this.ensureArchiveSelection()
  }

  private async handleStartDebugMode(command: StartDebugModeCommand): Promise<void> {
    const aggregate = createDebugProfileAggregate({
      difficulty: command.difficulty,
      content: this.content,
    })
    this.normalizeInitialOs(aggregate.profile)
    this.normalizeOwnedEquipmentLevels(aggregate.profile)
    this.activeProfile = aggregate
    this.debugProfileActive = true
    this.resetExploreSignalRuntime()
    this.archiveSelection = {}
    this.battleState = null
    this.screen = "explore"
  }

  private handleOpenArchive(): void {
    if (!this.activeProfile || !this.buildFeatureAccess().canOpenArchive) {
      return
    }
    this.ensureArchiveSelection()
    this.screen = "archive"
  }

  private handleOpenEquipment(): void {
    if (this.activeProfile && this.buildFeatureAccess().canOpenEquipment) {
      this.screen = "equipment"
    }
  }

  private handleOpenSettings(): void {
    this.screen = "settings"
  }

  private handleOpenMap(): void {
    // 全体マップの解放条件は session を正本にし、UI からの誤った command をここで止めます。
    if (this.activeProfile && this.buildFeatureAccess().canOpenMap) {
      this.screen = "map"
    }
  }

  private handleClosePanel(): void {
    if (!this.activeProfile) {
      this.screen = "title"
      return
    }

    // MAGNOLIA 装備直後は、装備画面を閉じる瞬間に境界解除の演出と機能開放をまとめます。
    if (
      this.screen === "equipment" &&
      this.activeProfile.profile.equipped.os === "eq_os_magnolia" &&
      !this.activeProfile.profile.unlockedFlags.includes("tutorial.released")
    ) {
      this.activeProfile.profile.unlockedFlags = uniqueIds([
        ...this.activeProfile.profile.unlockedFlags,
        "tutorial.released",
        "ui.map.enabled",
      ])
      this.presentationQueue.push(
        ...createTutorialReleasePresentation({
          worldPosition: this.activeProfile.profile.playerPosition,
          releasedActions: ["map", "full explore"],
          blocking: true,
        }),
      )
    }
    this.screen = "explore"
  }

  private handleEquipItem(
    command:
      | Extract<GameCommand, { type: "equipItem"; slot: "main" | "sub" | "os" }>
      | Extract<GameCommand, { type: "equipItem"; slot: "subsystem" }>,
  ): void {
    if (!this.activeProfile) {
      return
    }
    const equipment = this.content.equipment[command.equipmentId]
    const state = resolveEquipmentEquipState({
      equipmentId: command.equipmentId,
      slot: command.slot,
      subsystemIndex: command.slot === "subsystem" ? command.subsystemIndex : undefined,
      equipment,
      profile: this.activeProfile.profile,
    })
    if (!state.canEquip) {
      this.lastCommandErrorReason = state.lockedReasonLabel
      return
    }

    if (command.slot === "subsystem") {
      this.activeProfile.profile.equipped.subsystems[command.subsystemIndex] = command.equipmentId
      this.domainEventQueue.push({
        type: "equipmentEquipped",
        equipmentId: command.equipmentId,
        slot: command.slot,
        subsystemIndex: command.subsystemIndex,
      })
    } else {
      this.activeProfile.profile.equipped[command.slot] = command.equipmentId
      this.domainEventQueue.push({
        type: "equipmentEquipped",
        equipmentId: command.equipmentId,
        slot: command.slot,
      })
    }

    // MAGNOLIA 装備後の制限解除は、装備画面を閉じた瞬間に演出付きで行います。
  }

  private handleUnequipItem(
    command:
      | Extract<GameCommand, { type: "unequipItem"; slot: "main" | "sub" | "os" }>
      | Extract<GameCommand, { type: "unequipItem"; slot: "subsystem" }>,
  ): void {
    if (!this.activeProfile) {
      return
    }

    if (command.slot === "subsystem") {
      if (this.activeProfile.profile.equipped.subsystems[command.subsystemIndex] !== command.equipmentId) {
        this.lastCommandErrorReason = "指定したサブシステム枠には装備されていません"
        return
      }
      this.activeProfile.profile.equipped.subsystems[command.subsystemIndex] = null
      this.domainEventQueue.push({
        type: "equipmentUnequipped",
        equipmentId: command.equipmentId,
        slot: command.slot,
        subsystemIndex: command.subsystemIndex,
      })
      return
    }

    if (this.activeProfile.profile.equipped[command.slot] !== command.equipmentId) {
      this.lastCommandErrorReason = "指定したスロットには装備されていません"
      return
    }
    this.activeProfile.profile.equipped[command.slot] = undefined
    this.domainEventQueue.push({
      type: "equipmentUnequipped",
      equipmentId: command.equipmentId,
      slot: command.slot,
    })
  }

  private handlePurchaseEquipment(equipmentId: EquipmentId): void {
    if (!this.activeProfile) {
      return
    }
    if (!this.canPurchaseEquipment(equipmentId)) {
      this.lastCommandErrorReason = this.resolvePurchaseState(equipmentId).lockedReasonLabel
      return
    }
    const equipment = this.content.equipment[equipmentId]
    if (!equipment || equipment.unlockSource.kind !== "purchase") {
      return
    }
    this.activeProfile.profile.selfRepairPoints -= equipment.unlockSource.selfRepairPointCost
    this.grantEquipment([equipmentId])
  }

  private handleUpgradeEquipment(equipmentId: EquipmentId): void {
    if (!this.activeProfile) {
      return
    }
    if (!this.canUpgradeEquipment(equipmentId)) {
      this.lastCommandErrorReason = this.resolveUpgradeState(equipmentId).lockedReasonLabel
      return
    }
    const equipment = this.content.equipment[equipmentId]
    if (!equipment) {
      return
    }
    const currentLevel = this.activeProfile.profile.equipmentLevels[equipmentId] ?? 0
    const nextLevel = currentLevel + 1
    const params = equipment.levelParams.find((level) => level.level === nextLevel)
    if (!params) {
      return
    }
    if (this.activeProfile.profile.selfRepairPoints < params.selfRepairPointCost) {
      return
    }
    this.activeProfile.profile.selfRepairPoints -= params.selfRepairPointCost
    this.activeProfile.profile.equipmentLevels[equipmentId] = nextLevel
    if (params.transformEquipmentId) {
      this.applyEquipmentTransform(equipmentId, params.transformEquipmentId)
    }
  }

  private applyEquipmentTransform(
    sourceEquipmentId: EquipmentId,
    targetEquipmentId: EquipmentId,
  ): void {
    if (!this.activeProfile) {
      return
    }

    const sourceEquipment = this.content.equipment[sourceEquipmentId]
    const targetEquipment = this.content.equipment[targetEquipmentId]
    if (!sourceEquipment || !targetEquipment || sourceEquipment.slot !== targetEquipment.slot) {
      return
    }

    this.grantEquipment([targetEquipmentId])
    if (sourceEquipment.slot === "subsystem") {
      this.activeProfile.profile.equipped.subsystems =
        this.activeProfile.profile.equipped.subsystems.map((equipmentId) =>
          equipmentId === sourceEquipmentId ? targetEquipmentId : equipmentId,
        ) as ProfileRow["equipped"]["subsystems"]
      return
    }

    if (this.activeProfile.profile.equipped[sourceEquipment.slot] === sourceEquipmentId) {
      this.activeProfile.profile.equipped[sourceEquipment.slot] = targetEquipmentId
    }
  }

  private startMission(
    missionId: MissionId,
    transitionWorldPosition?: Vector2,
  ): void {
    if (!this.activeProfile) {
      return
    }
    if (!this.canStartMission(missionId)) {
      this.lastCommandErrorReason = "ミッション開始条件を満たしていません"
      return
    }
    const mission = this.content.missions[missionId]
    if (!mission) {
      return
    }
    const transmission = this.content.transmissions[mission.transmissionId]
    const transmissionProgress =
      this.activeProfile.transmissionProgress.find(
        (progress) => progress.transmissionId === transmission.transmissionId,
      ) ?? null
    const replaySeed = createMissionReplaySeed({ transmissionProgress })
    const loadout = this.resolveLoadout()
    const bindings = createEquipmentRuntimeBindings({
      loadout,
      registry: this.getRuntimeRegistry(),
    })
    const difficultyModifiers = this.resolveDifficultyModifiers()

    const initialMissionState = seedMissionStateWithReplayProgress({
      missionState: {
        missionId,
        phase: "intro",
        elapsedMs: 0,
        audioPlaybackMs: 0,
        noiseState: {
          noiseLevel: 0,
          decayRate: this.content.playerShipSpec.noiseDecayRate,
          hearingThreshold: clamp01(
            (mission.hearingThresholdOverride ?? this.content.playerShipSpec.hearingThreshold) +
              (difficultyModifiers.hearingThresholdOffset ?? 0),
          ),
          invincibleUntilMs: 0,
        },
        heardRanges: [],
        damageRanges: [],
        seededHeardRanges: [],
        hazards: [],
        destroyedAnalysisValue: 0,
        score: 0,
        selfRepairPointsEarned: 0,
        restorationRate: 0,
        cleared: false,
      },
      replaySeed,
    })

    const battleState: InternalBattleState = {
      mission,
      transmission,
      transcript: transmission.transcriptChunkIds
        .map((chunkId) => this.content.transcriptChunks[chunkId])
        .filter(Boolean)
        .sort((left, right) => left.startMs - right.startMs),
      loadout,
      bindings,
      noiseState: initialMissionState.noiseState,
      elapsedMs: 0,
      audioPlaybackMs: 0,
      phase: "intro",
      heardRanges: initialMissionState.heardRanges,
      damageRanges: [],
      seededHeardRanges: initialMissionState.seededHeardRanges,
      restorationRate: initialMissionState.restorationRate,
      destroyedAnalysisValue: 0,
      score: 0,
      selfRepairPointsEarned: 0,
      cleared: false,
      spawnedWaveIds: new Set<string>(),
      wavePerformance: {},
      firedBeatIds: new Set<string>(),
      playerPosition: resolveSpawnPoint(mission.playerSpawnId, this.content.battleSpawnPoints),
      mainCooldownMs: 0,
      mainMeleeCooldownMs: 0,
      subCooldownMs: 0,
      supportFields: [],
      pickups: [],
      fragments: [],
      enemies: [],
      projectiles: [],
      previousNoiseAudible: true,
      lastFragmentSpawnedAtMs: -Infinity,
      previousSubPressed: false,
      hazards: initialMissionState.hazards,
    }
    this.battleState = battleState
    const missionStartHookResult = runSubsystemHooks({
      bindings,
      context: {
        hook: "onMissionStart",
        missionId,
        resolvedLoadout: loadout,
      },
    })
    if (missionStartHookResult.effectRequests?.length) {
      this.applyEffectRequests(battleState, missionStartHookResult.effectRequests)
    }
    if (missionStartHookResult.analysisDelta) {
      battleState.destroyedAnalysisValue +=
        Math.max(0, missionStartHookResult.analysisDelta) * mission.analysisTotal
    }
    this.screen = "battle"
    this.presentationQueue.push(
      ...createTransmissionConnectPresentation({
        worldPosition: transitionWorldPosition ?? this.activeProfile.profile.playerPosition,
        areaId: transmission.areaId,
        transmissionId: transmission.transmissionId,
      }),
    )
  }

  private async handleReturnToExplore(): Promise<void> {
    this.battleState = null
    this.screen = "explore"
    await this.saveCurrentProfile()
  }

  private handleReturnToTitle(): void {
    // タイトルへ戻る時は、実行中 profile と一時状態も閉じて初期 title と同じ状態へ戻します。
    // save slot 一覧は saveSlots に残るため、continue 導線は維持されます。
    this.battleState = null
    this.activeProfile = null
    this.resetExploreSignalRuntime()
    this.archiveSelection = {}
    this.presentationQueue = []
    this.debugProfileActive = false
    this.screen = "title"
  }

  private async saveCurrentProfile(): Promise<void> {
    if (!this.activeProfile) {
      return
    }
    if (this.debugProfileActive) {
      // debug mode は既存 slot を上書きしない一時 profile として扱います。
      return
    }
    this.activeProfile.profile.updatedAt = new Date().toISOString()
    this.activeProfile.saveSlot.updatedAt = this.activeProfile.profile.updatedAt
    this.activeProfile.saveSlot.currentAreaId = this.activeProfile.profile.currentAreaId
    await this.repository.saveProfileToSlot(
      this.activeProfile.profile.slotId,
      this.activeProfile,
    )
    this.saveSlots = await this.repository.listSaveSlots()
  }

  private async saveProfileToSlot(slotId: SaveSlotId): Promise<void> {
    if (!this.activeProfile) {
      return
    }
    if (this.debugProfileActive) {
      // 自動保存や手動保存が debug profile を通常 slot へ混ぜないようにします。
      return
    }
    if (slotId === this.activeProfile.profile.slotId) {
      await this.saveCurrentProfile()
      return
    }
    await this.repository.saveProfileToSlot(slotId, this.activeProfile)
    this.saveSlots = await this.repository.listSaveSlots()
  }

  private handleSettingChange(path: SettingsPath, value: SettingsValue): void {
    this.settings = applySettingChange(this.settings, path, value)
    if (path === "difficulty" && this.activeProfile) {
      this.activeProfile.profile.difficulty = this.settings.difficulty
    }
  }

  private handleCollectItem(command: CollectItemCommand): void {
    if (!this.activeProfile) {
      return
    }
    const mapLogic = this.content.mapLogic[this.content.areas[this.activeProfile.profile.currentAreaId].mapId]
    const node = mapLogic.collectibleNodes.find((candidate) => candidate.nodeId === command.nodeId)
    if (!node) {
      this.lastCommandErrorReason = "収集ノードが見つかりません"
      return
    }
    const playerPosition = this.activeProfile.profile.playerPosition
    const mapState = this.buildCurrentWorldMapVisibilityState(mapLogic)
    if (!mapState.visibleCollectibleNodeIds.includes(node.nodeId)) {
      this.lastCommandErrorReason = "収集ノードが表示されていません"
      return
    }
    if (!isWithinRadius(playerPosition, { x: node.x, y: node.y }, resolveExploreNodeInteractionRadius(node))) {
      this.lastCommandErrorReason = "収集範囲外です"
      return
    }
    if (this.activeProfile.profile.collectedNodeIds.includes(node.nodeId)) {
      this.lastCommandErrorReason = "収集済みです"
      return
    }
    if (node.collectibleKind === "selfRepairPoints") {
      this.activeProfile.profile.selfRepairPoints += node.selfRepairPointAmount ?? 0
    }
    if (node.collectibleKind === "hiddenEquipment" && node.equipmentId) {
      this.grantEquipment([node.equipmentId])
    }
    this.activeProfile.profile.collectedNodeIds.push(node.nodeId)
  }

  private grantEquipment(equipmentIds: EquipmentId[]): void {
    if (!this.activeProfile) {
      return
    }

    for (const equipmentId of equipmentIds) {
      const equipment = this.content.equipment[equipmentId]
      if (!equipment) {
        continue
      }

      if (!this.activeProfile.profile.ownedEquipmentIds.includes(equipmentId)) {
        this.activeProfile.profile.ownedEquipmentIds.push(equipmentId)
      }

      // 入手した瞬間から基礎性能を使えるよう、未初期化の装備は level 1 を既定値にします。
      if ((this.activeProfile.profile.equipmentLevels[equipmentId] ?? 0) < 1) {
        this.activeProfile.profile.equipmentLevels[equipmentId] = 1
      }
    }
  }

  private canPurchaseEquipment(equipmentId: EquipmentId): boolean {
    return this.resolvePurchaseState(equipmentId).canPurchase
  }

  private canUpgradeEquipment(equipmentId: EquipmentId): boolean {
    return this.resolveUpgradeState(equipmentId).canUpgrade
  }

  private resolvePurchaseState(equipmentId: EquipmentId) {
    return resolveEquipmentPurchaseState({
      equipmentId,
      equipment: this.content.equipment[equipmentId],
      profile: this.activeProfile?.profile ?? null,
      featureAccess: this.buildFeatureAccess(),
    })
  }

  private resolveUpgradeState(equipmentId: EquipmentId) {
    return resolveEquipmentUpgradeState({
      equipmentId,
      equipment: this.content.equipment[equipmentId],
      profile: this.activeProfile?.profile ?? null,
      featureAccess: this.buildFeatureAccess(),
    })
  }

  private canStartMission(missionId: MissionId): boolean {
    if (!this.activeProfile) {
      return false
    }

    return this.buildFeatureAccess().startableMissionIds.includes(missionId)
  }

  private canSelectArchiveTransmission(
    areaId: AreaId,
    transmissionId: TransmissionId,
  ): boolean {
    if (!this.activeProfile) {
      return false
    }

    const transmission = this.content.transmissions[transmissionId]
    if (!transmission || transmission.areaId !== areaId) {
      return false
    }

    const progress = this.activeProfile.transmissionProgress.find(
      (entry) => entry.transmissionId === transmissionId,
    )

    return Boolean(progress && hasVisibleArchiveContent(progress))
  }

  private normalizeOwnedEquipmentLevels(profile: ProfileRow): void {
    for (const equipmentId of profile.ownedEquipmentIds) {
      // 旧 save では購入・報酬装備が level 0 のまま残ることがあるため、所持装備の基礎段階を補います。
      if ((profile.equipmentLevels[equipmentId] ?? 0) < 1) {
        profile.equipmentLevels[equipmentId] = 1
      }
    }
  }

  private normalizeInitialOs(profile: ProfileRow): void {
    const initialOsId = Object.values(this.content.equipment).find(
      (equipment) => equipment.slot === "os" && equipment.unlockSource.kind === "initial",
    )?.equipmentId

    if (!initialOsId) {
      return
    }

    // 旧 save でも OS スロットを空にしないため、初期OS「破損」を補います。
    if (!profile.ownedEquipmentIds.includes(initialOsId)) {
      profile.ownedEquipmentIds.push(initialOsId)
    }

    if (!profile.equipped.os) {
      profile.equipped.os = initialOsId
    }
  }

  private buildFeatureAccess() {
    if (!this.activeProfile) {
      return createEmptyFeatureAccessState()
    }
    return buildFeatureAccessState({
      profile: this.activeProfile.profile,
      loadout: this.resolveLoadout(),
      areas: this.content.areas,
      transmissions: this.content.transmissions,
      missions: this.content.missions,
      equipment: this.content.equipment,
      conditions: this.content.conditions,
      areaProgress: toRecord(this.activeProfile.areaProgress, "areaId"),
      transmissionProgress: toRecord(this.activeProfile.transmissionProgress, "transmissionId"),
    })
  }

  private createExploreSnapshot(): ExploreSnapshot {
    if (!this.activeProfile) {
      return createEmptyExploreSnapshot()
    }

    return createExploreSnapshotForProfile({
      content: this.content,
      profileAggregate: this.activeProfile,
      featureAccess: this.buildFeatureAccess(),
      loadout: this.resolveLoadout(),
    })
  }

  private createMapSnapshot() {
    return createMapSnapshotFromExplore(this.createExploreSnapshot())
  }

  private createMenuViewModel() {
    return buildMenuViewModel({
      profile: this.activeProfile?.profile ?? null,
      featureAccess: this.buildFeatureAccess(),
      unreadEquipmentCount: 0,
      unreadArchiveCount: 0,
    })
  }

  private createBattleSnapshot(): BattleSnapshot {
    return createBattleSnapshotFromState({
      battleState: this.battleState,
      activeProfile: this.activeProfile,
      fallbackMissionId: Object.keys(this.content.missions)[0] ?? "mission_missing",
    })
  }

  private createArchiveViewModel(selectedTransmissionId?: TransmissionId) {
    return buildArchiveViewModel({
      areas: this.content.areas,
      transmissions: this.content.transmissions,
      transmissionProgress: this.activeProfile
        ? toRecord(this.activeProfile.transmissionProgress, "transmissionId")
        : {},
      transcriptChunks: this.content.transcriptChunks,
      selectedTransmissionId,
    })
  }

  private createArchiveSnapshot() {
    if (!this.activeProfile) {
      return {
        screen: "archive" as const,
        selectedAreaId: undefined,
        selectedTransmissionId: undefined,
        access: createEmptyArchiveAccessState(),
        viewModel: this.createArchiveViewModel(),
      }
    }
    this.ensureArchiveSelection()
    const areaId = this.archiveSelection.areaId
    const transmissionId = this.archiveSelection.transmissionId
    if (!areaId || !transmissionId) {
      return {
        screen: "archive" as const,
        selectedAreaId: undefined,
        selectedTransmissionId: undefined,
        access: createEmptyArchiveAccessState(),
        viewModel: this.createArchiveViewModel(),
      }
    }
    if (!this.canSelectArchiveTransmission(areaId, transmissionId)) {
      this.archiveSelection = {}
      return {
        screen: "archive" as const,
        selectedAreaId: undefined,
        selectedTransmissionId: undefined,
        access: createEmptyArchiveAccessState(),
        viewModel: this.createArchiveViewModel(),
      }
    }
    const transmission = this.content.transmissions[transmissionId]
    const chunks = transmission.transcriptChunkIds
      .map((chunkId) => this.content.transcriptChunks[chunkId])
      .filter(Boolean)
    return {
      screen: "archive" as const,
      selectedAreaId: areaId,
      selectedTransmissionId: transmissionId,
      viewModel: this.createArchiveViewModel(transmissionId),
      access: buildArchiveAccessState({
        areaId,
        transmissionId,
        profile: this.activeProfile.profile,
        transmission,
        transmissionProgress:
          this.activeProfile.transmissionProgress.find(
            (progress) => progress.transmissionId === transmissionId,
          ) ?? null,
        chunks,
      }),
    }
  }

  private createEquipmentSnapshot() {
    return createEquipmentSnapshotForProfile(this.activeProfile, {
      content: this.content,
      featureAccess: this.buildFeatureAccess(),
    })
  }

  private handleExploreMenu(input: ExploreFrameInput): DomainEvent[] {
    if (!input.menuCommand) {
      return []
    }

    if (input.menuCommand === "openArchive" && this.buildFeatureAccess().canOpenArchive) {
      this.ensureArchiveSelection()
      this.screen = "archive"
    }
    if (input.menuCommand === "openMap" && this.buildFeatureAccess().canOpenMap) {
      this.screen = "map"
    }
    if (input.menuCommand === "openEquipment" && this.buildFeatureAccess().canOpenEquipment) {
      this.screen = "equipment"
    }
    if (input.menuCommand === "openSettings") {
      this.screen = "settings"
    }

    return []
  }

  private handleWarpToArea(areaId: AreaId): void {
    if (!this.activeProfile) {
      return
    }

    const featureAccess = this.buildFeatureAccess()
    if (!featureAccess.visibleAreaIds.includes(areaId)) {
      return
    }

    const targetArea = this.content.areas[areaId]
    if (!targetArea) {
      return
    }

    // 全体マップからの移動は、指定エリアの基準座標へ自機を移して探索へ戻します。
    // 1 枚の大きな map の中で現在地を切り替えるため、area 遷移ではなく座標移動として扱います。
    this.activeProfile.profile.currentAreaId = areaId
    this.activeProfile.profile.playerPosition = {
      ...targetArea.worldPosition,
    }
    this.screen = "explore"
  }

  private handleExploreInteraction(
    mapLogic: WorldMapLogic,
    playerPosition: Vector2,
    interactPressed: boolean,
  ): {
    events: DomainEvent[]
    presentationRequests: ReturnType<typeof flattenPresentationRequests>
  } {
    if (!this.activeProfile || !interactPressed) {
      return { events: [], presentationRequests: [] }
    }

    const mapState = this.buildCurrentWorldMapVisibilityState(mapLogic)
    const nearbyCollectible = findNearbyNode(
      mapLogic.collectibleNodes
        .filter((node) => mapState.visibleCollectibleNodeIds.includes(node.nodeId))
        .map((node) => ({ ...node, interactionRadius: resolveExploreNodeInteractionRadius(node) })),
      playerPosition,
    )
    if (nearbyCollectible && !this.activeProfile.profile.collectedNodeIds.includes(nearbyCollectible.nodeId)) {
      this.handleCollectItem({
        type: "collectItem",
        nodeId: nearbyCollectible.nodeId,
      })
      return {
        events: [
          {
            type: "collectibleCollected",
            nodeId: nearbyCollectible.nodeId,
            collectibleKind: nearbyCollectible.collectibleKind,
          },
        ],
        presentationRequests: [],
      }
    }

    const nearbyWarp = findNearbyNode(
      mapLogic.warpNodes
        .filter((node) => mapState.visibleWarpNodeIds.includes(node.nodeId))
        .map((node) => ({ ...node, interactionRadius: resolveExploreNodeInteractionRadius(node) })),
      playerPosition,
    )
    if (nearbyWarp) {
      this.activeProfile.profile.currentAreaId = nearbyWarp.warpTargetAreaId
      this.activeProfile.profile.playerPosition = {
        ...this.content.areas[nearbyWarp.warpTargetAreaId].worldPosition,
      }
      return {
        events: [],
        presentationRequests: createWarpTransitionPresentation({
          worldPosition: playerPosition,
          areaId: nearbyWarp.areaId,
          destination: "explore",
        }),
      }
    }

    const nearbyTransmission = findNearbyNode(
      mapLogic.transmissionNodes
        .filter((node) => mapState.visibleTransmissionNodeIds.includes(node.nodeId))
        .map((node) => ({ ...node, interactionRadius: resolveExploreNodeInteractionRadius(node) })),
      playerPosition,
    )
    if (nearbyTransmission) {
      this.startMission(
        this.content.transmissions[nearbyTransmission.transmissionId].missionId,
        { x: nearbyTransmission.x, y: nearbyTransmission.y },
      )
      return {
        events: [
          {
            type: "missionStarted",
            missionId: this.content.transmissions[nearbyTransmission.transmissionId].missionId,
          },
        ],
        presentationRequests: [],
      }
    }

    return { events: [], presentationRequests: [] }
  }

  private handleExploreNodeInteraction(nodeId: WorldMapNodeId): void {
    if (!this.activeProfile || this.screen !== "explore") {
      return
    }

    const mapLogic = this.content.mapLogic[this.content.areas[this.activeProfile.profile.currentAreaId].mapId]
    const playerPosition = this.activeProfile.profile.playerPosition
    const mapState = this.buildCurrentWorldMapVisibilityState(mapLogic)
    const collectible = mapLogic.collectibleNodes.find((node) => node.nodeId === nodeId)
    if (
      collectible &&
      mapState.visibleCollectibleNodeIds.includes(collectible.nodeId) &&
      !this.activeProfile.profile.collectedNodeIds.includes(collectible.nodeId) &&
      isWithinRadius(
        playerPosition,
        { x: collectible.x, y: collectible.y },
        resolveExploreNodeInteractionRadius(collectible),
      )
    ) {
      // command 経路でも session が DomainEvent の正本です。UI 側で取得成功を再判定しません。
      this.handleCollectItem({ type: "collectItem", nodeId: collectible.nodeId })
      this.domainEventQueue.push({
        type: "collectibleCollected",
        nodeId: collectible.nodeId,
        collectibleKind: collectible.collectibleKind,
      })
      return
    }

    const warp = mapLogic.warpNodes.find((node) => node.nodeId === nodeId)
    if (
      warp &&
      mapState.visibleWarpNodeIds.includes(warp.nodeId) &&
      isWithinRadius(playerPosition, { x: warp.x, y: warp.y }, resolveExploreNodeInteractionRadius(warp))
    ) {
      this.activeProfile.profile.currentAreaId = warp.warpTargetAreaId
      this.activeProfile.profile.playerPosition = {
        ...this.content.areas[warp.warpTargetAreaId].worldPosition,
      }
      this.presentationQueue.push(
        ...createWarpTransitionPresentation({
          worldPosition: playerPosition,
          areaId: warp.areaId,
          destination: "explore",
        }),
      )
      return
    }

    const transmission = mapLogic.transmissionNodes.find((node) => node.nodeId === nodeId)
    if (
      transmission &&
      mapState.visibleTransmissionNodeIds.includes(transmission.nodeId) &&
      isWithinRadius(
        playerPosition,
        { x: transmission.x, y: transmission.y },
        resolveExploreNodeInteractionRadius(transmission),
      )
    ) {
      this.startMission(
        this.content.transmissions[transmission.transmissionId].missionId,
        { x: transmission.x, y: transmission.y },
      )
    }
  }

  private buildCurrentWorldMapVisibilityState(mapLogic: WorldMapLogic): ReturnType<typeof buildWorldMapVisibilityState> {
    if (!this.activeProfile) {
      throw new Error("Cannot build world map visibility without an active profile.")
    }

    // command 経路でも selector と同じ可視 node set を使い、UI から渡された nodeId を信用しません。
    return buildWorldMapVisibilityState({
      revealBitmap: mergeRevealBitmaps(this.activeProfile.areaProgress),
      mapLogic,
      loadout: this.resolveLoadout(),
      featureAccess: this.buildFeatureAccess(),
      profile: this.activeProfile.profile,
      conditions: this.content.conditions,
      areaProgress: toRecord(this.activeProfile.areaProgress, "areaId"),
      transmissionProgress: toRecord(this.activeProfile.transmissionProgress, "transmissionId"),
    })
  }

  private revealCurrentArea(playerPosition: Vector2): {
    events: DomainEvent[]
    presentationRequests: ReturnType<typeof flattenPresentationRequests>
  } {
    if (!this.activeProfile) {
      return { events: [], presentationRequests: [] }
    }

    const areaId = this.activeProfile.profile.currentAreaId
    const row = this.activeProfile.areaProgress.find((progress) => progress.areaId === areaId)
    if (!row) {
      return { events: [], presentationRequests: [] }
    }
    const wasDiscovered = Boolean(row.discoveredAt)
    if (!row.discoveredAt) {
      row.discoveredAt = new Date().toISOString()
      row.nameRevealed = true
    }
    // 画面に映っていた範囲と minimap 記録の差を小さくするため、
    // 円形視界だけでなく camera viewport 相当の矩形も一緒に保存します。
    row.revealBitmap = revealViewportArea(
      row.revealBitmap,
      createExploreRevealViewport(playerPosition),
    )
    row.completionRateCache = computeRevealCompletionRate(row.revealBitmap)

    return {
      events: wasDiscovered
        ? []
        : [
            {
              type: "areaDiscovered",
              areaId,
            },
          ],
      presentationRequests: [],
    }
  }

  private applyEffectRequests(
    battle: InternalBattleState,
    effectRequests: RuntimeEffectRequest[],
    modifierPatch: RuntimeModifierPatch = {},
  ): {
    events: DomainEvent[]
    presentationRequests: ReturnType<typeof flattenPresentationRequests>
  } {
    return applyBattleEffectRequests({
      battle,
      effectRequests,
      modifierPatch,
      projectiles: this.content.projectiles,
      hitboxPresets: this.content.contentHitboxPresets,
      nextInstanceId: (prefix) => this.nextInstanceId(prefix),
      mainCadenceMultiplier: this.readMainCadenceMultiplier(battle),
    })
  }

  private updateSupportFields(battle: InternalBattleState, dtMs: number): void {
    const dtSeconds = dtMs / 1000
    for (const field of battle.supportFields) {
      field.remainingMs -= dtMs
      field.position.x += field.velocity.x * dtSeconds
      field.position.y += field.velocity.y * dtSeconds
    }
    battle.supportFields = battle.supportFields.filter((field) => field.remainingMs > 0)

    if (battle.barrier) {
      battle.barrier.remainingMs -= dtMs
      if (battle.barrier.remainingMs <= 0) {
        battle.barrier = undefined
      }
    }
  }

  private updatePickups(battle: InternalBattleState, dtMs: number): void {
    const dtSeconds = dtMs / 1000
    const remainingPickups: InternalPickupState[] = []

    for (const pickup of battle.pickups) {
      const toPlayer = {
        x: battle.playerPosition.x - pickup.position.x,
        y: battle.playerPosition.y - pickup.position.y,
      }
      const distanceToPlayerBeforeMove = Math.hypot(toPlayer.x, toPlayer.y)

      if (distanceToPlayerBeforeMove <= 96) {
        // 接近後は強めに吸い寄せ、回収待ちの煩わしさを減らします。
        const direction = normalizeVector(toPlayer)
        pickup.velocity.x = direction.x * 520
        pickup.velocity.y = direction.y * 520
      } else {
        pickup.velocity.y = Math.min(56, pickup.velocity.y + 18 * dtSeconds)
      }

      pickup.position.x += pickup.velocity.x * dtSeconds
      pickup.position.y += pickup.velocity.y * dtSeconds

      const distanceToPlayer = Math.hypot(
        battle.playerPosition.x - pickup.position.x,
        battle.playerPosition.y - pickup.position.y,
      )
      if (distanceToPlayer <= pickup.radius + 10) {
        battle.selfRepairPointsEarned += pickup.amount
        continue
      }

      if (pickup.position.y > BATTLE_HEIGHT + pickup.radius + 12) {
        continue
      }

      remainingPickups.push(pickup)
    }

    battle.pickups = remainingPickups
  }

  private spawnSelfRepairPickup(
    battle: InternalBattleState,
    position: Vector2,
    amount: number,
  ): void {
    battle.pickups.push({
      pickupInstanceId: this.nextInstanceId("pickup_self_repair"),
      kind: "selfRepairPoints",
      amount,
      position: { ...position },
      velocity: { x: 0, y: 18 },
      radius: 10,
      remainingMs: Number.POSITIVE_INFINITY,
    })
  }

  private updateEnemies(battle: InternalBattleState, dtMs: number): DomainEvent[] {
    const events: DomainEvent[] = []
    const dtSeconds = dtMs / 1000
    for (const enemy of battle.enemies) {
      const definition = this.content.enemies[enemy.enemyId]
      if (!definition) {
        continue
      }
      advanceEnemyMovement({
        enemy,
        enemyDefinition: definition,
        movementPatterns: this.content.movementPatterns,
        battleElapsedMs: battle.elapsedMs,
        dtMs,
      })

      if (enemy.burnUntilMs > battle.elapsedMs && enemy.burnDamagePerSec > 0) {
        enemy.hp -= enemy.burnDamagePerSec * dtSeconds
      }

      for (const field of battle.supportFields) {
        if (isCircleInsideCircle(enemy.position, enemy.radius, field.position, field.radius)) {
          enemy.hp -= field.dpsInField * dtSeconds
        }
      }

      if (enemy.hp <= 0) {
        continue
      }

      const projectileCountBefore = battle.projectiles.length
      this.fireEnemyPatterns(battle, enemy)
      const firstSpawnedEnemyProjectile = battle.projectiles
        .slice(projectileCountBefore)
        .find((projectile) => projectile.side === "enemy")
      if (firstSpawnedEnemyProjectile) {
        events.push({
          type: "enemyProjectileFired",
          projectileId: firstSpawnedEnemyProjectile.projectileId,
        })
      }
    }

    // hp <= 0 の敵は resolveBattleCollisions 側で撃破処理に集約するため、この段階では消さない。
    battle.enemies = battle.enemies.filter((enemy) => shouldKeepEnemyInBattle(enemy) || enemy.hp <= 0)
    return events
  }

  private updateProjectiles(
    battle: InternalBattleState,
    dtMs: number,
    statModifiers: Record<string, number> | undefined,
  ): void {
    updateBattleProjectiles({
      battle,
      dtMs,
      statModifiers,
      projectiles: this.content.projectiles,
      hitboxPresets: this.content.contentHitboxPresets,
      nextInstanceId: (prefix) => this.nextInstanceId(prefix),
    })
  }

  private buildMissionState() {
    if (!this.battleState) {
      return {
        missionId: "missing",
        phase: "intro" as const,
        elapsedMs: 0,
        audioPlaybackMs: 0,
        noiseState: {
          noiseLevel: 0,
          decayRate: 0.12,
          hearingThreshold: 0.7,
          invincibleUntilMs: 0,
        },
        heardRanges: [],
        damageRanges: [],
        seededHeardRanges: [],
        hazards: [],
        destroyedAnalysisValue: 0,
        score: 0,
        selfRepairPointsEarned: 0,
        restorationRate: 0,
        cleared: false,
      }
    }
    return {
      missionId: this.battleState.mission.missionId,
      phase: this.battleState.phase,
      elapsedMs: this.battleState.elapsedMs,
      audioPlaybackMs: this.battleState.audioPlaybackMs,
      noiseState: this.battleState.noiseState,
      heardRanges: this.battleState.heardRanges,
      damageRanges: this.battleState.damageRanges,
      seededHeardRanges: this.battleState.seededHeardRanges,
      hazards: this.battleState.hazards,
      destroyedAnalysisValue: this.battleState.destroyedAnalysisValue,
      score: this.battleState.score,
      selfRepairPointsEarned: this.battleState.selfRepairPointsEarned,
      restorationRate: this.battleState.restorationRate,
      cleared: this.battleState.cleared,
    }
  }

  private resolveLoadout() {
    return resolveLoadout({
      equipped: this.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
      equipmentLevels: this.activeProfile?.profile.equipmentLevels ?? {},
      equipment: this.content.equipment,
      effects: this.content.effects,
    })
  }

  private resolveExploreStatModifiers(): Record<string, number> | undefined {
    const loadout = this.resolveLoadout()
    const bindings = createEquipmentRuntimeBindings({
      loadout,
      registry: this.getRuntimeRegistry(),
    })
    return applyEquippedPassives({
      bindings,
      context: {
        phase: "explore",
        resolvedLoadout: loadout,
      },
    }).statModifiers
  }

  private resolveExploreVisionRadius(): number {
    const statModifiers = this.resolveExploreStatModifiers()
    return Math.max(
      1,
      DEFAULT_EXPLORE_VISION_RADIUS + (statModifiers?.exploreVisionBonus ?? 0),
    )
  }

  private resolveExploreScanRadius(): number {
    const statModifiers = this.resolveExploreStatModifiers()
    return Math.max(
      1,
      DEFAULT_EXPLORE_SCAN_RADIUS + (statModifiers?.exploreScanRadiusBonus ?? 0),
    )
  }

  private resolveExploreScanCooldownMs(): number {
    const statModifiers = this.resolveExploreStatModifiers()
    const multiplier = Math.max(
      0.25,
      1 + (statModifiers?.exploreScanCooldownMultiplier ?? 0),
    )
    return Math.max(1, EXPLORE_SCAN_COOLDOWN_MS * multiplier)
  }

  private resolveExploreMoveSpeedMultiplier(): number {
    const statModifiers = this.resolveExploreStatModifiers()
    return Math.max(0.25, 1 + (statModifiers?.exploreSpeedMultiplier ?? 0))
  }

  private getRuntimeRegistry() {
    return defaultEquipmentRuntimeRegistry
  }

  private resolveDifficultyModifiers() {
    return this.content.difficultyModifiers[
      this.settings.difficulty ?? this.activeProfile?.profile.difficulty ?? "calm"
    ]
  }

  private getTranscriptDurationMs(chunks: TranscriptChunk[]): number {
    return chunks[chunks.length - 1]?.endMs ?? 0
  }

  private resolveAudioWindow(
    battle: InternalBattleState,
    dtMs: number,
  ): TimeRange | null {
    if (battle.phase !== "playing") {
      return null
    }
    const transcriptDurationMs = this.getTranscriptDurationMs(battle.transcript)
    const previous = battle.audioPlaybackMs
    battle.audioPlaybackMs = Math.min(transcriptDurationMs, battle.audioPlaybackMs + dtMs)
    if (battle.audioPlaybackMs <= previous) {
      return null
    }
    return {
      startMs: previous,
      endMs: battle.audioPlaybackMs,
    }
  }

  private advanceMissionPhase(battle: InternalBattleState): void {
    const transcriptDurationMs = this.getTranscriptDurationMs(battle.transcript)
    if (battle.elapsedMs < battle.mission.audioStartDelayMs) {
      battle.phase = "intro"
      return
    }
    if (battle.audioPlaybackMs < transcriptDurationMs) {
      battle.phase = "playing"
      return
    }
    battle.phase = "outro"
  }

  private spawnMissionEnemies(battle: InternalBattleState, previousElapsedMs: number): void {
    spawnMissionEnemiesFromSystem({
      battle,
      previousElapsedMs,
      enemies: this.content.enemies,
      battleSpawnPoints: this.content.battleSpawnPoints,
      hitboxPresets: this.content.contentHitboxPresets,
      difficultyModifiers: this.resolveDifficultyModifiers(),
      nextInstanceId: (prefix) => this.nextInstanceId(prefix),
    })
  }

  private collectMissionBeatPresentationRequests(
    battle: InternalBattleState,
    previousElapsedMs: number,
  ): ReturnType<typeof flattenPresentationRequests> {
    const requests: ReturnType<typeof flattenPresentationRequests> = []
    for (const beat of battle.mission.beatEvents ?? []) {
      if (battle.firedBeatIds.has(beat.beatId)) {
        continue
      }
      if (beat.atMs < previousElapsedMs || beat.atMs > battle.elapsedMs) {
        continue
      }
      battle.firedBeatIds.add(beat.beatId)
      requests.push(
        ...createMissionBeatPresentation({
          missionId: battle.mission.missionId,
          beat,
        }),
      )
    }
    return requests
  }

  private fireEnemyPatterns(battle: InternalBattleState, enemy: InternalEnemyState): void {
    const enemyDefinition = this.content.enemies[enemy.enemyId]
    fireEnemyPatternsFromRegistry({
      battle,
      enemy,
      enemyDefinition,
      bulletPatterns: this.content.bulletPatterns,
      projectiles: this.content.projectiles,
      hitboxPresets: this.content.contentHitboxPresets,
      difficultyModifiers: this.resolveDifficultyModifiers(),
      nextInstanceId: (prefix) => this.nextInstanceId(prefix),
    })
  }

  private getOrCreateTransmissionProgress(
    transmissionId: TransmissionId,
    areaId: AreaId,
  ): TransmissionProgressRow {
    if (!this.activeProfile) {
      throw new Error("active profile is required")
    }
    const existing = this.activeProfile.transmissionProgress.find(
      (progress) => progress.transmissionId === transmissionId,
    )
    if (existing) {
      return existing
    }
    const created: TransmissionProgressRow = {
      profileId: this.activeProfile.profile.profileId,
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
    this.activeProfile.transmissionProgress.push(created)
    return created
  }

  private ensureArchiveSelection(): void {
    if (!this.activeProfile) {
      return
    }
    if (
      this.archiveSelection.areaId &&
      this.archiveSelection.transmissionId &&
      this.content.transmissions[this.archiveSelection.transmissionId]
    ) {
      return
    }
    // アーカイブを開いた時点で未開放通信の存在を推測できないよう、見えている通信だけを候補にします。
    const firstVisibleProgress = this.activeProfile.transmissionProgress.find((progress) =>
      hasVisibleArchiveContent(progress),
    )
    const firstVisibleTransmission = firstVisibleProgress
      ? this.content.transmissions[firstVisibleProgress.transmissionId]
      : undefined
    if (!firstVisibleTransmission) {
      this.archiveSelection = {}
      return
    }
    this.archiveSelection = {
      areaId: firstVisibleTransmission.areaId,
      transmissionId: firstVisibleTransmission.transmissionId,
    }
  }

  private readMainCadenceMultiplier(battle: InternalBattleState): number {
    const activeField = battle.supportFields.find((field) =>
      isCircleInsideCircle(battle.playerPosition, this.resolvePlayerHitRadius(), field.position, field.radius),
    )
    return activeField?.mainCadenceMultiplier ?? 1
  }

  private resolvePlayerHitRadius(): number {
    return resolveHitRadius(this.resolveHitboxPreset(this.content.playerShipSpec.hitboxPresetId))
  }

  private resolveHitboxPreset(hitboxPresetId: string): ContentHitboxPreset {
    const preset = this.content.contentHitboxPresets[hitboxPresetId]
    if (!preset) {
      throw new Error(`Missing hitbox preset ${hitboxPresetId}.`)
    }
    return preset
  }

  private nextInstanceId(prefix: string): string {
    this.instanceSerial += 1
    return `${prefix}:${this.instanceSerial}`
  }
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function computeMapAreaBounds(
  mapLogic: WorldMapLogic,
  bundle: ContentBundle,
  areaId: AreaId,
): Rect {
  const worldPosition = bundle.areas[areaId]?.worldPosition ?? { x: 0, y: 0 }
  const points = [
    worldPosition,
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    x: minX - 40,
    y: minY - 40,
    width: Math.max(160, maxX - minX + 80),
    height: Math.max(160, maxY - minY + 80),
  }
}

function uniqueIds<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function readMapCollectibleMarkerKind(
  node: CollectibleMapNode,
): WorldMapCollectibleViewModel["markerKind"] {
  return node.collectibleKind === "hiddenEquipment" ? "equipment" : "resource"
}

import {
  applySettingChange,
  createEmptyArchiveAccessState,
  createDefaultSaveSlots,
  createDefaultSettings,
  createEmptyEquipmentPanelViewModel,
  createEmptyEquippedItems,
  createEmptyFeatureAccessState,
  createEmptyMetadataUnlocked,
  DEFAULT_EXPLORE_REVEAL_ASPECT,
  DEFAULT_EXPLORE_VIEWPORT_HEIGHT,
  normalizeSettings,
} from "@magnolia/contracts"
import type {
  AreaId,
  AreaMaster,
  AreaProgressRow,
  BattleFrameInput,
  BattlefieldHazardState,
  BattleSnapshot,
  CollectItemCommand,
  CollectibleMapNode,
  ConditionId,
  ConditionSpec,
  ContentBundle,
  BulletPattern,
  Difficulty,
  DomainEvent,
  EquipmentId,
  EquipmentMaster,
  ExploreFrameInput,
  ExploreFrameResult,
  ExploreSnapshot,
  GameCommand,
  MetadataUnlocked,
  MissionId,
  MissionMaster,
  MissionResult,
  MissionRunRow,
  NoiseState,
  OpenArchiveCommand,
  OpenEquipmentCommand,
  OpenMapCommand,
  OpenSettingsCommand,
  ProfileAggregate,
  ProfileId,
  ProfileRow,
  ReturnToExploreCommand,
  RootSnapshot,
  RuntimeEffectRequest,
  SaveRepository,
  SaveSlotId,
  SaveSlotRow,
  SettingsPath,
  SettingsRow,
  SettingsValue,
  StartMissionCommand,
  StartNewGameAtSlotCommand,
  TimeRange,
  TranscriptChunk,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
  Vector2,
  WarpMapNode,
  WorldMapLogic,
} from "@magnolia/contracts"
import {
  applyEquippedPassives,
  createEquipmentRuntimeBindings,
  defaultEquipmentRuntimeRegistry,
  fireEquippedMainWeapon,
  resolveLoadout,
  runSubsystemHooks,
  useEquippedSubWeapon,
} from "./equipment-runtime"
import { buildBattleHazardViewModels, stepBattlefieldHazards } from "./hazards"
import {
  buildArchiveAccessState,
  buildFeatureAccessState,
  buildWorldMapVisibilityState,
  createMissionReplaySeed,
  seedMissionStateWithReplayProgress,
  selectVisibleWorldMapSnapshot,
} from "./selectors"
import {
  computeAreaCompletionRate,
  hasVisibleArchiveContent,
  isTransmissionIncomplete,
  readTransmissionCompletionState,
} from "./progression"
import {
  createBattleHitPresentation,
  createBattleInvincibleStartPresentation,
  createBattleNoiseClearPresentation,
  createBattleNoisePeakPresentation,
  createExploreTrailPresentation,
  createInitialSystemMessagePresentation,
  createRebootSequencePresentation,
  createTransmissionConnectPresentation,
  createTutorialReleasePresentation,
  createWarpTransitionPresentation,
  flattenPresentationRequests,
} from "./presentation"
import type {
  BattlePickupRenderState,
  BattleRenderState,
  EnemyRenderState,
  ExploreNodeRenderState,
  ExploreRenderState,
  HazardRenderState,
  ProjectileRenderState,
  Rect,
  SupportFieldRenderState,
  SubtitleRenderState,
} from "./runtime-types"

const WORLD_CELL_SIZE = 20
// world map の拡張後も探索履歴を保持できるよう、reveal bitmap の範囲を広げる。
// 旧サイズは area2 以降の座標を十分に覆っておらず、探索済みセルが保存されなかった。
const WORLD_BITMAP_WIDTH = 128
const WORLD_BITMAP_HEIGHT = 80
const WORLD_BITMAP_ORIGIN_X = -640
const WORLD_BITMAP_ORIGIN_Y = -520
const DEFAULT_EXPLORE_VISION_RADIUS = 150
const BATTLE_WIDTH = 480
const BATTLE_HEIGHT = 520
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
  "> bootstrap recovery routines",
  "",
  "memory integrity .......... 41% recovered",
  "neural lattice ............ partial (2/8 masked)",
  "archive bus ............... offline",
  "network uplink ............ no carrier",
  "self-repair module ........ cold",
  "",
  "> loading fallback profile ....... ok",
  "> applying minimal equipment (2/6)",
  "",
  "> signal acquired",
]

type SlotSelectMode = "new" | "continue"

type InternalEnemyState = {
  enemyInstanceId: string
  enemyId: string
  spawnPosition: Vector2
  position: Vector2
  hp: number
  maxHp: number
  enteredAtMs: number
  pauseStartedAtMs?: number
  patternLastFiredAtMs: Record<string, number>
  burnDamagePerSec: number
  burnUntilMs: number
  radius: number
  overrides?: Record<string, number | string | boolean>
}

type InternalProjectileState = {
  projectileInstanceId: string
  projectileId: string
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
  spawnDelayMs: number
  damage: number
  noiseDamage: number
  explosiveRadius?: number
  burnDamagePerSec?: number
  burnDurationMs?: number
  detonationDelayMs?: number
  explosionDamageMultiplier?: number
  explosionVisualProjectileId?: string
  nonColliding?: boolean
}

type InternalBarrierState = {
  barrierId: string
  radius: number
  remainingMs: number
  maxMs: number
  moveSpeedMultiplier: number
  allowAttackDuringUse: boolean
  blocksEnemyBullets: boolean
}

type InternalSupportFieldState = {
  fieldInstanceId: string
  fieldId: string
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
  dpsInField: number
  blocksEnemyBullets: boolean
  blocksMagneticDisaster: boolean
  mainCadenceMultiplier: number
}

type InternalPickupState = {
  pickupInstanceId: string
  kind: "selfRepairPoints"
  amount: number
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
}

type InternalBattleState = {
  mission: MissionMaster
  transmission: TransmissionMaster
  transcript: TranscriptChunk[]
  loadout: ReturnType<typeof resolveLoadout>
  bindings: ReturnType<typeof createEquipmentRuntimeBindings>
  noiseState: NoiseState
  elapsedMs: number
  audioPlaybackMs: number
  phase: "intro" | "playing" | "outro"
  heardRanges: TimeRange[]
  damageRanges: TimeRange[]
  seededHeardRanges: TimeRange[]
  restorationRate: number
  destroyedAnalysisValue: number
  score: number
  selfRepairPointsEarned: number
  cleared: boolean
  spawnedWaveIndexes: Set<number>
  playerPosition: Vector2
  mainCooldownMs: number
  subCooldownMs: number
  barrier?: InternalBarrierState
  supportFields: InternalSupportFieldState[]
  pickups: InternalPickupState[]
  enemies: InternalEnemyState[]
  projectiles: InternalProjectileState[]
  activeResult?: MissionResult
  previousNoiseAudible: boolean
  previousSubPressed: boolean
  hazards: BattlefieldHazardState[]
}

export class MagnoliaGameSession {
  private readonly content: ContentBundle
  private readonly repository: SaveRepository
  private saveSlots: SaveSlotRow[] = createDefaultSaveSlots()
  private settings: SettingsRow = createDefaultSettings()
  private screen: RootSnapshot["screen"] = "title"
  private slotSelectMode: SlotSelectMode = "new"
  private activeProfile: ProfileAggregate | null = null
  private battleState: InternalBattleState | null = null
  private lastExploreFacing: Vector2 = { x: 0, y: -1 }
  private exploreVisionRadius: number = DEFAULT_EXPLORE_VISION_RADIUS
  private presentationQueue = [] as ReturnType<typeof flattenPresentationRequests>
  private archiveSelection: { areaId?: AreaId; transmissionId?: TransmissionId } = {}
  private instanceSerial = 0

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
      equipment: this.screen === "equipment" ? this.createEquipmentSnapshot() : undefined,
    }
  }

  drainPresentationRequests() {
    const queue = [...this.presentationQueue]
    this.presentationQueue = []
    return queue
  }

  getExploreRenderState(): ExploreRenderState | null {
    if (!this.activeProfile) {
      return null
    }

    const featureAccess = this.buildFeatureAccess()
    // area は探索上のクラスター名であり、現行 demo では同じ 1 枚の world map を共有します。
    const mapLogic = this.content.mapLogic[this.activeProfile.profile.currentAreaId ? this.content.areas[this.activeProfile.profile.currentAreaId].mapId : Object.keys(this.content.mapLogic)[0]]
    const worldBounds = computeWorldBounds(mapLogic)
    const currentArea = this.content.areas[this.activeProfile.profile.currentAreaId]
    const displayArea = readDisplayArea({
      mapLogic,
      areas: this.content.areas,
      playerPosition: this.activeProfile.profile.playerPosition,
    })
    const currentAreaBounds = computeAreaBounds(mapLogic, currentArea.areaId, worldBounds)
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
      transmissionProgress: toRecord(this.activeProfile.transmissionProgress, "transmissionId"),
    })

    return {
      worldBounds,
      currentAreaId: displayArea?.areaId,
      currentAreaName: displayArea?.name ?? "—",
      currentThemeId: displayArea?.themeId,
      playerPosition: this.activeProfile.profile.playerPosition,
      playerFacing: this.lastExploreFacing ?? { x: 0, y: -1 },
      visionRadius: this.exploreVisionRadius,
      areaBounds: currentAreaBounds,
      visibleTransmissions: mapLogic.transmissionNodes
        .filter((node) => mapState.visibleTransmissionNodeIds.includes(node.nodeId))
        .map((node) => ({
          nodeId: node.nodeId,
          x: node.x,
          y: node.y,
          label: this.content.transmissions[node.transmissionId]?.title,
          state: readTransmissionCompletionState(
            this.activeProfile?.transmissionProgress.find(
              (progress) => progress.transmissionId === node.transmissionId,
            ),
          ),
        })),
      visibleWarps: mapLogic.warpNodes
        .filter((node) => mapState.visibleWarpNodeIds.includes(node.nodeId))
        .map((node) => ({
          nodeId: node.nodeId,
          x: node.x,
          y: node.y,
          label: this.content.areas[node.warpTargetAreaId]?.name,
        })),
      visibleCollectibles: mapLogic.collectibleNodes
        .filter((node) => mapState.visibleCollectibleNodeIds.includes(node.nodeId))
        .map((node) => ({
          nodeId: node.nodeId,
          x: node.x,
          y: node.y,
          markerKind:
            node.collectibleKind === "hiddenEquipment" ? "equipment" : "resource",
          label:
            node.collectibleKind === "hiddenEquipment"
              ? "???"
              : "自己修復ポイント",
        })),
      nearestTransmissionStrength,
      tutorialRestricted: !featureAccess.mapVisionUnlocked,
    }
  }

  getBattleRenderState(): BattleRenderState | null {
    if (!this.battleState) {
      return null
    }
    const battle = this.battleState

    return {
      missionId: battle.mission.missionId,
      missionDurationMs: battle.mission.durationMs,
      elapsedMs: battle.elapsedMs,
      player: {
        position: battle.playerPosition,
        radius: 8,
        invincible: battle.noiseState.invincibleUntilMs > battle.elapsedMs,
        noiseLevel: battle.noiseState.noiseLevel,
        barrierRadius: battle.barrier?.radius,
        barrierState: battle.barrier
          ? {
              remainingMs: battle.barrier.remainingMs,
              maxMs: battle.barrier.maxMs,
              active: true,
            }
          : undefined,
        subCooldownMs: battle.subCooldownMs,
        subMaxCooldownMs: battle.loadout.sub?.equipmentId
          ? (this.content.equipment[battle.loadout.sub.equipmentId]?.active?.cooldownMs ?? 0)
          : 0,
      },
      enemies: battle.enemies.map<EnemyRenderState>((enemy) => ({
        enemyInstanceId: enemy.enemyInstanceId,
        enemyId: enemy.enemyId,
        position: enemy.position,
        radius: enemy.radius,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        burning: enemy.burnUntilMs > battle.elapsedMs,
      })),
      projectiles: battle.projectiles
        .filter((projectile) => projectile.spawnDelayMs <= 0)
        .map<ProjectileRenderState>((projectile) => ({
          projectileInstanceId: projectile.projectileInstanceId,
          projectileId: projectile.projectileId,
          side: projectile.side,
          position: projectile.position,
          velocity: projectile.velocity,
          radius: projectile.radius,
        })),
      supportFields: battle.supportFields.map<SupportFieldRenderState>((field) => ({
        fieldInstanceId: field.fieldInstanceId,
        fieldId: field.fieldId,
        position: field.position,
        radius: field.radius,
        remainingMs: field.remainingMs,
        blocksEnemyBullets: field.blocksEnemyBullets,
        blocksMagneticDisaster: field.blocksMagneticDisaster,
      })),
      pickups: battle.pickups.map<BattlePickupRenderState>((pickup) => ({
        pickupInstanceId: pickup.pickupInstanceId,
        kind: pickup.kind,
        position: pickup.position,
        radius: pickup.radius,
        amount: pickup.amount,
      })),
      hazards: buildBattleHazardViewModels({
        hazards: battle.hazards,
      }).map<HazardRenderState>((hazard) => ({
        hazardId: hazard.hazardId,
        phase: hazard.phase,
        phaseProgress: hazard.phaseProgress,
        position: { x: hazard.area.x, y: hazard.area.y },
        size: { width: hazard.area.width, height: hazard.area.height },
      })),
      activeSubtitle: this.getActiveSubtitle(),
      pendingResult: battle.activeResult,
      equippedMainId: this.activeProfile?.profile.equipped.main,
      equippedSubId: this.activeProfile?.profile.equipped.sub,
    }
  }

  async dispatch(command: GameCommand): Promise<RootSnapshot> {
    switch (command.type) {
      case "startNewGameAtSlot":
        await this.handleStartNewGame(command)
        break
      case "resumeSaveSlot":
        await this.handleResumeSaveSlot(command.slotId)
        break
      case "openArchive":
        if (this.activeProfile && this.buildFeatureAccess().canOpenArchive) {
          this.ensureArchiveSelection()
          this.screen = "archive"
        }
        break
      case "openEquipment":
        if (this.activeProfile && this.buildFeatureAccess().canOpenEquipment) {
          this.screen = "equipment"
        }
        break
      case "openSettings":
        this.screen = "settings"
        break
      case "openMap":
        // 全体マップの解放条件は session を正本にします。
        // Web 側が押下を誤って通しても、MAGNOLIA 前に map が開かないようにします。
        if (this.activeProfile && this.buildFeatureAccess().canOpenMap) {
          this.screen = "map"
        }
        break
      case "closePanel":
        if (this.activeProfile) {
          // MAGNOLIA を装備した直後は、装備画面を閉じる瞬間に境界解除の演出と機能開放をまとめて発火します。
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
        } else {
          this.screen = "title"
        }
        break
      case "equipItem":
        this.handleEquipItem(command)
        break
      case "purchaseEquipment":
        this.handlePurchaseEquipment(command.equipmentId)
        break
      case "upgradeEquipment":
        this.handleUpgradeEquipment(command.equipmentId)
        break
      case "startMission":
        this.startMission(command.missionId)
        break
      case "returnToExplore":
        await this.handleReturnToExplore()
        break
      case "returnToTitle":
        this.handleReturnToTitle()
        break
      case "warpToArea":
        this.handleWarpToArea(command.areaId)
        break
      case "saveToCurrentSlot":
        await this.saveCurrentProfile()
        break
      case "saveToSlot":
        await this.saveProfileToSlot(command.slotId)
        break
      case "changeSetting":
        this.handleSettingChange(command.path, command.value)
        await this.repository.saveSettings(this.settings)
        break
      case "collectItem":
        this.handleCollectItem(command)
        break
    }

    return this.getSnapshot()
  }

  stepExplore(input: ExploreFrameInput): ExploreFrameResult {
    if (!this.activeProfile || this.screen !== "explore") {
      return {
        snapshot: this.createExploreSnapshot(),
        events: [],
        presentationRequests: [],
      }
    }

    const featureAccess = this.buildFeatureAccess()
    // currentAreaId は HUD 表示と進行判定のための区分で、移動先の map 自体は連続した 1 枚を使います。
    const mapLogic = this.content.mapLogic[this.content.areas[this.activeProfile.profile.currentAreaId].mapId]
    const worldBounds = computeWorldBounds(mapLogic)
    const currentAreaBounds = computeAreaBounds(
      mapLogic,
      this.activeProfile.profile.currentAreaId,
      worldBounds,
    )
    const moveSpeed = readExploreMoveSpeed(this.content, featureAccess, input.dashPressed)
    const velocity = normalizeVector(input.move)
    const movementBounds = featureAccess.mapVisionUnlocked ? worldBounds : currentAreaBounds
    const nextPosition = clampToRect(
      {
        x: this.activeProfile.profile.playerPosition.x + velocity.x * moveSpeed * (input.dtMs / 1000),
        y: this.activeProfile.profile.playerPosition.y + velocity.y * moveSpeed * (input.dtMs / 1000),
      },
      movementBounds,
    )

    this.activeProfile.profile.playerPosition = nextPosition
    if (velocity.x !== 0 || velocity.y !== 0) {
      this.lastExploreFacing = velocity
    }
    this.activeProfile.profile.currentAreaId = detectCurrentAreaId(
      mapLogic,
      this.content.areas,
      nextPosition,
      this.activeProfile.profile.currentAreaId,
    )
    const discoveredEvents = this.revealCurrentArea(nextPosition, mapLogic)
    const interactionEvents = this.handleExploreInteraction(mapLogic, nextPosition, input.interactPressed)
    const presentationRequests = flattenPresentationRequests([
      createExploreTrailPresentation({
        worldPosition: nextPosition,
        velocity,
        lifetimeMs: 280,
      }),
      discoveredEvents.presentationRequests,
      interactionEvents.presentationRequests,
    ])

    const menuEvents = this.handleExploreMenu(input)
    this.activeProfile.saveSlot.playTimeMs += input.dtMs

    return {
      snapshot: this.createExploreSnapshot(),
      events: [...discoveredEvents.events, ...interactionEvents.events, ...menuEvents],
      presentationRequests,
    }
  }

  stepBattle(input: BattleFrameInput) {
    if (!this.battleState || this.screen !== "battle") {
      return {
        snapshot: this.createBattleSnapshot(),
        events: [],
        effectRequests: [],
        presentationRequests: [],
      }
    }

    const battle = this.battleState
    const dtSeconds = input.dtMs / 1000
    const previousElapsedMs = battle.elapsedMs
    if (this.activeProfile) {
      this.activeProfile.saveSlot.playTimeMs += input.dtMs
    }
    battle.elapsedMs += input.dtMs
    battle.mainCooldownMs = Math.max(0, battle.mainCooldownMs - input.dtMs)
    battle.subCooldownMs = Math.max(0, battle.subCooldownMs - input.dtMs)

    const battlePassives = applyEquippedPassives({
      bindings: battle.bindings,
      context: {
        phase: "battle",
        resolvedLoadout: battle.loadout,
      },
    })
    const focusSpeedMultiplier =
      input.focus && battlePassives.visibilityModifiers?.focusMovementEnabled
        ? battlePassives.statModifiers?.focusSpeedMultiplier ?? 0.5
        : 1
    const baseMoveSpeed =
      input.focus && battlePassives.visibilityModifiers?.focusMovementEnabled
        ? this.content.playerShipSpec.focusMoveSpeed ?? 140
        : this.content.playerShipSpec.baseMoveSpeed ?? 240
    const playerSpeed =
      baseMoveSpeed * focusSpeedMultiplier * (battle.barrier?.moveSpeedMultiplier ?? 1)
    battle.playerPosition = clampToRect(
      {
        x: battle.playerPosition.x + normalizeVector(input.move).x * playerSpeed * dtSeconds,
        y: battle.playerPosition.y + normalizeVector(input.move).y * playerSpeed * dtSeconds,
      },
      { x: 8, y: 8, width: BATTLE_WIDTH - 16, height: BATTLE_HEIGHT - 16 },
    )

    this.advanceMissionPhase(battle)
    this.spawnMissionEnemies(battle, previousElapsedMs)

    const battleHookResult = runSubsystemHooks({
      bindings: battle.bindings,
      context: {
        hook: "onBattleStep",
        frameTimeMs: input.dtMs,
        resolvedLoadout: battle.loadout,
      },
    })
    battle.destroyedAnalysisValue += Math.max(0, battleHookResult.analysisDelta ?? 0) * battle.mission.analysisTotal

    const effectRequests: RuntimeEffectRequest[] = [...(battleHookResult.effectRequests ?? [])]
    const canFireMain = !battle.barrier || battle.barrier.allowAttackDuringUse
    if (input.fireMain && battle.mainCooldownMs <= 0 && canFireMain) {
      effectRequests.push(
        ...fireEquippedMainWeapon({
          bindings: battle.bindings,
          context: {
            playerPosition: battle.playerPosition,
            facing: { x: 0, y: -1 },
            frameTimeMs: input.dtMs,
            resolvedLoadout: battle.loadout,
          },
        }),
      )
    }

    const subJustPressed = input.fireSub && !battle.previousSubPressed
    const subHandlerId = battle.loadout.sub?.runtimeHandlerId
    if (
      input.fireSub &&
      battle.subCooldownMs <= 0 &&
      ((subHandlerId === "sub.barrier.noise_canceller" && !battle.barrier) ||
        (subHandlerId !== "sub.barrier.noise_canceller" && subJustPressed))
    ) {
      effectRequests.push(
        ...useEquippedSubWeapon({
          bindings: battle.bindings,
          context: {
            playerPosition: battle.playerPosition,
            facing: { x: 0, y: -1 },
            frameTimeMs: input.dtMs,
            resolvedLoadout: battle.loadout,
            stock: battle.loadout.sub?.level ?? 1,
          },
        }),
      )
    }
    battle.previousSubPressed = input.fireSub

    // 長押し型の barrier は、右クリックを離した時点で終了し残時間ぶんだけ cooldown を計算します。
    if (battle.barrier && !input.fireSub && battle.barrier.remainingMs > 0) {
      const consumed = battle.barrier.maxMs - battle.barrier.remainingMs
      const ratio = consumed / Math.max(1, battle.barrier.maxMs)
      const subEquipment = this.content.equipment[battle.loadout.sub?.equipmentId ?? ""]
      const baseCooldown = subEquipment?.active?.cooldownMs ?? 3000
      battle.subCooldownMs = Math.max(500, baseCooldown * ratio)
      battle.barrier = undefined
    }

    const spawnedEffects = this.applyEffectRequests(battle, effectRequests)
    this.updateSupportFields(battle, input.dtMs)
    this.updateEnemies(battle, input.dtMs)
    this.updateProjectiles(battle, input.dtMs, battlePassives.statModifiers)
    this.updatePickups(battle, input.dtMs)

    const hazardResult = stepBattlefieldHazards({
      mission: battle.mission,
      missionState: this.buildMissionState(),
      playerPosition: battle.playerPosition,
      dtMs: input.dtMs,
    })
    battle.hazards = hazardResult.missionState.hazards
    this.applyMagneticDisasterEffects(battle, input.dtMs)

    const collisionEvents = this.resolveBattleCollisions(battle)
    if (collisionEvents.effectRequests.length > 0) {
      effectRequests.push(...collisionEvents.effectRequests)
      this.applyEffectRequests(battle, collisionEvents.effectRequests)
    }

    const fieldProtectsFromMagneticDisaster = battle.supportFields.some(
      (field) =>
        field.blocksMagneticDisaster &&
        isCircleInsideCircle(battle.playerPosition, 8, field.position, field.radius),
    )

    battle.noiseState.noiseLevel = clamp01(
      battle.noiseState.noiseLevel -
        this.content.playerShipSpec.noiseDecayRate * dtSeconds * (this.resolveDifficultyModifiers().noiseDecayRateMultiplier ?? 1),
    )

    let inflictedNoise = collisionEvents.playerNoiseDamage
    if (!fieldProtectsFromMagneticDisaster) {
      inflictedNoise += hazardResult.playerNoiseDamage
    }
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
        battle.elapsedMs + this.content.playerShipSpec.invincibilityMs
    }

    const currentAudible = battle.noiseState.noiseLevel < battle.noiseState.hearingThreshold
    const audioWindow = this.resolveAudioWindow(battle, input.dtMs)
    if (audioWindow && battle.phase === "playing") {
      if (currentAudible) {
        battle.heardRanges = appendTimeRange(battle.heardRanges, audioWindow)
      } else {
        battle.damageRanges = appendTimeRange(battle.damageRanges, audioWindow)
      }
      battle.restorationRate = computeRestorationRate(battle, battle.transcript)
    }

    const presentationRequests = flattenPresentationRequests([
      collisionEvents.presentationRequests,
      currentAudible && !battle.previousNoiseAudible
        ? createBattleNoiseClearPresentation()
        : !currentAudible && battle.previousNoiseAudible
          ? createBattleNoisePeakPresentation()
          : [],
      battle.noiseState.invincibleUntilMs > battle.elapsedMs && inflictedNoise > 0
        ? createBattleInvincibleStartPresentation({
            durationMs: this.content.playerShipSpec.invincibilityMs,
          })
        : [],
      spawnedEffects.presentationRequests,
    ])
    battle.previousNoiseAudible = currentAudible

    battle.cleared = battle.phase === "outro" && battle.elapsedMs >= battle.mission.durationMs
    if (battle.cleared && !battle.activeResult) {
      battle.activeResult = this.finalizeMission(battle)
    }

    return {
      snapshot: this.createBattleSnapshot(),
      events: collisionEvents.events,
      effectRequests,
      presentationRequests,
    }
  }

  private applyMagneticDisasterEffects(
    battle: InternalBattleState,
    dtMs: number,
  ): void {
    const activeHazards = battle.hazards.filter(
      (hazard) => hazard.phase === "active",
    )
    if (activeHazards.length === 0) {
      return
    }

    // 磁気災害は局所的な環境ノイズではなく、空間全体を乱す場として扱います。
    // そのため、内部に入った敵弾は消え、敵機も継続的に損耗します。
    battle.projectiles = battle.projectiles.filter((projectile) => {
      if (projectile.side !== "enemy") {
        return true
      }

      return !activeHazards.some((hazard) =>
        doesCircleIntersectHazardArea(projectile.position, projectile.radius, hazard.area),
      )
    })

    const dtSeconds = dtMs / 1000
    for (const enemy of battle.enemies) {
      const totalHazardDps = activeHazards.reduce((sum, hazard) => {
        if (!doesCircleIntersectHazardArea(enemy.position, enemy.radius, hazard.area)) {
          return sum
        }
        return sum + hazard.enemyDamagePerSecond
      }, 0)

      if (totalHazardDps <= 0) {
        continue
      }

      enemy.hp -= totalHazardDps * dtSeconds
      enemy.burnUntilMs = Math.max(enemy.burnUntilMs, battle.elapsedMs + 180)
      enemy.burnDamagePerSec = Math.max(enemy.burnDamagePerSec, totalHazardDps * 0.1)
    }
  }

  selectArchive(areaId: AreaId, transmissionId: TransmissionId): void {
    if (!this.canSelectArchiveTransmission(areaId, transmissionId)) {
      return
    }
    this.archiveSelection = { areaId, transmissionId }
  }

  private async handleStartNewGame(command: StartNewGameAtSlotCommand): Promise<void> {
    this.slotSelectMode = "new"
    const aggregate = createInitialProfileAggregate({
      slotId: command.slotId,
      difficulty: command.difficulty,
      content: this.content,
    })
    this.normalizeInitialOs(aggregate.profile)
    this.normalizeOwnedEquipmentLevels(aggregate.profile)
    this.activeProfile = aggregate
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
    this.screen = "explore"
    this.ensureArchiveSelection()
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
    if (!equipment) {
      return
    }
    if (!this.activeProfile.profile.ownedEquipmentIds.includes(command.equipmentId)) {
      return
    }
    if (equipment.slot !== command.slot) {
      return
    }

    if (command.slot === "subsystem") {
      this.activeProfile.profile.equipped.subsystems[command.subsystemIndex] = command.equipmentId
    } else {
      this.activeProfile.profile.equipped[command.slot] = command.equipmentId
    }

    // MAGNOLIA 装備後の制限解除は、装備画面を閉じた瞬間に演出付きで行います。
  }

  private handlePurchaseEquipment(equipmentId: EquipmentId): void {
    if (!this.activeProfile) {
      return
    }
    if (!this.canPurchaseEquipment(equipmentId)) {
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
  }

  private startMission(missionId: MissionId): void {
    if (!this.activeProfile) {
      return
    }
    if (!this.canStartMission(missionId)) {
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
              (this.resolveDifficultyModifiers().hearingThresholdOffset ?? 0),
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

    this.battleState = {
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
      spawnedWaveIndexes: new Set<number>(),
      playerPosition: { x: BATTLE_WIDTH / 2, y: BATTLE_HEIGHT - 64 },
      mainCooldownMs: 0,
      subCooldownMs: 0,
      supportFields: [],
      pickups: [],
      enemies: [],
      projectiles: [],
      previousNoiseAudible: true,
      previousSubPressed: false,
      hazards: initialMissionState.hazards,
    }
    const missionStartHookResult = runSubsystemHooks({
      bindings,
      context: {
        hook: "onMissionStart",
        missionId,
        resolvedLoadout: loadout,
      },
    })
    if (missionStartHookResult.effectRequests?.length) {
      this.applyEffectRequests(this.battleState, missionStartHookResult.effectRequests)
    }
    if (missionStartHookResult.analysisDelta) {
      this.battleState.destroyedAnalysisValue +=
        Math.max(0, missionStartHookResult.analysisDelta) * mission.analysisTotal
    }
    this.screen = "battle"
    this.presentationQueue.push(
      ...createTransmissionConnectPresentation({
        worldPosition: this.activeProfile.profile.playerPosition,
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
    this.archiveSelection = {}
    this.presentationQueue = []
    this.screen = "title"
  }

  private async saveCurrentProfile(): Promise<void> {
    if (!this.activeProfile) {
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
    if (!node || this.activeProfile.profile.collectedNodeIds.includes(node.nodeId)) {
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
    if (!this.activeProfile) {
      return false
    }

    const equipment = this.content.equipment[equipmentId]
    if (!equipment || equipment.unlockSource.kind !== "purchase") {
      return false
    }

    const featureAccess = this.buildFeatureAccess()
    if (!featureAccess.visibleEquipmentIds.includes(equipmentId)) {
      return false
    }

    if (this.activeProfile.profile.ownedEquipmentIds.includes(equipmentId)) {
      return false
    }

    return (
      this.activeProfile.profile.selfRepairPoints >= equipment.unlockSource.selfRepairPointCost
    )
  }

  private canUpgradeEquipment(equipmentId: EquipmentId): boolean {
    if (!this.activeProfile) {
      return false
    }

    const equipment = this.content.equipment[equipmentId]
    if (!equipment) {
      return false
    }

    if (!this.activeProfile.profile.ownedEquipmentIds.includes(equipmentId)) {
      return false
    }

    const currentLevel = this.activeProfile.profile.equipmentLevels[equipmentId] ?? 0
    if (currentLevel < 1 || currentLevel >= equipment.maxLevel) {
      return false
    }

    const nextParams = equipment.levelParams.find((level) => level.level === currentLevel + 1)
    if (!nextParams) {
      return false
    }

    return this.activeProfile.profile.selfRepairPoints >= nextParams.selfRepairPointCost
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
    const fallbackProfile = this.activeProfile ?? createInitialProfileAggregate({
      slotId: 1,
      difficulty: this.settings.difficulty,
      content: this.content,
    })
    const mapLogic =
      this.content.mapLogic[this.content.areas[fallbackProfile.profile.currentAreaId].mapId]
    const displayArea = readDisplayArea({
      mapLogic,
      areas: this.content.areas,
      playerPosition: fallbackProfile.profile.playerPosition,
    })
    const featureAccess = this.activeProfile
      ? this.buildFeatureAccess()
      : createEmptyFeatureAccessState()
    const mapState = buildWorldMapVisibilityState({
      revealBitmap: mergeRevealBitmaps(fallbackProfile.areaProgress),
      mapLogic,
      loadout: this.resolveLoadout(),
      featureAccess,
      profile: fallbackProfile.profile,
      conditions: this.content.conditions,
      areaProgress: toRecord(fallbackProfile.areaProgress, "areaId"),
      transmissionProgress: toRecord(fallbackProfile.transmissionProgress, "transmissionId"),
    })
    const mapSnapshot = selectVisibleWorldMapSnapshot({
      mapState,
      playerPosition: fallbackProfile.profile.playerPosition,
      mapLogic,
    })
    const transmissionProgressById = toRecord(
      fallbackProfile.transmissionProgress,
      "transmissionId",
    )

    return {
      screen: "explore",
      playerPosition: fallbackProfile.profile.playerPosition,
      map: mapSnapshot,
      hud: {
        currentAreaId: displayArea?.areaId,
        equipped: fallbackProfile.profile.equipped,
        communicationStrength: computeNearestTransmissionStrength({
          playerPosition: fallbackProfile.profile.playerPosition,
          mapLogic,
          featureAccess,
          transmissionProgress: transmissionProgressById,
        }),
        compassTargetAreaId: featureAccess.compassEnabled
          ? computeCompassTargetAreaId({
              profile: fallbackProfile.profile,
              areas: this.content.areas,
              transmissions: this.content.transmissions,
              transmissionProgress: transmissionProgressById,
            })
          : undefined,
        currentAreaCompletionRate: computeAreaCompletionRate({
          area: displayArea,
          transmissionProgress: transmissionProgressById,
        }),
        selfRepairPoints: fallbackProfile.profile.selfRepairPoints,
      },
      featureAccess,
    }
  }

  private createMapSnapshot() {
    const exploreSnapshot = this.createExploreSnapshot()
    return {
      ...exploreSnapshot,
      screen: "map" as const,
    }
  }

  private createBattleSnapshot(): BattleSnapshot {
    if (!this.battleState) {
      return {
        screen: "battle",
        missionId: Object.keys(this.content.missions)[0] ?? "mission_missing",
        phase: "intro",
        playerPosition: { x: BATTLE_WIDTH / 2, y: BATTLE_HEIGHT - 64 },
        hud: {
          missionId: Object.keys(this.content.missions)[0] ?? "mission_missing",
          phase: "intro",
          analysisRate: 0,
          restorationRate: 0,
          noiseLevel: 0,
          equipped: this.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
          dangerLevel: 1,
          selfRepairPointsEarned: 0,
        },
        hazards: [],
      }
    }
    const transcriptDurationMs = this.getTranscriptDurationMs(this.battleState.transcript)
    return {
      screen: "battle",
      missionId: this.battleState.mission.missionId,
      phase: this.battleState.phase,
      playerPosition: this.battleState.playerPosition,
      hud: {
        missionId: this.battleState.mission.missionId,
        phase: this.battleState.phase,
        analysisRate: Math.min(
          1,
          this.battleState.destroyedAnalysisValue / this.battleState.mission.analysisTotal,
        ),
        restorationRate:
          transcriptDurationMs > 0
            ? computeRangesDuration(this.battleState.heardRanges) / transcriptDurationMs
            : 0,
        noiseLevel: this.battleState.noiseState.noiseLevel,
        equipped: this.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
        dangerLevel: this.battleState.mission.dangerLevel,
        selfRepairPointsEarned: this.battleState.selfRepairPointsEarned,
      },
      hazards: buildBattleHazardViewModels({
        hazards: this.buildMissionState().hazards,
      }),
    }
  }

  private createArchiveSnapshot() {
    if (!this.activeProfile) {
      return {
        screen: "archive" as const,
        selectedAreaId: undefined,
        selectedTransmissionId: undefined,
        access: createEmptyArchiveAccessState(),
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
      }
    }
    if (!this.canSelectArchiveTransmission(areaId, transmissionId)) {
      this.archiveSelection = {}
      return {
        screen: "archive" as const,
        selectedAreaId: undefined,
        selectedTransmissionId: undefined,
        access: createEmptyArchiveAccessState(),
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
    if (!this.activeProfile) {
      return createEmptyEquipmentPanelViewModel()
    }
    return {
      screen: "equipment" as const,
      ownedEquipmentIds: this.activeProfile.profile.ownedEquipmentIds,
      equipped: this.activeProfile.profile.equipped,
      equipmentLevels: this.activeProfile.profile.equipmentLevels,
      selfRepairPoints: this.activeProfile.profile.selfRepairPoints,
    }
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

    const nearbyCollectible = findNearbyNode(mapLogic.collectibleNodes, playerPosition)
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

    const nearbyWarp = findNearbyNode(mapLogic.warpNodes, playerPosition)
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

    const nearbyTransmission = findNearbyNode(mapLogic.transmissionNodes, playerPosition)
    if (nearbyTransmission) {
      this.startMission(this.content.transmissions[nearbyTransmission.transmissionId].missionId)
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

  private revealCurrentArea(playerPosition: Vector2, mapLogic: WorldMapLogic): {
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
  ): {
    presentationRequests: ReturnType<typeof flattenPresentationRequests>
  } {
    const presentationRequests = [] as ReturnType<typeof flattenPresentationRequests>

    for (const request of effectRequests) {
      switch (request.kind) {
        case "spawnProjectile":
          this.spawnProjectilesFromRequest(battle, request)
          break
        case "spawnBarrier":
          battle.barrier = {
            barrierId: request.barrierId,
            radius: request.radius,
            remainingMs: request.durationMs,
            maxMs: request.durationMs,
            moveSpeedMultiplier: request.moveSpeedMultiplier ?? 1,
            allowAttackDuringUse: request.allowAttackDuringUse,
            blocksEnemyBullets: request.blocksEnemyBullets,
          }
          break
        case "spawnSupportField":
          battle.supportFields.push({
            fieldInstanceId: this.nextInstanceId(request.fieldId),
            fieldId: request.fieldId,
            position: { ...request.position },
            velocity: { x: 0, y: -request.launchSpeed },
            radius: request.radius,
            remainingMs: request.durationMs,
            dpsInField: request.dpsInField ?? 0,
            blocksEnemyBullets: request.blocksEnemyBullets ?? false,
            blocksMagneticDisaster: request.blocksMagneticDisaster ?? false,
            mainCadenceMultiplier: request.mainCadenceMultiplier ?? 1,
          })
          break
        case "applyCooldown":
          if (request.slot === "main") {
            battle.mainCooldownMs = request.durationMs * this.readMainCadenceMultiplier(battle)
          }
          if (request.slot === "sub") {
            battle.subCooldownMs = request.durationMs
          }
          break
        case "playEffect":
          // 見た目の詳細は presentation 側へ寄せる前提のため、ここでは queue を増やしません。
          break
        case "clearEnemyProjectiles":
          battle.projectiles = battle.projectiles.filter(
            (projectile) =>
              projectile.side !== "enemy" ||
              !isWithinRadius(
                projectile.position,
                request.position ?? battle.playerPosition,
                request.radius ?? 9999,
              ),
          )
          break
      }
    }

    return {
      presentationRequests,
    }
  }

  private spawnProjectilesFromRequest(
    battle: InternalBattleState,
    request: Extract<RuntimeEffectRequest, { kind: "spawnProjectile" }>,
  ): void {
    const projectileSpec = this.content.projectiles[request.projectileId]
    const burnEffect = battle.loadout.subsystems
      .flatMap((binding) => binding?.passiveEffects ?? [])
      .find((effect) => effect.runtimeHandlerId === "subsystem.shot.modifier.burn")
    const spreadDeg = request.spreadDeg ?? 0
    const count = Math.max(1, request.count)
    for (let index = 0; index < count; index += 1) {
      const spreadOffset =
        count === 1 ? 0 : ((index / (count - 1)) * spreadDeg - spreadDeg / 2) * (Math.PI / 180)
      const direction = rotateVector(normalizeVector(request.direction), spreadOffset)
      battle.projectiles.push({
        projectileInstanceId: this.nextInstanceId(request.projectileId),
        projectileId: request.projectileId,
        side: projectileSpec?.side ?? "player",
        position: { ...request.position },
        velocity: {
          x: direction.x * request.speed,
          y: direction.y * request.speed,
        },
        radius: resolveHitRadius(projectileSpec?.hitboxPresetId),
        remainingMs: request.lifetimeMs ?? projectileSpec?.lifetimeMs ?? 2000,
        damage: request.damage ?? projectileSpec?.damage ?? 0,
        noiseDamage: request.noiseDamage ?? projectileSpec?.noiseDamage ?? 0,
        explosiveRadius:
          request.params && typeof request.params.explosionRadius === "number"
            ? request.params.explosionRadius
            : undefined,
        burnDamagePerSec: burnEffect
          ? Number(burnEffect.params?.burnDamagePerSec ?? 0)
          : undefined,
        burnDurationMs: burnEffect
          ? Number(burnEffect.params?.burnDurationMs ?? 0)
          : undefined,
        spawnDelayMs: request.delayMs ?? 0,
        detonationDelayMs:
          request.params && typeof request.params.explosionDelayMs === "number"
            ? request.params.explosionDelayMs
            : undefined,
        explosionDamageMultiplier:
          request.params && typeof request.params.explosionDamageMultiplier === "number"
            ? request.params.explosionDamageMultiplier
            : undefined,
        explosionVisualProjectileId:
          request.params && typeof request.params.explosionVisualProjectileId === "string"
            ? request.params.explosionVisualProjectileId
            : undefined,
        nonColliding:
          request.params && typeof request.params.visualOnly === "boolean"
            ? request.params.visualOnly
            : false,
      })
    }

    if (
      request.params?.meleeEnabled &&
      typeof request.params.meleeProjectileId === "string" &&
      hasEnemyWithinRange(
        battle.enemies,
        request.position,
        typeof request.params.meleeRange === "number" ? request.params.meleeRange : 80,
      )
    ) {
      const meleeProjectileId = request.params.meleeProjectileId
      const meleeProjectileSpec = this.content.projectiles[meleeProjectileId]
      const meleeCount =
        typeof request.params.meleeShotCount === "number" ? request.params.meleeShotCount : 3
      const meleeSpreadDeg =
        typeof request.params.meleeSpreadDeg === "number" ? request.params.meleeSpreadDeg : 120

      for (let index = 0; index < meleeCount; index += 1) {
        const spreadOffset =
          meleeCount === 1
            ? 0
            : ((index / (meleeCount - 1)) * meleeSpreadDeg - meleeSpreadDeg / 2) *
              (Math.PI / 180)
        const direction = rotateVector(normalizeVector(request.direction), spreadOffset)
        battle.projectiles.push({
          projectileInstanceId: this.nextInstanceId(meleeProjectileId),
          projectileId: meleeProjectileId,
          side: meleeProjectileSpec?.side ?? "player",
          position: { ...request.position },
          velocity: {
            x: direction.x * 320,
            y: direction.y * 320,
          },
          radius: resolveHitRadius(meleeProjectileSpec?.hitboxPresetId),
          remainingMs: 150,
          spawnDelayMs: (request.delayMs ?? 0) + index * (typeof request.params.meleeSequentialDelayMs === "number" ? request.params.meleeSequentialDelayMs : 0),
          damage:
            typeof request.params.meleeDamage === "number" ? request.params.meleeDamage : 8,
          noiseDamage: meleeProjectileSpec?.noiseDamage ?? 0,
          burnDamagePerSec: burnEffect
            ? Number(burnEffect.params?.burnDamagePerSec ?? 0)
            : undefined,
          burnDurationMs: burnEffect
            ? Number(burnEffect.params?.burnDurationMs ?? 0)
            : undefined,
          nonColliding: false,
        })
      }
    }
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
      pickup.remainingMs -= dtMs
      if (pickup.remainingMs <= 0) {
        continue
      }

      const toPlayer = {
        x: battle.playerPosition.x - pickup.position.x,
        y: battle.playerPosition.y - pickup.position.y,
      }
      const distanceToPlayer = Math.hypot(toPlayer.x, toPlayer.y)

      if (distanceToPlayer <= 96) {
        // 接近後は強めに吸い寄せ、回収待ちの煩わしさを減らします。
        const direction = normalizeVector(toPlayer)
        pickup.velocity.x = direction.x * 520
        pickup.velocity.y = direction.y * 520
      } else {
        pickup.velocity.y = Math.min(56, pickup.velocity.y + 18 * dtSeconds)
      }

      pickup.position.x += pickup.velocity.x * dtSeconds
      pickup.position.y += pickup.velocity.y * dtSeconds

      if (distanceToPlayer <= pickup.radius + 10) {
        battle.selfRepairPointsEarned += pickup.amount
        continue
      }

      if (
        pickup.position.x < -48 ||
        pickup.position.x > BATTLE_WIDTH + 48 ||
        pickup.position.y < -48 ||
        pickup.position.y > BATTLE_HEIGHT + 48
      ) {
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
      remainingMs: 5000,
    })
  }

  private updateEnemies(battle: InternalBattleState, dtMs: number): void {
    const dtSeconds = dtMs / 1000
    for (const enemy of battle.enemies) {
      const definition = this.content.enemies[enemy.enemyId]
      if (!definition) {
        continue
      }
      const elapsed = battle.elapsedMs - enemy.enteredAtMs
      const behaviorParams = {
        ...definition.behaviorParams,
        ...(enemy.overrides ?? {}),
      }
      const speed = Number(behaviorParams.speed ?? 40)
      switch (definition.behaviorKind) {
        case "straightDown": {
          enemy.position.y += speed * dtSeconds
          // driftX: 横方向への一定速ドリフト (画面横切り演出用)
          const driftX = Number(behaviorParams.driftX ?? 0)
          if (driftX !== 0) {
            enemy.position.x += driftX * dtSeconds
          }
          // wobble: ゆったりした正弦波の横揺れ (漂流感の演出)
          const wobbleAmp = Number(behaviorParams.wobbleAmplitude ?? 0)
          const wobblePeriod = Number(behaviorParams.wobblePeriodMs ?? 3000)
          if (wobbleAmp > 0) {
            enemy.position.x =
              enemy.spawnPosition.x +
              Math.sin((elapsed / wobblePeriod) * Math.PI * 2) * wobbleAmp
          }
          break
        }
        case "zigzag": {
          const amplitude = Number(behaviorParams.wobbleAmplitude ?? 40)
          const periodMs = Number(behaviorParams.wobblePeriodMs ?? 2000)
          enemy.position.y += speed * dtSeconds
          enemy.position.x =
            enemy.spawnPosition.x + Math.sin((elapsed / periodMs) * Math.PI * 2) * amplitude
          break
        }
        case "slowDescent": {
          const pauseAtY = Number(behaviorParams.pauseAtY ?? 100)
          const pauseMs = Number(behaviorParams.pauseMs ?? 1000)
          if (enemy.position.y < pauseAtY) {
            enemy.position.y += speed * dtSeconds
          } else if (!enemy.pauseStartedAtMs) {
            enemy.pauseStartedAtMs = battle.elapsedMs
          } else if (battle.elapsedMs - enemy.pauseStartedAtMs > pauseMs) {
            enemy.position.y += speed * dtSeconds
          }
          break
        }
      }

      if (enemy.burnUntilMs > battle.elapsedMs && enemy.burnDamagePerSec > 0) {
        enemy.hp -= enemy.burnDamagePerSec * dtSeconds
      }

      for (const field of battle.supportFields) {
        if (isCircleInsideCircle(enemy.position, enemy.radius, field.position, field.radius)) {
          enemy.hp -= field.dpsInField * dtSeconds
        }
      }

      this.fireEnemyPatterns(battle, enemy)
    }

    battle.enemies = battle.enemies.filter((enemy) => enemy.position.y < BATTLE_HEIGHT + 60 && enemy.hp > 0)
  }

  private updateProjectiles(
    battle: InternalBattleState,
    dtMs: number,
    statModifiers: Record<string, number> | undefined,
  ): void {
    const dtSeconds = dtMs / 1000
    const remainingProjectiles: InternalProjectileState[] = []
    const spawnedVisualProjectiles: InternalProjectileState[] = []

    for (const projectile of battle.projectiles) {
      if (projectile.spawnDelayMs > 0) {
        projectile.spawnDelayMs -= dtMs
        remainingProjectiles.push(projectile)
        continue
      }

      if (projectile.side === "player" && statModifiers?.homingStrength && statModifiers.homingRange) {
        const nearestEnemy = findNearestEnemyInRange(
          battle.enemies,
          projectile.position,
          statModifiers.homingRange,
        )
        if (nearestEnemy) {
          const targetDirection = normalizeVector({
            x: nearestEnemy.position.x - projectile.position.x,
            y: nearestEnemy.position.y - projectile.position.y,
          })
          const currentDirection = normalizeVector(projectile.velocity)
          const homingStrength = Math.min(1, statModifiers.homingStrength * dtSeconds)
          const mixedDirection = normalizeVector({
            x: currentDirection.x * (1 - homingStrength) + targetDirection.x * homingStrength,
            y: currentDirection.y * (1 - homingStrength) + targetDirection.y * homingStrength,
          })
          const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
          projectile.velocity = {
            x: mixedDirection.x * speed,
            y: mixedDirection.y * speed,
          }
        }
      }

      projectile.position.x += projectile.velocity.x * dtSeconds
      projectile.position.y += projectile.velocity.y * dtSeconds
      projectile.remainingMs -= dtMs
      if (typeof projectile.detonationDelayMs === "number") {
        projectile.detonationDelayMs -= dtMs
        if (projectile.detonationDelayMs <= 0) {
          const explosionVisual = this.detonatePlayerProjectile(battle, projectile)
          if (explosionVisual) {
            spawnedVisualProjectiles.push(explosionVisual)
          }
          continue
        }
      }
      if (projectile.remainingMs <= 0) {
        if (projectile.side === "player" && projectile.explosiveRadius) {
          const explosionVisual = this.detonatePlayerProjectile(battle, projectile)
          if (explosionVisual) {
            spawnedVisualProjectiles.push(explosionVisual)
          }
        }
        continue
      }
      if (
        projectile.position.x < -80 ||
        projectile.position.x > BATTLE_WIDTH + 80 ||
        projectile.position.y < -80 ||
        projectile.position.y > BATTLE_HEIGHT + 80
      ) {
        continue
      }
      remainingProjectiles.push(projectile)
    }

    battle.projectiles = [...remainingProjectiles, ...spawnedVisualProjectiles]
  }

  private resolveBattleCollisions(battle: InternalBattleState): {
    playerNoiseDamage: number
      events: DomainEvent[]
      presentationRequests: ReturnType<typeof flattenPresentationRequests>
      effectRequests: RuntimeEffectRequest[]
    } {
    let playerNoiseDamage = 0
    const events: DomainEvent[] = []
    const presentationRequests = [] as ReturnType<typeof flattenPresentationRequests>
    const effectRequests: RuntimeEffectRequest[] = []

    if (battle.barrier) {
      const barrierRadius = battle.barrier.radius
      battle.projectiles = battle.projectiles.filter((projectile) => {
        if (projectile.side !== "enemy") {
          return true
        }
        return !isWithinRadius(projectile.position, battle.playerPosition, barrierRadius)
      })
    }

    for (const field of battle.supportFields) {
      if (field.blocksEnemyBullets) {
        battle.projectiles = battle.projectiles.filter((projectile) => {
          if (projectile.side !== "enemy") {
            return true
          }
          return !isWithinRadius(projectile.position, field.position, field.radius)
        })
      }
    }

    const remainingProjectiles: InternalProjectileState[] = []
    const spawnedVisualProjectiles: InternalProjectileState[] = []
    for (const projectile of battle.projectiles) {
      if (projectile.spawnDelayMs > 0) {
        remainingProjectiles.push(projectile)
        continue
      }

      if (projectile.side === "enemy") {
        if (
          battle.noiseState.invincibleUntilMs <= battle.elapsedMs &&
          isWithinRadius(projectile.position, battle.playerPosition, projectile.radius + 8)
        ) {
          playerNoiseDamage += projectile.noiseDamage
          presentationRequests.push(
            ...createBattleHitPresentation({
              worldPosition: projectile.position,
              noiseLevel: clamp01(battle.noiseState.noiseLevel + projectile.noiseDamage),
            }),
          )
          continue
        }
        remainingProjectiles.push(projectile)
        continue
      }

      if (projectile.nonColliding) {
        remainingProjectiles.push(projectile)
        continue
      }

      let hitEnemy = false
      for (const enemy of battle.enemies) {
        if (!isWithinRadius(projectile.position, enemy.position, projectile.radius + enemy.radius)) {
          continue
        }
        enemy.hp -= projectile.damage
        if (projectile.burnDamagePerSec && projectile.burnDurationMs) {
          enemy.burnDamagePerSec = projectile.burnDamagePerSec
          enemy.burnUntilMs = battle.elapsedMs + projectile.burnDurationMs
        }
        if (projectile.explosiveRadius) {
          const explosionVisual = this.detonatePlayerProjectile(battle, {
            ...projectile,
            position: { ...projectile.position },
          })
          if (explosionVisual) {
            spawnedVisualProjectiles.push(explosionVisual)
          }
        }
        hitEnemy = true
        break
      }
      if (!hitEnemy) {
        remainingProjectiles.push(projectile)
      }
    }
    battle.projectiles = [...remainingProjectiles, ...spawnedVisualProjectiles]

    const survivors: InternalEnemyState[] = []
    for (const enemy of battle.enemies) {
      if (enemy.hp > 0) {
        survivors.push(enemy)
        continue
      }
      const definition = this.content.enemies[enemy.enemyId]
      battle.destroyedAnalysisValue += definition?.analysisValue ?? 0
      if ((definition?.dropSelfRepairPoints ?? 0) > 0) {
        this.spawnSelfRepairPickup(
          battle,
          enemy.position,
          definition?.dropSelfRepairPoints ?? 0,
        )
      }
      const enemyDestroyedHookResult = runSubsystemHooks({
        bindings: battle.bindings,
        context: {
          hook: "onEnemyDestroyed",
          enemyId: enemy.enemyId,
          analysisValue: definition?.analysisValue ?? 0,
          resolvedLoadout: battle.loadout,
        },
      })
      battle.destroyedAnalysisValue +=
        Math.max(0, enemyDestroyedHookResult.analysisDelta ?? 0) * battle.mission.analysisTotal
      effectRequests.push(...(enemyDestroyedHookResult.effectRequests ?? []))
      events.push({
        type: "enemyDestroyed",
        enemyId: enemy.enemyId,
      })
    }
    battle.enemies = survivors

    for (const enemy of battle.enemies) {
      if (
        battle.noiseState.invincibleUntilMs <= battle.elapsedMs &&
        isWithinRadius(enemy.position, battle.playerPosition, enemy.radius + 8)
      ) {
        playerNoiseDamage += (this.content.enemies[enemy.enemyId]?.collisionDamage ?? 0) / 100
      }
    }

    return {
      playerNoiseDamage,
      events,
      presentationRequests,
      effectRequests,
    }
  }

  private detonatePlayerProjectile(
    battle: InternalBattleState,
    projectile: InternalProjectileState,
  ): InternalProjectileState | null {
    if (!projectile.explosiveRadius || projectile.explosiveRadius <= 0) {
      return null
    }

    const damageMultiplier = projectile.explosionDamageMultiplier ?? 0.75
    const explosionDamage = projectile.damage * damageMultiplier

    for (const enemy of battle.enemies) {
      if (
        isWithinRadius(
          enemy.position,
          projectile.position,
          enemy.radius + projectile.explosiveRadius,
        )
      ) {
        enemy.hp -= explosionDamage
      }
    }

    if (!projectile.explosionVisualProjectileId) {
      return null
    }

    const projectileSpec = this.content.projectiles[projectile.explosionVisualProjectileId]
    return {
      projectileInstanceId: this.nextInstanceId(projectile.explosionVisualProjectileId),
      projectileId: projectile.explosionVisualProjectileId,
      side: "player",
      position: { ...projectile.position },
      velocity: { x: 0, y: 0 },
      radius: projectile.explosiveRadius,
      remainingMs: projectileSpec?.lifetimeMs ?? 180,
      spawnDelayMs: 0,
      damage: 0,
      noiseDamage: 0,
      nonColliding: true,
    }
  }

  private finalizeMission(battle: InternalBattleState): MissionResult {
    if (!this.activeProfile) {
      throw new Error("active profile is required to finalize mission")
    }
    const transcriptDurationMs = this.getTranscriptDurationMs(battle.transcript)
    const analysisRate = Math.min(
      1,
      battle.destroyedAnalysisValue / battle.mission.analysisTotal,
    )
    const restorationRate =
      transcriptDurationMs > 0
        ? computeRangesDuration(battle.heardRanges) / transcriptDurationMs
        : 0
    const transmissionProgress = this.getOrCreateTransmissionProgress(
      battle.transmission.transmissionId,
      battle.transmission.areaId,
    )
    const mergedHeardRanges = mergeRanges([
      ...transmissionProgress.heardRanges,
      ...battle.heardRanges,
    ])
    const previousArchiveHeardMs = computeRangesDuration(transmissionProgress.heardRanges)
    transmissionProgress.heardRanges = mergedHeardRanges
    transmissionProgress.clearCount += 1
    transmissionProgress.latestRunId = (transmissionProgress.latestRunId ?? 0) + 1
    transmissionProgress.lastPlayedAt = new Date().toISOString()
    transmissionProgress.firstConnectedAt ??= transmissionProgress.lastPlayedAt
    transmissionProgress.bestAnalysisRate = Math.max(
      transmissionProgress.bestAnalysisRate,
      analysisRate,
    )
    transmissionProgress.bestRunRestorationRate = Math.max(
      transmissionProgress.bestRunRestorationRate,
      restorationRate,
    )
    // 解析率は run ごとの最大値、本文開放は累積 heardRanges を使うので、両者を明確に分けて更新します。
    transmissionProgress.archiveRestorationRate =
      transcriptDurationMs > 0 ? computeRangesDuration(mergedHeardRanges) / transcriptDurationMs : 0
    transmissionProgress.metadataUnlocked = unlockMetadata(
      transmissionProgress.bestAnalysisRate,
      battle.transmission.metadataUnlockThresholds,
      transmissionProgress.metadataUnlocked,
    )

    const newHeardRangeMs = Math.max(
      0,
      computeRangesDuration(mergedHeardRanges) - previousArchiveHeardMs,
    )

    const isFirstClear = !this.activeProfile.profile.clearedMissionIds.includes(battle.mission.missionId)
    if (isFirstClear) {
      this.activeProfile.profile.clearedMissionIds.push(battle.mission.missionId)
    }

    // リザルト UI には今回の新規入手分だけを渡し、既取得装備の再表示を避けます。
    const rewardEquipmentIds = battle.transmission.rewardEquipmentIds ?? []
    const grantedEquipmentIds = rewardEquipmentIds.filter(
      (equipmentId) => !this.activeProfile?.profile.ownedEquipmentIds.includes(equipmentId),
    )

    const selfRepairPointsEarned =
      battle.selfRepairPointsEarned +
      (isFirstClear
        ? battle.mission.baseSelfRepairPoints
        : Math.round(battle.mission.baseSelfRepairPoints * battle.mission.repeatDecayRate)) +
      Math.round(newHeardRangeMs / 1000)

    this.activeProfile.profile.selfRepairPoints += selfRepairPointsEarned
    this.grantEquipment(rewardEquipmentIds)

    const run: MissionRunRow = {
      profileId: this.activeProfile.profile.profileId,
      transmissionId: battle.transmission.transmissionId,
      missionId: battle.mission.missionId,
      startedAt: new Date(Date.now() - battle.elapsedMs).toISOString(),
      finishedAt: new Date().toISOString(),
      rngSeed: 0,
      analysisRate,
      restorationRate,
      heardRanges: battle.heardRanges,
      damageRanges: battle.damageRanges,
      destroyedAnalysisValue: battle.destroyedAnalysisValue,
      score: Math.round(analysisRate * 10000 + restorationRate * 10000),
      selfRepairPointsEarned,
      cleared: true,
    }
    this.activeProfile.missionRuns.unshift(run)
    void this.repository.saveMissionRun(run)

    return {
      transmissionId: battle.transmission.transmissionId,
      missionId: battle.mission.missionId,
      analysisRate,
      restorationRate,
      heardRanges: battle.heardRanges,
      damageRanges: battle.damageRanges,
      destroyedAnalysisValue: battle.destroyedAnalysisValue,
      score: run.score,
      selfRepairPointsEarned,
      newHeardRangeMs,
      grantedEquipmentIds,
      isFirstClear,
      cleared: true,
    }
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
    const profile = this.activeProfile?.profile ?? createInitialProfileAggregate({
      slotId: 1,
      difficulty: this.settings.difficulty,
      content: this.content,
    }).profile
    return resolveLoadout({
      equipped: profile.equipped,
      equipmentLevels: profile.equipmentLevels,
      equipment: this.content.equipment,
      effects: this.content.effects,
    })
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
    battle.mission.waves.forEach((wave, waveIndex) => {
      if (battle.spawnedWaveIndexes.has(waveIndex)) {
        return
      }
      if (wave.atMs < previousElapsedMs || wave.atMs > battle.elapsedMs) {
        return
      }
      battle.spawnedWaveIndexes.add(waveIndex)
      for (const entry of wave.entries) {
        const enemy = this.content.enemies[entry.enemyId]
        const spawnPosition = resolveSpawnPoint(entry.spawnPointId)
        battle.enemies.push({
          enemyInstanceId: this.nextInstanceId(entry.enemyId),
          enemyId: entry.enemyId,
          spawnPosition,
          position: { ...spawnPosition },
          hp: enemy.hp,
          maxHp: enemy.hp,
          enteredAtMs: battle.elapsedMs,
          patternLastFiredAtMs: {},
          burnDamagePerSec: 0,
          burnUntilMs: 0,
          radius: resolveHitRadius(enemy.hitboxPresetId),
          overrides: entry.overrides,
        })
      }
    })
  }

  private fireEnemyPatterns(battle: InternalBattleState, enemy: InternalEnemyState): void {
    const enemyDefinition = this.content.enemies[enemy.enemyId]
    for (const patternId of enemyDefinition.bulletPatternIds) {
      const pattern = this.content.bulletPatterns[patternId]
      const lastFiredAtMs = enemy.patternLastFiredAtMs[patternId] ?? -pattern.cadenceMs
      if (battle.elapsedMs - lastFiredAtMs < pattern.cadenceMs) {
        continue
      }
      enemy.patternLastFiredAtMs[patternId] = battle.elapsedMs
      // 敵は自機だけを狙って撃つのではなく、空間へ無差別にノイズを放射する前提です。
      // そのため弾幕の基準方向は player ではなく、pattern 定義と経時揺れから決めます。
      const baseDirection = resolveEnemyPatternBaseDirection({
        battleElapsedMs: battle.elapsedMs,
        enemy,
        pattern,
      })
      const spreadDeg = Number(pattern.params.spreadDeg ?? 0)
      const burstCount = Math.max(1, pattern.burstCount)
      const baseRotationRad = readEnemyPatternBaseRotation({
        battleElapsedMs: battle.elapsedMs,
        enemy,
        pattern,
      })

      // ── goldenStream: 黄金角 (≈137.508°) ずつ回転しながら 1 発ずつ放射 ──
      // 向日葵の種配列と同じフィボナッチ螺旋を弾幕として形成する。
      if (pattern.patternKind === "goldenStream") {
        const GOLDEN_ANGLE_RAD = 2.39996322972865332 // 137.508° in radians
        const countKey = `${patternId}:n`
        const fireCount = enemy.patternLastFiredAtMs[countKey] ?? 0
        const angle = baseRotationRad + fireCount * GOLDEN_ANGLE_RAD
        const direction = { x: Math.cos(angle), y: Math.sin(angle) }
        const projectile = this.content.projectiles[pattern.projectileId]
        battle.projectiles.push({
          projectileInstanceId: this.nextInstanceId(pattern.projectileId),
          projectileId: pattern.projectileId,
          side: "enemy",
          position: { ...enemy.position },
          velocity: {
            x: direction.x * projectile.speed,
            y: direction.y * projectile.speed,
          },
          radius: resolveHitRadius(projectile.hitboxPresetId),
          remainingMs: projectile.lifetimeMs,
          spawnDelayMs: 0,
          damage: projectile.damage,
          noiseDamage: projectile.noiseDamage,
        })
        enemy.patternLastFiredAtMs[countKey] = fireCount + 1
        continue
      }

      for (let index = 0; index < burstCount; index += 1) {
        const offset =
          pattern.patternKind === "radial"
            ? baseRotationRad + ((index / burstCount) * 360 * Math.PI) / 180
            : ((burstCount === 1 ? 0 : (index / (burstCount - 1)) * spreadDeg - spreadDeg / 2) *
                Math.PI) /
              180
        const direction =
          pattern.patternKind === "radial"
            ? { x: Math.cos(offset), y: Math.sin(offset) }
            : rotateVector(baseDirection, offset)
        const projectile = this.content.projectiles[pattern.projectileId]
        battle.projectiles.push({
          projectileInstanceId: this.nextInstanceId(pattern.projectileId),
          projectileId: pattern.projectileId,
          side: "enemy",
          position: { ...enemy.position },
          velocity: {
            x: direction.x * projectile.speed,
            y: direction.y * projectile.speed,
          },
          radius: resolveHitRadius(projectile.hitboxPresetId),
          remainingMs: projectile.lifetimeMs,
          spawnDelayMs: 0,
          damage: projectile.damage,
          noiseDamage: projectile.noiseDamage,
        })
      }
    }
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
      isCircleInsideCircle(battle.playerPosition, 8, field.position, field.radius),
    )
    return activeField?.mainCadenceMultiplier ?? 1
  }

  private getActiveSubtitle(): SubtitleRenderState | undefined {
    if (!this.battleState) {
      return undefined
    }
    const battle = this.battleState
    const activeChunk = battle.transcript.find(
      (chunk) =>
        chunk.startMs <= battle.audioPlaybackMs &&
        chunk.endMs >= battle.audioPlaybackMs,
    )
    if (!activeChunk) {
      return undefined
    }
    const audible = battle.noiseState.noiseLevel < battle.noiseState.hearingThreshold
    return {
      transmissionId: battle.transmission.transmissionId,
      chunkId: activeChunk.chunkId,
      speakerLabel: activeChunk.speakerLabel,
      text: activeChunk.text,
      audible,
      progress:
        (battle.audioPlaybackMs - activeChunk.startMs) /
        Math.max(1, activeChunk.endMs - activeChunk.startMs),
    }
  }

  private nextInstanceId(prefix: string): string {
    this.instanceSerial += 1
    return `${prefix}:${this.instanceSerial}`
  }
}

function createInitialProfileAggregate(input: {
  slotId: SaveSlotId
  difficulty: Difficulty
  content: ContentBundle
}): ProfileAggregate {
  const createdAt = new Date().toISOString()
  const profileId = `profile:${input.slotId}:${createdAt}`
  const initialAreaId =
    Object.values(input.content.areas).find((area) => area.initialState === "visible")?.areaId ??
    Object.keys(input.content.areas)[0]
  const ownedEquipmentIds = Object.values(input.content.equipment)
    .filter((equipment) => equipment.unlockSource.kind === "initial")
    .map((equipment) => equipment.equipmentId)
  return {
    profile: {
      profileId,
      slotId: input.slotId,
      schemaVersion: 1,
      createdAt,
      updatedAt: createdAt,
      difficulty: input.difficulty,
      currentAreaId: initialAreaId,
      playerPosition: { ...input.content.areas[initialAreaId].worldPosition },
      equipped: {
        main: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "main"),
        sub: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "sub"),
        // 初期OS「破損」を最初から装備しておき、MAGNOLIA へ換装することで進行させます。
        os: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "os"),
        subsystems: [
          ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "subsystem") ?? null,
          null,
        ],
      },
      ownedEquipmentIds,
      equipmentLevels: Object.fromEntries(ownedEquipmentIds.map((equipmentId) => [equipmentId, 1])),
      selfRepairPoints: 0,
      collectedNodeIds: [],
      unlockedFlags: [],
      clearedMissionIds: [],
    },
    saveSlot: {
      slotId: input.slotId,
      profileId,
      label: `SLOT ${input.slotId}`,
      updatedAt: createdAt,
      currentAreaId: initialAreaId,
      playTimeMs: 0,
    },
    areaProgress: Object.values(input.content.areas).map((area) => ({
      profileId,
      areaId: area.areaId,
      discoveredAt: area.initialState === "visible" ? createdAt : undefined,
      nameRevealed: area.initialState === "visible",
      revealBitmap:
        area.initialState === "visible"
          ? revealViewportArea(
              createEmptyBitmap(),
              createExploreRevealViewport(area.worldPosition),
            )
          : createEmptyBitmap(),
      completionRateCache: 0,
    })),
    transmissionProgress: [],
    missionRuns: [],
  }
}

function createEmptyBitmap(): string {
  return Array.from({ length: WORLD_BITMAP_HEIGHT }, () => "0".repeat(WORLD_BITMAP_WIDTH)).join("|")
}

function mergeRevealBitmaps(rows: AreaProgressRow[]): string {
  const merged = Array.from({ length: WORLD_BITMAP_HEIGHT }, () =>
    Array.from({ length: WORLD_BITMAP_WIDTH }, () => "0"),
  )
  for (const row of rows) {
    normalizeBitmapRows(row.revealBitmap).forEach((line, y) => {
      line.split("").forEach((cell, x) => {
        if (cell === "1") {
          merged[y][x] = "1"
        }
      })
    })
  }
  return merged.map((line) => line.join("")).join("|")
}

function revealAroundPosition(bitmap: string, position: Vector2, radius = 1): string {
  const rows = normalizeBitmapRows(bitmap).map((row) => row.split(""))
  const cell = worldToBitmapCell(position)
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const targetX = cell.x + dx
      const targetY = cell.y + dy
      if (targetX < 0 || targetY < 0 || targetX >= WORLD_BITMAP_WIDTH || targetY >= WORLD_BITMAP_HEIGHT) {
        continue
      }
      rows[targetY][targetX] = "1"
    }
  }
  return rows.map((row) => row.join("")).join("|")
}

function revealViewportArea(
  bitmap: string,
  viewport: Rect,
): string {
  const rows = normalizeBitmapRows(bitmap).map((row) => row.split(""))
  const topLeft = worldToBitmapCell({ x: viewport.x, y: viewport.y })
  const bottomRight = worldToBitmapCell({
    x: viewport.x + viewport.width,
    y: viewport.y + viewport.height,
  })

  for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
    for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
      rows[y][x] = "1"
    }
  }

  return revealAroundPosition(
    rows.map((row) => row.join("")).join("|"),
    {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    },
    1,
  )
}

function createExploreRevealViewport(playerPosition: Vector2): Rect {
  return {
    x: playerPosition.x - (DEFAULT_EXPLORE_VIEWPORT_HEIGHT * DEFAULT_EXPLORE_REVEAL_ASPECT) / 2,
    y: playerPosition.y - DEFAULT_EXPLORE_VIEWPORT_HEIGHT / 2,
    width: DEFAULT_EXPLORE_VIEWPORT_HEIGHT * DEFAULT_EXPLORE_REVEAL_ASPECT,
    height: DEFAULT_EXPLORE_VIEWPORT_HEIGHT,
  }
}

function worldToBitmapCell(position: Vector2): { x: number; y: number } {
  return {
    x: Math.max(
      0,
      Math.min(
        WORLD_BITMAP_WIDTH - 1,
        Math.floor((position.x - WORLD_BITMAP_ORIGIN_X) / WORLD_CELL_SIZE),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        WORLD_BITMAP_HEIGHT - 1,
        Math.floor((position.y - WORLD_BITMAP_ORIGIN_Y) / WORLD_CELL_SIZE),
      ),
    ),
  }
}

function normalizeBitmapRows(bitmap: string): string[] {
  const sourceRows = bitmap
    .split("|")
    .map((row) => row.trim())
    .filter(Boolean)

  return Array.from({ length: WORLD_BITMAP_HEIGHT }, (_, y) => {
    const sourceRow = sourceRows[y] ?? ""
    if (sourceRow.length >= WORLD_BITMAP_WIDTH) {
      return sourceRow.slice(0, WORLD_BITMAP_WIDTH)
    }
    return sourceRow.padEnd(WORLD_BITMAP_WIDTH, "0")
  })
}

function computeRevealCompletionRate(bitmap: string): number {
  const cells = bitmap.replaceAll("|", "")
  const revealed = cells.split("").filter((cell) => cell === "1").length
  return cells.length === 0 ? 0 : revealed / cells.length
}

function toRecord<T extends Record<string, unknown>, K extends keyof T>(
  rows: T[],
  key: K,
): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [String(row[key]), row]))
}

function computeWorldBounds(mapLogic: WorldMapLogic): Rect {
  const allNodes = [
    ...mapLogic.areaNodes,
    ...mapLogic.transmissionNodes,
    ...mapLogic.warpNodes,
    ...mapLogic.collectibleNodes,
  ]
  const xs = allNodes.map((node) => node.x)
  const ys = allNodes.map((node) => node.y)
  const minX = Math.min(...xs) - 180
  const maxX = Math.max(...xs) + 180
  const minY = Math.min(...ys) - 180
  const maxY = Math.max(...ys) + 180
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function computeAreaBounds(mapLogic: WorldMapLogic, areaId: AreaId, fallback: Rect): Rect {
  const relatedNodes = [
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    // 行動制限は「現在エリアに属するノード」だけで決め、遷移先側のワープ入口では広げません。
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
  ]
  if (relatedNodes.length === 0) {
    return fallback
  }
  const xs = relatedNodes.map((node) => node.x)
  const ys = relatedNodes.map((node) => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  if (areaId === "area_central_tower") {
    // MAGNOLIA 入手前の制限エリアは、初期通信と初期アイテムを収めつつ、
    // 視界半径の拡張後でも窮屈になりすぎないサイズへ固定します。
    // 中心は散らしたノード群ではなく area ノード基準に固定し、
    // 境界解除演出の寄り先も毎回同じ正方形を参照できるようにします。
    const areaNode = mapLogic.areaNodes.find((node) => node.areaId === areaId)
    const baseCenterX = areaNode?.x ?? centerX
    const baseCenterY = areaNode?.y ?? centerY
    return clampRectInsideBounds(
      {
        x: baseCenterX - 380,
        y: baseCenterY - 380,
        width: 760,
        height: 760,
      },
      fallback,
    )
  }

  // 初期制限境界は docs の前提どおり正方形とし、解除演出でも同じ矩形を使います。
  // world の外へ少しでもはみ出すと camera clamp と境界描画の基準がずれるため、
  // 正方形を作った後に worldBounds 内へ平行移動だけで収めます。
  // 初期制限エリアは窮屈にしすぎず、ただし広がりすぎない値へ寄せる。
  // 以前の値だと探索可能範囲が少し広かったため、余白を一段だけ詰める。
  const paddingX = 180
  const paddingY = 150
  const halfSize = Math.max(
    (maxX - minX) / 2 + paddingX,
    (maxY - minY) / 2 + paddingY,
  )
  return clampRectInsideBounds(
    {
      x: centerX - halfSize,
      y: centerY - halfSize,
      width: halfSize * 2,
      height: halfSize * 2,
    },
    fallback,
  )
}

function computeAreaContextBounds(
  mapLogic: WorldMapLogic,
  areaId: AreaId,
): Rect | null {
  const relatedNodes = [
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
  ]
  if (relatedNodes.length === 0) {
    return null
  }

  const xs = relatedNodes.map((node) => node.x)
  const ys = relatedNodes.map((node) => node.y)
  const paddingX = 120
  const paddingY = 110

  return {
    x: Math.min(...xs) - paddingX,
    y: Math.min(...ys) - paddingY,
    width: Math.max(...xs) - Math.min(...xs) + paddingX * 2,
    height: Math.max(...ys) - Math.min(...ys) + paddingY * 2,
  }
}

function clampRectInsideBounds(rect: Rect, bounds: Rect): Rect {
  if (rect.width >= bounds.width || rect.height >= bounds.height) {
    return { ...bounds }
  }

  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - rect.width, rect.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - rect.height, rect.y)),
    width: rect.width,
    height: rect.height,
  }
}

function isPointInsideRect(point: Vector2, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function clampToRect(position: Vector2, rect: Rect): Vector2 {
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.width, position.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.height, position.y)),
  }
}

function normalizeVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  if (length <= 0.001) {
    return { x: 0, y: 0 }
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function detectCurrentAreaId(
  mapLogic: WorldMapLogic,
  areas: Record<AreaId, AreaMaster>,
  playerPosition: Vector2,
  fallbackAreaId: AreaId,
): AreaId {
  const nearestArea = mapLogic.areaNodes
    .map((node) => ({
      areaId: node.areaId,
      distance: Math.hypot(node.x - playerPosition.x, node.y - playerPosition.y),
    }))
    .sort((left, right) => left.distance - right.distance)[0]
  return nearestArea && areas[nearestArea.areaId] ? nearestArea.areaId : fallbackAreaId
}

function readDisplayArea(input: {
  mapLogic: WorldMapLogic
  areas: Record<AreaId, AreaMaster>
  playerPosition: Vector2
}): AreaMaster | undefined {
  const candidates = Object.values(input.areas)
    .map((area) => ({
      area,
      bounds: computeAreaContextBounds(input.mapLogic, area.areaId),
    }))
    .filter(
      (entry): entry is { area: AreaMaster; bounds: Rect } => entry.bounds !== null,
    )
    .filter(
      (entry) => isPointInsideRect(input.playerPosition, entry.bounds),
    )
    .sort(
      (left, right) =>
        Math.hypot(
          left.area.worldPosition.x - input.playerPosition.x,
          left.area.worldPosition.y - input.playerPosition.y,
        ) -
        Math.hypot(
          right.area.worldPosition.x - input.playerPosition.x,
          right.area.worldPosition.y - input.playerPosition.y,
        ),
    )

  return candidates[0]?.area
}

function readExploreMoveSpeed(
  content: ContentBundle,
  featureAccess: ReturnType<MagnoliaGameSession["buildFeatureAccess"]>,
  dashPressed: boolean,
): number {
  if (dashPressed && featureAccess.mapVisionUnlocked) {
    return content.playerShipSpec.exploreDashSpeed
  }
  return content.playerShipSpec.baseExploreSpeed
}

function computeNearestTransmissionStrength(input: {
  playerPosition: Vector2
  mapLogic: WorldMapLogic
  featureAccess: ReturnType<MagnoliaGameSession["buildFeatureAccess"]>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): number {
  const candidates = input.mapLogic.transmissionNodes
    .filter((node) => input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId))
    .filter((node) =>
      isTransmissionIncomplete(input.transmissionProgress[node.transmissionId]),
    )
  if (candidates.length === 0) {
    return 0
  }
  const nearestDistance = Math.min(
    ...candidates.map((node) => Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)),
  )
  return clamp01(1 - nearestDistance / 300)
}

function computeCompassTargetAreaId(input: {
  profile: ProfileRow
  areas: Record<AreaId, AreaMaster>
  transmissions: Record<TransmissionId, TransmissionMaster>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): AreaId | undefined {
  const unfinishedAreas = Object.values(input.areas).filter((area) =>
    area.transmissionIds.some(
      (transmissionId) => isTransmissionIncomplete(input.transmissionProgress[transmissionId]),
    ),
  )
  if (unfinishedAreas.length === 0) {
    return undefined
  }
  return unfinishedAreas
    .sort(
      (left, right) =>
        Math.hypot(
          left.worldPosition.x - input.profile.playerPosition.x,
          left.worldPosition.y - input.profile.playerPosition.y,
        ) -
        Math.hypot(
          right.worldPosition.x - input.profile.playerPosition.x,
          right.worldPosition.y - input.profile.playerPosition.y,
        ),
    )[0]
    ?.areaId
}

function findNearbyNode<T extends { x: number; y: number; interactionRadius: number }>(
  nodes: T[],
  playerPosition: Vector2,
): T | undefined {
  return nodes.find((node) =>
    isWithinRadius(playerPosition, { x: node.x, y: node.y }, node.interactionRadius),
  )
}

function isWithinRadius(position: Vector2, target: Vector2, radius: number): boolean {
  return Math.hypot(position.x - target.x, position.y - target.y) <= radius
}

function resolveSpawnPoint(spawnPointId: string): Vector2 {
  // 戦闘フィールド比率を変更しても敵配置の意味が崩れないよう、代表 spawn は画面比率で再計算します。
  const leftX = Math.round(BATTLE_WIDTH * 0.15)
  const centerX = Math.round(BATTLE_WIDTH * 0.5)
  const rightX = Math.round(BATTLE_WIDTH * 0.85)
  const midLeftX = Math.round(BATTLE_WIDTH * 0.2)
  const midRightX = Math.round(BATTLE_WIDTH * 0.8)

  switch (spawnPointId) {
    case "spawn_top_left":
      return { x: leftX, y: -24 }
    case "spawn_top_center":
      return { x: centerX, y: -24 }
    case "spawn_top_right":
      return { x: rightX, y: -24 }
    case "spawn_mid_left":
      return { x: midLeftX, y: 96 }
    case "spawn_mid_right":
      return { x: midRightX, y: 96 }
    // 画面横断用 — 画面外から侵入して反対側へ抜けるドリフト演出
    case "spawn_side_left":
      return { x: -24, y: 80 }
    case "spawn_side_right":
      return { x: BATTLE_WIDTH + 24, y: 80 }
    default:
      return { x: centerX, y: -24 }
  }
}

function resolveHitRadius(hitboxPresetId: string | undefined): number {
  if (!hitboxPresetId) {
    return 8
  }
  if (hitboxPresetId.includes("small")) {
    return 8
  }
  if (hitboxPresetId.includes("medium")) {
    return 12
  }
  if (hitboxPresetId.includes("large")) {
    return 18
  }
  if (hitboxPresetId.includes("thin")) {
    return 5
  }
  return 8
}

function computeRangesDuration(ranges: TimeRange[]): number {
  return mergeRanges(ranges).reduce((total, range) => total + (range.endMs - range.startMs), 0)
}

function appendTimeRange(ranges: TimeRange[], range: TimeRange): TimeRange[] {
  return mergeRanges([...ranges, range])
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((left, right) => left.startMs - right.startMs)
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (!last || range.startMs > last.endMs) {
      merged.push({ ...range })
      continue
    }
    last.endMs = Math.max(last.endMs, range.endMs)
  }
  return merged
}

function computeRestorationRate(
  battle: InternalBattleState,
  transcript: TranscriptChunk[],
): number {
  const totalDuration = transcript[transcript.length - 1]?.endMs ?? 0
  if (totalDuration <= 0) {
    return 0
  }
  return computeRangesDuration(battle.heardRanges) / totalDuration
}

function unlockMetadata(
  analysisRate: number,
  thresholds: TransmissionMaster["metadataUnlockThresholds"],
  current: MetadataUnlocked,
): MetadataUnlocked {
  return {
    title: current.title || analysisRate >= thresholds.title,
    sender: current.sender || analysisRate >= thresholds.sender,
    recipient: current.recipient || analysisRate >= thresholds.recipient,
    sentAt: current.sentAt || analysisRate >= thresholds.sentAt,
  }
}

function uniqueIds<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function readPatternNumericParam(
  pattern: BulletPattern,
  key: string,
  fallback: number,
): number {
  const value = pattern.params[key]
  return typeof value === "number" ? value : fallback
}

function resolveEnemyPatternBaseDirection(input: {
  battleElapsedMs: number
  enemy: InternalEnemyState
  pattern: BulletPattern
}): Vector2 {
  const baseAngleDeg = readPatternNumericParam(input.pattern, "baseAngleDeg", 90)
  const oscillationDeg = readPatternNumericParam(input.pattern, "oscillationDeg", 0)
  const oscillationMs = Math.max(1, readPatternNumericParam(input.pattern, "oscillationMs", 2400))
  const phaseOffsetDeg =
    readPatternNumericParam(input.pattern, "phaseOffsetDeg", 0) +
    pseudoRandomUnit(hashString(input.enemy.enemyInstanceId)) * 28
  const oscillation =
    oscillationDeg === 0
      ? 0
      : Math.sin(((input.battleElapsedMs + Math.abs(phaseOffsetDeg) * 8) / oscillationMs) * Math.PI * 2) *
        oscillationDeg

  return vectorFromAngleDeg(baseAngleDeg + phaseOffsetDeg + oscillation)
}

function readEnemyPatternBaseRotation(input: {
  battleElapsedMs: number
  enemy: InternalEnemyState
  pattern: BulletPattern
}): number {
  const baseAngleDeg = readPatternNumericParam(input.pattern, "baseAngleDeg", 90)
  const rotationDegPerSec = readPatternNumericParam(input.pattern, "rotationDegPerSec", 0)
  const phaseOffsetDeg =
    readPatternNumericParam(input.pattern, "phaseOffsetDeg", 0) +
    pseudoRandomUnit(hashString(`${input.enemy.enemyInstanceId}:rot`)) * 32

  return ((baseAngleDeg + phaseOffsetDeg + (input.battleElapsedMs / 1000) * rotationDegPerSec) * Math.PI) / 180
}

function vectorFromAngleDeg(angleDeg: number): Vector2 {
  const radians = (angleDeg * Math.PI) / 180
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pseudoRandomUnit(seed: number): number {
  return (seed % 1000) / 1000 - 0.5
}

function rotateVector(vector: Vector2, radians: number): Vector2 {
  return {
    x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
    y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians),
  }
}

function isCircleInsideCircle(
  position: Vector2,
  radius: number,
  targetPosition: Vector2,
  targetRadius: number,
): boolean {
  return Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y) <= radius + targetRadius
}

function isPointInsideHazardArea(
  position: Vector2,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    position.x >= area.x &&
    position.x <= area.x + area.width &&
    position.y >= area.y &&
    position.y <= area.y + area.height
  )
}

function doesCircleIntersectHazardArea(
  position: Vector2,
  radius: number,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  const nearestX = Math.max(area.x, Math.min(position.x, area.x + area.width))
  const nearestY = Math.max(area.y, Math.min(position.y, area.y + area.height))
  const dx = position.x - nearestX
  const dy = position.y - nearestY
  return dx * dx + dy * dy <= radius * radius
}

function findNearestEnemyInRange(
  enemies: InternalEnemyState[],
  position: Vector2,
  range: number,
): InternalEnemyState | undefined {
  return enemies
    .map((enemy) => ({
      enemy,
      distance: Math.hypot(enemy.position.x - position.x, enemy.position.y - position.y),
    }))
    .filter((entry) => entry.distance <= range)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy
}

function hasEnemyWithinRange(
  enemies: InternalEnemyState[],
  position: Vector2,
  range: number,
): boolean {
  return enemies.some((enemy) =>
    isWithinRadius(position, enemy.position, range + enemy.radius),
  )
}

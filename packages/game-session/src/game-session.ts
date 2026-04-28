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
  BattleSnapshot,
  CollectItemCommand,
  CollectibleMapNode,
  ConditionId,
  ConditionSpec,
  ContentBundle,
  DomainEvent,
  EnemyId,
  EquipmentId,
  EquipmentMaster,
  ExploreFrameInput,
  ExploreFrameResult,
  ExploreSnapshot,
  GameCommand,
  MissionId,
  MissionResult,
  MissionRunRow,
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
  TransmissionProgressRow,
  Vector2,
  WarpMapNode,
  WorldMapLogic,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  applyEquippedPassives,
  createEquipmentRuntimeBindings,
  defaultEquipmentRuntimeRegistry,
  fireEquippedMainWeapon,
  resolveLoadout,
  runSubsystemHooks,
  type RuntimeModifierPatch,
  useEquippedSubWeapon,
} from "./equipment-runtime"
import {
  applyBattleEffectRequests,
  detonatePlayerProjectile,
  updateBattleProjectiles,
} from "./battle-effects"
import type {
  InternalBattleState,
  InternalEnemyState,
  InternalPickupState,
  InternalProjectileState,
} from "./battle-state"
import { buildBattleHazardViewModels, stepBattlefieldHazards } from "./hazards"
import {
  buildArchiveAccessState,
  buildFeatureAccessState,
  buildWorldMapVisibilityState,
  createMissionReplaySeed,
  seedMissionStateWithReplayProgress,
} from "./selectors"
import {
  appendTimeRange,
  computeRecoverableArchiveHeardRanges,
  computeRecoverableRunHeardRanges,
  computeRangesDuration,
  computeRestorationRate,
  hasVisibleArchiveContent,
  mergeRanges,
  readTransmissionCompletionState,
  unlockMetadata,
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
import {
  clampToRect,
  computeAreaBounds,
  computeCompassTargetAreaId,
  computeNearestTransmissionStrength,
  computeNearestAnyTransmissionStrength,
  computeRevealCompletionRate,
  computeWorldBounds,
  createExploreRevealViewport,
  detectCurrentAreaId,
  findNearbyNode,
  isWithinRadius,
  mergeRevealBitmaps,
  normalizeVector,
  readDisplayArea,
  readExploreMoveSpeed,
  revealViewportArea,
} from "./explore-world"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  clamp01,
  doesCircleIntersectHazardArea,
  isCircleInsideCircle,
  readEnemyPatternBaseRotation,
  resolveEnemyPatternBaseDirection,
  resolveHitRadius,
  resolveSpawnPoint,
  rotateVector,
} from "./battle-world"
import { createInitialProfileAggregate } from "./profile-factory"
import {
  createBattleSnapshotFromState,
  createEmptyExploreSnapshot,
  createEquipmentSnapshotForProfile,
  createExploreSnapshotForProfile,
  createMapSnapshotFromExplore,
} from "./session-snapshots"
import { toRecord } from "./record-utils"
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

const DEFAULT_EXPLORE_VISION_RADIUS = 150
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

type SlotSelectMode = "new" | "continue"

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
  private domainEventQueue: DomainEvent[] = []
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
    const nearestAnyTransmissionStrength = computeNearestAnyTransmissionStrength({
      playerPosition: this.activeProfile.profile.playerPosition,
      mapLogic,
      featureAccess,
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
          interactionRadius: node.interactionRadius,
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
          interactionRadius: node.interactionRadius,
        })),
      visibleCollectibles: mapLogic.collectibleNodes
        .filter((node) => mapState.visibleCollectibleNodeIds.includes(node.nodeId))
        .map((node) => ({
          nodeId: node.nodeId,
          x: node.x,
          y: node.y,
          interactionRadius: node.interactionRadius,
          markerKind:
            node.collectibleKind === "hiddenEquipment" ? "equipment" : "resource",
          label:
            node.collectibleKind === "hiddenEquipment"
              ? "???"
              : "自己修復ポイント",
        })),
      nearestTransmissionStrength,
      nearestAnyTransmissionStrength,
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
        visualPresetId: readEnemyVisualPresetId(this.content, enemy.enemyId),
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
          visualPresetId: readProjectileSpec(this.content, projectile.projectileId).visualPresetId,
          trailPresetId: readProjectileSpec(this.content, projectile.projectileId).trailPresetId,
          side: projectile.side,
          position: projectile.position,
          velocity: projectile.velocity,
          radius: projectile.radius,
          progress:
            projectile.initialLifetimeMs && projectile.initialLifetimeMs > 0
              ? clamp01((projectile.ageMs ?? 0) / projectile.initialLifetimeMs)
              : undefined,
          inversePhaseVisual: projectile.inversePhaseVisual,
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
        visualPresetId: hazard.visualPresetId,
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
        this.enqueueDomainEvent(this.handleCollectItem(command))
        break
      case "interactExploreNode":
        this.handleExploreNodeInteraction(command.nodeId)
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
    battle.mainMeleeCooldownMs = Math.max(0, (battle.mainMeleeCooldownMs ?? 0) - input.dtMs)
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

    const spawnedEffects = this.applyEffectRequests(battle, effectRequests, battlePassives)
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
      this.applyEffectRequests(battle, collisionEvents.effectRequests, battlePassives)
    }

    const fieldProtectsFromMagneticDisaster = battle.supportFields.some(
      (field) =>
        field.blocksMagneticDisaster &&
        isCircleInsideCircle(battle.playerPosition, 8, field.position, field.radius),
    )

    const difficultyModifiers = this.resolveDifficultyModifiers()
    battle.noiseState.noiseLevel = clamp01(
      battle.noiseState.noiseLevel -
        this.content.playerShipSpec.noiseDecayRate *
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
        battle.elapsedMs + this.content.playerShipSpec.invincibilityMs
      receivedRestorationDamage = totalNoiseDamage > 0
      if (hitHookResult.effectRequests?.length) {
        this.applyEffectRequests(battle, hitHookResult.effectRequests, battlePassives)
      }
    }

    const currentAudible = battle.noiseState.noiseLevel < battle.noiseState.hearingThreshold
    const audioWindow = this.resolveAudioWindow(battle, input.dtMs)
    if (audioWindow && battle.phase === "playing") {
      if (currentAudible && !receivedRestorationDamage) {
        battle.heardRanges = appendTimeRange(battle.heardRanges, audioWindow)
      } else {
        battle.damageRanges = appendTimeRange(battle.damageRanges, audioWindow)
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
      mainMeleeCooldownMs: 0,
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

  private enqueueDomainEvent(event: DomainEvent | null): void {
    if (event) {
      this.domainEventQueue.push(event)
    }
  }

  private handleCollectItem(command: CollectItemCommand): DomainEvent | null {
    if (!this.activeProfile) {
      return null
    }
    const mapLogic = this.content.mapLogic[this.content.areas[this.activeProfile.profile.currentAreaId].mapId]
    const node = mapLogic.collectibleNodes.find((candidate) => candidate.nodeId === command.nodeId)
    if (!node || this.activeProfile.profile.collectedNodeIds.includes(node.nodeId)) {
      return null
    }
    if (node.collectibleKind === "selfRepairPoints") {
      this.activeProfile.profile.selfRepairPoints += node.selfRepairPointAmount ?? 0
    }
    if (node.collectibleKind === "hiddenEquipment" && node.equipmentId) {
      this.grantEquipment([node.equipmentId])
    }
    this.activeProfile.profile.collectedNodeIds.push(node.nodeId)
    return {
      type: "collectibleCollected",
      nodeId: node.nodeId,
      collectibleKind: node.collectibleKind,
    }
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

  private createBattleSnapshot(): BattleSnapshot {
    return createBattleSnapshotFromState({
      battleState: this.battleState,
      activeProfile: this.activeProfile,
      fallbackMissionId: Object.keys(this.content.missions)[0] ?? "mission_missing",
    })
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
    return createEquipmentSnapshotForProfile(this.activeProfile)
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
      const event = this.handleCollectItem({
        type: "collectItem",
        nodeId: nearbyCollectible.nodeId,
      })
      return {
        events: event ? [event] : [],
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

  private handleExploreNodeInteraction(nodeId: WorldMapNodeId): void {
    if (!this.activeProfile || this.screen !== "explore") {
      return
    }

    const mapLogic = this.content.mapLogic[this.content.areas[this.activeProfile.profile.currentAreaId].mapId]
    const playerPosition = this.activeProfile.profile.playerPosition
    const collectible = mapLogic.collectibleNodes.find((node) => node.nodeId === nodeId)
    if (
      collectible &&
      !this.activeProfile.profile.collectedNodeIds.includes(collectible.nodeId) &&
      isWithinRadius(playerPosition, { x: collectible.x, y: collectible.y }, collectible.interactionRadius)
    ) {
      this.enqueueDomainEvent(this.handleCollectItem({ type: "collectItem", nodeId: collectible.nodeId }))
      return
    }

    const warp = mapLogic.warpNodes.find((node) => node.nodeId === nodeId)
    if (
      warp &&
      isWithinRadius(playerPosition, { x: warp.x, y: warp.y }, warp.interactionRadius)
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
      isWithinRadius(
        playerPosition,
        { x: transmission.x, y: transmission.y },
        transmission.interactionRadius,
      )
    ) {
      const missionId = this.content.transmissions[transmission.transmissionId].missionId
      this.startMission(missionId)
      this.enqueueDomainEvent({
        type: "missionStarted",
        missionId,
      })
    }
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
    modifierPatch: RuntimeModifierPatch = {},
  ): {
    presentationRequests: ReturnType<typeof flattenPresentationRequests>
  } {
    return applyBattleEffectRequests({
      battle,
      effectRequests,
      modifierPatch,
      projectiles: this.content.projectiles,
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
    updateBattleProjectiles({
      battle,
      dtMs,
      statModifiers,
      projectiles: this.content.projectiles,
      nextInstanceId: (prefix) => this.nextInstanceId(prefix),
    })
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
          const explosionVisual = detonatePlayerProjectile({
            battle,
            projectile: {
              ...projectile,
              position: { ...projectile.position },
            },
            projectiles: this.content.projectiles,
            nextInstanceId: (prefix) => this.nextInstanceId(prefix),
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

  private finalizeMission(battle: InternalBattleState): MissionResult {
    if (!this.activeProfile) {
      throw new Error("active profile is required to finalize mission")
    }
    const transcriptDurationMs = this.getTranscriptDurationMs(battle.transcript)
    const analysisRate = Math.min(
      1,
      battle.destroyedAnalysisValue / battle.mission.analysisTotal,
    )
    const recoverableRunHeardRanges = computeRecoverableRunHeardRanges({
      heardRanges: battle.heardRanges,
      seededHeardRanges: battle.seededHeardRanges,
      damageRanges: battle.damageRanges,
    })
    const restorationRate = computeRestorationRate(recoverableRunHeardRanges, battle.transcript)
    const transmissionProgress = this.getOrCreateTransmissionProgress(
      battle.transmission.transmissionId,
      battle.transmission.areaId,
    )
    const mergedHeardRanges = mergeRanges([
      ...transmissionProgress.heardRanges,
      ...recoverableRunHeardRanges,
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

    const difficultyModifiers = this.resolveDifficultyModifiers()
    const rawSelfRepairPointsEarned =
      battle.selfRepairPointsEarned +
      (isFirstClear
        ? battle.mission.baseSelfRepairPoints
        : Math.round(battle.mission.baseSelfRepairPoints * battle.mission.repeatDecayRate)) +
      Math.round(newHeardRangeMs / 1000)
    const selfRepairPointsEarned = Math.round(
      rawSelfRepairPointsEarned * (difficultyModifiers.selfRepairPointMultiplier ?? 1),
    )

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
      heardRanges: recoverableRunHeardRanges,
      damageRanges: battle.damageRanges,
      destroyedAnalysisValue: battle.destroyedAnalysisValue,
      score: Math.round(
        (analysisRate * 10000 + restorationRate * 10000) *
          (difficultyModifiers.scoreMultiplier ?? 1),
      ),
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
      heardRanges: recoverableRunHeardRanges,
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
    return resolveLoadout({
      equipped: this.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
      equipmentLevels: this.activeProfile?.profile.equipmentLevels ?? {},
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
        const maxHp = Math.max(1, Math.round(enemy.hp * (this.resolveDifficultyModifiers().enemyHpMultiplier ?? 1)))
        battle.enemies.push({
          enemyInstanceId: this.nextInstanceId(entry.enemyId),
          enemyId: entry.enemyId,
          spawnPosition,
          position: { ...spawnPosition },
          hp: maxHp,
          maxHp,
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
    const difficultyModifiers = this.resolveDifficultyModifiers()
    const cadenceMultiplier = difficultyModifiers.enemyCadenceMultiplier ?? 1
    const noiseDamageMultiplier = difficultyModifiers.enemyNoiseDamageMultiplier ?? 1
    for (const patternId of enemyDefinition.bulletPatternIds) {
      const pattern = this.content.bulletPatterns[patternId]
      const cadenceMs = Math.max(80, pattern.cadenceMs * cadenceMultiplier)
      const lastFiredAtMs = enemy.patternLastFiredAtMs[patternId] ?? -cadenceMs
      if (battle.elapsedMs - lastFiredAtMs < cadenceMs) {
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
          noiseDamage: projectile.noiseDamage * noiseDamageMultiplier,
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
          noiseDamage: projectile.noiseDamage * noiseDamageMultiplier,
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

function readEnemyVisualPresetId(content: ContentBundle, enemyId: EnemyId): string {
  const enemy = content.enemies[enemyId]
  if (!enemy) {
    throw new Error(`Missing enemy ${enemyId} while building battle render state.`)
  }
  return enemy.visualPresetId
}

function readProjectileSpec(content: ContentBundle, projectileId: string) {
  const projectile = content.projectiles[projectileId]
  if (!projectile) {
    throw new Error(`Missing projectile ${projectileId} while building battle render state.`)
  }
  return projectile
}

function uniqueIds<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

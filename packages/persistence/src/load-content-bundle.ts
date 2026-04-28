import type {
  AreaMaster,
  BulletPattern,
  BulletVisualRoleCollection,
  BulletVisualRoleSpec,
  ConditionId,
  ConditionSpec,
  ContentBundle,
  EffectSpec,
  EffectId,
  EnemyArchetype,
  EnemyId,
  EquipmentId,
  EquipmentMaster,
  HitboxPresetId,
  MapId,
  MissionId,
  MissionMaster,
  MissionVisualProfile,
  MissionVisualProfileCollection,
  ProjectileVisualRole,
  ProjectileId,
  ProjectileSpec,
  TranscriptChunk,
  TranscriptChunkId,
  TransmissionId,
  TransmissionMaster,
  VisualPresetId,
  WorldMapLogic,
} from "@magnolia/contracts"
import { type PresentationCueId } from "@magnolia/contracts"
import areaBroadcastFacilityJson from "../../../content/gameplay/areas/area_broadcast_facility.json"
import areaCentralTowerJson from "../../../content/gameplay/areas/area_central_tower.json"
import bpA2LanceSpreadJson from "../../../content/gameplay/bullet-patterns/bp_a2_lance_spread.json"
import bpB1CoreBurstJson from "../../../content/gameplay/bullet-patterns/bp_b1_core_burst.json"
import bpB1LanceStreamJson from "../../../content/gameplay/bullet-patterns/bp_b1_lance_stream.json"
import bpC1PressureRingJson from "../../../content/gameplay/bullet-patterns/bp_c1_pressure_ring.json"
import bpHeavyBurstJson from "../../../content/gameplay/bullet-patterns/bp_heavy_burst.json"
import bpRadialBurstJson from "../../../content/gameplay/bullet-patterns/bp_radial_burst.json"
import bpScoutSingleJson from "../../../content/gameplay/bullet-patterns/bp_scout_single.json"
import bpSpiralStreamJson from "../../../content/gameplay/bullet-patterns/bp_spiral_stream.json"
import bpStandardSpreadJson from "../../../content/gameplay/bullet-patterns/bp_standard_spread.json"
import enemyA1Json from "../../../content/gameplay/enemies/a1.json"
import enemyA2Json from "../../../content/gameplay/enemies/a2.json"
import enemyB1Json from "../../../content/gameplay/enemies/b1.json"
import enemyC1Json from "../../../content/gameplay/enemies/c1.json"
import enemyHeavyJson from "../../../content/gameplay/enemies/enemy_heavy.json"
import enemyScoutJson from "../../../content/gameplay/enemies/enemy_scout.json"
import enemyStandardJson from "../../../content/gameplay/enemies/enemy_standard.json"
import effMainCarrierJson from "../../../content/gameplay/equipment/effects/eff_main_carrier.json"
import effMainPulseJson from "../../../content/gameplay/equipment/effects/eff_main_pulse.json"
import effOsMagnoliaJson from "../../../content/gameplay/equipment/effects/eff_os_magnolia.json"
import effSubNoiseCancellerJson from "../../../content/gameplay/equipment/effects/eff_sub_noise_canceller.json"
import effSubSilentWaveJson from "../../../content/gameplay/equipment/effects/eff_sub_silent_wave.json"
import effSubsystemAnalysisCircuitJson from "../../../content/gameplay/equipment/effects/eff_subsystem_analysis_circuit.json"
import effSubsystemGuidedWaveJson from "../../../content/gameplay/equipment/effects/eff_subsystem_guided_wave.json"
import effSubsystemInversePhaseJson from "../../../content/gameplay/equipment/effects/eff_subsystem_inverse_phase.json"
import effSubsystemNoiseGateJson from "../../../content/gameplay/equipment/effects/eff_subsystem_noise_gate.json"
import effSubsystemPrecisionControlJson from "../../../content/gameplay/equipment/effects/eff_subsystem_precision_control.json"
import eqMainCarrierJson from "../../../content/gameplay/equipment/eq_main_carrier.json"
import eqMainPulseJson from "../../../content/gameplay/equipment/eq_main_pulse.json"
import eqOsBrokenJson from "../../../content/gameplay/equipment/eq_os_broken.json"
import eqOsMagnoliaJson from "../../../content/gameplay/equipment/eq_os_magnolia.json"
import eqSubNoiseCancellerJson from "../../../content/gameplay/equipment/eq_sub_noise_canceller.json"
import eqSubSilentWaveJson from "../../../content/gameplay/equipment/eq_sub_silent_wave.json"
import eqSubsystemAnalysisCircuitJson from "../../../content/gameplay/equipment/eq_subsystem_analysis_circuit.json"
import eqSubsystemGuidedWaveJson from "../../../content/gameplay/equipment/eq_subsystem_guided_wave.json"
import eqSubsystemInversePhaseJson from "../../../content/gameplay/equipment/eq_subsystem_inverse_phase.json"
import eqSubsystemNoiseGateJson from "../../../content/gameplay/equipment/eq_subsystem_noise_gate.json"
import eqSubsystemPrecisionControlJson from "../../../content/gameplay/equipment/eq_subsystem_precision_control.json"
import worldMapDemoJson from "../../../content/gameplay/map-logic/world_map_demo.json"
import missionGoodMorningJson from "../../../content/gameplay/missions/mission_good_morning.json"
import missionWhereAreYouJson from "../../../content/gameplay/missions/mission_where_are_you.json"
import missionEvacuationJson from "../../../content/gameplay/missions/mission_evacuation.json"
import condAlwaysJson from "../../../content/gameplay/progression/conditions/cond_always.json"
import condMissionGoodMorningClearedJson from "../../../content/gameplay/progression/conditions/cond_mission_good_morning_cleared.json"
import projEnemyBasicJson from "../../../content/gameplay/projectiles/proj_enemy_basic.json"
import projEnemyCoreJson from "../../../content/gameplay/projectiles/proj_enemy_core.json"
import projEnemyGeoJson from "../../../content/gameplay/projectiles/proj_enemy_geo.json"
import projEnemyLanceJson from "../../../content/gameplay/projectiles/proj_enemy_lance.json"
import projEnemyPetalJson from "../../../content/gameplay/projectiles/proj_enemy_petal.json"
import projPlayerCarrierJson from "../../../content/gameplay/projectiles/proj_player_carrier.json"
import projPlayerCarrierBlastJson from "../../../content/gameplay/projectiles/proj_player_carrier_blast.json"
import projPlayerPulseJson from "../../../content/gameplay/projectiles/proj_player_pulse.json"
import projPlayerPulseMeleeJson from "../../../content/gameplay/projectiles/proj_player_pulse_melee.json"
import txGoodMorningChunksJson from "../../../content/gameplay/transmissions/tx_good_morning.chunks.json"
import txGoodMorningJson from "../../../content/gameplay/transmissions/tx_good_morning.json"
import txWhereAreYouChunksJson from "../../../content/gameplay/transmissions/tx_where_are_you.chunks.json"
import txWhereAreYouJson from "../../../content/gameplay/transmissions/tx_where_are_you.json"
import txEvacuationChunksJson from "../../../content/gameplay/transmissions/tx_evacuation.chunks.json"
import txEvacuationJson from "../../../content/gameplay/transmissions/tx_evacuation.json"
import bulletVisualRolesJson from "../../../content/gameplay/visual-presets/bullet_visual_roles.json"
import missionVisualProfilesJson from "../../../content/gameplay/visual-presets/mission_visual_profiles.json"
import {
  createDefaultDifficultyModifiers,
  createDefaultHitboxes,
  createDefaultPlayerShipSpec,
  createDefaultPresentationCues,
  createDefaultThemes,
  createDefaultVisuals,
} from "./defaults"

let cachedBundle: ContentBundle | null = null
// mission ごとの差は content 側の調整で吸収し、runtime へ専用分岐を増やし過ぎないための許可一覧です。
// frontend / art チームが敵配置や hazard を触る時は、まずこの generic schema の範囲で表現します。
const SUPPORTED_ENEMY_BEHAVIOR_KINDS = new Set(["straightDown", "zigzag", "slowDescent"])
const SUPPORTED_BULLET_PATTERN_KINDS = new Set(["goldenStream", "radial", "spread"])
const SUPPORTED_ENEMY_OVERRIDE_KEYS = new Set([
  "speed",
  "driftX",
  "wobbleAmplitude",
  "wobblePeriodMs",
  "pauseAtY",
  "pauseMs",
])

export function loadContentBundle(): ContentBundle {
  if (cachedBundle) {
    return cachedBundle
  }

  // いまは content-tools 未導入のため、実データ JSON を明示 import して bundle を組み立てます。
  // 生成済み bundle に切り替える時は、この関数の内部だけを差し替えれば済む構成に留めます。
  const areas = [areaBroadcastFacilityJson, areaCentralTowerJson] as AreaMaster[]
  const missions = [missionGoodMorningJson, missionWhereAreYouJson, missionEvacuationJson] as MissionMaster[]
  const transmissions = [txGoodMorningJson, txWhereAreYouJson, txEvacuationJson] as TransmissionMaster[]
  const transcriptChunks = [
    ...(txGoodMorningChunksJson as TranscriptChunk[]),
    ...(txWhereAreYouChunksJson as TranscriptChunk[]),
    ...(txEvacuationChunksJson as TranscriptChunk[]),
  ]
  const mapLogic = [worldMapDemoJson as WorldMapLogic]
  const enemies = [
    enemyA1Json,
    enemyA2Json,
    enemyC1Json,
    enemyB1Json,
    enemyHeavyJson,
    enemyScoutJson,
    enemyStandardJson,
  ] as EnemyArchetype[]
  const bulletPatterns = [
    bpA2LanceSpreadJson,
    bpC1PressureRingJson,
    bpB1CoreBurstJson,
    bpB1LanceStreamJson,
    bpHeavyBurstJson,
    bpRadialBurstJson,
    bpScoutSingleJson,
    bpSpiralStreamJson,
    bpStandardSpreadJson,
  ] as BulletPattern[]
  const projectiles = [
    projEnemyBasicJson,
    projEnemyCoreJson,
    projEnemyGeoJson,
    projEnemyLanceJson,
    projEnemyPetalJson,
    projPlayerCarrierJson,
    projPlayerCarrierBlastJson,
    projPlayerPulseJson,
    projPlayerPulseMeleeJson,
  ] as ProjectileSpec[]
  const equipment = [
    eqMainCarrierJson,
    eqMainPulseJson,
    eqOsBrokenJson,
    eqOsMagnoliaJson,
    eqSubNoiseCancellerJson,
    eqSubSilentWaveJson,
    eqSubsystemAnalysisCircuitJson,
    eqSubsystemGuidedWaveJson,
    eqSubsystemInversePhaseJson,
    eqSubsystemNoiseGateJson,
    eqSubsystemPrecisionControlJson,
  ] as EquipmentMaster[]
  const effects = [
    effMainCarrierJson,
    effMainPulseJson,
    effOsMagnoliaJson,
    effSubNoiseCancellerJson,
    effSubSilentWaveJson,
    effSubsystemAnalysisCircuitJson,
    effSubsystemGuidedWaveJson,
    effSubsystemInversePhaseJson,
    effSubsystemNoiseGateJson,
    effSubsystemPrecisionControlJson,
  ] as EffectSpec[]
  const conditions = [
    condAlwaysJson,
    condMissionGoodMorningClearedJson,
  ] as ConditionSpec[]
  const missionVisualProfileCollection =
    missionVisualProfilesJson as MissionVisualProfileCollection
  const bulletVisualRoleCollection =
    bulletVisualRolesJson as BulletVisualRoleCollection
  validateVisualCollectionMetadata(
    missionVisualProfileCollection,
    bulletVisualRoleCollection,
  )

  const bundle: ContentBundle = {
    playerShipSpec: createDefaultPlayerShipSpec(),
    areas: indexBy("areaId", areas),
    mapLogic: indexBy("mapId", mapLogic),
    transmissions: indexBy("transmissionId", transmissions),
    transcriptChunks: indexBy("chunkId", transcriptChunks),
    missions: indexBy("missionId", missions),
    enemies: indexBy("enemyId", enemies),
    bulletPatterns: indexBy("bulletPatternId", bulletPatterns),
    projectiles: indexBy("projectileId", projectiles),
    equipment: indexBy("equipmentId", equipment),
    effects: indexBy("effectId", effects),
    conditions: indexBy("conditionId", conditions),
    missionVisualProfiles: indexBy(
      "visualProfileId",
      missionVisualProfileCollection.profiles,
    ),
    bulletVisualRoles: indexBy(
      "visualRole",
      bulletVisualRoleCollection.roles,
    ),
    visuals: createDefaultVisuals(collectVisualPresetIds(missions, enemies, projectiles)),
    hitboxes: filterHitboxes(collectHitboxPresetIds(enemies, projectiles)),
    themes: createDefaultThemes(areas.map((area) => area.themeId)),
    presentationCues: filterPresentationCues([
      "system.boot.message",
      "system.reboot.sequence",
      "system.reboot.settle",
      "tutorial.restriction.enter",
      "tutorial.restriction.release",
      "explore.player.trail",
      "transmission.connect.sequence",
      "warp.transition.sequence",
      "battle.player.hit",
      "battle.noise.peak",
      "battle.noise.clear",
      "battle.invincible.start",
    ]),
    difficultyModifiers: createDefaultDifficultyModifiers(),
  }

  validateBundle(bundle)
  cachedBundle = bundle
  return bundle
}

function collectVisualPresetIds(
  missions: MissionMaster[],
  enemies: EnemyArchetype[],
  projectiles: ProjectileSpec[],
): VisualPresetId[] {
  const ids = new Set<VisualPresetId>()

  for (const mission of missions) {
    ids.add(mission.backgroundPresetId)
    for (const hazard of mission.hazards) {
      ids.add(hazard.visualPresetId)
    }
  }

  for (const enemy of enemies) {
    ids.add(enemy.visualPresetId)
  }

  for (const projectile of projectiles) {
    ids.add(projectile.visualPresetId)
  }

  return [...ids]
}

function collectHitboxPresetIds(
  enemies: EnemyArchetype[],
  projectiles: ProjectileSpec[],
): HitboxPresetId[] {
  const ids = new Set<HitboxPresetId>(["hitbox_player_core"])

  for (const enemy of enemies) {
    ids.add(enemy.hitboxPresetId)
  }

  for (const projectile of projectiles) {
    ids.add(projectile.hitboxPresetId)
  }

  return [...ids]
}

function filterHitboxes(ids: HitboxPresetId[]) {
  const hitboxes = createDefaultHitboxes()
  const filtered: Record<string, (typeof hitboxes)[string]> = {}

  for (const id of ids) {
    const hitbox = hitboxes[id]
    if (hitbox) {
      filtered[id] = hitbox
    }
  }

  return filtered
}

function filterPresentationCues(ids: PresentationCueId[]) {
  const cues = createDefaultPresentationCues()
  const filtered: Record<string, (typeof cues)[string]> = {}

  for (const id of ids) {
    filtered[id] = cues[id]
  }

  return filtered
}

function validateVisualCollectionMetadata(
  missionVisualProfileCollection: MissionVisualProfileCollection,
  bulletVisualRoleCollection: BulletVisualRoleCollection,
): void {
  // visual-presets は runtime bundle の一部として扱うため、support file のままなら起動時に止めます。
  if (String(missionVisualProfileCollection.kind) !== "missionVisualProfiles") {
    throw new Error("Invalid mission visual profile collection kind.")
  }
  if (Number(missionVisualProfileCollection.schemaVersion) !== 1) {
    throw new Error("Unsupported mission visual profile schemaVersion.")
  }
  if (String(missionVisualProfileCollection.runtimeStatus) !== "runtimeData") {
    throw new Error("Mission visual profiles must be marked as runtimeData.")
  }
  if (String(bulletVisualRoleCollection.kind) !== "bulletVisualRoles") {
    throw new Error("Invalid bullet visual role collection kind.")
  }
  if (Number(bulletVisualRoleCollection.schemaVersion) !== 1) {
    throw new Error("Unsupported bullet visual role schemaVersion.")
  }
  if (String(bulletVisualRoleCollection.runtimeStatus) !== "runtimeData") {
    throw new Error("Bullet visual roles must be marked as runtimeData.")
  }
}

function validateBundle(bundle: ContentBundle): void {
  const validSpawnPointIds = new Set([
    "spawn_player_center",
    "spawn_top_left",
    "spawn_top_center",
    "spawn_top_right",
    "spawn_mid_left",
    "spawn_mid_right",
    "spawn_side_left",
    "spawn_side_right",
  ])
  const validNodeIds = new Set<string>()
  const areaMapIds = new Set<string>()

  validateMissionVisualProfiles(bundle)
  validateBulletVisualRoles(bundle)

  for (const mapLogic of Object.values(bundle.mapLogic)) {
    for (const node of [
      ...mapLogic.areaNodes,
      ...mapLogic.transmissionNodes,
      ...mapLogic.warpNodes,
      ...mapLogic.collectibleNodes,
    ]) {
      validNodeIds.add(node.nodeId)
    }
  }

  for (const area of Object.values(bundle.areas)) {
    areaMapIds.add(area.mapId)
    if (!bundle.mapLogic[area.mapId]) {
      throw new Error(`Missing map ${area.mapId} for area ${area.areaId}.`)
    }
    assertConditionExists(bundle, area.unlockConditionId, `area ${area.areaId}`)
    assertConditionExists(bundle, area.visibilityConditionId, `area ${area.areaId}`)

    for (const transmissionId of area.transmissionIds) {
      const transmission = bundle.transmissions[transmissionId]
      if (!transmission) {
        throw new Error(`Missing transmission ${transmissionId} for area ${area.areaId}.`)
      }
      if (transmission.areaId !== area.areaId) {
        throw new Error(
          `Transmission ${transmissionId} belongs to ${transmission.areaId}, expected ${area.areaId}.`,
        )
      }
    }
  }

  // 現行の探索は 1 枚の連続マップ前提です。別 mapId を混ぜると移動・表示・進行の前提が崩れます。
  if (areaMapIds.size > 1) {
    throw new Error(`Expected a single shared world map, found ${areaMapIds.size} mapIds.`)
  }

  for (const transmission of Object.values(bundle.transmissions)) {
    const area = bundle.areas[transmission.areaId]
    if (!area) {
      throw new Error(
        `Missing area ${transmission.areaId} for transmission ${transmission.transmissionId}.`,
      )
    }
    if (!area.transmissionIds.includes(transmission.transmissionId)) {
      throw new Error(
        `Area ${area.areaId} does not list transmission ${transmission.transmissionId}.`,
      )
    }

    assertConditionExists(
      bundle,
      transmission.visibilityConditionId,
      `transmission ${transmission.transmissionId}`,
    )
    assertConditionExists(
      bundle,
      transmission.accessConditionId,
      `transmission ${transmission.transmissionId}`,
    )
    assertConditionExists(
      bundle,
      transmission.unlockConditionId,
      `transmission ${transmission.transmissionId}`,
    )
    if (!bundle.missions[transmission.missionId]) {
      throw new Error(
        `Missing mission ${transmission.missionId} for transmission ${transmission.transmissionId}.`,
      )
    }

    for (const rewardEquipmentId of transmission.rewardEquipmentIds ?? []) {
      if (!bundle.equipment[rewardEquipmentId]) {
        throw new Error(
          `Missing reward equipment ${rewardEquipmentId} for transmission ${transmission.transmissionId}.`,
        )
      }
    }

    let previousChunkEndMs = -Infinity
    for (const chunkId of transmission.transcriptChunkIds) {
      const chunk = bundle.transcriptChunks[chunkId]
      if (!chunk) {
        throw new Error(`Missing transcript chunk ${chunkId} for transmission ${transmission.transmissionId}.`)
      }

      if (chunk.transmissionId !== transmission.transmissionId) {
        throw new Error(
          `Transcript chunk ${chunkId} belongs to ${chunk.transmissionId}, expected ${transmission.transmissionId}.`,
        )
      }
      if (chunk.endMs <= chunk.startMs) {
        throw new Error(`Transcript chunk ${chunkId} must have endMs greater than startMs.`)
      }
      if (chunk.startMs < previousChunkEndMs) {
        throw new Error(`Transcript chunk ${chunkId} overlaps previous chunk in ${transmission.transmissionId}.`)
      }
      previousChunkEndMs = chunk.endMs
    }
  }

  const activeEnemyIds = new Set<string>()
  const activeBulletPatternIds = new Set<string>()

  for (const mission of Object.values(bundle.missions)) {
    assertConditionExists(bundle, mission.visibilityConditionId, `mission ${mission.missionId}`)
    assertConditionExists(bundle, mission.startConditionId, `mission ${mission.missionId}`)
    if (!bundle.transmissions[mission.transmissionId]) {
      throw new Error(
        `Missing transmission ${mission.transmissionId} for mission ${mission.missionId}.`,
      )
    }
    if (!mission.visualProfileId) {
      throw new Error(`Missing visualProfileId for active mission ${mission.missionId}.`)
    }
    const missionVisualProfile = bundle.missionVisualProfiles[mission.visualProfileId]
    if (!missionVisualProfile) {
      throw new Error(
        `Missing mission visual profile ${mission.visualProfileId} for mission ${mission.missionId}.`,
      )
    }
    if (!missionVisualProfile.missionIds.includes(mission.missionId)) {
      throw new Error(
        `Mission visual profile ${mission.visualProfileId} does not list mission ${mission.missionId}.`,
      )
    }

    if (!validSpawnPointIds.has(mission.playerSpawnId)) {
      throw new Error(
        `Unsupported player spawn ${mission.playerSpawnId} in mission ${mission.missionId}.`,
      )
    }

    for (const wave of mission.waves) {
      for (const entry of wave.entries) {
        if (!bundle.enemies[entry.enemyId]) {
          throw new Error(
            `Missing enemy ${entry.enemyId} in mission ${mission.missionId}.`,
          )
        }
        activeEnemyIds.add(entry.enemyId)
        if (!validSpawnPointIds.has(entry.spawnPointId)) {
          throw new Error(
            `Unsupported enemy spawn ${entry.spawnPointId} in mission ${mission.missionId}.`,
          )
        }
        for (const key of Object.keys(entry.overrides ?? {})) {
          if (!SUPPORTED_ENEMY_OVERRIDE_KEYS.has(key)) {
            throw new Error(
              `Unsupported enemy override ${key} in mission ${mission.missionId}.`,
            )
          }
        }
      }
    }

    for (const hazard of mission.hazards) {
      assertConditionExists(bundle, hazard.visibilityConditionId, `hazard ${hazard.hazardId}`)
      if (hazard.area.width <= 0 || hazard.area.height <= 0) {
        throw new Error(`Hazard ${hazard.hazardId} in mission ${mission.missionId} has invalid area.`)
      }
      if (
        hazard.motion.motionKind === "linear" &&
        !Number.isFinite(hazard.motion.velocity.x + hazard.motion.velocity.y)
      ) {
        throw new Error(`Hazard ${hazard.hazardId} in mission ${mission.missionId} has invalid velocity.`)
      }
    }
  }

  for (const enemy of Object.values(bundle.enemies)) {
    if (!SUPPORTED_ENEMY_BEHAVIOR_KINDS.has(enemy.behaviorKind)) {
      throw new Error(`Unsupported behavior ${enemy.behaviorKind} for enemy ${enemy.enemyId}.`)
    }
    if (enemy.staged && activeEnemyIds.has(enemy.enemyId)) {
      throw new Error(`Staged enemy ${enemy.enemyId} is referenced by an active mission.`)
    }
    for (const bulletPatternId of enemy.bulletPatternIds) {
      if (!bundle.bulletPatterns[bulletPatternId]) {
        throw new Error(
          `Missing bullet pattern ${bulletPatternId} for enemy ${enemy.enemyId}.`,
        )
      }
      // active mission から到達する pattern を記録し、staged 誤参照を検出します。
      if (activeEnemyIds.has(enemy.enemyId)) {
        activeBulletPatternIds.add(bulletPatternId)
      }
    }
  }

  for (const bulletPattern of Object.values(bundle.bulletPatterns)) {
    if (bulletPattern.staged && activeBulletPatternIds.has(bulletPattern.bulletPatternId)) {
      throw new Error(
        `Staged bullet pattern ${bulletPattern.bulletPatternId} is used by an active enemy.`,
      )
    }
    if (activeBulletPatternIds.has(bulletPattern.bulletPatternId)) {
      if (!bulletPattern.visualRole) {
        throw new Error(
          `Missing visualRole for active bullet pattern ${bulletPattern.bulletPatternId}.`,
        )
      }
      const visualRole = bundle.bulletVisualRoles[bulletPattern.visualRole]
      if (!visualRole) {
        throw new Error(
          `Missing bullet visual role ${bulletPattern.visualRole} for active pattern ${bulletPattern.bulletPatternId}.`,
        )
      }
      if (!visualRole.bulletPatternIds.includes(bulletPattern.bulletPatternId)) {
        throw new Error(
          `Bullet visual role ${bulletPattern.visualRole} does not list active pattern ${bulletPattern.bulletPatternId}.`,
        )
      }
      if (!visualRole.projectileIds.includes(bulletPattern.projectileId)) {
        throw new Error(
          `Bullet visual role ${bulletPattern.visualRole} does not list projectile ${bulletPattern.projectileId}.`,
        )
      }
    }
    if (!SUPPORTED_BULLET_PATTERN_KINDS.has(bulletPattern.patternKind)) {
      throw new Error(
        `Unsupported pattern kind ${bulletPattern.patternKind} for ${bulletPattern.bulletPatternId}.`,
      )
    }
    if (!bundle.projectiles[bulletPattern.projectileId]) {
      throw new Error(
        `Missing projectile ${bulletPattern.projectileId} for pattern ${bulletPattern.bulletPatternId}.`,
      )
    }
  }

  for (const equipment of Object.values(bundle.equipment)) {
    if (!equipment.summary?.trim()) {
      throw new Error(`Missing summary for equipment ${equipment.equipmentId}.`)
    }

    assertConditionExists(bundle, equipment.unlockConditionId, `equipment ${equipment.equipmentId}`)
    assertConditionExists(
      bundle,
      equipment.visibilityConditionId,
      `equipment ${equipment.equipmentId}`,
    )

    if (
      equipment.unlockSource.kind === "transmissionReward" &&
      !bundle.transmissions[equipment.unlockSource.transmissionId]
    ) {
      throw new Error(
        `Missing transmission ${equipment.unlockSource.transmissionId} for equipment ${equipment.equipmentId}.`,
      )
    }

    if (
      equipment.unlockSource.kind === "mapPickup" &&
      !validNodeIds.has(equipment.unlockSource.nodeId)
    ) {
      throw new Error(
        `Missing collectible node ${equipment.unlockSource.nodeId} for equipment ${equipment.equipmentId}.`,
      )
    }

    for (const effectId of [...equipment.passiveEffectIds, ...equipment.activeEffectIds]) {
      if (!bundle.effects[effectId]) {
        throw new Error(
          `Missing effect ${effectId} for equipment ${equipment.equipmentId}.`,
        )
      }
    }
  }

  for (const mapLogic of Object.values(bundle.mapLogic)) {
    for (const node of mapLogic.areaNodes) {
      if (!bundle.areas[node.areaId]) {
        throw new Error(`Missing area ${node.areaId} for node ${node.nodeId}.`)
      }
      assertConditionExists(bundle, node.visibilityConditionId, `node ${node.nodeId}`)
    }

    for (const node of mapLogic.transmissionNodes) {
      if (!bundle.transmissions[node.transmissionId]) {
        throw new Error(`Missing transmission ${node.transmissionId} for node ${node.nodeId}.`)
      }
      if (!bundle.areas[node.areaId]) {
        throw new Error(`Missing area ${node.areaId} for node ${node.nodeId}.`)
      }
      assertConditionExists(bundle, node.visibilityConditionId, `node ${node.nodeId}`)
      assertConditionExists(bundle, node.accessConditionId, `node ${node.nodeId}`)
    }

    for (const node of mapLogic.warpNodes) {
      if (!bundle.areas[node.areaId]) {
        throw new Error(`Missing area ${node.areaId} for node ${node.nodeId}.`)
      }
      if (!bundle.areas[node.warpTargetAreaId]) {
        throw new Error(`Missing warp target area ${node.warpTargetAreaId} for node ${node.nodeId}.`)
      }
      assertConditionExists(bundle, node.visibilityConditionId, `node ${node.nodeId}`)
      assertConditionExists(bundle, node.accessConditionId, `node ${node.nodeId}`)
    }

    for (const node of mapLogic.collectibleNodes) {
      if (!bundle.areas[node.areaId]) {
        throw new Error(`Missing area ${node.areaId} for node ${node.nodeId}.`)
      }
      if (node.collectibleKind === "hiddenEquipment" && node.equipmentId && !bundle.equipment[node.equipmentId]) {
        throw new Error(`Missing equipment ${node.equipmentId} for collectible ${node.nodeId}.`)
      }
      assertConditionExists(bundle, node.visibilityConditionId, `node ${node.nodeId}`)
    }
  }

  for (const condition of Object.values(bundle.conditions)) {
    switch (condition.kind) {
      case "always":
      case "flagSet":
      case "saveSlotUsed":
        break
      case "all":
      case "any":
        for (const childId of condition.children) {
          assertConditionExists(bundle, childId, `condition ${condition.conditionId}`)
        }
        break
      case "not":
        assertConditionExists(bundle, condition.child, `condition ${condition.conditionId}`)
        break
      case "equipmentEquipped":
        if (condition.equipmentId && !bundle.equipment[condition.equipmentId]) {
          throw new Error(
            `Missing equipment ${condition.equipmentId} for condition ${condition.conditionId}.`,
          )
        }
        break
      case "missionCleared":
        if (!bundle.missions[condition.missionId]) {
          throw new Error(
            `Missing mission ${condition.missionId} for condition ${condition.conditionId}.`,
          )
        }
        break
      case "areaDiscovered":
        if (!bundle.areas[condition.areaId]) {
          throw new Error(
            `Missing area ${condition.areaId} for condition ${condition.conditionId}.`,
          )
        }
        break
      case "analysisAtLeast":
      case "restorationAtLeast":
        if (!bundle.transmissions[condition.transmissionId]) {
          throw new Error(
            `Missing transmission ${condition.transmissionId} for condition ${condition.conditionId}.`,
          )
        }
        break
      case "collectibleCollected":
        if (!validNodeIds.has(condition.nodeId)) {
          throw new Error(
            `Missing node ${condition.nodeId} for condition ${condition.conditionId}.`,
          )
        }
        break
    }
  }
}

function validateMissionVisualProfiles(bundle: ContentBundle): void {
  const profileByMissionId = new Map<MissionId, MissionVisualProfile>()

  for (const profile of Object.values(bundle.missionVisualProfiles)) {
    if (profile.missionIds.length === 0) {
      throw new Error(`Mission visual profile ${profile.visualProfileId} must list at least one mission.`)
    }
    assertFiniteVisualTuningValue(
      profile.carrierDensity,
      `carrierDensity for mission visual profile ${profile.visualProfileId}`,
    )
    assertFiniteVisualTuningValue(
      profile.memoryTone,
      `memoryTone for mission visual profile ${profile.visualProfileId}`,
    )
    assertFiniteVisualTuningValue(
      profile.dangerTone,
      `dangerTone for mission visual profile ${profile.visualProfileId}`,
    )
    assertFiniteVisualTuningValue(
      profile.backgroundSink,
      `backgroundSink for mission visual profile ${profile.visualProfileId}`,
    )

    for (const missionId of profile.missionIds) {
      if (!bundle.missions[missionId]) {
        throw new Error(
          `Mission visual profile ${profile.visualProfileId} references missing mission ${missionId}.`,
        )
      }
      const existingProfile = profileByMissionId.get(missionId)
      if (existingProfile) {
        throw new Error(
          `Mission ${missionId} is listed by both visual profiles ${existingProfile.visualProfileId} and ${profile.visualProfileId}.`,
        )
      }
      profileByMissionId.set(missionId, profile)
    }
  }
}

function validateBulletVisualRoles(bundle: ContentBundle): void {
  const patternRoleById = new Map<string, ProjectileVisualRole>()

  for (const bulletVisualRole of Object.values(bundle.bulletVisualRoles)) {
    if (!bulletVisualRole) {
      continue
    }
    validateBulletVisualRole(bundle, bulletVisualRole, patternRoleById)
  }
}

function validateBulletVisualRole(
  bundle: ContentBundle,
  bulletVisualRole: BulletVisualRoleSpec,
  patternRoleById: Map<string, ProjectileVisualRole>,
): void {
  if (bulletVisualRole.projectileIds.length === 0) {
    throw new Error(`Bullet visual role ${bulletVisualRole.visualRole} must list at least one projectile.`)
  }
  if (bulletVisualRole.bulletPatternIds.length === 0) {
    throw new Error(`Bullet visual role ${bulletVisualRole.visualRole} must list at least one bullet pattern.`)
  }
  assertFiniteVisualTuningValue(
    bulletVisualRole.seedBucket,
    `seedBucket for bullet visual role ${bulletVisualRole.visualRole}`,
  )
  assertFiniteVisualTuningValue(
    bulletVisualRole.scale,
    `scale for bullet visual role ${bulletVisualRole.visualRole}`,
  )
  assertFiniteVisualTuningValue(
    bulletVisualRole.glowStrength,
    `glowStrength for bullet visual role ${bulletVisualRole.visualRole}`,
  )

  for (const projectileId of bulletVisualRole.projectileIds) {
    if (!bundle.projectiles[projectileId]) {
      throw new Error(
        `Bullet visual role ${bulletVisualRole.visualRole} references missing projectile ${projectileId}.`,
      )
    }
  }

  for (const bulletPatternId of bulletVisualRole.bulletPatternIds) {
    const bulletPattern = bundle.bulletPatterns[bulletPatternId]
    if (!bulletPattern) {
      throw new Error(
        `Bullet visual role ${bulletVisualRole.visualRole} references missing pattern ${bulletPatternId}.`,
      )
    }
    if (bulletPattern.visualRole !== bulletVisualRole.visualRole) {
      throw new Error(
        `Bullet pattern ${bulletPatternId} declares visualRole ${bulletPattern.visualRole ?? "<missing>"}, expected ${bulletVisualRole.visualRole}.`,
      )
    }
    if (!bulletVisualRole.projectileIds.includes(bulletPattern.projectileId)) {
      throw new Error(
        `Bullet visual role ${bulletVisualRole.visualRole} does not list projectile ${bulletPattern.projectileId} used by ${bulletPatternId}.`,
      )
    }

    const existingRole = patternRoleById.get(bulletPatternId)
    if (existingRole) {
      throw new Error(
        `Bullet pattern ${bulletPatternId} is listed by both visual roles ${existingRole} and ${bulletVisualRole.visualRole}.`,
      )
    }
    patternRoleById.set(bulletPatternId, bulletVisualRole.visualRole)
  }
}

function assertFiniteVisualTuningValue(value: number, label: string): void {
  // JSON 由来の数値は描画計算へ直接渡るため、NaN や Infinity を bundle 作成時点で止めます。
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${label}.`)
  }
}

function assertConditionExists(
  bundle: ContentBundle,
  conditionId: ConditionId | undefined,
  ownerLabel: string,
): void {
  if (!conditionId) {
    return
  }

  if (!bundle.conditions[conditionId]) {
    throw new Error(`Missing condition ${conditionId} for ${ownerLabel}.`)
  }
}

function indexBy<
  Item extends Record<Key, string>,
  Key extends keyof Item,
>(
  key: Key,
  items: Item[],
): Record<Item[Key] & string, Item> {
  const indexed: Record<string, Item> = {}

  for (const item of items) {
    const id = item[key]
    if (indexed[id]) {
      throw new Error(`Duplicate content id detected: ${id}`)
    }
    indexed[id] = item
  }

  return indexed as Record<Item[Key] & string, Item>
}

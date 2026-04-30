import {
  BULLET_PATTERN_KINDS,
  ENEMY_BEHAVIOR_KINDS,
  ENEMY_OVERRIDE_KEYS,
  type AreaMaster,
  type BackgroundPreset,
  type BulletPattern,
  type ConditionId,
  type ConditionSpec,
  type ContentBundle,
  type ContentHitboxPreset,
  type ContentLifecycle,
  type ContentVisualPreset,
  type EffectId,
  type EffectSpec,
  type EnemyArchetype,
  type EnemyId,
  type EquipmentId,
  type EquipmentMaster,
  type MapId,
  type MissionId,
  type MissionMaster,
  type ProjectileId,
  type ProjectileSpec,
  type PresentationCueSpec,
  type TranscriptChunk,
  type TranscriptChunkId,
  type TransmissionId,
  type TransmissionMaster,
  type WorldMapLogic,
} from "@magnolia/contracts"
import { contentManifest } from "./generated/content-manifest"
import {
  createDefaultDifficultyModifiers,
  createDefaultPlayerShipSpec,
  createDefaultThemes,
} from "./defaults"

let cachedBundle: ContentBundle | null = null
// mission ごとの差は content 側の調整で吸収し、runtime へ専用分岐を増やし過ぎないための許可一覧です。
// frontend / art チームが敵配置や hazard を触る時は、まずこの generic schema の範囲で表現します。
const SUPPORTED_ENEMY_BEHAVIOR_KINDS: ReadonlySet<string> = new Set(ENEMY_BEHAVIOR_KINDS)
const SUPPORTED_BULLET_PATTERN_KINDS: ReadonlySet<string> = new Set(BULLET_PATTERN_KINDS)
const SUPPORTED_ENEMY_OVERRIDE_KEYS: ReadonlySet<string> = new Set(ENEMY_OVERRIDE_KEYS)

export function loadContentBundle(): ContentBundle {
  if (cachedBundle) {
    return cachedBundle
  }

  const contentLifecycle =
    contentManifest.contentClassification as Partial<Record<ContentLifecycle, Record<string, string[]>>>
  // authoring 用 manifest は全 JSON を持ち、runtime bundle は active lifecycle のみを採用します。
  // prototype / deprecated は validator で参照確認しつつ、通常の session 経路へ混ぜません。
  const areas = manifestItems<AreaMaster>(contentManifest.areas)
  const missions = filterActive(
    manifestItems<MissionMaster>(contentManifest.missions),
    "missions",
    "missionId",
    contentLifecycle,
  )
  const transmissions = manifestItems<TransmissionMaster>(contentManifest.transmissions)
  const transcriptChunks = manifestItems<TranscriptChunk>(contentManifest.transcriptChunks)
  const mapLogic = manifestItems<WorldMapLogic>(contentManifest.mapLogic)
  const enemies = filterActive(
    manifestItems<EnemyArchetype>(contentManifest.enemies),
    "enemies",
    "enemyId",
    contentLifecycle,
  )
  const bulletPatterns = filterActive(
    manifestItems<BulletPattern>(contentManifest.bulletPatterns),
    "bulletPatterns",
    "bulletPatternId",
    contentLifecycle,
  )
  const projectiles = filterActive(
    manifestItems<ProjectileSpec>(contentManifest.projectiles),
    "projectiles",
    "projectileId",
    contentLifecycle,
  )
  const equipment = manifestItems<EquipmentMaster>(contentManifest.equipment)
  const effects = manifestItems<EffectSpec>(contentManifest.effects)
  const conditions = manifestItems<ConditionSpec>(contentManifest.conditions)
  const contentVisualPresets = manifestItems<ContentVisualPreset>(contentManifest.visualPresets)
  const contentHitboxPresets = manifestItems<ContentHitboxPreset>(contentManifest.hitboxPresets)
  const backgroundPresets = manifestItems<BackgroundPreset>(contentManifest.backgroundPresets)
  const presentationCues = manifestItems<PresentationCueSpec>(contentManifest.presentationCues)

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
    contentVisualPresets: indexBy("presetId", contentVisualPresets),
    contentHitboxPresets: indexBy("presetId", contentHitboxPresets),
    backgroundPresets: indexBy("presetId", backgroundPresets),
    contentLifecycle,
    themes: createDefaultThemes(areas.map((area) => area.themeId)),
    presentationCues: indexBy("id", presentationCues),
    difficultyModifiers: createDefaultDifficultyModifiers(),
  }

  validateBundle(bundle)
  cachedBundle = bundle
  return bundle
}

function manifestItems<Item>(items: readonly unknown[]): Item[] {
  return [...items] as Item[]
}

function filterActive<
  Item extends Record<Key, string>,
  Key extends keyof Item,
>(
  items: Item[],
  lifecycleKey: string,
  idKey: Key,
  lifecycle: Partial<Record<ContentLifecycle, Record<string, string[]>>>,
): Item[] {
  const activeIds = new Set(lifecycle.active?.[lifecycleKey] ?? [])
  if (activeIds.size === 0) {
    throw new Error(`Missing active lifecycle entries for ${lifecycleKey}.`)
  }

  return items.filter((item) => activeIds.has(item[idKey]))
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

  validatePresetCoverage(bundle)

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

  for (const mission of Object.values(bundle.missions)) {
    assertConditionExists(bundle, mission.visibilityConditionId, `mission ${mission.missionId}`)
    assertConditionExists(bundle, mission.startConditionId, `mission ${mission.missionId}`)
    if (!bundle.transmissions[mission.transmissionId]) {
      throw new Error(
        `Missing transmission ${mission.transmissionId} for mission ${mission.missionId}.`,
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
    for (const bulletPatternId of enemy.bulletPatternIds) {
      if (!bundle.bulletPatterns[bulletPatternId]) {
        throw new Error(
          `Missing bullet pattern ${bulletPatternId} for enemy ${enemy.enemyId}.`,
        )
      }
    }
  }

  for (const bulletPattern of Object.values(bundle.bulletPatterns)) {
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

function validatePresetCoverage(bundle: ContentBundle): void {
  if (!bundle.contentVisualPresets || !bundle.contentHitboxPresets || !bundle.backgroundPresets) {
    throw new Error("Content preset tables must be loaded from content/gameplay preset JSON.")
  }

  for (const mission of Object.values(bundle.missions)) {
    if (!bundle.backgroundPresets[mission.backgroundPresetId]) {
      throw new Error(`Missing background preset ${mission.backgroundPresetId} for mission ${mission.missionId}.`)
    }
    for (const hazard of mission.hazards) {
      if (!bundle.contentVisualPresets[hazard.visualPresetId]) {
        throw new Error(`Missing hazard visual preset ${hazard.visualPresetId} for hazard ${hazard.hazardId}.`)
      }
    }
  }

  for (const enemy of Object.values(bundle.enemies)) {
    if (!bundle.contentVisualPresets[enemy.visualPresetId]) {
      throw new Error(`Missing enemy visual preset ${enemy.visualPresetId} for enemy ${enemy.enemyId}.`)
    }
    if (!bundle.contentHitboxPresets[enemy.hitboxPresetId]) {
      throw new Error(`Missing enemy hitbox preset ${enemy.hitboxPresetId} for enemy ${enemy.enemyId}.`)
    }
  }

  for (const projectile of Object.values(bundle.projectiles)) {
    if (!bundle.contentVisualPresets[projectile.visualPresetId]) {
      throw new Error(`Missing projectile visual preset ${projectile.visualPresetId} for projectile ${projectile.projectileId}.`)
    }
    if (!bundle.contentHitboxPresets[projectile.hitboxPresetId]) {
      throw new Error(`Missing projectile hitbox preset ${projectile.hitboxPresetId} for projectile ${projectile.projectileId}.`)
    }
  }

  for (const cue of Object.values(bundle.presentationCues)) {
    if (!cue.reduceFlashingVariant) {
      throw new Error(`Presentation cue ${cue.id} must define reduceFlashingVariant.`)
    }
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

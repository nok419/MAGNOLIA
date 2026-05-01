import {
  BATTLE_FIELD_HEIGHT,
  BATTLE_FIELD_WIDTH,
  BATTLE_SPAWN_OUTER_MARGIN,
  BATTLE_SPAWN_POINT_SIDES,
  BULLET_PATTERN_AUTHORING_PARAM_KEYS,
  BULLET_PATTERN_KINDS,
  ENEMY_BEHAVIOR_KINDS,
  ENEMY_OVERRIDE_KEYS,
  MOVEMENT_PATTERN_KINDS,
  type AreaMaster,
  type BackgroundPreset,
  type BattleSpawnPoint,
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
  type EnemySpawn,
  type EnemyWave,
  type EquipmentId,
  type EquipmentMaster,
  type MapId,
  type MissionId,
  type MissionMaster,
  type MovementPattern,
  type ProjectileId,
  type ProjectileSpec,
  type PresentationCueSpec,
  type TranscriptChunk,
  type TranscriptChunkMigration,
  type TranscriptChunkId,
  type TransmissionId,
  type TransmissionMaster,
  type WorldMapLogic,
} from "@magnolia/contracts"
import migratedIdMapJson from "../../../content/gameplay/migrated-id-map.json"
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
const SUPPORTED_BULLET_PATTERN_PARAM_KEYS: ReadonlySet<string> = new Set(BULLET_PATTERN_AUTHORING_PARAM_KEYS)
const SUPPORTED_BATTLE_SPAWN_POINT_SIDES: ReadonlySet<string> = new Set(BATTLE_SPAWN_POINT_SIDES)
const SUPPORTED_MOVEMENT_PATTERN_KINDS: ReadonlySet<string> = new Set(MOVEMENT_PATTERN_KINDS)
const AUDIO_DURATION_TOLERANCE_MS = 1200

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
    manifestItems<Partial<MissionMaster> & Record<string, unknown>>(contentManifest.missions)
      .map(normalizeMission),
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
  const battleSpawnPoints = manifestItems<BattleSpawnPoint>(contentManifest.battleSpawnPoints)
  const movementPatterns = filterActive(
    manifestItems<MovementPattern>(contentManifest.movementPatterns),
    "movementPatterns",
    "movementPatternId",
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
    transcriptChunkMigrations: readTranscriptChunkMigrations(migratedIdMapJson),
    missions: indexBy("missionId", missions),
    battleSpawnPoints: indexBy("spawnPointId", battleSpawnPoints),
    movementPatterns: indexBy("movementPatternId", movementPatterns),
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

function validateBattleSpawnPoint(spawnPoint: BattleSpawnPoint): void {
  if (!SUPPORTED_BATTLE_SPAWN_POINT_SIDES.has(spawnPoint.side)) {
    throw new Error(`Unsupported battle spawn point side ${spawnPoint.side} for ${spawnPoint.spawnPointId}.`)
  }
  if (!isFiniteRatio(spawnPoint.xRatio) || !isFiniteRatio(spawnPoint.yRatio)) {
    throw new Error(`Battle spawn point ${spawnPoint.spawnPointId} must use xRatio/yRatio between 0 and 1.`)
  }
  if (!Number.isFinite(spawnPoint.offsetX) || !Number.isFinite(spawnPoint.offsetY)) {
    throw new Error(`Battle spawn point ${spawnPoint.spawnPointId} has invalid offset.`)
  }

  const position = resolveSpawnPointPosition(spawnPoint)
  if (!isWithinBattlefieldMargin(position, BATTLE_SPAWN_OUTER_MARGIN)) {
    throw new Error(
      `Battle spawn point ${spawnPoint.spawnPointId} is outside the allowed ${BATTLE_SPAWN_OUTER_MARGIN}px margin.`,
    )
  }
}

function validateMovementPattern(pattern: MovementPattern): void {
  if (!SUPPORTED_MOVEMENT_PATTERN_KINDS.has(pattern.patternKind)) {
    throw new Error(`Unsupported movement pattern kind ${pattern.patternKind} for ${pattern.movementPatternId}.`)
  }

  switch (pattern.patternKind) {
    case "linear":
      assertPositiveNumber(pattern.speed, `movement pattern ${pattern.movementPatternId} speed`)
      assertOptionalFiniteNumber(pattern.driftX, `movement pattern ${pattern.movementPatternId} driftX`)
      assertOptionalFiniteNumber(pattern.driftY, `movement pattern ${pattern.movementPatternId} driftY`)
      break
    case "sineDrift":
      assertPositiveNumber(pattern.speed, `movement pattern ${pattern.movementPatternId} speed`)
      assertOptionalFiniteNumber(pattern.driftX, `movement pattern ${pattern.movementPatternId} driftX`)
      assertOptionalFiniteNumber(pattern.driftY, `movement pattern ${pattern.movementPatternId} driftY`)
      assertFiniteNumber(pattern.wobbleAmplitude, `movement pattern ${pattern.movementPatternId} wobbleAmplitude`)
      assertPositiveNumber(pattern.wobblePeriodMs, `movement pattern ${pattern.movementPatternId} wobblePeriodMs`)
      break
    case "pauseThenDrift":
      assertPositiveNumber(pattern.speed, `movement pattern ${pattern.movementPatternId} speed`)
      assertOptionalFiniteNumber(pattern.driftX, `movement pattern ${pattern.movementPatternId} driftX`)
      assertOptionalFiniteNumber(pattern.driftY, `movement pattern ${pattern.movementPatternId} driftY`)
      assertFiniteNumber(pattern.pauseAtY, `movement pattern ${pattern.movementPatternId} pauseAtY`)
      assertNonNegativeNumber(pattern.pauseMs, `movement pattern ${pattern.movementPatternId} pauseMs`)
      break
    case "bezierRoute": {
      assertPositiveNumber(pattern.durationMs, `movement pattern ${pattern.movementPatternId} durationMs`)
      if (!Array.isArray(pattern.points) || pattern.points.length < 2 || pattern.points.length > 4) {
        throw new Error(`Movement pattern ${pattern.movementPatternId} must define 2 to 4 bezier points.`)
      }
      for (const point of pattern.points) {
        assertPointWithinMargin(point, pattern.movementPatternId)
      }
      const lastPoint = pattern.points[pattern.points.length - 1]
      if (isInsideBattlefield(lastPoint)) {
        throw new Error(`Movement pattern ${pattern.movementPatternId} bezierRoute must end outside the visible field.`)
      }
      break
    }
    case "holdAndFade":
      assertNonNegativeNumber(pattern.holdMs, `movement pattern ${pattern.movementPatternId} holdMs`)
      assertPositiveNumber(pattern.fadeMs, `movement pattern ${pattern.movementPatternId} fadeMs`)
      assertOptionalFiniteNumber(pattern.driftX, `movement pattern ${pattern.movementPatternId} driftX`)
      assertOptionalFiniteNumber(pattern.driftY, `movement pattern ${pattern.movementPatternId} driftY`)
      break
  }
}

function validateSpawnPointReference(
  bundle: ContentBundle,
  spawnPointId: string,
  expectedSide: "player" | "noiseSource",
  owner: string,
): void {
  const spawnPoint = bundle.battleSpawnPoints[spawnPointId]
  if (!spawnPoint) {
    throw new Error(`Missing battle spawn point ${spawnPointId} referenced by ${owner}.`)
  }
  if (spawnPoint.side !== expectedSide && spawnPoint.side !== "shared") {
    const sideLabel = expectedSide === "player" ? "Player" : "Enemy"
    throw new Error(
      `${sideLabel} spawn point ${spawnPointId} has side ${spawnPoint.side}, expected ${expectedSide} or shared.`,
    )
  }
}

function assertMovementPatternExists(
  bundle: ContentBundle,
  movementPatternId: string | undefined,
  owner: string,
): void {
  if (movementPatternId && !bundle.movementPatterns[movementPatternId]) {
    throw new Error(`Missing movement pattern ${movementPatternId} referenced by ${owner}.`)
  }
}

function resolveSpawnPointPosition(spawnPoint: BattleSpawnPoint): { x: number; y: number } {
  return {
    x: Math.round(BATTLE_FIELD_WIDTH * spawnPoint.xRatio + spawnPoint.offsetX),
    y: Math.round(BATTLE_FIELD_HEIGHT * spawnPoint.yRatio + spawnPoint.offsetY),
  }
}

function isFiniteRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isWithinBattlefieldMargin(point: { x: number; y: number }, margin: number): boolean {
  return (
    point.x >= -margin &&
    point.x <= BATTLE_FIELD_WIDTH + margin &&
    point.y >= -margin &&
    point.y <= BATTLE_FIELD_HEIGHT + margin
  )
}

function isInsideBattlefield(point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.x <= BATTLE_FIELD_WIDTH && point.y >= 0 && point.y <= BATTLE_FIELD_HEIGHT
}

function assertPointWithinMargin(point: { x: number; y: number }, patternId: string): void {
  assertFiniteNumber(point.x, `movement pattern ${patternId} point.x`)
  assertFiniteNumber(point.y, `movement pattern ${patternId} point.y`)
  if (!isWithinBattlefieldMargin(point, BATTLE_SPAWN_OUTER_MARGIN)) {
    throw new Error(`Movement pattern ${patternId} point is outside the allowed battlefield margin.`)
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`)
  }
}

function assertOptionalFiniteNumber(value: number | undefined, label: string): void {
  if (value !== undefined) {
    assertFiniteNumber(value, label)
  }
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than 0.`)
  }
}

function assertNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be 0 or greater.`)
  }
}

function normalizeMission(mission: Partial<MissionMaster> & Record<string, unknown>): MissionMaster {
  const missionId = typeof mission.missionId === "string" ? mission.missionId : "unknown_mission"
  const waves = Array.isArray(mission.waves) ? mission.waves : []

  return {
    ...(mission as MissionMaster),
    waves: waves.map((wave, waveIndex) => normalizeWave(missionId, wave, waveIndex)),
  }
}

function normalizeWave(missionId: string, wave: unknown, waveIndex: number): EnemyWave {
  const source = typeof wave === "object" && wave !== null ? wave as Partial<EnemyWave> : {}
  const waveId =
    typeof source.waveId === "string" && source.waveId.trim()
      ? source.waveId
      : `${missionId}:${source.atMs ?? 0}:${waveIndex}`
  const entries = Array.isArray(source.entries) ? source.entries : []

  return {
    ...(source as EnemyWave),
    waveId,
    entries: entries.map((entry, entryIndex) => normalizeSpawnEntry(missionId, waveId, entry, entryIndex)),
  }
}

function normalizeSpawnEntry(
  missionId: string,
  waveId: string,
  entry: unknown,
  entryIndex: number,
): EnemySpawn {
  const source = typeof entry === "object" && entry !== null ? entry as Partial<EnemySpawn> : {}
  const spawnId =
    typeof source.spawnId === "string" && source.spawnId.trim()
      ? source.spawnId
      : `${missionId}:${waveId}:${source.enemyId ?? "enemy"}:${source.spawnPointId ?? "spawn"}:${entryIndex}`

  return {
    ...(source as EnemySpawn),
    spawnId,
  }
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
  const validNodeIds = new Set<string>()
  const areaMapIds = new Set<string>()

  validatePresetCoverage(bundle)
  validateTranscriptChunkMigrations(bundle)

  for (const spawnPoint of Object.values(bundle.battleSpawnPoints)) {
    validateBattleSpawnPoint(spawnPoint)
  }

  for (const movementPattern of Object.values(bundle.movementPatterns)) {
    validateMovementPattern(movementPattern)
  }

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
    const linkedMission = bundle.missions[transmission.missionId]
    if (!linkedMission) {
      throw new Error(
        `Missing mission ${transmission.missionId} for transmission ${transmission.transmissionId}.`,
      )
    }
    if (linkedMission.transmissionId !== transmission.transmissionId) {
      throw new Error(
        `Transmission ${transmission.transmissionId} points to mission ${transmission.missionId}, but that mission points to ${linkedMission.transmissionId}.`,
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
    let maxChunkEndMs = 0
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
      maxChunkEndMs = Math.max(maxChunkEndMs, chunk.endMs)
    }

    if (transmission.audioAssetId) {
      if (!Number.isFinite(transmission.audioDurationMs) || (transmission.audioDurationMs ?? 0) <= 0) {
        throw new Error(`Transmission ${transmission.transmissionId} must define audioDurationMs when audioAssetId is set.`)
      }
      if ((transmission.audioDurationMs ?? 0) + AUDIO_DURATION_TOLERANCE_MS < maxChunkEndMs) {
        throw new Error(
          `Transmission ${transmission.transmissionId} audioDurationMs is shorter than transcript chunks.`,
        )
      }
    }
  }

  for (const mission of Object.values(bundle.missions)) {
    assertConditionExists(bundle, mission.visibilityConditionId, `mission ${mission.missionId}`)
    assertConditionExists(bundle, mission.startConditionId, `mission ${mission.missionId}`)
    const transmission = bundle.transmissions[mission.transmissionId]
    if (!transmission) {
      throw new Error(
        `Missing transmission ${mission.transmissionId} for mission ${mission.missionId}.`,
      )
    }
    if (transmission.missionId !== mission.missionId) {
      throw new Error(
        `Mission ${mission.missionId} points to transmission ${mission.transmissionId}, but that transmission points to ${transmission.missionId}.`,
      )
    }
    const missionTranscriptChunkIds = new Set(transmission.transcriptChunkIds)
    const transmissionDurationMs = Math.max(
      transmission.audioDurationMs ?? 0,
      ...transmission.transcriptChunkIds.map((chunkId) => bundle.transcriptChunks[chunkId]?.endMs ?? 0),
    )
    if (mission.audioStartDelayMs + transmissionDurationMs + mission.outroMs > mission.durationMs) {
      throw new Error(
        `Mission ${mission.missionId} duration does not contain audioStartDelayMs + transmission audio/chunks + outroMs.`,
      )
    }

    validateSpawnPointReference(bundle, mission.playerSpawnId, "player", `mission ${mission.missionId}`)

    for (const wave of mission.waves) {
      for (const entry of wave.entries) {
        if (!bundle.enemies[entry.enemyId]) {
          throw new Error(
            `Missing enemy ${entry.enemyId} in mission ${mission.missionId}.`,
          )
        }
        validateSpawnPointReference(
          bundle,
          entry.spawnPointId,
          "noiseSource",
          `mission ${mission.missionId}/${wave.waveId}/${entry.spawnId}`,
        )
        assertMovementPatternExists(
          bundle,
          entry.movementPatternId,
          `mission ${mission.missionId}/${wave.waveId}/${entry.spawnId}`,
        )
        for (const key of Object.keys(entry.overrides ?? {})) {
          if (!SUPPORTED_ENEMY_OVERRIDE_KEYS.has(key)) {
            throw new Error(
              `Unsupported enemy override ${key} in mission ${mission.missionId}.`,
            )
          }
        }
      }
    }

    const missionHazardIds = new Set(mission.hazards.map((hazard) => hazard.hazardId))
    for (const beat of mission.beatEvents ?? []) {
      if (beat.atMs < 0 || beat.durationMs < 0 || beat.atMs + beat.durationMs > mission.durationMs) {
        throw new Error(
          `Mission beat ${beat.beatId} in ${mission.missionId} is outside mission duration.`,
        )
      }
      for (const chunkId of beat.transcriptChunkIds) {
        const chunk = bundle.transcriptChunks[chunkId]
        if (!chunk) {
          throw new Error(
            `Missing transcript chunk ${chunkId} in mission beat ${mission.missionId}/${beat.beatId}.`,
          )
        }
        if (chunk.transmissionId !== mission.transmissionId || !missionTranscriptChunkIds.has(chunkId)) {
          throw new Error(
            `Mission beat ${mission.missionId}/${beat.beatId} references chunk ${chunkId} outside transmission ${mission.transmissionId}.`,
          )
        }
      }
      for (const enemyId of beat.relatedEnemyIds ?? []) {
        if (!bundle.enemies[enemyId]) {
          throw new Error(
            `Mission beat ${mission.missionId}/${beat.beatId} references missing enemy ${enemyId}.`,
          )
        }
      }
      for (const hazardId of beat.relatedHazardIds ?? []) {
        if (!missionHazardIds.has(hazardId)) {
          throw new Error(
            `Mission beat ${mission.missionId}/${beat.beatId} references missing hazard ${hazardId}.`,
          )
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
    assertMovementPatternExists(bundle, enemy.movementPatternId, `enemy ${enemy.enemyId}`)
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
    validateBulletPatternParams(bulletPattern)
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

    if (
      equipment.unlockSource.kind === "upgradeTransform" &&
      !bundle.equipment[equipment.unlockSource.sourceEquipmentId]
    ) {
      throw new Error(
        `Missing source equipment ${equipment.unlockSource.sourceEquipmentId} for equipment ${equipment.equipmentId}.`,
      )
    }

    for (const params of equipment.levelParams ?? []) {
      if (params.transformEquipmentId && !bundle.equipment[params.transformEquipmentId]) {
        throw new Error(
          `Missing transform equipment ${params.transformEquipmentId} for equipment ${equipment.equipmentId}.`,
        )
      }
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

function validateBulletPatternParams(bulletPattern: BulletPattern): void {
  for (const key of Object.keys(bulletPattern.params ?? {})) {
    if (!SUPPORTED_BULLET_PATTERN_PARAM_KEYS.has(key)) {
      throw new Error(
        `Unsupported bullet pattern param ${key} in ${bulletPattern.bulletPatternId}.`,
      )
    }
  }

  for (const key of ["baseAngleDeg", "rotationDegPerSec", "phaseOffsetDeg", "oscillationDeg", "oscillationMs", "spreadDeg"]) {
    const value = bulletPattern.params[key]
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`Bullet pattern ${bulletPattern.bulletPatternId}.${key} must be a finite number.`)
    }
  }
}

function readTranscriptChunkMigrations(source: unknown): TranscriptChunkMigration[] {
  if (!isRecord(source) || !Array.isArray(source.migrations)) {
    return []
  }

  return source.migrations
    .filter((migration): migration is Record<string, unknown> => isRecord(migration))
    .filter((migration) => migration.kind === "transcriptChunk")
    .map((migration) => ({
      kind: "transcriptChunk",
      transmissionId: String(migration.transmissionId ?? ""),
      fromChunkId: String(migration.fromChunkId ?? ""),
      toChunkIds: Array.isArray(migration.toChunkIds)
        ? migration.toChunkIds.filter((chunkId): chunkId is string => typeof chunkId === "string")
        : [],
      segments: Array.isArray(migration.segments)
        ? migration.segments
            .filter((segment): segment is Record<string, unknown> => isRecord(segment))
            .map((segment) => ({
              sourceStartRatio: readFiniteNumber(segment.sourceStartRatio, 0),
              sourceEndRatio: readFiniteNumber(segment.sourceEndRatio, 1),
              targetChunkId: String(segment.targetChunkId ?? ""),
              targetStartRatio: readFiniteNumber(segment.targetStartRatio, 0),
              targetEndRatio: readFiniteNumber(segment.targetEndRatio, 1),
            }))
        : undefined,
      reason: typeof migration.reason === "string" ? migration.reason : undefined,
    }))
}

function validateTranscriptChunkMigrations(bundle: ContentBundle): void {
  const migrationsByFromChunkId = new Map<TranscriptChunkId, TranscriptChunkMigration>()
  for (const migration of bundle.transcriptChunkMigrations) {
    if (!migration.fromChunkId) {
      throw new Error("Transcript chunk migration must declare fromChunkId.")
    }
    if (!bundle.transmissions[migration.transmissionId]) {
      throw new Error(`Transcript chunk migration ${migration.fromChunkId} references missing transmission ${migration.transmissionId}.`)
    }
    if (bundle.transcriptChunks[migration.fromChunkId]) {
      throw new Error(`Transcript chunk migration source ${migration.fromChunkId} still exists as a current chunk.`)
    }
    if (migration.toChunkIds.length === 0) {
      throw new Error(`Transcript chunk migration ${migration.fromChunkId} must declare at least one toChunkId.`)
    }
    if (migrationsByFromChunkId.has(migration.fromChunkId)) {
      throw new Error(`Duplicate transcript chunk migration for ${migration.fromChunkId}.`)
    }
    migrationsByFromChunkId.set(migration.fromChunkId, migration)

    for (const toChunkId of migration.toChunkIds) {
      const chunk = bundle.transcriptChunks[toChunkId]
      if (!chunk) {
        throw new Error(`Transcript chunk migration ${migration.fromChunkId} references missing target ${toChunkId}.`)
      }
      if (chunk.transmissionId !== migration.transmissionId) {
        throw new Error(
          `Transcript chunk migration ${migration.fromChunkId} target ${toChunkId} belongs to ${chunk.transmissionId}, expected ${migration.transmissionId}.`,
        )
      }
    }

    for (const segment of migration.segments ?? []) {
      if (!migration.toChunkIds.includes(segment.targetChunkId)) {
        throw new Error(`Transcript chunk migration ${migration.fromChunkId} segment targets ${segment.targetChunkId} outside toChunkIds.`)
      }
      validateMigrationRatio(segment.sourceStartRatio, segment.sourceEndRatio, `source range for ${migration.fromChunkId}`)
      validateMigrationRatio(segment.targetStartRatio, segment.targetEndRatio, `target range for ${migration.fromChunkId}/${segment.targetChunkId}`)
    }
  }

  for (const chunk of Object.values(bundle.transcriptChunks)) {
    for (const previousChunkId of chunk.previousChunkIds ?? []) {
      const migration = migrationsByFromChunkId.get(previousChunkId)
      if (!migration || !migration.toChunkIds.includes(chunk.chunkId)) {
        throw new Error(
          `Transcript chunk ${chunk.chunkId} declares previousChunkId ${previousChunkId}, but migrated-id-map.json has no matching transcriptChunk migration.`,
        )
      }
    }
  }
}

function validateMigrationRatio(startRatio: number, endRatio: number, owner: string): void {
  if (startRatio < 0 || startRatio > 1 || endRatio < 0 || endRatio > 1 || endRatio <= startRatio) {
    throw new Error(`Invalid transcript chunk migration ${owner}: ratios must be in ascending 0..1 range.`)
  }
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

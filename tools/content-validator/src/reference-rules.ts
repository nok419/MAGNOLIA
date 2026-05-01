import path from "node:path"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import {
  addIssue,
  addWarning,
  asArray,
  asNumber,
  asRecord,
  asString,
  getId,
  indexById,
  type ContentFile,
  type ValidationContext,
} from "./validate-content.js"
import {
  BATTLE_FIELD_HEIGHT,
  BATTLE_FIELD_WIDTH,
  BATTLE_SPAWN_OUTER_MARGIN,
  BATTLE_SPAWN_POINT_SIDES,
  ENEMY_OVERRIDE_KEYS,
  MOVEMENT_PATTERN_KINDS,
} from "./content-kinds.js"

const VALID_BATTLE_SPAWN_POINT_SIDES: ReadonlySet<string> = new Set(BATTLE_SPAWN_POINT_SIDES)
const VALID_MOVEMENT_PATTERN_KINDS: ReadonlySet<string> = new Set(MOVEMENT_PATTERN_KINDS)
const VALID_ENEMY_OVERRIDE_KEYS: ReadonlySet<string> = new Set(ENEMY_OVERRIDE_KEYS)

const ID_KEYS_BY_GROUP: Record<string, readonly string[]> = {
  areas: ["areaId"],
  missions: ["missionId"],
  transmissions: ["transmissionId", "chunkId"],
  enemies: ["enemyId"],
  "bullet-patterns": ["bulletPatternId"],
  projectiles: ["projectileId"],
  equipment: ["equipmentId"],
  "equipment/effects": ["effectId"],
  progression: ["conditionId"],
  "map-logic": ["mapId"],
  "battle-spawn-points": ["spawnPointId"],
  "movement-patterns": ["movementPatternId"],
  "visual-presets": ["presetId"],
  "hitbox-presets": ["presetId", "hitboxPresetId"],
  "background-presets": ["presetId"],
}

export function validateReferenceRules(context: ValidationContext): void {
  validateFileNameMatchesId(context)
  validateUniqueIds(context)

  const indexes = createIndexes(context)
  validateBattleSpawnPointDefinitions(context, indexes)
  validateMovementPatternDefinitions(context, indexes)
  validateAreaReferences(context, indexes)
  validateTransmissionReferences(context, indexes)
  validateTranscriptChunkMigrationReferences(context, indexes)
  validateMissionReferences(context, indexes)
  validateEnemyReferences(context, indexes)
  validateBulletPatternReferences(context, indexes)
  validateEquipmentReferences(context, indexes)
  validateMapReferences(context, indexes)
  validateConditionReferences(context, indexes)
  validateContentClassification(context, indexes)
  validateActiveLifecycleReferences(context, indexes)
  validateContentDirectoriesMatchDocs(context)
  validateGeneratedManifestMatchesContentFiles(context)
}

function createIndexes(context: ValidationContext) {
  return {
    areas: indexById(context.store.byGroup.areas ?? [], ["areaId"]),
    missions: indexById(context.store.byGroup.missions ?? [], ["missionId"]),
    transmissions: indexById(
      (context.store.byGroup.transmissions ?? []).filter((file) => !file.relativePath.endsWith(".chunks.json")),
      ["transmissionId"],
    ),
    chunks: indexChunkFiles(context.store.byGroup.transmissions ?? []),
    chunkRecords: indexChunkRecords(context.store.byGroup.transmissions ?? []),
    enemies: indexById(context.store.byGroup.enemies ?? [], ["enemyId"]),
    bulletPatterns: indexById(context.store.byGroup["bullet-patterns"] ?? [], ["bulletPatternId"]),
    projectiles: indexById(context.store.byGroup.projectiles ?? [], ["projectileId"]),
    battleSpawnPoints: indexById(context.store.byGroup["battle-spawn-points"] ?? [], ["spawnPointId"]),
    movementPatterns: indexById(context.store.byGroup["movement-patterns"] ?? [], ["movementPatternId"]),
    equipment: indexById(context.store.byGroup.equipment ?? [], ["equipmentId"]),
    effects: indexById(context.store.byGroup["equipment/effects"] ?? [], ["effectId"]),
    conditions: indexById(collectConditionFiles(context), ["conditionId"]),
    maps: indexById(context.store.byGroup["map-logic"] ?? [], ["mapId"]),
  }
}

function collectConditionFiles(context: ValidationContext): ContentFile[] {
  return context.store.files.filter((file) => file.gameplayRelativePath.includes("progression/conditions/"))
}

function indexChunkFiles(files: readonly ContentFile[]): Map<string, ContentFile> {
  const index = new Map<string, ContentFile>()
  for (const file of files) {
    if (!file.relativePath.endsWith(".chunks.json")) {
      continue
    }
    for (const chunk of asArray(file.data)) {
      const record = asRecord(chunk)
      const chunkId = record ? asString(record.chunkId) : undefined
      if (chunkId) {
        index.set(chunkId, file)
      }
    }
  }
  return index
}

function indexChunkRecords(files: readonly ContentFile[]): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>()
  for (const file of files) {
    if (!file.relativePath.endsWith(".chunks.json")) {
      continue
    }
    for (const chunk of asArray(file.data)) {
      const record = asRecord(chunk)
      const chunkId = record ? asString(record.chunkId) : undefined
      if (chunkId && record) {
        index.set(chunkId, record)
      }
    }
  }
  return index
}

function validateFileNameMatchesId(context: ValidationContext): void {
  for (const file of context.store.files) {
    if (file.relativePath.endsWith(".chunks.json")) {
      continue
    }
    const group = resolveGroup(file.gameplayRelativePath)
    const keys = ID_KEYS_BY_GROUP[group]
    const record = asRecord(file.data)
    if (!keys || !record) {
      continue
    }
    const id = getId(record, keys)
    const basename = path.basename(file.path, ".json")
    if (id && id !== basename && !file.relativePath.endsWith("presentation-cues.json")) {
      addIssue(context, `JSON ID '${id}' must match file name '${basename}'.`, file.relativePath)
    }
  }
}

function resolveGroup(relativePath: string): string {
  const parts = relativePath.split(path.sep)
  if (parts[0] === "equipment" && parts[1] === "effects") {
    return "equipment/effects"
  }
  if (parts[0] === "progression" && parts[1] === "conditions") {
    return "progression"
  }
  if (parts[0] === "visual-presets") {
    return "visual-presets"
  }
  if (parts[0] === "hitbox-presets") {
    return "hitbox-presets"
  }
  return parts[0]
}

function validateUniqueIds(context: ValidationContext): void {
  const seen = new Map<string, string>()
  for (const file of context.store.files) {
    if (file.relativePath.endsWith(".chunks.json")) {
      for (const chunk of asArray(file.data)) {
        const record = asRecord(chunk)
        const id = record ? asString(record.chunkId) : undefined
        checkUnique(context, seen, id, file.relativePath)
      }
      continue
    }
    const record = asRecord(file.data)
    if (!record) {
      continue
    }
    const keys = ID_KEYS_BY_GROUP[resolveGroup(file.gameplayRelativePath)] ?? []
    const id = getId(record, keys)
    checkUnique(context, seen, id, file.relativePath)
  }
}

function checkUnique(
  context: ValidationContext,
  seen: Map<string, string>,
  id: string | undefined,
  file: string,
): void {
  if (!id) {
    return
  }
  const previous = seen.get(id)
  if (previous) {
    addIssue(context, `Duplicate id '${id}' also appears in ${previous}.`, file)
    return
  }
  seen.set(id, file)
}

function requireId(
  context: ValidationContext,
  index: Map<string, ContentFile>,
  id: string | undefined,
  kind: string,
  owner: string,
  file: string,
): void {
  if (id && !index.has(id)) {
    addIssue(context, `Missing ${kind} '${id}' referenced by ${owner}.`, file)
  }
}

function validateBattleSpawnPointDefinitions(
  context: ValidationContext,
  indexes: ReturnType<typeof createIndexes>,
): void {
  for (const [spawnPointId, file] of indexes.battleSpawnPoints) {
    const spawnPoint = asRecord(file.data)
    if (!spawnPoint) {
      continue
    }
    const side = asString(spawnPoint.side)
    if (!side || !VALID_BATTLE_SPAWN_POINT_SIDES.has(side)) {
      addIssue(context, `Battle spawn point '${spawnPointId}' has unsupported side '${String(side)}'.`, file.relativePath)
    }
    const xRatio = asNumber(spawnPoint.xRatio)
    const yRatio = asNumber(spawnPoint.yRatio)
    const offsetX = asNumber(spawnPoint.offsetX)
    const offsetY = asNumber(spawnPoint.offsetY)
    if (!isRatio(xRatio) || !isRatio(yRatio)) {
      addIssue(context, `Battle spawn point '${spawnPointId}' must declare xRatio/yRatio in 0..1.`, file.relativePath)
      continue
    }
    if (offsetX === undefined || offsetY === undefined) {
      addIssue(context, `Battle spawn point '${spawnPointId}' must declare numeric offsetX/offsetY.`, file.relativePath)
      continue
    }
    const position = {
      x: Math.round(BATTLE_FIELD_WIDTH * xRatio + offsetX),
      y: Math.round(BATTLE_FIELD_HEIGHT * yRatio + offsetY),
    }
    if (!isWithinBattleMargin(position)) {
      addIssue(context, `Battle spawn point '${spawnPointId}' is outside the allowed spawn margin.`, file.relativePath)
    }
  }
}

function validateMovementPatternDefinitions(
  context: ValidationContext,
  indexes: ReturnType<typeof createIndexes>,
): void {
  for (const [movementPatternId, file] of indexes.movementPatterns) {
    const pattern = asRecord(file.data)
    if (!pattern) {
      continue
    }
    const patternKind = asString(pattern.patternKind)
    if (!patternKind || !VALID_MOVEMENT_PATTERN_KINDS.has(patternKind)) {
      addIssue(context, `Movement pattern '${movementPatternId}' has unsupported patternKind '${String(patternKind)}'.`, file.relativePath)
      continue
    }
    validateMovementPatternShape(context, movementPatternId, patternKind, pattern, file.relativePath)
    warnIfMovementMayRemainOnscreen(context, movementPatternId, patternKind, pattern, file.relativePath)
  }
}

function validateMovementPatternShape(
  context: ValidationContext,
  movementPatternId: string,
  patternKind: string,
  pattern: Record<string, unknown>,
  file: string,
): void {
  if (patternKind === "linear" || patternKind === "sineDrift" || patternKind === "pauseThenDrift") {
    validatePositiveNumber(context, pattern.speed, `${movementPatternId} speed`, file)
  }
  if (patternKind === "sineDrift") {
    validateFiniteNumber(context, pattern.wobbleAmplitude, `${movementPatternId} wobbleAmplitude`, file)
    validatePositiveNumber(context, pattern.wobblePeriodMs, `${movementPatternId} wobblePeriodMs`, file)
  }
  if (patternKind === "pauseThenDrift") {
    validateFiniteNumber(context, pattern.pauseAtY, `${movementPatternId} pauseAtY`, file)
    validateNonNegativeNumber(context, pattern.pauseMs, `${movementPatternId} pauseMs`, file)
  }
  if (patternKind === "bezierRoute") {
    validatePositiveNumber(context, pattern.durationMs, `${movementPatternId} durationMs`, file)
    const points = asArray(pattern.points).map((point) => asRecord(point))
    if (points.length < 2 || points.length > 4 || points.some((point) => point === null)) {
      addIssue(context, `Movement pattern '${movementPatternId}' must declare 2 to 4 route points.`, file)
      return
    }
    for (const point of points) {
      const x = asNumber(point?.x)
      const y = asNumber(point?.y)
      if (x === undefined || y === undefined || !isWithinBattleMargin({ x, y })) {
        addIssue(context, `Movement pattern '${movementPatternId}' has a route point outside the allowed margin.`, file)
      }
    }
    const lastPoint = points[points.length - 1]
    const x = asNumber(lastPoint?.x)
    const y = asNumber(lastPoint?.y)
    if (x !== undefined && y !== undefined && isInsideBattlefield({ x, y })) {
      addIssue(context, `Movement pattern '${movementPatternId}' bezierRoute must end outside the visible field.`, file)
    }
  }
  if (patternKind === "holdAndFade") {
    validateNonNegativeNumber(context, pattern.holdMs, `${movementPatternId} holdMs`, file)
    validatePositiveNumber(context, pattern.fadeMs, `${movementPatternId} fadeMs`, file)
  }
}

function warnIfMovementMayRemainOnscreen(
  context: ValidationContext,
  movementPatternId: string,
  patternKind: string,
  pattern: Record<string, unknown>,
  file: string,
): void {
  if (patternKind !== "linear" && patternKind !== "sineDrift" && patternKind !== "pauseThenDrift") {
    return
  }
  const speed = asNumber(pattern.speed)
  if (speed === undefined || speed <= 0) {
    return
  }
  const pauseMs = patternKind === "pauseThenDrift" ? asNumber(pattern.pauseMs) ?? 0 : 0
  const worstCaseMs = ((BATTLE_FIELD_HEIGHT + BATTLE_SPAWN_OUTER_MARGIN * 2) / speed) * 1000 + pauseMs
  if (worstCaseMs > 70000) {
    addWarning(
      context,
      `Movement pattern '${movementPatternId}' may remain on screen for ${Math.round(worstCaseMs)}ms.`,
      file,
    )
  }
}

function validateAreaReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [areaId, file] of indexes.areas) {
    const area = asRecord(file.data)
    if (!area) {
      continue
    }
    requireId(context, indexes.maps, asString(area.mapId), "map", areaId, file.relativePath)
    requireId(context, indexes.conditions, asString(area.unlockConditionId), "condition", areaId, file.relativePath)
    requireId(context, indexes.conditions, asString(area.visibilityConditionId), "condition", areaId, file.relativePath)
    for (const transmissionId of asArray(area.transmissionIds)) {
      requireId(context, indexes.transmissions, asString(transmissionId), "transmission", areaId, file.relativePath)
    }
  }
}

function validateTransmissionReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  const soundAssetIds = readKnownSoundAssetIds(context)
  for (const [transmissionId, file] of indexes.transmissions) {
    const transmission = asRecord(file.data)
    if (!transmission) {
      continue
    }
    requireId(context, indexes.areas, asString(transmission.areaId), "area", transmissionId, file.relativePath)
    const missionId = asString(transmission.missionId)
    requireId(context, indexes.missions, missionId, "mission", transmissionId, file.relativePath)
    const linkedMission = missionId ? asRecord(indexes.missions.get(missionId)?.data) : null
    if (linkedMission && asString(linkedMission.transmissionId) !== transmissionId) {
      addIssue(
        context,
        `Transmission '${transmissionId}' points to mission '${missionId}', but that mission points to '${String(linkedMission.transmissionId)}'.`,
        file.relativePath,
      )
    }
    requireId(context, indexes.conditions, asString(transmission.visibilityConditionId), "condition", transmissionId, file.relativePath)
    requireId(context, indexes.conditions, asString(transmission.accessConditionId), "condition", transmissionId, file.relativePath)
    requireId(context, indexes.conditions, asString(transmission.unlockConditionId), "condition", transmissionId, file.relativePath)
    const audioAssetId = asString(transmission.audioAssetId)
    if (audioAssetId && !soundAssetIds.has(audioAssetId)) {
      addIssue(context, `Missing sound asset '${audioAssetId}' referenced by transmission '${transmissionId}'.`, file.relativePath)
    }
    for (const chunkIdValue of asArray(transmission.transcriptChunkIds)) {
      const chunkId = asString(chunkIdValue)
      requireId(context, indexes.chunks, chunkId, "transcript chunk", transmissionId, file.relativePath)
      const chunk = chunkId ? indexes.chunkRecords.get(chunkId) : undefined
      if (chunk && asString(chunk.transmissionId) !== transmissionId) {
        addIssue(
          context,
          `Transcript chunk '${chunkId}' belongs to '${String(chunk.transmissionId)}', expected '${transmissionId}'.`,
          file.relativePath,
        )
      }
    }
    for (const equipmentId of asArray(transmission.rewardEquipmentIds)) {
      requireId(context, indexes.equipment, asString(equipmentId), "reward equipment", transmissionId, file.relativePath)
    }
  }
}

function readKnownSoundAssetIds(context: ValidationContext): Set<string> {
  const soundCatalogPath = path.join(context.store.rootDir, "apps", "web", "src", "audio", "soundCatalog.ts")
  if (!existsSync(soundCatalogPath)) {
    return new Set()
  }

  const source = readFileSync(soundCatalogPath, "utf8")
  const assetIdBlock = source.match(/export const SOUND_ASSET_IDS = \{([\s\S]*?)\} as const/)
  if (!assetIdBlock) {
    return new Set()
  }

  return new Set(
    [...assetIdBlock[1].matchAll(/'([^']+)'/g)]
      .map((match) => match[1])
      .filter(Boolean),
  )
}

function validateTranscriptChunkMigrationReferences(
  context: ValidationContext,
  indexes: ReturnType<typeof createIndexes>,
): void {
  const migrationFile = context.store.files.find((file) => file.gameplayRelativePath === "migrated-id-map.json")
  const migrationMap = migrationFile ? asRecord(migrationFile.data) : null
  if (!migrationFile || !migrationMap) {
    addIssue(context, "Missing migrated-id-map.json for content ID migration policy.", "content/gameplay/migrated-id-map.json")
    return
  }

  const transcriptMigrations = asArray(migrationMap.migrations)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null && entry.kind === "transcriptChunk")
  const migrationsBySource = new Map<string, Record<string, unknown>>()

  for (const migration of transcriptMigrations) {
    const fromChunkId = asString(migration.fromChunkId)
    const transmissionId = asString(migration.transmissionId)
    const toChunkIds = asArray(migration.toChunkIds)
      .map((chunkId) => asString(chunkId))
      .filter((chunkId): chunkId is string => Boolean(chunkId))

    if (!fromChunkId) {
      addIssue(context, "Transcript chunk migration must declare fromChunkId.", migrationFile.relativePath)
      continue
    }
    if (migrationsBySource.has(fromChunkId)) {
      addIssue(context, `Duplicate transcript chunk migration for '${fromChunkId}'.`, migrationFile.relativePath)
      continue
    }
    migrationsBySource.set(fromChunkId, migration)

    if (indexes.chunks.has(fromChunkId)) {
      addIssue(context, `Transcript chunk migration source '${fromChunkId}' still exists as a current chunk.`, migrationFile.relativePath)
    }
    requireId(context, indexes.transmissions, transmissionId, "transmission", fromChunkId, migrationFile.relativePath)
    if (toChunkIds.length === 0) {
      addIssue(context, `Transcript chunk migration '${fromChunkId}' must declare at least one toChunkId.`, migrationFile.relativePath)
    }

    for (const toChunkId of toChunkIds) {
      requireId(context, indexes.chunks, toChunkId, "transcript chunk", fromChunkId, migrationFile.relativePath)
      const chunk = indexes.chunkRecords.get(toChunkId)
      if (chunk && transmissionId && asString(chunk.transmissionId) !== transmissionId) {
        addIssue(
          context,
          `Transcript chunk migration '${fromChunkId}' target '${toChunkId}' belongs to '${String(chunk.transmissionId)}', expected '${transmissionId}'.`,
          migrationFile.relativePath,
        )
      }
    }

    for (const segment of asArray(migration.segments)) {
      const segmentRecord = asRecord(segment)
      const targetChunkId = asString(segmentRecord?.targetChunkId)
      if (targetChunkId && !toChunkIds.includes(targetChunkId)) {
        addIssue(context, `Transcript chunk migration '${fromChunkId}' segment targets '${targetChunkId}' outside toChunkIds.`, migrationFile.relativePath)
      }
      validateMigrationRatio(context, segmentRecord?.sourceStartRatio, segmentRecord?.sourceEndRatio, `source range for '${fromChunkId}'`, migrationFile.relativePath)
      validateMigrationRatio(context, segmentRecord?.targetStartRatio, segmentRecord?.targetEndRatio, `target range for '${fromChunkId}/${String(targetChunkId)}'`, migrationFile.relativePath)
    }
  }

  for (const [chunkId, file] of indexes.chunks) {
    const chunk = indexes.chunkRecords.get(chunkId)
    for (const previousChunkIdValue of asArray(chunk?.previousChunkIds)) {
      const previousChunkId = asString(previousChunkIdValue)
      if (!previousChunkId) {
        addIssue(context, `Transcript chunk '${chunkId}' has a non-string previousChunkIds entry.`, file.relativePath)
        continue
      }
      if (indexes.chunks.has(previousChunkId)) {
        addIssue(context, `Transcript chunk '${chunkId}' previousChunkId '${previousChunkId}' still exists as a current chunk.`, file.relativePath)
      }
      const migration = migrationsBySource.get(previousChunkId)
      const toChunkIds = migration
        ? asArray(migration.toChunkIds).map((toChunkId) => asString(toChunkId)).filter((toChunkId): toChunkId is string => Boolean(toChunkId))
        : []
      if (!migration || !toChunkIds.includes(chunkId)) {
        addIssue(
          context,
          `Transcript chunk '${chunkId}' declares previousChunkId '${previousChunkId}', but migrated-id-map.json has no matching transcriptChunk migration.`,
          file.relativePath,
        )
      }
    }
  }
}

function validateMigrationRatio(
  context: ValidationContext,
  startValue: unknown,
  endValue: unknown,
  owner: string,
  file: string,
): void {
  const startRatio = asNumber(startValue)
  const endRatio = asNumber(endValue)
  if (
    startRatio === undefined ||
    endRatio === undefined ||
    startRatio < 0 ||
    startRatio > 1 ||
    endRatio < 0 ||
    endRatio > 1 ||
    endRatio <= startRatio
  ) {
    addIssue(context, `Invalid transcript chunk migration ${owner}: ratios must be in ascending 0..1 range.`, file)
  }
}

function validateMissionReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    if (!mission) {
      continue
    }
    const transmissionId = asString(mission.transmissionId)
    requireId(context, indexes.transmissions, transmissionId, "transmission", missionId, file.relativePath)
    const linkedTransmission = transmissionId ? asRecord(indexes.transmissions.get(transmissionId)?.data) : null
    if (linkedTransmission && asString(linkedTransmission.missionId) !== missionId) {
      addIssue(
        context,
        `Mission '${missionId}' points to transmission '${transmissionId}', but that transmission points to '${String(linkedTransmission.missionId)}'.`,
        file.relativePath,
      )
    }
    const transmissionChunkIds = new Set(asArray(linkedTransmission?.transcriptChunkIds).map((chunkId) => asString(chunkId)).filter((chunkId): chunkId is string => Boolean(chunkId)))
    validateSpawnPointReference(
      context,
      indexes,
      asString(mission.playerSpawnId),
      "player",
      `mission '${missionId}' playerSpawnId`,
      file.relativePath,
    )
    requireId(context, indexes.conditions, asString(mission.visibilityConditionId), "condition", missionId, file.relativePath)
    requireId(context, indexes.conditions, asString(mission.startConditionId), "condition", missionId, file.relativePath)
    const waveIds = new Set<string>()
    const spawnIds = new Set<string>()
    for (const wave of asArray(mission.waves)) {
      const waveRecord = asRecord(wave)
      const waveId = asString(waveRecord?.waveId)
      if (!waveId) {
        addIssue(context, `Mission '${missionId}' wave must declare waveId.`, file.relativePath)
      } else if (waveIds.has(waveId)) {
        addIssue(context, `Mission '${missionId}' has duplicate waveId '${waveId}'.`, file.relativePath)
      } else {
        waveIds.add(waveId)
      }
      for (const entry of asArray(waveRecord?.entries)) {
        const entryRecord = asRecord(entry)
        const spawnId = asString(entryRecord?.spawnId)
        if (!spawnId) {
          addIssue(context, `Mission '${missionId}' enemy spawn must declare spawnId.`, file.relativePath)
        } else if (spawnIds.has(spawnId)) {
          addIssue(context, `Mission '${missionId}' has duplicate spawnId '${spawnId}'.`, file.relativePath)
        } else {
          spawnIds.add(spawnId)
        }
        requireId(context, indexes.enemies, asString(entryRecord?.enemyId), "enemy", missionId, file.relativePath)
        validateSpawnPointReference(
          context,
          indexes,
          asString(entryRecord?.spawnPointId),
          "noiseSource",
          `mission '${missionId}' enemy spawn`,
          file.relativePath,
        )
        requireId(context, indexes.movementPatterns, asString(entryRecord?.movementPatternId), "movement pattern", missionId, file.relativePath)
        for (const key of Object.keys(asRecord(entryRecord?.overrides) ?? {})) {
          if (!VALID_ENEMY_OVERRIDE_KEYS.has(key)) {
            addIssue(context, `Unsupported enemy override '${key}' in mission '${missionId}'.`, file.relativePath)
          }
        }
      }
    }
    const hazardIds = new Set(
      asArray(mission.hazards)
        .map((hazard) => asString(asRecord(hazard)?.hazardId))
        .filter((hazardId): hazardId is string => Boolean(hazardId)),
    )
    for (const beat of asArray(mission.beatEvents)) {
      const beatRecord = asRecord(beat)
      const beatId = asString(beatRecord?.beatId) ?? "(unknown beat)"
      for (const chunkIdValue of asArray(beatRecord?.transcriptChunkIds)) {
        const chunkId = asString(chunkIdValue)
        requireId(context, indexes.chunks, chunkId, "transcript chunk", `${missionId}/${beatId}`, file.relativePath)
        const chunk = chunkId ? indexes.chunkRecords.get(chunkId) : undefined
        if (chunk && transmissionId && asString(chunk.transmissionId) !== transmissionId) {
          addIssue(context, `Transcript chunk '${chunkId}' in ${missionId}/${beatId} belongs to '${String(chunk.transmissionId)}', expected '${transmissionId}'.`, file.relativePath)
        }
        if (chunkId && transmissionChunkIds.size > 0 && !transmissionChunkIds.has(chunkId)) {
          addIssue(context, `Transcript chunk '${chunkId}' in ${missionId}/${beatId} is not listed by transmission '${String(transmissionId)}'.`, file.relativePath)
        }
      }
      for (const enemyId of asArray(beatRecord?.relatedEnemyIds)) {
        requireId(context, indexes.enemies, asString(enemyId), "enemy", `${missionId}/${beatId}`, file.relativePath)
      }
      for (const hazardIdValue of asArray(beatRecord?.relatedHazardIds)) {
        const hazardId = asString(hazardIdValue)
        if (hazardId && !hazardIds.has(hazardId)) {
          addIssue(context, `Missing hazard '${hazardId}' referenced by ${missionId}/${beatId}.`, file.relativePath)
        }
      }
    }
    for (const hazard of asArray(mission.hazards)) {
      const hazardRecord = asRecord(hazard)
      requireId(context, indexes.conditions, asString(hazardRecord?.visibilityConditionId), "condition", missionId, file.relativePath)
    }
  }
}

function validateSpawnPointReference(
  context: ValidationContext,
  indexes: ReturnType<typeof createIndexes>,
  spawnPointId: string | undefined,
  expectedSide: "player" | "noiseSource",
  owner: string,
  file: string,
): void {
  if (!spawnPointId) {
    return
  }
  const spawnPointFile = indexes.battleSpawnPoints.get(spawnPointId)
  if (!spawnPointFile) {
    addIssue(context, `Missing battle spawn point '${spawnPointId}' referenced by ${owner}.`, file)
    return
  }
  const spawnPoint = asRecord(spawnPointFile.data)
  const side = asString(spawnPoint?.side)
  if (side !== expectedSide && side !== "shared") {
    const sideLabel = expectedSide === "player" ? "Player" : "Enemy"
    addIssue(
      context,
      `${sideLabel} spawn point '${spawnPointId}' has side '${String(side)}', expected '${expectedSide}' or 'shared'.`,
      file,
    )
  }
}

function validateFiniteNumber(context: ValidationContext, value: unknown, owner: string, file: string): void {
  if (asNumber(value) === undefined) {
    addIssue(context, `${owner} must be a finite number.`, file)
  }
}

function validatePositiveNumber(context: ValidationContext, value: unknown, owner: string, file: string): void {
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue <= 0) {
    addIssue(context, `${owner} must be greater than 0.`, file)
  }
}

function validateNonNegativeNumber(context: ValidationContext, value: unknown, owner: string, file: string): void {
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue < 0) {
    addIssue(context, `${owner} must be 0 or greater.`, file)
  }
}

function isRatio(value: number | undefined): value is number {
  return value !== undefined && value >= 0 && value <= 1
}

function isWithinBattleMargin(point: { x: number; y: number }): boolean {
  return (
    point.x >= -BATTLE_SPAWN_OUTER_MARGIN &&
    point.x <= BATTLE_FIELD_WIDTH + BATTLE_SPAWN_OUTER_MARGIN &&
    point.y >= -BATTLE_SPAWN_OUTER_MARGIN &&
    point.y <= BATTLE_FIELD_HEIGHT + BATTLE_SPAWN_OUTER_MARGIN
  )
}

function isInsideBattlefield(point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.x <= BATTLE_FIELD_WIDTH && point.y >= 0 && point.y <= BATTLE_FIELD_HEIGHT
}

function validateEnemyReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [enemyId, file] of indexes.enemies) {
    const enemy = asRecord(file.data)
    if (!enemy) {
      continue
    }
    for (const bulletPatternId of asArray(enemy.bulletPatternIds)) {
      requireId(context, indexes.bulletPatterns, asString(bulletPatternId), "bullet pattern", enemyId, file.relativePath)
    }
    requireId(context, indexes.movementPatterns, asString(enemy.movementPatternId), "movement pattern", enemyId, file.relativePath)
  }
}

function validateBulletPatternReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [patternId, file] of indexes.bulletPatterns) {
    const pattern = asRecord(file.data)
    if (!pattern) {
      continue
    }
    requireId(context, indexes.projectiles, asString(pattern.projectileId), "projectile", patternId, file.relativePath)
  }
}

function validateEquipmentReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [equipmentId, file] of indexes.equipment) {
    const equipment = asRecord(file.data)
    if (!equipment) {
      continue
    }
    requireId(context, indexes.conditions, asString(equipment.unlockConditionId), "condition", equipmentId, file.relativePath)
    requireId(context, indexes.conditions, asString(equipment.visibilityConditionId), "condition", equipmentId, file.relativePath)
    for (const effectId of [...asArray(equipment.passiveEffectIds), ...asArray(equipment.activeEffectIds)]) {
      requireId(context, indexes.effects, asString(effectId), "effect", equipmentId, file.relativePath)
    }
    const unlockSource = asRecord(equipment.unlockSource)
    if (unlockSource?.kind === "transmissionReward") {
      requireId(context, indexes.transmissions, asString(unlockSource.transmissionId), "transmission", equipmentId, file.relativePath)
    }
    if (unlockSource?.kind === "upgradeTransform") {
      requireId(context, indexes.equipment, asString(unlockSource.sourceEquipmentId), "source equipment", equipmentId, file.relativePath)
    }
    for (const params of asArray(equipment.levelParams)) {
      const paramsRecord = asRecord(params)
      requireId(context, indexes.equipment, asString(paramsRecord?.transformEquipmentId), "transform equipment", equipmentId, file.relativePath)
    }
  }
}

function validateMapReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  const knownNodeIds = new Set<string>()
  const areaVisibilityById = new Map<string, string | undefined>()
  for (const [areaId, file] of indexes.areas) {
    areaVisibilityById.set(areaId, asString(asRecord(file.data)?.visibilityConditionId))
  }
  for (const [mapId, file] of indexes.maps) {
    const map = asRecord(file.data)
    if (!map) {
      continue
    }
    for (const group of ["areaNodes", "transmissionNodes", "warpNodes", "collectibleNodes"]) {
      for (const node of asArray(map[group])) {
        const nodeRecord = asRecord(node)
        const nodeId = asString(nodeRecord?.nodeId)
        if (nodeId) {
          knownNodeIds.add(nodeId)
        }
        requireId(context, indexes.areas, asString(nodeRecord?.areaId), "area", mapId, file.relativePath)
        requireId(context, indexes.conditions, asString(nodeRecord?.visibilityConditionId), "condition", mapId, file.relativePath)
        requireId(context, indexes.conditions, asString(nodeRecord?.accessConditionId), "condition", mapId, file.relativePath)
        requireId(context, indexes.transmissions, asString(nodeRecord?.transmissionId), "transmission", mapId, file.relativePath)
        requireId(context, indexes.equipment, asString(nodeRecord?.equipmentId), "equipment", mapId, file.relativePath)
        requireId(context, indexes.areas, asString(nodeRecord?.warpTargetAreaId), "target area", mapId, file.relativePath)
        validateNodeVisibilityWithinArea(
          context,
          areaVisibilityById,
          nodeRecord,
          nodeId ?? "(unknown node)",
          file.relativePath,
        )
      }
    }
  }

  for (const [equipmentId, file] of indexes.equipment) {
    const equipment = asRecord(file.data)
    const unlockSource = asRecord(equipment?.unlockSource)
    const nodeId = unlockSource?.kind === "mapPickup" ? asString(unlockSource.nodeId) : undefined
    if (nodeId && !knownNodeIds.has(nodeId)) {
      addIssue(context, `Missing map node '${nodeId}' referenced by ${equipmentId}.`, file.relativePath)
    }
  }
}

function validateNodeVisibilityWithinArea(
  context: ValidationContext,
  areaVisibilityById: Map<string, string | undefined>,
  node: Record<string, unknown> | null,
  nodeId: string,
  file: string,
): void {
  const areaId = asString(node?.areaId)
  if (!areaId) {
    return
  }

  const areaVisibilityConditionId = areaVisibilityById.get(areaId)
  const nodeVisibilityConditionId = asString(node?.visibilityConditionId)
  if (!areaVisibilityConditionId || areaVisibilityConditionId === "cond_always") {
    return
  }

  if (nodeVisibilityConditionId === areaVisibilityConditionId) {
    return
  }

  if (node?.allowOutOfAreaHint === true) {
    return
  }

  // 条件式の包含関係は一般化せず、ロック中エリアでは同じ条件か明示例外だけを許します。
  addIssue(
    context,
    `Map node '${nodeId}' uses visibilityConditionId '${String(nodeVisibilityConditionId)}' broader than area '${areaId}' visibility '${areaVisibilityConditionId}'. Use the area condition or set allowOutOfAreaHint: true.`,
    file,
  )
}

function validateConditionReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [conditionId, file] of indexes.conditions) {
    const condition = asRecord(file.data)
    if (!condition) {
      continue
    }
    for (const childId of asArray(condition.children)) {
      requireId(context, indexes.conditions, asString(childId), "condition", conditionId, file.relativePath)
    }
    requireId(context, indexes.conditions, asString(condition.child), "condition", conditionId, file.relativePath)
    requireId(context, indexes.missions, asString(condition.missionId), "mission", conditionId, file.relativePath)
    requireId(context, indexes.areas, asString(condition.areaId), "area", conditionId, file.relativePath)
    requireId(context, indexes.transmissions, asString(condition.transmissionId), "transmission", conditionId, file.relativePath)
    requireId(context, indexes.equipment, asString(condition.equipmentId), "equipment", conditionId, file.relativePath)
  }
}

function validateContentClassification(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  const classificationFile = context.store.files.find((file) => file.gameplayRelativePath === "content-classification.json")
  const classification = classificationFile ? asRecord(classificationFile.data) : null
  if (!classificationFile || !classification) {
    addIssue(context, "Missing active / prototype / deprecated content classification.", "content/gameplay")
    return
  }

  const buckets = ["active", "prototype", "deprecated"] as const
  const knownIdsByKind: Record<string, Set<string>> = {
    missions: new Set(indexes.missions.keys()),
    enemies: new Set(indexes.enemies.keys()),
    bulletPatterns: new Set(indexes.bulletPatterns.keys()),
    projectiles: new Set(indexes.projectiles.keys()),
    movementPatterns: new Set(indexes.movementPatterns.keys()),
  }
  const classified = new Map<string, string>()
  for (const bucket of buckets) {
    const bucketRecord = asRecord(classification[bucket])
    for (const [kind, ids] of Object.entries(bucketRecord ?? {})) {
      const knownIds = knownIdsByKind[kind]
      for (const id of asArray(ids)) {
        const idString = asString(id)
        if (!idString) {
          continue
        }
        if (!knownIds?.has(idString)) {
          addIssue(context, `Classification contains unknown ${kind} id '${idString}'.`, classificationFile.relativePath)
          continue
        }
        const previous = classified.get(idString)
        if (previous) {
          addIssue(context, `Content id '${idString}' appears in both ${previous} and ${bucket}.`, classificationFile.relativePath)
        }
        classified.set(idString, bucket)
      }
    }
  }

  for (const [id] of new Map([
    ...indexes.missions,
    ...indexes.enemies,
    ...indexes.bulletPatterns,
    ...indexes.projectiles,
    ...indexes.movementPatterns,
  ])) {
    if (!classified.has(id)) {
      addIssue(context, `Content id '${id}' is not classified as active, prototype, or deprecated.`, classificationFile.relativePath)
    }
  }
}

function validateActiveLifecycleReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  const classificationFile = context.store.files.find((file) => file.gameplayRelativePath === "content-classification.json")
  const classification = classificationFile ? asRecord(classificationFile.data) : null
  const active = classification ? asRecord(classification.active) : null
  if (!classificationFile || !active) {
    return
  }

  const activeMissions = readLifecycleSet(active, "missions")
  const activeEnemies = readLifecycleSet(active, "enemies")
  const activeBulletPatterns = readLifecycleSet(active, "bulletPatterns")
  const activeProjectiles = readLifecycleSet(active, "projectiles")
  const activeMovementPatterns = readLifecycleSet(active, "movementPatterns")

  for (const [kind, ids] of [
    ["missions", activeMissions],
    ["enemies", activeEnemies],
    ["bulletPatterns", activeBulletPatterns],
    ["projectiles", activeProjectiles],
    ["movementPatterns", activeMovementPatterns],
  ] as const) {
    if (ids.size === 0) {
      addIssue(context, `Active lifecycle must list at least one ${kind} id.`, classificationFile.relativePath)
    }
  }

  for (const missionId of activeMissions) {
    const file = indexes.missions.get(missionId)
    const mission = file ? asRecord(file.data) : null
    if (!file || !mission) {
      continue
    }
    for (const wave of asArray(mission.waves)) {
      const waveRecord = asRecord(wave)
      for (const entry of asArray(waveRecord?.entries)) {
        const entryRecord = asRecord(entry)
        const enemyId = asString(entryRecord?.enemyId)
        if (enemyId && !activeEnemies.has(enemyId)) {
          addIssue(context, `Active mission '${missionId}' references non-active enemy '${enemyId}'.`, file.relativePath)
        }
        const movementPatternId = asString(entryRecord?.movementPatternId)
        if (movementPatternId && !activeMovementPatterns.has(movementPatternId)) {
          addIssue(context, `Active mission '${missionId}' references non-active movement pattern '${movementPatternId}'.`, file.relativePath)
        }
      }
    }
    for (const beat of asArray(mission.beatEvents)) {
      const beatRecord = asRecord(beat)
      const beatId = asString(beatRecord?.beatId) ?? "(unknown beat)"
      for (const enemyIdValue of asArray(beatRecord?.relatedEnemyIds)) {
        const enemyId = asString(enemyIdValue)
        if (enemyId && !activeEnemies.has(enemyId)) {
          addIssue(context, `Active mission beat '${missionId}/${beatId}' references non-active enemy '${enemyId}'.`, file.relativePath)
        }
      }
    }
  }

  for (const enemyId of activeEnemies) {
    const file = indexes.enemies.get(enemyId)
    const enemy = file ? asRecord(file.data) : null
    if (!file || !enemy) {
      continue
    }
    for (const bulletPatternIdValue of asArray(enemy.bulletPatternIds)) {
      const bulletPatternId = asString(bulletPatternIdValue)
      if (bulletPatternId && !activeBulletPatterns.has(bulletPatternId)) {
        addIssue(context, `Active enemy '${enemyId}' references non-active bullet pattern '${bulletPatternId}'.`, file.relativePath)
      }
    }
    const movementPatternId = asString(enemy.movementPatternId)
    if (movementPatternId && !activeMovementPatterns.has(movementPatternId)) {
      addIssue(context, `Active enemy '${enemyId}' references non-active movement pattern '${movementPatternId}'.`, file.relativePath)
    }
  }

  for (const bulletPatternId of activeBulletPatterns) {
    const file = indexes.bulletPatterns.get(bulletPatternId)
    const bulletPattern = file ? asRecord(file.data) : null
    if (!file || !bulletPattern) {
      continue
    }
    const projectileId = asString(bulletPattern.projectileId)
    if (projectileId && !activeProjectiles.has(projectileId)) {
      addIssue(context, `Active bullet pattern '${bulletPatternId}' references non-active projectile '${projectileId}'.`, file.relativePath)
    }
  }
}

function readLifecycleSet(bucket: Record<string, unknown>, key: string): Set<string> {
  return new Set(
    asArray(bucket[key])
      .map((value) => asString(value))
      .filter((value): value is string => Boolean(value)),
  )
}

function validateContentDirectoriesMatchDocs(context: ValidationContext): void {
  if (!context.store.usesDefaultGameplayDir) {
    return
  }

  const docsPath = findDocsFileByNfcName(context.store.rootDir, "05_データ構造.md")
  if (!existsSync(docsPath)) {
    addIssue(context, "Missing docs/05_データ構造.md for content tree audit.", "docs")
    return
  }

  const docs = readFileSync(docsPath, "utf8")
  const documentedDirectories = new Set(
    [...docs.matchAll(/content\/gameplay\/([A-Za-z0-9_./-]+)\/?/g)]
      .map((match) => match[1]?.replace(/\/$/, ""))
      .filter((entry): entry is string => Boolean(entry) && !entry.includes("*")),
  )
  const actualDirectories = new Set(
    collectDirectories(context.store.gameplayDir)
      .map((directory) => path.relative(context.store.gameplayDir, directory))
      .filter(Boolean)
      .filter((directory) => !["active", "prototypes", "deprecated"].includes(directory)),
  )

  for (const directory of actualDirectories) {
    if (!documentedDirectories.has(directory)) {
      addIssue(context, `Content directory '${directory}' exists but is not documented in docs/05_データ構造.md.`, "docs/05_データ構造.md")
    }
  }
}

function findDocsFileByNfcName(rootDir: string, expectedName: string): string {
  const docsDir = path.join(rootDir, "docs")
  const expectedPath = path.join(docsDir, expectedName)
  if (existsSync(expectedPath)) {
    return expectedPath
  }
  if (!existsSync(docsDir)) {
    return expectedPath
  }
  const matchedName = readdirSync(docsDir).find((file) => file.normalize("NFC") === expectedName)
  return matchedName ? path.join(docsDir, matchedName) : expectedPath
}

function validateGeneratedManifestMatchesContentFiles(context: ValidationContext): void {
  if (!context.store.usesDefaultGameplayDir) {
    return
  }

  const manifestPath = path.join(
    context.store.rootDir,
    "packages",
    "persistence",
    "src",
    "generated",
    "content-manifest.ts",
  )
  if (!existsSync(manifestPath)) {
    addIssue(context, "Missing generated content manifest.", "packages/persistence/src/generated")
    return
  }

  const manifestSource = readFileSync(manifestPath, "utf8")
  const actualFiles = new Set(
    context.store.files
      .filter((file) => mustBeLoadedByContentBundle(file.gameplayRelativePath))
      .map((file) => file.gameplayRelativePath.split(path.sep).join("/")),
  )
  const manifestFiles = new Set(
    [...manifestSource.matchAll(/"\.\.\/\.\.\/\.\.\/\.\.\/content\/gameplay\/([^"]+\.json)"/g)]
      .map((match) => match[1])
      .filter((entry): entry is string => Boolean(entry)),
  )

  for (const file of context.store.files) {
    if (!mustBeLoadedByContentBundle(file.gameplayRelativePath)) {
      continue
    }
    const expectedImport = file.gameplayRelativePath.split(path.sep).join("/")
    if (!manifestFiles.has(expectedImport)) {
      addIssue(context, `Content file 'content/gameplay/${expectedImport}' is missing from generated manifest.`, "packages/persistence/src/generated/content-manifest.ts")
    }
  }

  for (const manifestFile of manifestFiles) {
    if (!actualFiles.has(manifestFile)) {
      addIssue(context, `Generated manifest imports missing content file 'content/gameplay/${manifestFile}'.`, "packages/persistence/src/generated/content-manifest.ts")
    }
  }
}

function mustBeLoadedByContentBundle(gameplayRelativePath: string): boolean {
  if (gameplayRelativePath === "migrated-id-map.json") {
    return false
  }
  return gameplayRelativePath.endsWith(".json")
}

function collectDirectories(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  const directories: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const entryPath = path.join(dir, entry.name)
    directories.push(entryPath, ...collectDirectories(entryPath))
  }
  return directories
}

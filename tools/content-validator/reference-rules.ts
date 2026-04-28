import path from "node:path"
import {
  addIssue,
  asArray,
  asRecord,
  asString,
  getId,
  indexById,
  type ContentFile,
  type ValidationContext,
} from "./validate-content.js"

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
  "visual-presets": ["presetId"],
  "hitbox-presets": ["presetId", "hitboxPresetId"],
  "background-presets": ["presetId"],
}

export function validateReferenceRules(context: ValidationContext): void {
  validateFileNameMatchesId(context)
  validateUniqueIds(context)

  const indexes = createIndexes(context)
  validateAreaReferences(context, indexes)
  validateTransmissionReferences(context, indexes)
  validateMissionReferences(context, indexes)
  validateEnemyReferences(context, indexes)
  validateBulletPatternReferences(context, indexes)
  validateEquipmentReferences(context, indexes)
  validateMapReferences(context, indexes)
  validateConditionReferences(context, indexes)
  validateContentClassification(context, indexes)
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
    enemies: indexById(context.store.byGroup.enemies ?? [], ["enemyId"]),
    bulletPatterns: indexById(context.store.byGroup["bullet-patterns"] ?? [], ["bulletPatternId"]),
    projectiles: indexById(context.store.byGroup.projectiles ?? [], ["projectileId"]),
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
  for (const [transmissionId, file] of indexes.transmissions) {
    const transmission = asRecord(file.data)
    if (!transmission) {
      continue
    }
    requireId(context, indexes.areas, asString(transmission.areaId), "area", transmissionId, file.relativePath)
    requireId(context, indexes.missions, asString(transmission.missionId), "mission", transmissionId, file.relativePath)
    requireId(context, indexes.conditions, asString(transmission.visibilityConditionId), "condition", transmissionId, file.relativePath)
    requireId(context, indexes.conditions, asString(transmission.accessConditionId), "condition", transmissionId, file.relativePath)
    requireId(context, indexes.conditions, asString(transmission.unlockConditionId), "condition", transmissionId, file.relativePath)
    for (const chunkId of asArray(transmission.transcriptChunkIds)) {
      requireId(context, indexes.chunks, asString(chunkId), "transcript chunk", transmissionId, file.relativePath)
    }
    for (const equipmentId of asArray(transmission.rewardEquipmentIds)) {
      requireId(context, indexes.equipment, asString(equipmentId), "reward equipment", transmissionId, file.relativePath)
    }
  }
}

function validateMissionReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    if (!mission) {
      continue
    }
    requireId(context, indexes.transmissions, asString(mission.transmissionId), "transmission", missionId, file.relativePath)
    requireId(context, indexes.conditions, asString(mission.visibilityConditionId), "condition", missionId, file.relativePath)
    requireId(context, indexes.conditions, asString(mission.startConditionId), "condition", missionId, file.relativePath)
    for (const wave of asArray(mission.waves)) {
      const waveRecord = asRecord(wave)
      for (const entry of asArray(waveRecord?.entries)) {
        const entryRecord = asRecord(entry)
        requireId(context, indexes.enemies, asString(entryRecord?.enemyId), "enemy", missionId, file.relativePath)
      }
    }
    for (const hazard of asArray(mission.hazards)) {
      const hazardRecord = asRecord(hazard)
      requireId(context, indexes.conditions, asString(hazardRecord?.visibilityConditionId), "condition", missionId, file.relativePath)
    }
  }
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
  }
}

function validateMapReferences(context: ValidationContext, indexes: ReturnType<typeof createIndexes>): void {
  const knownNodeIds = new Set<string>()
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

  for (const [id] of new Map([...indexes.missions, ...indexes.enemies, ...indexes.bulletPatterns, ...indexes.projectiles])) {
    if (!classified.has(id)) {
      addIssue(context, `Content id '${id}' is not classified as active, prototype, or deprecated.`, classificationFile.relativePath)
    }
  }
}

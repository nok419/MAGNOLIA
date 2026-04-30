import path from "node:path"
import { existsSync, readdirSync, readFileSync } from "node:fs"
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
    const hazardIds = new Set(
      asArray(mission.hazards)
        .map((hazard) => asString(asRecord(hazard)?.hazardId))
        .filter((hazardId): hazardId is string => Boolean(hazardId)),
    )
    for (const beat of asArray(mission.beatEvents)) {
      const beatRecord = asRecord(beat)
      const beatId = asString(beatRecord?.beatId) ?? "(unknown beat)"
      for (const chunkId of asArray(beatRecord?.transcriptChunkIds)) {
        requireId(context, indexes.chunks, asString(chunkId), "transcript chunk", `${missionId}/${beatId}`, file.relativePath)
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

  for (const [kind, ids] of [
    ["missions", activeMissions],
    ["enemies", activeEnemies],
    ["bulletPatterns", activeBulletPatterns],
    ["projectiles", activeProjectiles],
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
        const enemyId = asString(asRecord(entry)?.enemyId)
        if (enemyId && !activeEnemies.has(enemyId)) {
          addIssue(context, `Active mission '${missionId}' references non-active enemy '${enemyId}'.`, file.relativePath)
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

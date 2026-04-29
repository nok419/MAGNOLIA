#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const ID_KEYS_BY_GROUP = {
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

const CLASSIFIED_KINDS = {
  missions: "mission",
  enemies: "enemy",
  "bullet-patterns": "bullet pattern",
  projectiles: "projectile",
}

const MIGRATION_TARGETS = {
  areas: "area",
  transmissions: "transmission",
  missions: "mission",
  equipment: "equipment",
  worldMapNodes: "world map node",
  enemies: "enemy",
  bulletPatterns: "bullet pattern",
  projectiles: "projectile",
}

const ENEMY_RENDERER_KINDS = new Set(["orbital", "orbitalBoss"])
const PROJECTILE_RENDERER_KINDS = new Set([
  "playerPulse",
  "playerCarrier",
  "playerCarrierBlast",
  "playerMelee",
  "noiseOrb",
  "geoDiamond",
  "enemyLance",
  "bossCore",
  "signalShard",
])
const HAZARD_RENDERER_KINDS = new Set(["magneticDisaster"])
const PALETTE_ROLES = new Set(["normalSignal", "memoryFragment", "dangerNoise", "support"])
const BACKGROUND_THEMES = new Set(["centralTower", "broadcastFacility", "voidField"])
const HITBOX_SHAPES = new Set(["circle", "ellipse", "rect", "polygon"])
const PRESENTATION_CHANNELS = new Set(["overlay", "explore", "battle", "transition", "ui"])
const TRANSCRIPT_IMPORTANCE_VALUES = new Set(["normal", "important", "critical"])
const FRAGMENT_RECOVERY_LIFETIME_KEYS = new Set(["calm", "terminal"])

const MAIN_WEAPON_HANDLERS = new Set([
  "weapon.main.pulse",
  "weapon.main.carrier",
  "weapon.main.default",
])
const SUB_WEAPON_HANDLERS = new Set([
  "sub.default.burst",
  "sub.barrier.noise_canceller",
  "sub.field.silent_wave",
])
const PASSIVE_HANDLERS = new Set([
  "os.magnolia.core",
  "os.analysis.boost",
  "subsystem.map.reveal",
  "subsystem.movement.focus",
  "subsystem.shot.modifier.homing",
  "subsystem.shot.modifier.burn",
])
const SUBSYSTEM_HOOK_HANDLERS = new Set([
  "subsystem.analysis.ramp",
  "subsystem.noise.gate",
])

const EFFECT_PROJECTILE_PARAM_KEYS = [
  "projectileId",
  "meleeProjectileId",
  "explosionVisualProjectileId",
]

function addIssue(context, message, file) {
  context.issues.push({ file, message })
}

function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asString(value) {
  return typeof value === "string" ? value : undefined
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function getId(record, keys) {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) {
      return value
    }
  }
  return undefined
}

function indexById(files, keys) {
  const index = new Map()
  for (const file of files) {
    const record = asRecord(file.data)
    if (!record) {
      continue
    }
    const id = getId(record, keys)
    if (id) {
      index.set(id, file)
    }
  }
  return index
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join("/")
}

function collectJsonFiles(dir, rootDir, gameplayDir) {
  if (!existsSync(dir)) {
    return []
  }

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath, rootDir, gameplayDir))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }
    files.push({
      path: entryPath,
      relativePath: normalizeRelativePath(path.relative(rootDir, entryPath)),
      gameplayRelativePath: normalizeRelativePath(path.relative(gameplayDir, entryPath)),
      data: readJson(entryPath),
    })
  }
  return files
}

function resolveGroup(relativePath) {
  const parts = relativePath.split("/")
  if (parts[0] === "equipment" && parts[1] === "effects") {
    return "equipment/effects"
  }
  if (parts[0] === "progression" && parts[1] === "conditions") {
    return "progression"
  }
  return parts[0]
}

function groupFiles(files) {
  const groups = {}
  for (const file of files) {
    const group = resolveGroup(file.gameplayRelativePath)
    groups[group] ??= []
    groups[group].push(file)
  }
  return groups
}

function createStore(options) {
  const rootDir = options.rootDir
  const gameplayDir = options.gameplayDir
  const files = collectJsonFiles(gameplayDir, rootDir, gameplayDir)
  return {
    rootDir,
    gameplayDir,
    files,
    byGroup: groupFiles(files),
  }
}

function createIndexes(context) {
  const transmissionFiles = context.store.byGroup.transmissions ?? []
  return {
    areas: indexById(context.store.byGroup.areas ?? [], ["areaId"]),
    missions: indexById(context.store.byGroup.missions ?? [], ["missionId"]),
    transmissions: indexById(
      transmissionFiles.filter((file) => !file.relativePath.endsWith(".chunks.json")),
      ["transmissionId"],
    ),
    chunks: indexChunkFiles(transmissionFiles),
    enemies: indexById(context.store.byGroup.enemies ?? [], ["enemyId"]),
    bulletPatterns: indexById(context.store.byGroup["bullet-patterns"] ?? [], ["bulletPatternId"]),
    projectiles: indexById(context.store.byGroup.projectiles ?? [], ["projectileId"]),
    equipment: indexById(context.store.byGroup.equipment ?? [], ["equipmentId"]),
    effects: indexById(context.store.byGroup["equipment/effects"] ?? [], ["effectId"]),
    conditions: indexById(collectConditionFiles(context), ["conditionId"]),
    maps: indexById(context.store.byGroup["map-logic"] ?? [], ["mapId"]),
    visualPresets: indexById(context.store.byGroup["visual-presets"] ?? [], ["presetId"]),
    hitboxPresets: indexById(
      context.store.byGroup["hitbox-presets"] ?? [],
      ["presetId", "hitboxPresetId"],
    ),
    backgroundPresets: indexById(context.store.byGroup["background-presets"] ?? [], ["presetId"]),
  }
}

function collectConditionFiles(context) {
  return context.store.files.filter((file) =>
    file.gameplayRelativePath.includes("progression/conditions/")
  )
}

function indexChunkFiles(files) {
  const index = new Map()
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

function validateReferenceRules(context, indexes) {
  validateFileNameMatchesId(context)
  validateUniqueIds(context)
  validateAreaReferences(context, indexes)
  validateTransmissionReferences(context, indexes)
  validateMissionReferences(context, indexes)
  validateEnemyReferences(context, indexes)
  validateBulletPatternReferences(context, indexes)
  validateEquipmentReferences(context, indexes)
  validateMapReferences(context, indexes)
  validateConditionReferences(context, indexes)
  validateEffectRuntimeAndProjectileReferences(context, indexes)
  validateContentDrivenExperienceFields(context, indexes)
}

function validateFileNameMatchesId(context) {
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
    if (id && id !== basename) {
      addIssue(context, `JSON ID '${id}' must match file name '${basename}'.`, file.relativePath)
    }
  }
}

function validateUniqueIds(context) {
  const seen = new Map()
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

function checkUnique(context, seen, id, file) {
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

function requireId(context, index, id, kind, owner, file) {
  if (id && !index.has(id)) {
    addIssue(context, `Missing ${kind} '${id}' referenced by ${owner}.`, file)
  }
}

function validateAreaReferences(context, indexes) {
  for (const [areaId, file] of indexes.areas) {
    const area = asRecord(file.data)
    if (!area) {
      continue
    }
    requireId(context, indexes.maps, asString(area.mapId), "map", areaId, file.relativePath)
    requireId(
      context,
      indexes.conditions,
      asString(area.unlockConditionId),
      "condition",
      areaId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(area.visibilityConditionId),
      "condition",
      areaId,
      file.relativePath,
    )
    for (const transmissionId of asArray(area.transmissionIds)) {
      requireId(
        context,
        indexes.transmissions,
        asString(transmissionId),
        "transmission",
        areaId,
        file.relativePath,
      )
    }
  }
}

function validateTransmissionReferences(context, indexes) {
  for (const [transmissionId, file] of indexes.transmissions) {
    const transmission = asRecord(file.data)
    if (!transmission) {
      continue
    }
    requireId(
      context,
      indexes.areas,
      asString(transmission.areaId),
      "area",
      transmissionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.missions,
      asString(transmission.missionId),
      "mission",
      transmissionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(transmission.visibilityConditionId),
      "condition",
      transmissionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(transmission.accessConditionId),
      "condition",
      transmissionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(transmission.unlockConditionId),
      "condition",
      transmissionId,
      file.relativePath,
    )
    for (const chunkId of asArray(transmission.transcriptChunkIds)) {
      requireId(
        context,
        indexes.chunks,
        asString(chunkId),
        "transcript chunk",
        transmissionId,
        file.relativePath,
      )
    }
    for (const equipmentId of asArray(transmission.rewardEquipmentIds)) {
      requireId(
        context,
        indexes.equipment,
        asString(equipmentId),
        "reward equipment",
        transmissionId,
        file.relativePath,
      )
    }
  }
}

function validateMissionReferences(context, indexes) {
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    if (!mission) {
      continue
    }
    requireId(
      context,
      indexes.transmissions,
      asString(mission.transmissionId),
      "transmission",
      missionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(mission.visibilityConditionId),
      "condition",
      missionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(mission.startConditionId),
      "condition",
      missionId,
      file.relativePath,
    )
    for (const wave of asArray(mission.waves)) {
      const waveRecord = asRecord(wave)
      for (const entry of asArray(waveRecord?.entries)) {
        const entryRecord = asRecord(entry)
        requireId(
          context,
          indexes.enemies,
          asString(entryRecord?.enemyId),
          "enemy",
          missionId,
          file.relativePath,
        )
      }
    }
    for (const hazard of asArray(mission.hazards)) {
      const hazardRecord = asRecord(hazard)
      requireId(
        context,
        indexes.conditions,
        asString(hazardRecord?.visibilityConditionId),
        "condition",
        missionId,
        file.relativePath,
      )
    }
  }
}

function validateEnemyReferences(context, indexes) {
  for (const [enemyId, file] of indexes.enemies) {
    const enemy = asRecord(file.data)
    if (!enemy) {
      continue
    }
    for (const bulletPatternId of asArray(enemy.bulletPatternIds)) {
      requireId(
        context,
        indexes.bulletPatterns,
        asString(bulletPatternId),
        "bullet pattern",
        enemyId,
        file.relativePath,
      )
    }
  }
}

function validateBulletPatternReferences(context, indexes) {
  for (const [patternId, file] of indexes.bulletPatterns) {
    const pattern = asRecord(file.data)
    if (!pattern) {
      continue
    }
    requireId(
      context,
      indexes.projectiles,
      asString(pattern.projectileId),
      "projectile",
      patternId,
      file.relativePath,
    )
  }
}

function validateEquipmentReferences(context, indexes) {
  for (const [equipmentId, file] of indexes.equipment) {
    const equipment = asRecord(file.data)
    if (!equipment) {
      continue
    }
    requireId(
      context,
      indexes.conditions,
      asString(equipment.unlockConditionId),
      "condition",
      equipmentId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.conditions,
      asString(equipment.visibilityConditionId),
      "condition",
      equipmentId,
      file.relativePath,
    )
    for (const effectId of [
      ...asArray(equipment.passiveEffectIds),
      ...asArray(equipment.activeEffectIds),
    ]) {
      requireId(
        context,
        indexes.effects,
        asString(effectId),
        "effect",
        equipmentId,
        file.relativePath,
      )
    }
    const unlockSource = asRecord(equipment.unlockSource)
    if (unlockSource?.kind === "transmissionReward") {
      requireId(
        context,
        indexes.transmissions,
        asString(unlockSource.transmissionId),
        "transmission",
        equipmentId,
        file.relativePath,
      )
    }
  }
}

function validateMapReferences(context, indexes) {
  const knownNodeIds = new Set()
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
        requireId(
          context,
          indexes.conditions,
          asString(nodeRecord?.visibilityConditionId),
          "condition",
          mapId,
          file.relativePath,
        )
        requireId(
          context,
          indexes.conditions,
          asString(nodeRecord?.accessConditionId),
          "condition",
          mapId,
          file.relativePath,
        )
        requireId(
          context,
          indexes.transmissions,
          asString(nodeRecord?.transmissionId),
          "transmission",
          mapId,
          file.relativePath,
        )
        requireId(
          context,
          indexes.equipment,
          asString(nodeRecord?.equipmentId),
          "equipment",
          mapId,
          file.relativePath,
        )
        requireId(
          context,
          indexes.areas,
          asString(nodeRecord?.warpTargetAreaId),
          "target area",
          mapId,
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

  context.knownNodeIds = knownNodeIds
}

function validateConditionReferences(context, indexes) {
  for (const [conditionId, file] of indexes.conditions) {
    const condition = asRecord(file.data)
    if (!condition) {
      continue
    }
    for (const childId of asArray(condition.children)) {
      requireId(
        context,
        indexes.conditions,
        asString(childId),
        "condition",
        conditionId,
        file.relativePath,
      )
    }
    requireId(
      context,
      indexes.conditions,
      asString(condition.child),
      "condition",
      conditionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.missions,
      asString(condition.missionId),
      "mission",
      conditionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.areas,
      asString(condition.areaId),
      "area",
      conditionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.transmissions,
      asString(condition.transmissionId),
      "transmission",
      conditionId,
      file.relativePath,
    )
    requireId(
      context,
      indexes.equipment,
      asString(condition.equipmentId),
      "equipment",
      conditionId,
      file.relativePath,
    )
  }
}

function validateEffectRuntimeAndProjectileReferences(context, indexes) {
  for (const [equipmentId, file] of indexes.equipment) {
    const equipment = asRecord(file.data)
    if (!equipment) {
      continue
    }
    const handlerId = asString(equipment.runtimeHandlerId)
    if (!handlerId) {
      continue
    }
    const slot = asString(equipment.slot)
    if (slot === "main" && !MAIN_WEAPON_HANDLERS.has(handlerId)) {
      addIssue(context, `Equipment '${equipmentId}' references unknown main handler '${handlerId}'.`, file.relativePath)
    }
    if (slot === "sub" && !SUB_WEAPON_HANDLERS.has(handlerId)) {
      addIssue(context, `Equipment '${equipmentId}' references unknown sub handler '${handlerId}'.`, file.relativePath)
    }
  }

  for (const [effectId, file] of indexes.effects) {
    const effect = asRecord(file.data)
    if (!effect) {
      continue
    }
    validateEffectHandler(context, effectId, effect, file.relativePath)

    const params = asRecord(effect.params)
    for (const key of EFFECT_PROJECTILE_PARAM_KEYS) {
      const projectileId = asString(params?.[key])
      requireId(
        context,
        indexes.projectiles,
        projectileId,
        "projectile",
        `${effectId}.${key}`,
        file.relativePath,
      )
    }
  }
}

function validateEffectHandler(context, effectId, effect, file) {
  const handlerId = asString(effect.runtimeHandlerId)
  if (!handlerId) {
    return
  }

  if (asString(effect.hookKind)) {
    if (!SUBSYSTEM_HOOK_HANDLERS.has(handlerId)) {
      addIssue(context, `Effect '${effectId}' references unknown subsystem hook '${handlerId}'.`, file)
    }
    return
  }

  const effectKind = asString(effect.effectKind)
  const known =
    MAIN_WEAPON_HANDLERS.has(handlerId) ||
    SUB_WEAPON_HANDLERS.has(handlerId) ||
    PASSIVE_HANDLERS.has(handlerId)

  if (!known) {
    addIssue(context, `Effect '${effectId}' references unknown runtime handler '${handlerId}'.`, file)
    return
  }

  if (effectKind === "subArmField" && !SUB_WEAPON_HANDLERS.has(handlerId)) {
    addIssue(context, `Effect '${effectId}' must use a sub weapon handler.`, file)
  }
}

function validateContentDrivenExperienceFields(context, indexes) {
  validateTranscriptChunkRecoveryFields(context)
  validateMissionFragmentRecoveryFields(context, indexes)
  validateMapSignalProfiles(context, indexes)
}

function validateTranscriptChunkRecoveryFields(context) {
  for (const file of context.store.byGroup.transmissions ?? []) {
    if (!file.relativePath.endsWith(".chunks.json")) {
      continue
    }
    for (const chunk of asArray(file.data)) {
      const record = asRecord(chunk)
      if (!record) {
        continue
      }
      const chunkId = asString(record.chunkId) ?? "(unknown)"
      const importance = asString(record.importance)
      if (importance && !TRANSCRIPT_IMPORTANCE_VALUES.has(importance)) {
        addIssue(context, `Transcript chunk '${chunkId}' has unsupported importance '${importance}'.`, file.relativePath)
      }
      validateFragmentRecoverySpec(
        context,
        asRecord(record.fragmentRecovery),
        `Transcript chunk '${chunkId}'.fragmentRecovery`,
        file.relativePath,
      )
    }
  }
}

function validateMissionFragmentRecoveryFields(context, indexes) {
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    const tuning = asRecord(mission?.fragmentRecovery)
    if (!tuning) {
      continue
    }

    validatePositiveNumber(context, tuning.cooldownMs, `${missionId}.fragmentRecovery.cooldownMs`, file.relativePath)
    validatePositiveNumber(
      context,
      tuning.spawnDistanceMin,
      `${missionId}.fragmentRecovery.spawnDistanceMin`,
      file.relativePath,
    )
    validatePositiveNumber(
      context,
      tuning.spawnDistanceMax,
      `${missionId}.fragmentRecovery.spawnDistanceMax`,
      file.relativePath,
    )
    validateRate(context, tuning.minSpanRatio, `${missionId}.fragmentRecovery.minSpanRatio`, file.relativePath)
    validateRate(context, tuning.maxSpanRatio, `${missionId}.fragmentRecovery.maxSpanRatio`, file.relativePath)
    validateMinMax(
      context,
      tuning.spawnDistanceMin,
      tuning.spawnDistanceMax,
      `${missionId}.fragmentRecovery.spawnDistanceMin`,
      `${missionId}.fragmentRecovery.spawnDistanceMax`,
      file.relativePath,
    )
    validateMinMax(
      context,
      tuning.minSpanRatio,
      tuning.maxSpanRatio,
      `${missionId}.fragmentRecovery.minSpanRatio`,
      `${missionId}.fragmentRecovery.maxSpanRatio`,
      file.relativePath,
    )

    const lifetimeMs = asRecord(tuning.lifetimeMs)
    for (const [key, value] of Object.entries(lifetimeMs ?? {})) {
      if (!FRAGMENT_RECOVERY_LIFETIME_KEYS.has(key)) {
        addIssue(context, `${missionId}.fragmentRecovery.lifetimeMs has unsupported key '${key}'.`, file.relativePath)
        continue
      }
      validatePositiveNumber(context, value, `${missionId}.fragmentRecovery.lifetimeMs.${key}`, file.relativePath)
    }
  }
}

function validateFragmentRecoverySpec(context, recovery, owner, file) {
  if (!recovery) {
    return
  }
  validatePositiveNumber(context, recovery.weight, `${owner}.weight`, file)
  validateRate(context, recovery.minSpanRatio, `${owner}.minSpanRatio`, file)
  validateRate(context, recovery.maxSpanRatio, `${owner}.maxSpanRatio`, file)
  validatePositiveNumber(context, recovery.lifetimeMultiplier, `${owner}.lifetimeMultiplier`, file)
  validateMinMax(context, recovery.minSpanRatio, recovery.maxSpanRatio, `${owner}.minSpanRatio`, `${owner}.maxSpanRatio`, file)
}

function validateMapSignalProfiles(context, indexes) {
  for (const [mapId, file] of indexes.maps) {
    const map = asRecord(file.data)
    if (!map) {
      continue
    }
    for (const group of ["transmissionNodes", "collectibleNodes"]) {
      for (const node of asArray(map[group])) {
        const nodeRecord = asRecord(node)
        const nodeId = asString(nodeRecord?.nodeId) ?? `${mapId}.${group}`
        validateSignalProfile(
          context,
          asRecord(nodeRecord?.signalProfile),
          `Node '${nodeId}'.signalProfile`,
          file.relativePath,
        )
      }
    }
  }
}

function validateSignalProfile(context, profile, owner, file) {
  if (!profile) {
    return
  }
  for (const key of [
    "passiveRadius",
    "passiveConfidenceRadius",
    "scanRadius",
    "confidenceMultiplier",
    "hintStrengthMultiplier",
  ]) {
    validatePositiveNumber(context, profile[key], `${owner}.${key}`, file)
  }
}

function validateTimingRules(context, indexes) {
  const chunksByTransmission = indexChunksByTransmission(context)
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    if (!mission) {
      continue
    }
    const durationMs = asNumber(mission.durationMs)
    if (!durationMs || durationMs <= 0) {
      addIssue(context, `Mission '${missionId}' must have positive durationMs.`, file.relativePath)
      continue
    }
    validateNumberRange(context, mission.audioStartDelayMs, 0, 10000, "audioStartDelayMs", missionId, file.relativePath)
    validateNumberRange(context, mission.outroMs, 0, durationMs, "outroMs", missionId, file.relativePath)
    validateNumberRange(context, mission.hearingThresholdOverride, 0, 1, "hearingThresholdOverride", missionId, file.relativePath)
    validateNumberRange(context, mission.repeatDecayRate, 0, 1, "repeatDecayRate", missionId, file.relativePath)

    for (const wave of asArray(mission.waves)) {
      const waveRecord = asRecord(wave)
      const atMs = asNumber(waveRecord?.atMs)
      if (atMs === undefined || atMs < 0 || atMs > durationMs) {
        addIssue(context, `Mission '${missionId}' has wave outside duration at ${String(atMs)}ms.`, file.relativePath)
      }
    }
    for (const hazard of asArray(mission.hazards)) {
      const hazardRecord = asRecord(hazard)
      const spawnAtMs = asNumber(hazardRecord?.spawnAtMs) ?? 0
      const telegraphMs = asNumber(hazardRecord?.telegraphMs) ?? 0
      const activeMs = asNumber(hazardRecord?.activeMs) ?? 0
      const fadeOutMs = asNumber(hazardRecord?.fadeOutMs) ?? 0
      const endMs = spawnAtMs + telegraphMs + activeMs + fadeOutMs
      if (spawnAtMs < 0 || endMs > durationMs) {
        addIssue(
          context,
          `Mission '${missionId}' has hazard '${String(hazardRecord?.hazardId)}' ending at ${endMs}ms outside ${durationMs}ms.`,
          file.relativePath,
        )
      }
    }

    const transmissionId = asString(mission.transmissionId)
    const chunks = transmissionId ? chunksByTransmission.get(transmissionId) ?? [] : []
    if (chunks.length > 0) {
      const maxChunkEndMs = Math.max(...chunks.map((chunk) => asNumber(chunk.endMs) ?? 0))
      const audioStartDelayMs = asNumber(mission.audioStartDelayMs) ?? 0
      const outroMs = asNumber(mission.outroMs) ?? 0
      if (audioStartDelayMs + maxChunkEndMs + outroMs > durationMs) {
        addIssue(
          context,
          `Mission '${missionId}' duration does not contain audioStartDelayMs + subtitle chunks + outroMs.`,
          file.relativePath,
        )
      }
    }
  }
}

function validateNumberRange(context, value, min, max, label, owner, file) {
  if (value === undefined) {
    return
  }
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue < min || numberValue > max) {
    addIssue(context, `${owner}.${label} must be between ${min} and ${max}.`, file)
  }
}

function validatePositiveNumber(context, value, label, file) {
  if (value === undefined) {
    return
  }
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue <= 0) {
    addIssue(context, `${label} must be a positive number.`, file)
  }
}

function validateRate(context, value, label, file) {
  if (value === undefined) {
    return
  }
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue < 0 || numberValue > 1) {
    addIssue(context, `${label} must be between 0 and 1.`, file)
  }
}

function validateMinMax(context, minValue, maxValue, minLabel, maxLabel, file) {
  const minNumber = asNumber(minValue)
  const maxNumber = asNumber(maxValue)
  if (minNumber !== undefined && maxNumber !== undefined && minNumber > maxNumber) {
    addIssue(context, `${minLabel} must be less than or equal to ${maxLabel}.`, file)
  }
}

function indexChunksByTransmission(context) {
  const chunksByTransmission = new Map()
  for (const file of context.store.byGroup.transmissions ?? []) {
    if (!file.relativePath.endsWith(".chunks.json")) {
      continue
    }

    let previousEndMs = -Infinity
    for (const chunk of asArray(file.data)) {
      const record = asRecord(chunk)
      if (!record) {
        continue
      }
      const transmissionId = asString(record.transmissionId)
      const chunkId = asString(record.chunkId) ?? "(unknown)"
      const startMs = asNumber(record.startMs)
      const endMs = asNumber(record.endMs)
      if (startMs === undefined || endMs === undefined || endMs <= startMs) {
        addIssue(context, `Transcript chunk '${chunkId}' must have endMs greater than startMs.`, file.relativePath)
      }
      if (startMs !== undefined && startMs < previousEndMs) {
        addIssue(context, `Transcript chunk '${chunkId}' overlaps the previous chunk.`, file.relativePath)
      }
      previousEndMs = endMs ?? previousEndMs
      if (!transmissionId) {
        continue
      }
      const list = chunksByTransmission.get(transmissionId) ?? []
      list.push(record)
      chunksByTransmission.set(transmissionId, list)
    }
  }
  return chunksByTransmission
}

function validatePresetRules(context, indexes) {
  validatePresetDefinitions(context, indexes)
  validatePresetCoverage(context, indexes)
}

function validatePresetDefinitions(context, indexes) {
  for (const [presetId, file] of indexes.visualPresets) {
    const preset = asRecord(file.data)
    const category = asString(preset?.category)
    const rendererKind = asString(preset?.rendererKind)
    if (category === "enemy" && !ENEMY_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Enemy visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "projectile" && !PROJECTILE_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Projectile visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "hazard" && !HAZARD_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Hazard visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    const paletteRole = asString(preset?.paletteRole)
    if (!PALETTE_ROLES.has(paletteRole ?? "")) {
      addIssue(context, `Visual preset '${presetId}' has unsupported paletteRole '${String(paletteRole)}'.`, file.relativePath)
    }
    if (!asString(preset?.accessibilityVariant)) {
      addIssue(context, `Visual preset '${presetId}' must declare accessibilityVariant.`, file.relativePath)
    }
  }

  for (const [presetId, file] of indexes.hitboxPresets) {
    const preset = asRecord(file.data)
    const shape = asString(preset?.shape)
    if (!HITBOX_SHAPES.has(shape ?? "")) {
      addIssue(context, `Hitbox preset '${presetId}' has unsupported shape '${String(shape)}'.`, file.relativePath)
    }
  }

  for (const [presetId, file] of indexes.backgroundPresets) {
    const preset = asRecord(file.data)
    const theme = asString(preset?.theme)
    if (!BACKGROUND_THEMES.has(theme ?? "")) {
      addIssue(context, `Background preset '${presetId}' has unsupported theme '${String(theme)}'.`, file.relativePath)
    }
    for (const key of [
      "residualWarmth",
      "structureDensity",
      "dustDensity",
      "scanlineIntensity",
      "vignetteStrength",
    ]) {
      const value = asNumber(preset?.[key])
      if (value === undefined || value < 0 || value > 1) {
        addIssue(context, `Background preset '${presetId}.${key}' must be between 0 and 1.`, file.relativePath)
      }
    }
  }
}

function validatePresetCoverage(context, indexes) {
  for (const [missionId, file] of indexes.missions) {
    const mission = asRecord(file.data)
    requirePreset(
      context,
      indexes.backgroundPresets,
      asString(mission?.backgroundPresetId),
      "background preset",
      missionId,
      file.relativePath,
    )
    for (const hazard of asArray(mission?.hazards)) {
      const hazardRecord = asRecord(hazard)
      requirePreset(
        context,
        indexes.visualPresets,
        asString(hazardRecord?.visualPresetId),
        "hazard visual preset",
        missionId,
        file.relativePath,
      )
    }
  }

  for (const [enemyId, file] of indexes.enemies) {
    const enemy = asRecord(file.data)
    requirePreset(
      context,
      indexes.visualPresets,
      asString(enemy?.visualPresetId),
      "enemy visual preset",
      enemyId,
      file.relativePath,
    )
    requirePreset(
      context,
      indexes.hitboxPresets,
      asString(enemy?.hitboxPresetId),
      "enemy hitbox preset",
      enemyId,
      file.relativePath,
    )
  }

  for (const [projectileId, file] of indexes.projectiles) {
    const projectile = asRecord(file.data)
    requirePreset(
      context,
      indexes.visualPresets,
      asString(projectile?.visualPresetId),
      "projectile visual preset",
      projectileId,
      file.relativePath,
    )
    requirePreset(
      context,
      indexes.hitboxPresets,
      asString(projectile?.hitboxPresetId),
      "projectile hitbox preset",
      projectileId,
      file.relativePath,
    )
  }
}

function requirePreset(context, index, presetId, kind, owner, file) {
  if (!presetId || !index.has(presetId)) {
    addIssue(context, `Missing ${kind} '${String(presetId)}' referenced by ${owner}.`, file)
  }
}

function validatePresentationCueRules(context) {
  const file = context.store.files.find((entry) => entry.gameplayRelativePath === "presentation-cues.json")
  if (!file) {
    addIssue(context, "Missing presentation-cues.json.", "content/gameplay")
    return
  }
  for (const cue of asArray(file.data)) {
    const record = asRecord(cue)
    const id = asString(record?.id) ?? "(unknown)"
    if (!PRESENTATION_CHANNELS.has(asString(record?.channel) ?? "")) {
      addIssue(context, `Presentation cue '${id}' has unsupported channel '${String(record?.channel)}'.`, file.relativePath)
    }
    const durationMs = asNumber(record?.defaultDurationMs)
    if (durationMs === undefined || durationMs <= 0 || durationMs > 10000) {
      addIssue(context, `Presentation cue '${id}' must declare defaultDurationMs between 1 and 10000.`, file.relativePath)
    }
    const reduceFlashingVariant = asRecord(record?.reduceFlashingVariant)
    if (!reduceFlashingVariant) {
      addIssue(context, `Presentation cue '${id}' must declare reduceFlashingVariant.`, file.relativePath)
    }
    const variantDuration = asNumber(reduceFlashingVariant?.defaultDurationMs)
    if (variantDuration !== undefined && durationMs !== undefined && variantDuration > durationMs * 1.5) {
      addIssue(context, `Presentation cue '${id}' reduceFlashingVariant duration is unexpectedly long.`, file.relativePath)
    }
    const maxFlashHz = asNumber(record?.maxFlashHz)
    if (maxFlashHz !== undefined && maxFlashHz > 3) {
      addIssue(context, `Presentation cue '${id}' maxFlashHz must be 3 or lower.`, file.relativePath)
    }
  }
}

function validateContentClassification(context, indexes) {
  const file = context.store.files.find((entry) => entry.gameplayRelativePath === "content-classification.json")
  const classification = file ? asRecord(file.data) : null
  if (!file || !classification) {
    addIssue(context, "Missing active / prototype / deprecated content classification.", "content/gameplay")
    return new Map()
  }

  const bucketByContentKey = new Map()
  for (const bucket of ["active", "prototype", "deprecated"]) {
    const bucketRecord = asRecord(classification[bucket])
    for (const [kind, ids] of Object.entries(bucketRecord ?? {})) {
      if (!CLASSIFIED_KINDS[kind]) {
        addIssue(context, `Classification contains unsupported kind '${kind}'.`, file.relativePath)
        continue
      }
      const knownIds = getClassifiedIndex(indexes, kind)
      for (const id of asArray(ids)) {
        const idString = asString(id)
        if (!idString) {
          continue
        }
        if (!knownIds.has(idString)) {
          addIssue(context, `Classification contains unknown ${kind} id '${idString}'.`, file.relativePath)
          continue
        }
        const key = `${kind}:${idString}`
        const previous = bucketByContentKey.get(key)
        if (previous) {
          addIssue(context, `Content id '${idString}' appears in both ${previous} and ${bucket}.`, file.relativePath)
        }
        bucketByContentKey.set(key, bucket)
      }
    }
  }

  for (const kind of Object.keys(CLASSIFIED_KINDS)) {
    for (const [id] of getClassifiedIndex(indexes, kind)) {
      if (!bucketByContentKey.has(`${kind}:${id}`)) {
        addIssue(context, `Content id '${id}' is not classified as active, prototype, or deprecated.`, file.relativePath)
      }
    }
  }

  validateActiveDependencyPolicy(context, indexes, bucketByContentKey, file.relativePath)
  return bucketByContentKey
}

function getClassifiedIndex(indexes, kind) {
  if (kind === "bullet-patterns") {
    return indexes.bulletPatterns
  }
  return indexes[kind]
}

function readBucket(bucketByContentKey, kind, id) {
  return bucketByContentKey.get(`${kind}:${id}`)
}

function requireActiveReference(context, bucketByContentKey, kind, id, owner, file) {
  if (!id) {
    return
  }
  const bucket = readBucket(bucketByContentKey, kind, id)
  if (bucket && bucket !== "active") {
    addIssue(context, `Active content '${owner}' references ${bucket} ${CLASSIFIED_KINDS[kind]} '${id}'.`, file)
  }
}

function validateActiveDependencyPolicy(context, indexes, bucketByContentKey) {
  for (const [missionId, file] of indexes.missions) {
    if (readBucket(bucketByContentKey, "missions", missionId) !== "active") {
      continue
    }
    const mission = asRecord(file.data)
    for (const wave of asArray(mission?.waves)) {
      const waveRecord = asRecord(wave)
      for (const entry of asArray(waveRecord?.entries)) {
        const enemyId = asString(asRecord(entry)?.enemyId)
        requireActiveReference(context, bucketByContentKey, "enemies", enemyId, missionId, file.relativePath)
      }
    }
  }

  for (const [enemyId, file] of indexes.enemies) {
    if (readBucket(bucketByContentKey, "enemies", enemyId) !== "active") {
      continue
    }
    const enemy = asRecord(file.data)
    for (const bulletPatternId of asArray(enemy?.bulletPatternIds)) {
      requireActiveReference(
        context,
        bucketByContentKey,
        "bullet-patterns",
        asString(bulletPatternId),
        enemyId,
        file.relativePath,
      )
    }
  }

  for (const [patternId, file] of indexes.bulletPatterns) {
    if (readBucket(bucketByContentKey, "bullet-patterns", patternId) !== "active") {
      continue
    }
    const pattern = asRecord(file.data)
    requireActiveReference(
      context,
      bucketByContentKey,
      "projectiles",
      asString(pattern?.projectileId),
      patternId,
      file.relativePath,
    )
  }
}

function validateMigrationMap(context, indexes, bucketByContentKey) {
  const file = context.store.files.find((entry) => entry.gameplayRelativePath === "migrated-id-map.json")
  const migrationMap = file ? asRecord(file.data) : null
  if (!file || !migrationMap) {
    addIssue(context, "Missing save migration map.", "content/gameplay")
    return
  }

  const version = asNumber(migrationMap.schemaVersion)
  if (version === undefined || version < 1) {
    addIssue(context, "migrated-id-map.schemaVersion must be 1 or greater.", file.relativePath)
  }

  for (const [key, label] of Object.entries(MIGRATION_TARGETS)) {
    const mappings = asRecord(migrationMap[key])
    if (!mappings) {
      addIssue(context, `migrated-id-map.${key} must be an object.`, file.relativePath)
      continue
    }
    for (const [sourceId, targetValue] of Object.entries(mappings)) {
      const targetId = asString(targetValue)
      if (!targetId) {
        addIssue(context, `Migration target for '${sourceId}' must be a string.`, file.relativePath)
        continue
      }
      if (sourceId === targetId) {
        addIssue(context, `Migration '${sourceId}' points to itself.`, file.relativePath)
      }
      validateMigrationTarget(context, indexes, bucketByContentKey, key, label, targetId, file.relativePath)
    }
  }
}

function validateMigrationTarget(context, indexes, bucketByContentKey, key, label, targetId, file) {
  const indexByMigrationKey = {
    areas: indexes.areas,
    transmissions: indexes.transmissions,
    missions: indexes.missions,
    equipment: indexes.equipment,
    enemies: indexes.enemies,
    bulletPatterns: indexes.bulletPatterns,
    projectiles: indexes.projectiles,
  }

  if (key === "worldMapNodes") {
    if (!context.knownNodeIds?.has(targetId)) {
      addIssue(context, `Migration target ${label} '${targetId}' does not exist.`, file)
    }
    return
  }

  const index = indexByMigrationKey[key]
  if (!index?.has(targetId)) {
    addIssue(context, `Migration target ${label} '${targetId}' does not exist.`, file)
    return
  }

  const classificationKindByMigrationKey = {
    missions: "missions",
    enemies: "enemies",
    bulletPatterns: "bullet-patterns",
    projectiles: "projectiles",
  }
  const classificationKind = classificationKindByMigrationKey[key]
  if (classificationKind) {
    requireActiveReference(context, bucketByContentKey, classificationKind, targetId, "migrated-id-map", file)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const store = createStore(options)
  const context = { store, issues: [], knownNodeIds: new Set() }
  const indexes = createIndexes(context)

  validateReferenceRules(context, indexes)
  validateTimingRules(context, indexes)
  validatePresetRules(context, indexes)
  validatePresentationCueRules(context)
  const classification = validateContentClassification(context, indexes)
  validateMigrationMap(context, indexes, classification)

  if (context.issues.length > 0) {
    for (const issue of context.issues) {
      const prefix = issue.file ? `${issue.file}: ` : ""
      console.error(`${prefix}${issue.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`content validation passed (${store.files.length} JSON files)`)
}

function parseArgs(args) {
  const rootDir = process.cwd()
  let gameplayDir = path.join(rootDir, "content", "gameplay")

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--gameplay-dir") {
      const value = args[index + 1]
      if (!value) {
        throw new Error("--gameplay-dir requires a path.")
      }
      gameplayDir = path.resolve(rootDir, value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument '${arg}'.`)
  }

  return { rootDir, gameplayDir }
}

main()

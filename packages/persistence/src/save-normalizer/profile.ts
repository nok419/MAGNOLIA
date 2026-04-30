import {
  createDefaultSaveSlots,
  createEmptyEquippedItems,
} from "@magnolia/contracts"
import type {
  ContentBundle,
  EquipmentId,
  EquippedItems,
  ProfileAggregate,
  ProfileId,
  ProfileRow,
  SaveSlotId,
} from "@magnolia/contracts"
import {
  clampRate,
  normalizeVector,
  readDifficulty,
  readNonEmptyString,
  readNumber,
  readStringArray,
  readTimestamp,
  uniqueStrings,
} from "./primitives"

export function normalizeProfileRow(input: {
  profile: ProfileAggregate["profile"] | undefined
  profileId: ProfileId
  slotId: SaveSlotId
  initialAreaId: string
  content?: ContentBundle
  now: string
}): ProfileRow {
  const source = input.profile
  const currentAreaId = readExistingAreaId(
    source?.currentAreaId,
    input.content,
    input.initialAreaId,
  )
  const initialEquipmentIds = input.content
    ? Object.values(input.content.equipment)
        .filter((equipment) => equipment.unlockSource.kind === "initial")
        .map((equipment) => equipment.equipmentId)
    : []
  const ownedEquipmentIds = uniqueStrings([
    ...initialEquipmentIds,
    ...normalizeEquipmentIds(source?.ownedEquipmentIds, input.content),
  ])
  const equipped = normalizeEquippedItems(source?.equipped, ownedEquipmentIds, input.content)

  return {
    profileId: input.profileId,
    slotId: input.slotId,
    schemaVersion: Math.max(1, Math.trunc(readNumber(source?.schemaVersion, 1))),
    createdAt: readTimestamp(source?.createdAt, input.now),
    updatedAt: input.now,
    difficulty: readDifficulty(source?.difficulty),
    currentAreaId,
    playerPosition: normalizeVector(
      source?.playerPosition,
      input.content?.areas[currentAreaId]?.worldPosition ?? { x: 0, y: 0 },
    ),
    equipped,
    ownedEquipmentIds,
    equipmentLevels: normalizeEquipmentLevels(
      source?.equipmentLevels,
      ownedEquipmentIds,
      input.content,
    ),
    selfRepairPoints: Math.max(0, Math.trunc(readNumber(source?.selfRepairPoints, 0))),
    collectedNodeIds: normalizeCollectibleNodeIds(source?.collectedNodeIds, input.content),
    identifiedNodeIds: normalizeMapNodeIds(source?.identifiedNodeIds, input.content),
    unlockedFlags: uniqueStrings(readStringArray(source?.unlockedFlags)),
    clearedMissionIds: normalizeMissionIds(source?.clearedMissionIds, input.content),
  }
}

export function normalizeSaveSlotRow(input: {
  slotId: SaveSlotId
  saveSlot: ProfileAggregate["saveSlot"] | undefined
  profile: ProfileRow
  now: string
}): ProfileAggregate["saveSlot"] {
  const fallback = createDefaultSaveSlots().find((slot) => slot.slotId === input.slotId)
  if (!fallback) {
    throw new Error(`Unknown save slot ${input.slotId}.`)
  }

  return {
    slotId: input.slotId,
    profileId: input.profile.profileId,
    label: readNonEmptyString(input.saveSlot?.label, fallback.label),
    updatedAt: input.now,
    currentAreaId: input.profile.currentAreaId,
    playTimeMs: Math.max(0, Math.trunc(readNumber(input.saveSlot?.playTimeMs, 0))),
  }
}

export function readInitialAreaId(
  content: ContentBundle | undefined,
  fallbackAreaId?: string,
): string {
  if (!content) {
    return fallbackAreaId ?? "area_undefined"
  }

  if (fallbackAreaId && content.areas[fallbackAreaId]) {
    return fallbackAreaId
  }

  return (
    Object.values(content.areas).find((area) => area.initialState === "visible")?.areaId ??
    Object.keys(content.areas)[0]
  )
}

function readExistingAreaId(
  areaId: string | undefined,
  content: ContentBundle | undefined,
  fallbackAreaId: string,
): string {
  if (!content) {
    return areaId ?? fallbackAreaId
  }
  return areaId && content.areas[areaId] ? areaId : fallbackAreaId
}

function normalizeEquippedItems(
  equipped: EquippedItems | undefined,
  ownedEquipmentIds: EquipmentId[],
  content?: ContentBundle,
): EquippedItems {
  const source = equipped ?? createEmptyEquippedItems()
  return {
    main: normalizeEquippedItem(source.main, "main", ownedEquipmentIds, content),
    sub: normalizeEquippedItem(source.sub, "sub", ownedEquipmentIds, content),
    os: normalizeEquippedItem(source.os, "os", ownedEquipmentIds, content),
    subsystems: [
      normalizeEquippedItem(source.subsystems?.[0], "subsystem", ownedEquipmentIds, content) ?? null,
      normalizeEquippedItem(source.subsystems?.[1], "subsystem", ownedEquipmentIds, content) ?? null,
    ],
  }
}

function normalizeEquippedItem(
  equipmentId: EquipmentId | null | undefined,
  slot: "main" | "sub" | "os" | "subsystem",
  ownedEquipmentIds: EquipmentId[],
  content?: ContentBundle,
): EquipmentId | undefined {
  if (!equipmentId || !ownedEquipmentIds.includes(equipmentId)) {
    return undefined
  }

  if (!content) {
    return equipmentId
  }

  const equipment = content.equipment[equipmentId]
  if (!equipment || equipment.slot !== slot) {
    return undefined
  }

  return equipmentId
}

function normalizeEquipmentLevels(
  levels: ProfileRow["equipmentLevels"] | undefined,
  ownedEquipmentIds: EquipmentId[],
  content?: ContentBundle,
): ProfileRow["equipmentLevels"] {
  const normalized: ProfileRow["equipmentLevels"] = {}
  for (const equipmentId of ownedEquipmentIds) {
    const rawLevel = levels?.[equipmentId]
    const maxLevel = content?.equipment[equipmentId]?.maxLevel ?? 1
    normalized[equipmentId] = Math.min(
      maxLevel,
      Math.max(1, Math.trunc(readNumber(rawLevel, 1))),
    )
  }
  return normalized
}

function normalizeEquipmentIds(
  equipmentIds: ProfileRow["ownedEquipmentIds"] | undefined,
  content?: ContentBundle,
): EquipmentId[] {
  const ids = uniqueStrings(readStringArray(equipmentIds))
  if (!content) {
    return ids
  }
  return ids.filter((equipmentId) => Boolean(content.equipment[equipmentId]))
}

function normalizeCollectibleNodeIds(
  nodeIds: ProfileRow["collectedNodeIds"] | undefined,
  content?: ContentBundle,
): ProfileRow["collectedNodeIds"] {
  const ids = normalizeMapNodeIds(nodeIds, content)
  if (!content) {
    return ids
  }

  const collectibleNodeIds = new Set(
    Object.values(content.mapLogic).flatMap((mapLogic) =>
      mapLogic.collectibleNodes.map((node) => node.nodeId),
    ),
  )
  return ids.filter((nodeId) => collectibleNodeIds.has(nodeId))
}

function normalizeMapNodeIds(
  nodeIds: string[] | undefined,
  content?: ContentBundle,
): string[] {
  const ids = uniqueStrings(readStringArray(nodeIds))
  if (!content) {
    return ids
  }

  const knownNodeIds = new Set(
    Object.values(content.mapLogic).flatMap((mapLogic) =>
      [
        ...mapLogic.areaNodes,
        ...mapLogic.transmissionNodes,
        ...mapLogic.warpNodes,
        ...mapLogic.collectibleNodes,
      ].map((node) => node.nodeId),
    ),
  )
  return ids.filter((nodeId) => knownNodeIds.has(nodeId))
}

function normalizeMissionIds(
  missionIds: ProfileRow["clearedMissionIds"] | undefined,
  content?: ContentBundle,
): ProfileRow["clearedMissionIds"] {
  const ids = uniqueStrings(readStringArray(missionIds))
  if (!content) {
    return ids
  }
  return ids.filter((missionId) => Boolean(content.missions[missionId]))
}

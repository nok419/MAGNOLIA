import {
  createDefaultSaveSlots,
  createEmptyEquippedItems,
  createEmptyMetadataUnlocked,
  normalizeSettings,
} from "@magnolia/contracts"
import type {
  AreaProgressRow,
  ContentBundle,
  Difficulty,
  EquipmentId,
  EquippedItems,
  MissionRunRow,
  ProfileAggregate,
  ProfileId,
  ProfileRow,
  SaveSlotId,
  SettingsRow,
  TimeRange,
  TransmissionProgressRow,
  Vector2,
} from "@magnolia/contracts"

export function normalizePersistedSettings(settings: SettingsRow | null | undefined): SettingsRow {
  return normalizeSettings(settings)
}

export function normalizePersistedAggregate(input: {
  slotId: SaveSlotId
  aggregate: ProfileAggregate
  content?: ContentBundle
  rebindProfileId?: boolean
}): ProfileAggregate {
  const now = new Date().toISOString()
  const initialAreaId = readInitialAreaId(input.content, input.aggregate?.profile?.currentAreaId)
  // load / save / import の入口をここへ集約し、保存形式が増えても検証基準を 1 か所で保ちます。
  // 別スロット保存や import では profileId を振り直し、元スロットの continue 導線を壊しません。
  const nextProfileId = input.rebindProfileId
    ? createProfileId(input.slotId)
    : readProfileId(input.aggregate?.profile?.profileId, input.slotId)

  const profile = normalizeProfileRow({
    profile: input.aggregate?.profile,
    profileId: nextProfileId,
    slotId: input.slotId,
    now,
    initialAreaId,
    content: input.content,
  })

  const saveSlot = normalizeSaveSlotRow({
    slotId: input.slotId,
    saveSlot: input.aggregate?.saveSlot,
    profile,
    now,
  })

  return {
    profile,
    saveSlot,
    areaProgress: normalizeAreaProgressRows({
      rows: input.aggregate?.areaProgress ?? [],
      profileId: profile.profileId,
      content: input.content,
      now,
    }),
    transmissionProgress: normalizeTransmissionProgressRows({
      rows: input.aggregate?.transmissionProgress ?? [],
      profileId: profile.profileId,
      content: input.content,
      rebindRunIds: Boolean(input.rebindProfileId),
    }),
    missionRuns: normalizeMissionRuns({
      rows: input.aggregate?.missionRuns ?? [],
      profileId: profile.profileId,
      content: input.content,
      now,
      resetIds: Boolean(input.rebindProfileId),
    }),
  }
}

export function parseImportedAggregate(serialized: string): ProfileAggregate {
  const parsed = JSON.parse(serialized) as unknown
  if (!isRecord(parsed)) {
    throw new Error("Invalid profile export: expected an object.")
  }

  const profile = isRecord(parsed.profile) ? parsed.profile : {}
  const saveSlot = isRecord(parsed.saveSlot) ? parsed.saveSlot : {}
  const areaProgress = Array.isArray(parsed.areaProgress) ? parsed.areaProgress : []
  const transmissionProgress = Array.isArray(parsed.transmissionProgress)
    ? parsed.transmissionProgress
    : []
  const missionRuns = Array.isArray(parsed.missionRuns) ? parsed.missionRuns : []

  return {
    profile: profile as ProfileRow,
    saveSlot: saveSlot as ProfileAggregate["saveSlot"],
    areaProgress: areaProgress as AreaProgressRow[],
    transmissionProgress: transmissionProgress as TransmissionProgressRow[],
    missionRuns: missionRuns as MissionRunRow[],
  }
}

export function normalizePersistedMissionRun(input: {
  run: MissionRunRow
  content?: ContentBundle
}): MissionRunRow {
  return normalizeMissionRuns({
    rows: [input.run],
    profileId: readProfileId(input.run.profileId, 1),
    content: input.content,
    now: new Date().toISOString(),
  })[0] ?? {
    ...input.run,
    startedAt: readTimestamp(input.run.startedAt, new Date().toISOString()),
    finishedAt: readTimestamp(input.run.finishedAt, new Date().toISOString()),
  }
}

function normalizeProfileRow(input: {
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
    unlockedFlags: uniqueStrings(readStringArray(source?.unlockedFlags)),
    clearedMissionIds: normalizeMissionIds(source?.clearedMissionIds, input.content),
  }
}

function normalizeSaveSlotRow(input: {
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

function normalizeAreaProgressRows(input: {
  rows: AreaProgressRow[]
  profileId: ProfileId
  content?: ContentBundle
  now: string
}): AreaProgressRow[] {
  const existing = new Map<string, AreaProgressRow>()
  for (const row of input.rows) {
    existing.set(row.areaId, row)
  }

  if (!input.content) {
    return input.rows
      .filter((row) => typeof row.areaId === "string" && row.areaId.length > 0)
      .map((row) => ({
        profileId: input.profileId,
        areaId: row.areaId,
        discoveredAt: row.discoveredAt ? readTimestamp(row.discoveredAt, input.now) : undefined,
        nameRevealed: Boolean(row.nameRevealed),
        revealBitmap: typeof row.revealBitmap === "string" ? row.revealBitmap : "",
        completionRateCache: clampRate(row.completionRateCache),
      }))
  }

  return Object.values(input.content.areas).map((area) => {
    const row = existing.get(area.areaId)
    const discoveredAt =
      row?.discoveredAt ??
      (area.initialState === "visible" ? input.now : undefined)

    return {
      profileId: input.profileId,
      areaId: area.areaId,
      discoveredAt: discoveredAt ? readTimestamp(discoveredAt, input.now) : undefined,
      nameRevealed: row ? Boolean(row.nameRevealed) : area.initialState === "visible",
      revealBitmap: typeof row?.revealBitmap === "string" ? row.revealBitmap : "",
      completionRateCache: clampRate(row?.completionRateCache),
    }
  })
}

function normalizeTransmissionProgressRows(input: {
  rows: TransmissionProgressRow[]
  profileId: ProfileId
  content?: ContentBundle
  rebindRunIds?: boolean
}): TransmissionProgressRow[] {
  const rows = input.rows.filter((row) => {
    if (!input.content) {
      return typeof row.transmissionId === "string" && row.transmissionId.length > 0
    }
    return Boolean(input.content.transmissions[row.transmissionId])
  })

  return rows.map((row) => {
    const transmission = input.content?.transmissions[row.transmissionId]
    const durationMs = transmission
      ? readTransmissionDurationMs(input.content, transmission.missionId)
      : undefined

    return {
      profileId: input.profileId,
      transmissionId: row.transmissionId,
      areaId: transmission?.areaId ?? readNonEmptyString(row.areaId, ""),
      firstConnectedAt: row.firstConnectedAt
        ? readTimestamp(row.firstConnectedAt, undefined)
        : undefined,
      lastPlayedAt: row.lastPlayedAt ? readTimestamp(row.lastPlayedAt, undefined) : undefined,
      clearCount: Math.max(0, Math.trunc(readNumber(row.clearCount, 0))),
      bestAnalysisRate: clampRate(row.bestAnalysisRate),
      bestRunRestorationRate: clampRate(row.bestRunRestorationRate),
      archiveRestorationRate: clampRate(row.archiveRestorationRate),
      heardRanges: normalizeTimeRanges(row.heardRanges, durationMs),
      metadataUnlocked: {
        ...createEmptyMetadataUnlocked(),
        ...(isRecord(row.metadataUnlocked) ? row.metadataUnlocked : {}),
      },
      // 複製保存や import 時に run id を引き継ぐと、別 profile の履歴参照が混線します。
      // latestRunId は profile ごとの参照なので、rebind 時は切り離します。
      latestRunId: input.rebindRunIds
        ? undefined
        :
        typeof row.latestRunId === "number" && Number.isFinite(row.latestRunId)
          ? Math.max(1, Math.trunc(row.latestRunId))
          : undefined,
    }
  })
}

function normalizeMissionRuns(input: {
  rows: MissionRunRow[]
  profileId: ProfileId
  content?: ContentBundle
  now: string
  resetIds?: boolean
}): MissionRunRow[] {
  return input.rows
    .filter((row) => {
      if (!input.content) {
        return typeof row.missionId === "string" && typeof row.transmissionId === "string"
      }
      const mission = input.content.missions[row.missionId]
      if (!mission) {
        return false
      }
      return mission.transmissionId === row.transmissionId
    })
    .map((row) => {
      const durationMs = input.content?.missions[row.missionId]?.durationMs

      return {
        id: input.resetIds
          ? undefined
          :
          typeof row.id === "number" && Number.isFinite(row.id)
            ? Math.max(1, Math.trunc(row.id))
            : undefined,
        profileId: input.profileId,
        transmissionId: row.transmissionId,
        missionId: row.missionId,
        startedAt: readTimestamp(row.startedAt, input.now),
        finishedAt: readTimestamp(row.finishedAt, input.now),
        rngSeed: Math.trunc(readNumber(row.rngSeed, 0)),
        analysisRate: clampRate(row.analysisRate),
        restorationRate: clampRate(row.restorationRate),
        heardRanges: normalizeTimeRanges(row.heardRanges, durationMs),
        damageRanges: normalizeTimeRanges(row.damageRanges, durationMs),
        destroyedAnalysisValue: Math.max(0, readNumber(row.destroyedAnalysisValue, 0)),
        score: Math.max(0, readNumber(row.score, 0)),
        selfRepairPointsEarned: Math.max(0, readNumber(row.selfRepairPointsEarned, 0)),
        cleared: Boolean(row.cleared),
      }
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
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
  const ids = uniqueStrings(readStringArray(nodeIds))
  if (!content) {
    return ids
  }

  const knownNodeIds = new Set(
    Object.values(content.mapLogic).flatMap((mapLogic) =>
      mapLogic.collectibleNodes.map((node) => node.nodeId),
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

function normalizeTimeRanges(
  ranges: TimeRange[] | undefined,
  durationMs?: number,
): TimeRange[] {
  if (!Array.isArray(ranges)) {
    return []
  }

  const sorted = ranges
    .map((range) => ({
      startMs: Math.max(0, readNumber(range?.startMs, 0)),
      endMs: Math.max(0, readNumber(range?.endMs, 0)),
    }))
    .map((range) => ({
      startMs: durationMs === undefined ? range.startMs : Math.min(durationMs, range.startMs),
      endMs: durationMs === undefined ? range.endMs : Math.min(durationMs, range.endMs),
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((left, right) => left.startMs - right.startMs)

  const merged: TimeRange[] = []
  for (const range of sorted) {
    const previous = merged.at(-1)
    if (!previous || previous.endMs < range.startMs) {
      merged.push(range)
      continue
    }
    previous.endMs = Math.max(previous.endMs, range.endMs)
  }

  return merged
}

function readTransmissionDurationMs(
  content: ContentBundle | undefined,
  missionId: string,
): number | undefined {
  return content?.missions[missionId]?.durationMs
}

function readInitialAreaId(
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

function readProfileId(profileId: unknown, slotId: SaveSlotId): ProfileId {
  if (typeof profileId === "string" && profileId.length > 0) {
    return profileId
  }
  return createProfileId(slotId)
}

function createProfileId(slotId: SaveSlotId): ProfileId {
  return `profile_${slotId}_${Date.now()}`
}

function readDifficulty(value: unknown): Difficulty {
  return value === "terminal" ? "terminal" : "calm"
}

function normalizeVector(value: unknown, fallback: Vector2): Vector2 {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  return {
    x: readNumber(value.x, fallback.x),
    y: readNumber(value.y, fallback.y),
  }
}

function clampRate(value: unknown): number {
  return Math.min(1, Math.max(0, readNumber(value, 0)))
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readTimestamp(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value))) {
    return value
  }
  if (fallback) {
    return fallback
  }
  return new Date().toISOString()
}

function readNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

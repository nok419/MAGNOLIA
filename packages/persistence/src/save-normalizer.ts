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
  TranscriptChunk,
  TranscriptSpan,
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
    const areaId = migrateAreaId(input.content, row.areaId)
    if (areaId) {
      existing.set(areaId, { ...row, areaId })
    }
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
  const rows = input.rows.flatMap((row) => {
    const transmissionId = migrateTransmissionId(input.content, row.transmissionId)
    const areaId = migrateAreaId(input.content, row.areaId)

    if (!input.content) {
      return typeof transmissionId === "string" && transmissionId.length > 0
        ? [{ ...row, transmissionId, areaId: areaId ?? row.areaId }]
        : []
    }
    return transmissionId && input.content.transmissions[transmissionId]
      ? [{ ...row, transmissionId, areaId: areaId ?? row.areaId }]
      : []
  })

  const normalizedRows = rows.map((row) => {
    const transmission = input.content?.transmissions[row.transmissionId]
    const durationMs = transmission
      ? readTransmissionDurationMs(input.content, transmission.missionId)
      : undefined
    const chunks = transmission && input.content
      ? readTranscriptChunksForTransmission(input.content, transmission.transmissionId)
      : []
    const heardRanges = normalizeTimeRanges(row.heardRanges, durationMs)
    const transcriptSpans = normalizeTranscriptSpans(
      Array.isArray(row.transcriptSpans) ? row.transcriptSpans : [],
      chunks,
    )
    const restoredSpans = transcriptSpans.length > 0
      ? transcriptSpans
      : transcriptSpansFromTimeRanges(chunks, heardRanges)
    const restoredRanges = chunks.length > 0 && restoredSpans.length > 0
      ? timeRangesFromTranscriptSpans(chunks, restoredSpans)
      : heardRanges

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
      heardRanges: restoredRanges,
      transcriptSpans: restoredSpans,
      signalConfidence: normalizeOptionalRate(row.signalConfidence),
      signalDiscoveredAt: row.signalDiscoveredAt
        ? readTimestamp(row.signalDiscoveredAt, undefined)
        : undefined,
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

  return mergeTransmissionProgressRows(normalizedRows)
}

function mergeTransmissionProgressRows(
  rows: TransmissionProgressRow[],
): TransmissionProgressRow[] {
  const merged = new Map<string, TransmissionProgressRow>()

  for (const row of rows) {
    const previous = merged.get(row.transmissionId)
    if (!previous) {
      merged.set(row.transmissionId, row)
      continue
    }

    // 旧 ID と現行 ID が同時に import された場合、同じ通信の進行を 1 行へ集約します。
    // clearCount は重複加算せず最大値を採用し、復元範囲は和集合にします。
    merged.set(row.transmissionId, {
      ...previous,
      firstConnectedAt: earlierTimestamp(previous.firstConnectedAt, row.firstConnectedAt),
      lastPlayedAt: laterTimestamp(previous.lastPlayedAt, row.lastPlayedAt),
      clearCount: Math.max(previous.clearCount, row.clearCount),
      bestAnalysisRate: Math.max(previous.bestAnalysisRate, row.bestAnalysisRate),
      bestRunRestorationRate: Math.max(
        previous.bestRunRestorationRate,
        row.bestRunRestorationRate,
      ),
      archiveRestorationRate: Math.max(
        previous.archiveRestorationRate,
        row.archiveRestorationRate,
      ),
      heardRanges: normalizeTimeRanges([...previous.heardRanges, ...row.heardRanges]),
      transcriptSpans: normalizeTranscriptSpans(
        [...previous.transcriptSpans, ...row.transcriptSpans],
        [],
      ),
      signalConfidence: maxOptionalRate(previous.signalConfidence, row.signalConfidence),
      signalDiscoveredAt: earlierTimestamp(
        previous.signalDiscoveredAt,
        row.signalDiscoveredAt,
      ),
      metadataUnlocked: {
        title: previous.metadataUnlocked.title || row.metadataUnlocked.title,
        sender: previous.metadataUnlocked.sender || row.metadataUnlocked.sender,
        recipient: previous.metadataUnlocked.recipient || row.metadataUnlocked.recipient,
        sentAt: previous.metadataUnlocked.sentAt || row.metadataUnlocked.sentAt,
      },
      latestRunId: row.latestRunId ?? previous.latestRunId,
    })
  }

  return [...merged.values()]
}

function normalizeMissionRuns(input: {
  rows: MissionRunRow[]
  profileId: ProfileId
  content?: ContentBundle
  now: string
  resetIds?: boolean
}): MissionRunRow[] {
  return input.rows
    .flatMap((row): MissionRunRow[] => {
      const missionId = migrateMissionId(input.content, row.missionId)
      const transmissionId = migrateTransmissionId(input.content, row.transmissionId)

      if (!input.content) {
        return typeof missionId === "string" && typeof transmissionId === "string"
          ? [{ ...row, missionId, transmissionId }]
          : []
      }
      if (!missionId) {
        return []
      }
      const mission = missionId ? input.content.missions[missionId] : undefined
      if (!mission) {
        return []
      }
      const normalizedTransmissionId = transmissionId ?? mission.transmissionId
      return mission.transmissionId === normalizedTransmissionId
        ? [{ ...row, missionId, transmissionId: normalizedTransmissionId }]
        : []
    })
    .map((row) => {
      const durationMs = input.content?.missions[row.missionId]?.durationMs
      const chunks = input.content
        ? readTranscriptChunksForMission(input.content, row.missionId)
        : []
      const heardRanges = normalizeTimeRanges(row.heardRanges, durationMs)
      const transcriptSpans = normalizeTranscriptSpans(
        Array.isArray(row.transcriptSpans) ? row.transcriptSpans : [],
        chunks,
      )
      const restoredSpans = transcriptSpans.length > 0
        ? transcriptSpans
        : transcriptSpansFromTimeRanges(chunks, heardRanges)
      const restoredRanges = chunks.length > 0 && restoredSpans.length > 0
        ? timeRangesFromTranscriptSpans(chunks, restoredSpans)
        : heardRanges

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
        heardRanges: restoredRanges,
        transcriptSpans: restoredSpans,
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
  const normalizedEquipmentId = migrateEquipmentId(content, equipmentId)

  if (!normalizedEquipmentId || !ownedEquipmentIds.includes(normalizedEquipmentId)) {
    return undefined
  }

  if (!content) {
    return normalizedEquipmentId
  }

  const equipment = content.equipment[normalizedEquipmentId]
  if (!equipment || equipment.slot !== slot) {
    return undefined
  }

  return normalizedEquipmentId
}

function normalizeEquipmentLevels(
  levels: ProfileRow["equipmentLevels"] | undefined,
  ownedEquipmentIds: EquipmentId[],
  content?: ContentBundle,
): ProfileRow["equipmentLevels"] {
  const normalized: ProfileRow["equipmentLevels"] = {}
  const levelByEquipmentId = normalizeEquipmentLevelMap(levels, content)
  for (const equipmentId of ownedEquipmentIds) {
    const rawLevel = levelByEquipmentId[equipmentId]
    const maxLevel = content?.equipment[equipmentId]?.maxLevel ?? 1
    normalized[equipmentId] = Math.min(
      maxLevel,
      Math.max(1, Math.trunc(readNumber(rawLevel, 1))),
    )
  }
  return normalized
}

function normalizeEquipmentLevelMap(
  levels: ProfileRow["equipmentLevels"] | undefined,
  content?: ContentBundle,
): ProfileRow["equipmentLevels"] {
  const normalized: ProfileRow["equipmentLevels"] = {}

  for (const [equipmentId, level] of Object.entries(levels ?? {})) {
    const migratedEquipmentId = migrateEquipmentId(content, equipmentId)
    if (!migratedEquipmentId) {
      continue
    }
    if (content && !content.equipment[migratedEquipmentId]) {
      continue
    }
    normalized[migratedEquipmentId] = Math.max(
      readNumber(normalized[migratedEquipmentId], 1),
      readNumber(level, 1),
    )
  }

  return normalized
}

function normalizeEquipmentIds(
  equipmentIds: ProfileRow["ownedEquipmentIds"] | undefined,
  content?: ContentBundle,
): EquipmentId[] {
  const ids = uniqueStrings(
    readStringArray(equipmentIds)
      .map((equipmentId) => migrateEquipmentId(content, equipmentId))
      .filter((equipmentId): equipmentId is EquipmentId => Boolean(equipmentId)),
  )
  if (!content) {
    return ids
  }
  return ids.filter((equipmentId) => Boolean(content.equipment[equipmentId]))
}

function normalizeCollectibleNodeIds(
  nodeIds: ProfileRow["collectedNodeIds"] | undefined,
  content?: ContentBundle,
): ProfileRow["collectedNodeIds"] {
  const ids = uniqueStrings(
    readStringArray(nodeIds)
      .map((nodeId) => migrateWorldMapNodeId(content, nodeId))
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  )
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
  const ids = uniqueStrings(
    readStringArray(missionIds)
      .map((missionId) => migrateMissionId(content, missionId))
      .filter((missionId): missionId is string => Boolean(missionId)),
  )
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

function normalizeTranscriptSpans(
  spans: TranscriptSpan[] | undefined,
  chunks: TranscriptChunk[],
): TranscriptSpan[] {
  if (!Array.isArray(spans)) {
    return []
  }
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId))
  const sorted = spans
    .map((span) => ({
      chunkId: typeof span?.chunkId === "string" ? span.chunkId : "",
      startRatio: clampRate(Math.min(
        readNumber(span?.startRatio, 0),
        readNumber(span?.endRatio, 0),
      )),
      endRatio: clampRate(Math.max(
        readNumber(span?.startRatio, 0),
        readNumber(span?.endRatio, 0),
      )),
    }))
    .filter((span) => span.chunkId.length > 0)
    .filter((span) => chunks.length === 0 || chunkIds.has(span.chunkId))
    .filter((span) => span.endRatio > span.startRatio)
    .sort((left, right) =>
      left.chunkId.localeCompare(right.chunkId) || left.startRatio - right.startRatio,
    )

  const merged: TranscriptSpan[] = []
  for (const span of sorted) {
    const previous = merged.at(-1)
    if (!previous || previous.chunkId !== span.chunkId || previous.endRatio < span.startRatio) {
      merged.push(span)
      continue
    }
    previous.endRatio = Math.max(previous.endRatio, span.endRatio)
  }
  return merged
}

function transcriptSpansFromTimeRanges(
  chunks: TranscriptChunk[],
  ranges: TimeRange[],
): TranscriptSpan[] {
  const spans: TranscriptSpan[] = []
  for (const chunk of chunks) {
    const durationMs = Math.max(1, chunk.endMs - chunk.startMs)
    for (const range of ranges) {
      const overlapStart = Math.max(chunk.startMs, range.startMs)
      const overlapEnd = Math.min(chunk.endMs, range.endMs)
      if (overlapEnd <= overlapStart) {
        continue
      }
      spans.push({
        chunkId: chunk.chunkId,
        startRatio: (overlapStart - chunk.startMs) / durationMs,
        endRatio: (overlapEnd - chunk.startMs) / durationMs,
      })
    }
  }
  return normalizeTranscriptSpans(spans, chunks)
}

function timeRangesFromTranscriptSpans(
  chunks: TranscriptChunk[],
  spans: TranscriptSpan[],
): TimeRange[] {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
  return normalizeTimeRanges(
    normalizeTranscriptSpans(spans, chunks).flatMap((span) => {
      const chunk = chunksById.get(span.chunkId)
      if (!chunk) {
        return []
      }
      const durationMs = Math.max(1, chunk.endMs - chunk.startMs)
      return [{
        startMs: chunk.startMs + durationMs * span.startRatio,
        endMs: chunk.startMs + durationMs * span.endRatio,
      }]
    }),
  )
}

function readTranscriptChunksForTransmission(
  content: ContentBundle,
  transmissionId: string,
): TranscriptChunk[] {
  const transmission = content.transmissions[transmissionId]
  return (transmission?.transcriptChunkIds ?? [])
    .map((chunkId) => content.transcriptChunks[chunkId])
    .filter((chunk): chunk is TranscriptChunk => Boolean(chunk))
    .sort((left, right) => left.startMs - right.startMs)
}

function readTranscriptChunksForMission(
  content: ContentBundle,
  missionId: string,
): TranscriptChunk[] {
  const mission = content.missions[missionId]
  return mission ? readTranscriptChunksForTransmission(content, mission.transmissionId) : []
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

  const normalizedFallbackAreaId = migrateAreaId(content, fallbackAreaId)
  if (normalizedFallbackAreaId && content.areas[normalizedFallbackAreaId]) {
    return normalizedFallbackAreaId
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
  const normalizedAreaId = migrateAreaId(content, areaId)
  return normalizedAreaId && content.areas[normalizedAreaId] ? normalizedAreaId : fallbackAreaId
}

function migrateAreaId(content: ContentBundle | undefined, areaId: string | undefined): string | undefined {
  return migrateContentId(content?.migratedIds.areas, areaId)
}

function migrateTransmissionId(
  content: ContentBundle | undefined,
  transmissionId: string | undefined,
): string | undefined {
  return migrateContentId(content?.migratedIds.transmissions, transmissionId)
}

function migrateMissionId(
  content: ContentBundle | undefined,
  missionId: string | undefined,
): string | undefined {
  return migrateContentId(content?.migratedIds.missions, missionId)
}

function migrateEquipmentId(
  content: ContentBundle | undefined,
  equipmentId: string | null | undefined,
): EquipmentId | undefined {
  return migrateContentId(content?.migratedIds.equipment, equipmentId) as EquipmentId | undefined
}

function migrateWorldMapNodeId(
  content: ContentBundle | undefined,
  nodeId: string | undefined,
): string | undefined {
  return migrateContentId(content?.migratedIds.worldMapNodes, nodeId)
}

function migrateContentId(
  mappings: Record<string, string> | undefined,
  id: string | null | undefined,
): string | undefined {
  if (!id) {
    return undefined
  }
  return mappings?.[id] ?? id
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

function normalizeOptionalRate(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return clampRate(value)
}

function maxOptionalRate(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) {
    return right
  }
  if (right === undefined) {
    return left
  }
  return Math.max(left, right)
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

function earlierTimestamp(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }
  return Date.parse(left) <= Date.parse(right) ? left : right
}

function laterTimestamp(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }
  return Date.parse(left) >= Date.parse(right) ? left : right
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

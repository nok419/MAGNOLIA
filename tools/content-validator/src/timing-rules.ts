import {
  addIssue,
  asArray,
  asNumber,
  asRecord,
  asString,
  indexById,
  type ContentFile,
  type ValidationContext,
} from "./validate-content.js"

export function validateTimingRules(context: ValidationContext): void {
  const missions = indexById(context.store.byGroup.missions ?? [], ["missionId"])
  const transmissions = indexById(
    (context.store.byGroup.transmissions ?? []).filter((file) => !file.relativePath.endsWith(".chunks.json")),
    ["transmissionId"],
  )
  const chunksByTransmission = indexChunksByTransmission(context)
  const chunkRecords = indexChunkRecords(context)

  validateTransmissionChunkListTiming(context, transmissions, chunkRecords)

  for (const [missionId, file] of missions) {
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
    const transmission = transmissionId ? transmissions.get(transmissionId) : undefined
    const chunks = transmissionId ? chunksByTransmission.get(transmissionId) ?? [] : []
    if (transmission && chunks.length > 0) {
      const maxChunkEndMs = Math.max(...chunks.map((chunk) => asNumber(chunk.endMs) ?? 0))
      const audioDurationMs = asNumber(asRecord(transmission.data)?.audioDurationMs) ?? 0
      const transmissionDurationMs = Math.max(maxChunkEndMs, audioDurationMs)
      const audioStartDelayMs = asNumber(mission.audioStartDelayMs) ?? 0
      const outroMs = asNumber(mission.outroMs) ?? 0
      if (audioStartDelayMs + transmissionDurationMs + outroMs > durationMs) {
        addIssue(
          context,
          `Mission '${missionId}' duration does not contain audioStartDelayMs + transmission audio/chunks + outroMs.`,
          file.relativePath,
        )
      }
    }
  }
}

function validateNumberRange(
  context: ValidationContext,
  value: unknown,
  min: number,
  max: number,
  label: string,
  owner: string,
  file: string,
): void {
  if (value === undefined) {
    return
  }
  const numberValue = asNumber(value)
  if (numberValue === undefined || numberValue < min || numberValue > max) {
    addIssue(context, `${owner}.${label} must be between ${min} and ${max}.`, file)
  }
}


function validateTransmissionChunkListTiming(
  context: ValidationContext,
  transmissions: Map<string, ContentFile>,
  chunksById: Map<string, Record<string, unknown>>,
): void {
  for (const [transmissionId, file] of transmissions) {
    const transmission = asRecord(file.data)
    if (!transmission) {
      continue
    }
    let previousEndMs = -Infinity
    let maxChunkEndMs = 0
    for (const chunkIdValue of asArray(transmission.transcriptChunkIds)) {
      const chunkId = asString(chunkIdValue)
      const chunk = chunkId ? chunksById.get(chunkId) : undefined
      if (!chunk) {
        continue
      }
      const startMs = asNumber(chunk.startMs)
      const endMs = asNumber(chunk.endMs)
      if (startMs === undefined || endMs === undefined || endMs <= startMs) {
        addIssue(context, `Transcript chunk '${String(chunkId)}' in '${transmissionId}' must have endMs greater than startMs.`, file.relativePath)
        continue
      }
      if (startMs < previousEndMs) {
        addIssue(context, `Transmission '${transmissionId}' transcriptChunkIds are not in chronological order around '${String(chunkId)}'.`, file.relativePath)
      }
      previousEndMs = endMs
      maxChunkEndMs = Math.max(maxChunkEndMs, endMs)
    }

    if (asString(transmission.audioAssetId)) {
      const audioDurationMs = asNumber(transmission.audioDurationMs)
      if (audioDurationMs === undefined || audioDurationMs <= 0) {
        addIssue(context, `Transmission '${transmissionId}' must define positive audioDurationMs when audioAssetId is set.`, file.relativePath)
      } else if (audioDurationMs + 1200 < maxChunkEndMs) {
        addIssue(context, `Transmission '${transmissionId}' audioDurationMs is shorter than transcript chunks.`, file.relativePath)
      }
    }
  }
}

function indexChunkRecords(context: ValidationContext): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>()
  for (const file of context.store.byGroup.transmissions ?? []) {
    if (!file.relativePath.endsWith(".chunks.json")) {
      continue
    }
    for (const chunk of asArray(file.data)) {
      const record = asRecord(chunk)
      const chunkId = asString(record?.chunkId)
      if (record && chunkId) {
        index.set(chunkId, record)
      }
    }
  }
  return index
}

function indexChunksByTransmission(context: ValidationContext): Map<string, Record<string, unknown>[]> {
  const chunksByTransmission = new Map<string, Record<string, unknown>[]>()
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

import {
  addIssue,
  asArray,
  asNumber,
  asRecord,
  asString,
  indexById,
  type ValidationContext,
} from "./validate-content.js"

export function validateTimingRules(context: ValidationContext): void {
  const missions = indexById(context.store.byGroup.missions ?? [], ["missionId"])
  const transmissions = indexById(
    (context.store.byGroup.transmissions ?? []).filter((file) => !file.relativePath.endsWith(".chunks.json")),
    ["transmissionId"],
  )
  const chunksByTransmission = indexChunksByTransmission(context)

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

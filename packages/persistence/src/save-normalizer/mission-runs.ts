import type {
  ContentBundle,
  MissionRunRow,
  ProfileId,
} from "@magnolia/contracts"
import {
  clampRate,
  readNumber,
  readProfileId,
  readTimestamp,
} from "./primitives"
import {
  normalizeTimeRanges,
  normalizeTranscriptSpans,
  readTranscriptChunksForMission,
  timeRangesFromTranscriptSpans,
  transcriptSpansFromTimeRanges,
} from "./transcript-ranges"

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

export function normalizeMissionRuns(input: {
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

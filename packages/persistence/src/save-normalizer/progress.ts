import { createEmptyMetadataUnlocked } from "@magnolia/contracts"
import type {
  AreaProgressRow,
  ContentBundle,
  ProfileId,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import {
  clampRate,
  isRecord,
  normalizeOptionalRate,
  readNonEmptyString,
  readNumber,
  readTimestamp,
} from "./primitives"
import {
  normalizeTimeRanges,
  normalizeTranscriptSpans,
  readTranscriptChunksForTransmission,
  readTransmissionDurationMs,
  timeRangesFromTranscriptSpans,
  transcriptSpansFromTimeRanges,
} from "./transcript-ranges"

export function normalizeAreaProgressRows(input: {
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

export function normalizeTransmissionProgressRows(input: {
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
      // import 時は別 profile の latestRunId を参照しないようにします。
      latestRunId: input.rebindRunIds
        ? undefined
        :
        typeof row.latestRunId === "number" && Number.isFinite(row.latestRunId)
          ? Math.max(1, Math.trunc(row.latestRunId))
          : undefined,
    }
  })
}

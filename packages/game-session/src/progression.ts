import type {
  AreaMaster,
  MetadataUnlocked,
  TimeRange,
  TranscriptChunk,
  TranscriptSpan,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
} from "@magnolia/contracts"

export type TransmissionCompletionState = "locked" | "partial" | "complete"

export function computeMetadataCompletionRate(
  metadataUnlocked: MetadataUnlocked | undefined,
): number {
  if (!metadataUnlocked) {
    return 0
  }

  return (
    Object.values(metadataUnlocked).filter(Boolean).length /
    Math.max(1, Object.keys(metadataUnlocked).length)
  )
}

export function computeTransmissionCompletionRate(
  progress: TransmissionProgressRow | undefined,
): number {
  if (!progress) {
    return 0
  }

  return (
    computeMetadataCompletionRate(progress.metadataUnlocked) * 0.5 +
    clampRate(progress.archiveRestorationRate) * 0.5
  )
}

export function computeAreaCompletionRate(input: {
  area: AreaMaster | undefined
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): number {
  const transmissionIds = input.area?.transmissionIds ?? []
  if (transmissionIds.length === 0) {
    return 0
  }

  const total = transmissionIds.reduce((sum, transmissionId) => {
    return sum + computeTransmissionCompletionRate(input.transmissionProgress[transmissionId])
  }, 0)

  return total / transmissionIds.length
}

export function readTransmissionCompletionState(
  progress: TransmissionProgressRow | undefined,
): TransmissionCompletionState {
  if (!progress) {
    return "locked"
  }

  if (progress.bestAnalysisRate >= 1 && progress.archiveRestorationRate >= 1) {
    return "complete"
  }

  return "partial"
}

export function hasUnlockedTransmissionMetadata(
  progress: TransmissionProgressRow | undefined,
): boolean {
  if (!progress) {
    return false
  }

  return Object.values(progress.metadataUnlocked).some(Boolean)
}

export function hasVisibleArchiveContent(
  progress: TransmissionProgressRow | undefined,
): boolean {
  if (!progress) {
    return false
  }

  return progress.heardRanges.length > 0 ||
    progress.transcriptSpans.length > 0 ||
    hasUnlockedTransmissionMetadata(progress)
}

export function isTransmissionIncomplete(
  progress: TransmissionProgressRow | undefined,
): boolean {
  if (!progress) {
    return true
  }

  return (
    progress.archiveRestorationRate < 1 ||
    computeMetadataCompletionRate(progress.metadataUnlocked) < 1
  )
}

export function isTransmissionSignalIdentified(
  progress: TransmissionProgressRow | undefined,
): boolean {
  if (!progress) {
    return false
  }
  return Boolean(
    progress.firstConnectedAt ||
      progress.heardRanges.length > 0 ||
      progress.transcriptSpans.length > 0 ||
      (progress.signalConfidence ?? 0) >= 1,
  )
}

export function computeRangesDuration(ranges: TimeRange[]): number {
  return mergeRanges(ranges).reduce((total, range) => total + (range.endMs - range.startMs), 0)
}

export function appendTimeRange(ranges: TimeRange[], range: TimeRange): TimeRange[] {
  return mergeRanges([...ranges, range])
}

export function subtractTimeRanges(
  sourceRanges: TimeRange[],
  blockedRanges: TimeRange[],
): TimeRange[] {
  const blocked = mergeRanges(blockedRanges)
  if (blocked.length === 0) {
    return mergeRanges(sourceRanges)
  }

  const fragments: TimeRange[] = []
  for (const source of mergeRanges(sourceRanges)) {
    let openFragments: TimeRange[] = [{ ...source }]
    for (const blockedRange of blocked) {
      const nextFragments: TimeRange[] = []
      for (const fragment of openFragments) {
        if (blockedRange.endMs <= fragment.startMs || blockedRange.startMs >= fragment.endMs) {
          nextFragments.push(fragment)
          continue
        }

        // 被弾区間と重なる部分だけを除外し、過去に確保済みの区間は別処理で守ります。
        if (blockedRange.startMs > fragment.startMs) {
          nextFragments.push({
            startMs: fragment.startMs,
            endMs: Math.min(blockedRange.startMs, fragment.endMs),
          })
        }
        if (blockedRange.endMs < fragment.endMs) {
          nextFragments.push({
            startMs: Math.max(blockedRange.endMs, fragment.startMs),
            endMs: fragment.endMs,
          })
        }
      }
      openFragments = nextFragments
      if (openFragments.length === 0) {
        break
      }
    }
    fragments.push(...openFragments)
  }

  return mergeRanges(fragments.filter((range) => range.endMs > range.startMs))
}

export function computeRecoverableRunHeardRanges(input: {
  heardRanges: TimeRange[]
  seededHeardRanges: TimeRange[]
  damageRanges: TimeRange[]
}): TimeRange[] {
  const currentRunRanges = subtractTimeRanges(input.heardRanges, input.seededHeardRanges)
  return subtractTimeRanges(currentRunRanges, input.damageRanges)
}

export function computeRecoverableArchiveHeardRanges(input: {
  heardRanges: TimeRange[]
  seededHeardRanges: TimeRange[]
  damageRanges: TimeRange[]
}): TimeRange[] {
  return mergeRanges([
    ...input.seededHeardRanges,
    ...computeRecoverableRunHeardRanges(input),
  ])
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((left, right) => left.startMs - right.startMs)
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (!last || range.startMs > last.endMs) {
      merged.push({ ...range })
      continue
    }
    last.endMs = Math.max(last.endMs, range.endMs)
  }
  return merged
}

export function mergeTranscriptSpans(spans: TranscriptSpan[]): TranscriptSpan[] {
  const byChunk = new Map<string, TranscriptSpan[]>()
  for (const span of spans) {
    const normalized = normalizeTranscriptSpan(span)
    if (normalized.endRatio <= normalized.startRatio) {
      continue
    }
    byChunk.set(normalized.chunkId, [...(byChunk.get(normalized.chunkId) ?? []), normalized])
  }

  return Array.from(byChunk.entries()).flatMap(([chunkId, chunkSpans]) => {
    const sorted = chunkSpans.sort((left, right) => left.startRatio - right.startRatio)
    const merged: TranscriptSpan[] = []
    for (const span of sorted) {
      const last = merged[merged.length - 1]
      if (!last || span.startRatio > last.endRatio) {
        merged.push({ ...span, chunkId })
        continue
      }
      last.endRatio = Math.max(last.endRatio, span.endRatio)
    }
    return merged
  })
}

export function normalizeTranscriptSpan(span: TranscriptSpan): TranscriptSpan {
  const startRatio = clampRate(Math.min(span.startRatio, span.endRatio))
  const endRatio = clampRate(Math.max(span.startRatio, span.endRatio))
  return {
    chunkId: span.chunkId,
    startRatio,
    endRatio,
  }
}

export function transcriptSpansFromTimeRanges(
  chunks: TranscriptChunk[],
  ranges: TimeRange[],
): TranscriptSpan[] {
  const spans: TranscriptSpan[] = []
  for (const chunk of chunks) {
    const durationMs = Math.max(1, chunk.endMs - chunk.startMs)
    for (const range of mergeRanges(ranges)) {
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
  return mergeTranscriptSpans(spans)
}

export function timeRangesFromTranscriptSpans(
  chunks: TranscriptChunk[],
  spans: TranscriptSpan[],
): TimeRange[] {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
  return mergeRanges(
    mergeTranscriptSpans(spans).flatMap((span) => {
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

export function transcriptSpanForTimeRange(
  chunk: TranscriptChunk,
  range: TimeRange,
): TranscriptSpan {
  const durationMs = Math.max(1, chunk.endMs - chunk.startMs)
  return normalizeTranscriptSpan({
    chunkId: chunk.chunkId,
    startRatio: (range.startMs - chunk.startMs) / durationMs,
    endRatio: (range.endMs - chunk.startMs) / durationMs,
  })
}

export function readTranscriptChunkRestorationRatio(
  chunk: TranscriptChunk,
  spans: TranscriptSpan[],
): number {
  const restored = mergeTranscriptSpans(spans.filter((span) => span.chunkId === chunk.chunkId))
    .reduce((total, span) => total + Math.max(0, span.endRatio - span.startRatio), 0)
  return clampRate(restored)
}

export function computeRestorationRate(
  heardRanges: TimeRange[],
  transcript: TranscriptChunk[],
): number {
  const totalDuration = transcript[transcript.length - 1]?.endMs ?? 0
  if (totalDuration <= 0) {
    return 0
  }
  return computeRangesDuration(heardRanges) / totalDuration
}

export function unlockMetadata(
  analysisRate: number,
  thresholds: TransmissionMaster["metadataUnlockThresholds"],
  current: MetadataUnlocked,
): MetadataUnlocked {
  return {
    title: current.title || analysisRate >= thresholds.title,
    sender: current.sender || analysisRate >= thresholds.sender,
    recipient: current.recipient || analysisRate >= thresholds.recipient,
    sentAt: current.sentAt || analysisRate >= thresholds.sentAt,
  }
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value))
}

import type {
  ContentBundle,
  TimeRange,
  TranscriptChunk,
  TranscriptChunkMigration,
  TranscriptChunkMigrationSegment,
  TranscriptSpan,
} from "@magnolia/contracts"
import { clampRate, readNumber } from "./primitives"

export function normalizeTimeRanges(
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

export function normalizeTranscriptSpans(
  spans: TranscriptSpan[] | undefined,
  chunks: TranscriptChunk[],
  migrations: TranscriptChunkMigration[] = [],
): TranscriptSpan[] {
  if (!Array.isArray(spans)) {
    return []
  }
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId))
  const migrationsBySource = new Map(migrations.map((migration) => [migration.fromChunkId, migration]))
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
    .flatMap((span) => {
      if (chunks.length === 0 || chunkIds.has(span.chunkId)) {
        return [span]
      }
      return migrateTranscriptSpan(span, migrationsBySource.get(span.chunkId), chunkIds)
    })
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

function migrateTranscriptSpan(
  span: TranscriptSpan,
  migration: TranscriptChunkMigration | undefined,
  chunkIds: Set<string>,
): TranscriptSpan[] {
  if (!migration) {
    return []
  }

  const segments = readMigrationSegments(migration)
  const migrated: TranscriptSpan[] = []
  for (const segment of segments) {
    if (!chunkIds.has(segment.targetChunkId)) {
      continue
    }
    const overlapStart = Math.max(span.startRatio, segment.sourceStartRatio)
    const overlapEnd = Math.min(span.endRatio, segment.sourceEndRatio)
    if (overlapEnd <= overlapStart) {
      continue
    }

    const sourceLength = Math.max(0.0001, segment.sourceEndRatio - segment.sourceStartRatio)
    const targetLength = segment.targetEndRatio - segment.targetStartRatio
    // 旧 chunk 内での相対位置を、新 chunk 内の対応区間へ線形に移します。
    // 本文の文字数変更だけなら同じ chunkId が残るため、この移行経路は ID 変更時だけ使われます。
    migrated.push({
      chunkId: segment.targetChunkId,
      startRatio: clampRate(segment.targetStartRatio + ((overlapStart - segment.sourceStartRatio) / sourceLength) * targetLength),
      endRatio: clampRate(segment.targetStartRatio + ((overlapEnd - segment.sourceStartRatio) / sourceLength) * targetLength),
    })
  }
  return migrated
}

function readMigrationSegments(migration: TranscriptChunkMigration): TranscriptChunkMigrationSegment[] {
  if (migration.segments && migration.segments.length > 0) {
    return migration.segments
  }

  const targetCount = Math.max(1, migration.toChunkIds.length)
  // segments 未指定の migration は、旧 chunk を新 chunk 数で等分します。
  // split の最小指定を短く保つための互換規則です。
  return migration.toChunkIds.map((targetChunkId, index) => ({
    sourceStartRatio: index / targetCount,
    sourceEndRatio: (index + 1) / targetCount,
    targetChunkId,
    targetStartRatio: 0,
    targetEndRatio: 1,
  }))
}

export function transcriptSpansFromTimeRanges(
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

export function timeRangesFromTranscriptSpans(
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

export function readTranscriptChunksForTransmission(
  content: ContentBundle,
  transmissionId: string,
): TranscriptChunk[] {
  const transmission = content.transmissions[transmissionId]
  return (transmission?.transcriptChunkIds ?? [])
    .map((chunkId) => content.transcriptChunks[chunkId])
    .filter((chunk): chunk is TranscriptChunk => Boolean(chunk))
    .sort((left, right) => left.startMs - right.startMs)
}

export function readTranscriptChunkMigrationsForTransmission(
  content: ContentBundle,
  transmissionId: string,
): TranscriptChunkMigration[] {
  return content.transcriptChunkMigrations.filter(
    (migration) => migration.transmissionId === transmissionId,
  )
}

export function readTranscriptChunksForMission(
  content: ContentBundle,
  missionId: string,
): TranscriptChunk[] {
  const mission = content.missions[missionId]
  return mission ? readTranscriptChunksForTransmission(content, mission.transmissionId) : []
}

export function readTransmissionDurationMs(
  content: ContentBundle | undefined,
  missionId: string,
): number | undefined {
  return content?.missions[missionId]?.durationMs
}

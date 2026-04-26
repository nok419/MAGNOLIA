import type {
  AreaMaster,
  MetadataUnlocked,
  TimeRange,
  TranscriptChunk,
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

  return progress.heardRanges.length > 0 || hasUnlockedTransmissionMetadata(progress)
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

import type {
  AreaMaster,
  MetadataUnlocked,
  TransmissionId,
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

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value))
}

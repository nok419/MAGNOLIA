import type {
  AreaId,
  DifficultyModifiers,
  EquipmentId,
  MissionResult,
  MissionRunRow,
  ProfileAggregate,
  TranscriptChunk,
  TransmissionId,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import type { InternalBattleState } from "../battle-state"
import {
  computeRangesDuration,
  computeRecoverableRunHeardRanges,
  computeRestorationRate,
  mergeTranscriptSpans,
  timeRangesFromTranscriptSpans,
  transcriptSpansFromTimeRanges,
  unlockMetadata,
} from "../progression"

export type FinalizedBattleMission = {
  result: MissionResult
  missionRun: MissionRunRow
}

export function finalizeBattleMission(input: {
  battle: InternalBattleState
  activeProfile: ProfileAggregate
  difficultyModifiers: DifficultyModifiers
  getOrCreateTransmissionProgress: (
    transmissionId: TransmissionId,
    areaId: AreaId,
  ) => TransmissionProgressRow
  grantEquipment: (equipmentIds: EquipmentId[]) => void
  nowMs?: number
}): FinalizedBattleMission {
  const { battle, activeProfile, difficultyModifiers } = input
  const nowMs = input.nowMs ?? Date.now()
  const finishedAt = new Date(nowMs).toISOString()
  const transcriptDurationMs = getTranscriptDurationMs(battle.transcript)
  const analysisRate = Math.min(
    1,
    battle.destroyedAnalysisValue / battle.mission.analysisTotal,
  )
  const recoverableRunHeardRanges = computeRecoverableRunHeardRanges({
    heardRanges: battle.heardRanges,
    seededHeardRanges: battle.seededHeardRanges,
    damageRanges: battle.damageRanges,
  })
  const recoverableRunTranscriptSpans = transcriptSpansFromTimeRanges(
    battle.transcript,
    recoverableRunHeardRanges,
  )
  const restorationRate = computeRestorationRate(recoverableRunHeardRanges, battle.transcript)
  const transmissionProgress = input.getOrCreateTransmissionProgress(
    battle.transmission.transmissionId,
    battle.transmission.areaId,
  )
  const mergedTranscriptSpans = mergeTranscriptSpans([
    ...transmissionProgress.transcriptSpans,
    ...recoverableRunTranscriptSpans,
  ])
  const mergedHeardRanges = timeRangesFromTranscriptSpans(
    battle.transcript,
    mergedTranscriptSpans,
  )
  const previousArchiveHeardMs = computeRangesDuration(transmissionProgress.heardRanges)
  transmissionProgress.heardRanges = mergedHeardRanges
  transmissionProgress.transcriptSpans = mergedTranscriptSpans
  transmissionProgress.clearCount += 1
  transmissionProgress.latestRunId = (transmissionProgress.latestRunId ?? 0) + 1
  transmissionProgress.lastPlayedAt = finishedAt
  transmissionProgress.firstConnectedAt ??= transmissionProgress.lastPlayedAt
  transmissionProgress.bestAnalysisRate = Math.max(
    transmissionProgress.bestAnalysisRate,
    analysisRate,
  )
  transmissionProgress.bestRunRestorationRate = Math.max(
    transmissionProgress.bestRunRestorationRate,
    restorationRate,
  )
  // 解析率は run ごとの最大値、本文開放は累積 heardRanges を使うため、別々に更新します。
  transmissionProgress.archiveRestorationRate =
    transcriptDurationMs > 0 ? computeRangesDuration(mergedHeardRanges) / transcriptDurationMs : 0
  transmissionProgress.metadataUnlocked = unlockMetadata(
    transmissionProgress.bestAnalysisRate,
    battle.transmission.metadataUnlockThresholds,
    transmissionProgress.metadataUnlocked,
  )

  const newHeardRangeMs = Math.max(
    0,
    computeRangesDuration(mergedHeardRanges) - previousArchiveHeardMs,
  )

  const isFirstClear = !activeProfile.profile.clearedMissionIds.includes(battle.mission.missionId)
  if (isFirstClear) {
    activeProfile.profile.clearedMissionIds.push(battle.mission.missionId)
  }

  // リザルト UI には今回の新規入手分だけを渡し、既取得装備の再表示を避けます。
  const rewardEquipmentIds = battle.transmission.rewardEquipmentIds ?? []
  const grantedEquipmentIds = rewardEquipmentIds.filter(
    (equipmentId) => !activeProfile.profile.ownedEquipmentIds.includes(equipmentId),
  )

  const rawSelfRepairPointsEarned =
    battle.selfRepairPointsEarned +
    (isFirstClear
      ? battle.mission.baseSelfRepairPoints
      : Math.round(battle.mission.baseSelfRepairPoints * battle.mission.repeatDecayRate)) +
    Math.round(newHeardRangeMs / 1000)
  const selfRepairPointsEarned = Math.round(
    rawSelfRepairPointsEarned * (difficultyModifiers.selfRepairPointMultiplier ?? 1),
  )

  activeProfile.profile.selfRepairPoints += selfRepairPointsEarned
  input.grantEquipment(rewardEquipmentIds)

  const missionRun: MissionRunRow = {
    profileId: activeProfile.profile.profileId,
    transmissionId: battle.transmission.transmissionId,
    missionId: battle.mission.missionId,
    startedAt: new Date(nowMs - battle.elapsedMs).toISOString(),
    finishedAt,
    rngSeed: 0,
    analysisRate,
    restorationRate,
    heardRanges: recoverableRunHeardRanges,
    transcriptSpans: recoverableRunTranscriptSpans,
    damageRanges: battle.damageRanges,
    destroyedAnalysisValue: battle.destroyedAnalysisValue,
    score: Math.round(
      (analysisRate * 10000 + restorationRate * 10000) *
        (difficultyModifiers.scoreMultiplier ?? 1),
    ),
    selfRepairPointsEarned,
    cleared: true,
  }
  activeProfile.missionRuns.unshift(missionRun)

  return {
    result: {
      transmissionId: battle.transmission.transmissionId,
      missionId: battle.mission.missionId,
      analysisRate,
      restorationRate,
      heardRanges: recoverableRunHeardRanges,
      transcriptSpans: mergedTranscriptSpans,
      damageRanges: battle.damageRanges,
      destroyedAnalysisValue: battle.destroyedAnalysisValue,
      score: missionRun.score,
      selfRepairPointsEarned,
      newHeardRangeMs,
      grantedEquipmentIds,
      isFirstClear,
      cleared: true,
    },
    missionRun,
  }
}

function getTranscriptDurationMs(chunks: TranscriptChunk[]): number {
  return chunks[chunks.length - 1]?.endMs ?? 0
}

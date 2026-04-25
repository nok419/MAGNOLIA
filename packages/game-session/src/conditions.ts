import type {
  AreaId,
  AreaProgressRow,
  ConditionId,
  ConditionSpec,
  ProfileRow,
  TransmissionId,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import type { ResolvedLoadout } from "./equipment-runtime"

export type ConditionEvaluationInput = {
  conditionId: ConditionId
  conditions: Record<ConditionId, ConditionSpec>
  profile: ProfileRow
  areaProgress: Record<AreaId, AreaProgressRow>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  resolvedLoadout: ResolvedLoadout
}

export function evaluateCondition(input: ConditionEvaluationInput): boolean {
  return evaluateConditionWithGuard(input, new Set<ConditionId>())
}

function evaluateConditionWithGuard(
  input: ConditionEvaluationInput,
  visiting: Set<ConditionId>,
): boolean {
  const condition = input.conditions[input.conditionId]
  if (!condition) {
    return false
  }

  // 条件定義の循環で無限再帰にならないよう、同一評価木で再訪した場合は false とします。
  if (visiting.has(condition.conditionId)) {
    return false
  }

  visiting.add(condition.conditionId)

  const result = (() => {
    switch (condition.kind) {
      case "always":
        return true
      case "flagSet":
        return input.profile.unlockedFlags.includes(condition.flag)
      case "areaDiscovered":
        return Boolean(input.areaProgress[condition.areaId]?.discoveredAt)
      case "equipmentEquipped":
        return isEquipmentConditionSatisfied(condition, input.resolvedLoadout)
      case "missionCleared":
        return input.profile.clearedMissionIds.includes(condition.missionId)
      case "analysisAtLeast":
        return (
          input.transmissionProgress[condition.transmissionId]?.bestAnalysisRate ?? 0
        ) >= condition.rate
      case "restorationAtLeast":
        return (
          input.transmissionProgress[condition.transmissionId]?.archiveRestorationRate ?? 0
        ) >= condition.rate
      case "saveSlotUsed":
        return input.profile.slotId === condition.slotId
      case "collectibleCollected":
        return input.profile.collectedNodeIds.includes(condition.nodeId)
      case "all":
        return condition.children.every((childId) =>
          evaluateConditionWithGuard({ ...input, conditionId: childId }, visiting),
        )
      case "any":
        return condition.children.some((childId) =>
          evaluateConditionWithGuard({ ...input, conditionId: childId }, visiting),
        )
      case "not":
        return !evaluateConditionWithGuard(
          { ...input, conditionId: condition.child },
          visiting,
        )
    }
  })()

  visiting.delete(condition.conditionId)
  return result
}

function isEquipmentConditionSatisfied(
  condition: Extract<ConditionSpec, { kind: "equipmentEquipped" }>,
  loadout: ResolvedLoadout,
): boolean {
  // subsystem は 2 枠あるため、通常 slot と同じ列に展開して条件判定します。
  const bindings = [loadout.main, loadout.sub, loadout.os, ...loadout.subsystems]

  return bindings.some((binding) => {
    if (!binding) {
      return false
    }

    if (condition.slot && condition.slot !== binding.slot) {
      return false
    }

    if (
      condition.slot === "subsystem" &&
      condition.subsystemIndex !== undefined &&
      binding.subsystemIndex !== condition.subsystemIndex
    ) {
      return false
    }

    if (condition.equipmentId && condition.equipmentId !== binding.equipmentId) {
      return false
    }

    return true
  })
}

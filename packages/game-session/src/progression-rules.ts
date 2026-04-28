import type {
  ContentBundle,
  EquipmentId,
  EquipmentMaster,
  ProfileRow,
  RootSnapshot,
} from "@magnolia/contracts"

export const TUTORIAL_RELEASE_FLAG = "tutorial.released"
export const MAP_ENABLED_FLAG = "ui.map.enabled"

export type TutorialReleaseRule = {
  releaseEquipmentId: EquipmentId | null
  unlockedFlags: string[]
  releasedActions: string[]
}

export function resolveTutorialReleaseRule(content: ContentBundle): TutorialReleaseRule {
  const releaseEquipment = Object.values(content.equipment).find((equipment) =>
    equipment.slot === "os" &&
    equipment.unlockSource.kind === "transmissionReward" &&
    equipment.passiveEffectIds.some((effectId) => {
      const effect = content.effects[effectId]
      return (
        effect?.effectKind === "mapReveal" &&
        Boolean(effect.params?.unlocksAreaVision) &&
        Boolean(effect.params?.unlocksHud)
      )
    }),
  )

  return {
    releaseEquipmentId: releaseEquipment?.equipmentId ?? null,
    unlockedFlags: [TUTORIAL_RELEASE_FLAG, MAP_ENABLED_FLAG],
    releasedActions: ["map", "full explore"],
  }
}

export function shouldReleaseTutorialOnPanelClose(input: {
  screen: RootSnapshot["screen"]
  profile: ProfileRow
  rule: TutorialReleaseRule
}): boolean {
  return (
    input.screen === "equipment" &&
    Boolean(input.rule.releaseEquipmentId) &&
    input.profile.equipped.os === input.rule.releaseEquipmentId &&
    !input.profile.unlockedFlags.includes(TUTORIAL_RELEASE_FLAG)
  )
}

export function findInitialOsEquipmentId(equipment: Record<EquipmentId, EquipmentMaster>): EquipmentId | null {
  return Object.values(equipment).find(
    (entry) => entry.slot === "os" && entry.unlockSource.kind === "initial",
  )?.equipmentId ?? null
}

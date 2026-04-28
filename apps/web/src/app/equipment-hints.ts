import type { ContentBundle, ProfileAggregate } from "@magnolia/contracts"

export function resolveUnseenEquipmentIds(profile: ProfileAggregate | null, seenEquipmentIds: string[]): string[] {
  const ownedEquipmentIds = profile?.profile.ownedEquipmentIds ?? []
  const seenEquipmentSet = new Set(seenEquipmentIds)
  return ownedEquipmentIds.filter((id) => !seenEquipmentSet.has(id))
}

export function shouldShowRewardEquipmentHint(input: {
  content: ContentBundle | null
  profile: ProfileAggregate | null
  unseenEquipmentIds: string[]
}): boolean {
  if (!input.content || !input.profile || input.unseenEquipmentIds.length === 0) {
    return false
  }

  const equippedIds = new Set<string>([
    input.profile.profile.equipped.main,
    input.profile.profile.equipped.sub,
    input.profile.profile.equipped.os,
    ...input.profile.profile.equipped.subsystems,
  ].filter((value): value is string => Boolean(value)))
  const clearedMissionIds = new Set(input.profile.profile.clearedMissionIds)

  return input.unseenEquipmentIds.some((equipmentId) => {
    if (equippedIds.has(equipmentId)) {
      return false
    }
    const equipment = input.content?.equipment[equipmentId]
    if (!equipment || equipment.unlockSource.kind !== "transmissionReward") {
      return false
    }
    const transmission = input.content?.transmissions[equipment.unlockSource.transmissionId]
    return transmission ? clearedMissionIds.has(transmission.missionId) : false
  })
}

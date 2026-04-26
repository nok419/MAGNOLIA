import type {
  ContentBundle,
  Difficulty,
  ProfileAggregate,
  SaveSlotId,
} from "@magnolia/contracts"
import {
  createEmptyBitmap,
  createExploreRevealViewport,
  revealViewportArea,
} from "./explore-world"

export function createInitialProfileAggregate(input: {
  slotId: SaveSlotId
  difficulty: Difficulty
  content: ContentBundle
}): ProfileAggregate {
  const createdAt = new Date().toISOString()
  const profileId = `profile:${input.slotId}:${createdAt}`
  const initialAreaId =
    Object.values(input.content.areas).find((area) => area.initialState === "visible")?.areaId ??
    Object.keys(input.content.areas)[0]
  const ownedEquipmentIds = Object.values(input.content.equipment)
    .filter((equipment) => equipment.unlockSource.kind === "initial")
    .map((equipment) => equipment.equipmentId)

  return {
    profile: {
      profileId,
      slotId: input.slotId,
      schemaVersion: 1,
      createdAt,
      updatedAt: createdAt,
      difficulty: input.difficulty,
      currentAreaId: initialAreaId,
      playerPosition: { ...input.content.areas[initialAreaId].worldPosition },
      equipped: {
        main: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "main"),
        sub: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "sub"),
        // 初期OS「破損」を最初から装備しておき、MAGNOLIA へ換装することで進行させます。
        os: ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "os"),
        subsystems: [
          ownedEquipmentIds.find((id) => input.content.equipment[id].slot === "subsystem") ?? null,
          null,
        ],
      },
      ownedEquipmentIds,
      equipmentLevels: Object.fromEntries(ownedEquipmentIds.map((equipmentId) => [equipmentId, 1])),
      selfRepairPoints: 0,
      collectedNodeIds: [],
      unlockedFlags: [],
      clearedMissionIds: [],
    },
    saveSlot: {
      slotId: input.slotId,
      profileId,
      label: `SLOT ${input.slotId}`,
      updatedAt: createdAt,
      currentAreaId: initialAreaId,
      playTimeMs: 0,
    },
    areaProgress: Object.values(input.content.areas).map((area) => ({
      profileId,
      areaId: area.areaId,
      discoveredAt: area.initialState === "visible" ? createdAt : undefined,
      nameRevealed: area.initialState === "visible",
      revealBitmap:
        area.initialState === "visible"
          ? revealViewportArea(
              createEmptyBitmap(),
              createExploreRevealViewport(area.worldPosition),
            )
          : createEmptyBitmap(),
      completionRateCache: 0,
    })),
    transmissionProgress: [],
    missionRuns: [],
  }
}

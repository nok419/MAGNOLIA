import type {
  ContentBundle,
  Difficulty,
  EquipmentId,
  MissionId,
  ProfileAggregate,
  SaveSlotId,
  TransmissionMaster,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import {
  createEmptyBitmap,
  createExploreRevealViewport,
  revealViewportArea,
} from "./explore-world"

const DEBUG_PROFILE_SLOT_ID: SaveSlotId = 1
const DEBUG_MISSION_ID: MissionId = "mission_good_morning"
const DEBUG_MAGNOLIA_EQUIPMENT_ID: EquipmentId = "eq_os_magnolia"
const DEBUG_SELF_REPAIR_POINTS = 900
const DEBUG_RELEASE_FLAGS = ["tutorial.released", "ui.map.enabled"] as const

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
      identifiedNodeIds: [],
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

export function createDebugProfileAggregate(input: {
  difficulty: Difficulty
  content: ContentBundle
}): ProfileAggregate {
  const aggregate = createInitialProfileAggregate({
    slotId: DEBUG_PROFILE_SLOT_ID,
    difficulty: input.difficulty,
    content: input.content,
  })
  const mission = input.content.missions[DEBUG_MISSION_ID]
  if (!mission) {
    throw new Error(`${DEBUG_MISSION_ID} が見つからないため debug mode を開始できません。`)
  }
  const transmission = input.content.transmissions[mission.transmissionId]
  if (!transmission) {
    throw new Error(`${mission.transmissionId} が見つからないため debug mode を開始できません。`)
  }
  if (!input.content.equipment[DEBUG_MAGNOLIA_EQUIPMENT_ID]) {
    throw new Error(`${DEBUG_MAGNOLIA_EQUIPMENT_ID} が見つからないため debug mode を開始できません。`)
  }

  const profile = aggregate.profile
  const now = profile.createdAt
  const ownedEquipmentIds = Object.keys(input.content.equipment).sort()

  profile.ownedEquipmentIds = ownedEquipmentIds
  profile.equipmentLevels = Object.fromEntries(
    ownedEquipmentIds.map((equipmentId) => [equipmentId, 1]),
  )
  profile.selfRepairPoints = DEBUG_SELF_REPAIR_POINTS
  profile.clearedMissionIds = [mission.missionId]
  profile.unlockedFlags = Array.from(new Set([...profile.unlockedFlags, ...DEBUG_RELEASE_FLAGS]))
  profile.equipped.os = DEBUG_MAGNOLIA_EQUIPMENT_ID
  profile.equipped.main ??= findFirstEquipmentBySlot(input.content, "main")
  profile.equipped.sub ??= findFirstEquipmentBySlot(input.content, "sub")
  profile.equipped.subsystems = [
    profile.equipped.subsystems[0] ?? findFirstEquipmentBySlot(input.content, "subsystem") ?? null,
    profile.equipped.subsystems[1],
  ]
  profile.updatedAt = now

  aggregate.saveSlot = {
    ...aggregate.saveSlot,
    label: "DEBUG",
    updatedAt: now,
    currentAreaId: profile.currentAreaId,
    playTimeMs: 0,
  }
  aggregate.transmissionProgress = [
    createClearedTransmissionProgress({
      profileId: profile.profileId,
      transmission,
      content: input.content,
      now,
    }),
  ]
  aggregate.missionRuns = [
    {
      profileId: profile.profileId,
      transmissionId: transmission.transmissionId,
      missionId: mission.missionId,
      startedAt: now,
      finishedAt: now,
      rngSeed: 0,
      analysisRate: 1,
      restorationRate: 1,
      heardRanges: aggregate.transmissionProgress[0].heardRanges,
      transcriptSpans: aggregate.transmissionProgress[0].transcriptSpans,
      damageRanges: [],
      destroyedAnalysisValue: mission.analysisTotal,
      score: 20000,
      selfRepairPointsEarned: 0,
      cleared: true,
    },
  ]

  return aggregate
}

function findFirstEquipmentBySlot(
  content: ContentBundle,
  slot: "main" | "sub" | "subsystem",
): EquipmentId | undefined {
  const candidates = Object.values(content.equipment)
    .filter((equipment) => equipment.slot === slot)
    .sort((left, right) => left.equipmentId.localeCompare(right.equipmentId))
  return candidates[0]?.equipmentId
}

function createClearedTransmissionProgress(input: {
  profileId: string
  transmission: TransmissionMaster
  content: ContentBundle
  now: string
}): TransmissionProgressRow {
  const chunks = input.transmission.transcriptChunkIds
    .map((chunkId) => input.content.transcriptChunks[chunkId])
    .filter(Boolean)
  const transcriptSpans = input.transmission.transcriptChunkIds.map((chunkId) => ({
    chunkId,
    startRatio: 0,
    endRatio: 1,
  }))
  const heardRanges = chunks.map((chunk) => ({
    startMs: chunk.startMs,
    endMs: chunk.endMs,
  }))

  // debug mode は「mission 01 clear 後」の検証用なので、該当通信は完全復元済みにします。
  return {
    profileId: input.profileId,
    transmissionId: input.transmission.transmissionId,
    areaId: input.transmission.areaId,
    firstConnectedAt: input.now,
    lastPlayedAt: input.now,
    clearCount: 1,
    bestAnalysisRate: 1,
    bestRunRestorationRate: 1,
    archiveRestorationRate: 1,
    heardRanges,
    transcriptSpans,
    signalConfidence: 1,
    signalDiscoveredAt: input.now,
    metadataUnlocked: {
      title: true,
      sender: true,
      recipient: true,
      sentAt: true,
    },
    latestRunId: 1,
  }
}

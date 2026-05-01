import {
  createEmptyEquipmentPanelViewModel,
  createEmptyEquippedItems,
  createEmptyFeatureAccessState,
} from "@magnolia/contracts"
import type {
  BattleSnapshot,
  ContentBundle,
  EquipmentPanelViewModel,
  ExploreSnapshot,
  FeatureAccessState,
  MapSnapshot,
  MissionId,
  ProfileAggregate,
} from "@magnolia/contracts"
import type { ResolvedLoadout } from "./equipment-runtime"
import { buildBattleHazardViewModels } from "./hazards"
import {
  buildWorldMapVisibilityState,
  buildEquipmentCatalogViewModel,
  selectVisibleWorldMapSnapshot,
} from "./selectors"
import {
  computeAreaCompletionRate,
} from "./progression"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
} from "./battle-world"
import type { InternalBattleState } from "./battle-state"
import {
  computeCompassTargetAreaId,
  computeNearestTransmissionStrength,
  mergeRevealBitmaps,
  readDisplayArea,
} from "./explore-world"
import { toRecord } from "./record-utils"

export function createEmptyExploreSnapshot(): ExploreSnapshot {
  const emptyFeatureAccess = createEmptyFeatureAccessState()
  return {
    screen: "explore",
    playerPosition: { x: 0, y: 0 },
    map: {
      playerPosition: { x: 0, y: 0 },
      visibleAreaNodeIds: [],
      visibleTransmissionNodeIds: [],
      visibleWarpNodeIds: [],
      visibleCollectibleNodeIds: [],
      fogBitmap: "",
    },
    hud: {
      equipped: createEmptyEquippedItems(),
      communicationStrength: 0,
      currentAreaCompletionRate: 0,
      selfRepairPoints: 0,
    },
    featureAccess: emptyFeatureAccess,
  }
}

export function createExploreSnapshotForProfile(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  featureAccess: FeatureAccessState
  loadout: ResolvedLoadout
}): ExploreSnapshot {
  const profile = input.profileAggregate.profile
  const currentArea = input.content.areas[profile.currentAreaId]
  const mapLogic = input.content.mapLogic[currentArea.mapId]
  const displayArea = readDisplayArea({
    mapLogic,
    areas: input.content.areas,
    playerPosition: profile.playerPosition,
  })
  const areaProgressById = toRecord(input.profileAggregate.areaProgress, "areaId")
  const transmissionProgressById = toRecord(
    input.profileAggregate.transmissionProgress,
    "transmissionId",
  )
  const mapState = buildWorldMapVisibilityState({
    revealBitmap: mergeRevealBitmaps(input.profileAggregate.areaProgress),
    mapLogic,
    loadout: input.loadout,
    featureAccess: input.featureAccess,
    profile,
    conditions: input.content.conditions,
    areaProgress: areaProgressById,
    transmissionProgress: transmissionProgressById,
  })
  const mapSnapshot = selectVisibleWorldMapSnapshot({
    mapState,
    playerPosition: profile.playerPosition,
    mapLogic,
  })

  return {
    screen: "explore",
    playerPosition: profile.playerPosition,
    map: mapSnapshot,
    hud: {
      currentAreaId: displayArea?.areaId,
      equipped: profile.equipped,
      communicationStrength: computeNearestTransmissionStrength({
        playerPosition: profile.playerPosition,
        mapLogic,
        featureAccess: input.featureAccess,
        transmissionProgress: transmissionProgressById,
      }),
      compassTargetAreaId: input.featureAccess.compassEnabled
        ? computeCompassTargetAreaId({
            profile,
            areas: input.content.areas,
            transmissions: input.content.transmissions,
            transmissionProgress: transmissionProgressById,
          })
        : undefined,
      currentAreaCompletionRate: computeAreaCompletionRate({
        area: displayArea,
        transmissionProgress: transmissionProgressById,
      }),
      selfRepairPoints: profile.selfRepairPoints,
    },
    featureAccess: input.featureAccess,
  }
}

export function createMapSnapshotFromExplore(exploreSnapshot: ExploreSnapshot): MapSnapshot {
  return {
    ...exploreSnapshot,
    screen: "map",
  }
}

export function createBattleSnapshotFromState(input: {
  battleState: InternalBattleState | null
  activeProfile: ProfileAggregate | null
  fallbackMissionId: MissionId
}): BattleSnapshot {
  if (!input.battleState) {
    return {
      screen: "battle",
      missionId: input.fallbackMissionId,
      phase: "intro",
      playerPosition: { x: BATTLE_WIDTH / 2, y: BATTLE_HEIGHT - 64 },
      hud: {
        missionId: input.fallbackMissionId,
        phase: "intro",
        analysisRate: 0,
        restorationRate: 0,
        noiseLevel: 0,
        equipped: input.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
        dangerLevel: 1,
        selfRepairPointsEarned: 0,
      },
      hazards: [],
    }
  }

  const transcriptDurationMs = input.battleState.transcript[input.battleState.transcript.length - 1]?.endMs ?? 0
  return {
    screen: "battle",
    missionId: input.battleState.mission.missionId,
    phase: input.battleState.phase,
    playerPosition: input.battleState.playerPosition,
    hud: {
      missionId: input.battleState.mission.missionId,
      phase: input.battleState.phase,
      analysisRate: Math.min(
        1,
        input.battleState.destroyedAnalysisValue / input.battleState.mission.analysisTotal,
      ),
      restorationRate: transcriptDurationMs > 0 ? input.battleState.restorationRate : 0,
      noiseLevel: input.battleState.noiseState.noiseLevel,
      equipped: input.activeProfile?.profile.equipped ?? createEmptyEquippedItems(),
      dangerLevel: input.battleState.mission.dangerLevel,
      selfRepairPointsEarned: input.battleState.selfRepairPointsEarned,
    },
    hazards: buildBattleHazardViewModels({
      hazards: input.battleState.hazards,
    }),
  }
}

export function createEquipmentSnapshotForProfile(
  profileAggregate: ProfileAggregate | null,
  input?: {
    content: ContentBundle
    featureAccess: FeatureAccessState
  },
): EquipmentPanelViewModel {
  if (!profileAggregate) {
    return createEmptyEquipmentPanelViewModel()
  }
  const catalog = input
    ? buildEquipmentCatalogViewModel({
        equipment: input.content.equipment,
        effects: input.content.effects,
        projectiles: input.content.projectiles,
        profile: profileAggregate.profile,
        featureAccess: input.featureAccess,
      })
    : createEmptyEquipmentPanelViewModel().catalog
  return {
    screen: "equipment",
    ownedEquipmentIds: profileAggregate.profile.ownedEquipmentIds,
    equipped: profileAggregate.profile.equipped,
    equipmentLevels: profileAggregate.profile.equipmentLevels,
    selfRepairPoints: profileAggregate.profile.selfRepairPoints,
    catalog,
  }
}

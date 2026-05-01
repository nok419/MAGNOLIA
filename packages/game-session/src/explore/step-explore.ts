import type {
  AreaId,
  ContentBundle,
  DomainEvent,
  ExploreFrameInput,
  ExploreFrameResult,
  ExploreScanPulseViewModel,
  ExploreSnapshot,
  FeatureAccessState,
  ProfileAggregate,
  RootSnapshot,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  clampToRect,
  computeAreaBounds,
  computeWorldBounds,
  detectCurrentAreaId,
  normalizeVector,
  readExploreMoveSpeed,
} from "../explore-world"
import {
  createExploreTrailPresentation,
  flattenPresentationRequests,
} from "../presentation"
import {
  updateExploreSignalConfidence,
} from "./explore-session-runtime"

type ExplorePresentationRequests = ReturnType<typeof flattenPresentationRequests>

export type ExploreRuntimeState = {
  lastExploreFacing: Vector2
  lastExploreVelocity: Vector2
  lastExploreMovementMode: "normal" | "wideScan" | "precisionReceive"
  lastExploreSignalStability: number
  exploreElapsedMs: number
  lastExploreScanAtMs: number
  exploreScanPulses: ExploreScanPulseViewModel[]
  newlyIdentifiedExploreNodeIds: Set<WorldMapNodeId>
}

export type ExploreStepHost = {
  content: ContentBundle
  equipment: {
    exploreMoveSpeedMultiplier: number
    scanRadius: number
    scanCooldownMs: number
  }
  snapshot: {
    createExploreSnapshot: () => ExploreSnapshot
  }
  featureAccess: {
    buildFeatureAccess: () => FeatureAccessState
  }
  presentation: {
    revealCurrentArea: (playerPosition: Vector2) => {
      events: DomainEvent[]
      presentationRequests: ExplorePresentationRequests
    }
    handleExploreInteraction: (
      mapLogic: WorldMapLogic,
      playerPosition: Vector2,
      interactPressed: boolean,
    ) => {
      events: DomainEvent[]
      presentationRequests: ExplorePresentationRequests
    }
  }
  menu: {
    handleExploreMenu: (input: ExploreFrameInput) => DomainEvent[]
  }
  progress: {
    getOrCreateTransmissionProgress: (
      transmissionId: string,
      areaId: AreaId,
    ) => TransmissionProgressRow
  }
  ids: {
    nextInstanceId: (prefix: string) => string
  }
}

export function stepExploreFrame(input: {
  frameInput: ExploreFrameInput
  screen: RootSnapshot["screen"]
  activeProfile: ProfileAggregate | null
  runtime: ExploreRuntimeState
  host: ExploreStepHost
}): {
  result: ExploreFrameResult
  runtime: ExploreRuntimeState
} {
  const runtime = { ...input.runtime }
  if (!input.activeProfile || input.screen !== "explore") {
    return {
      result: {
        snapshot: input.host.snapshot.createExploreSnapshot(),
        events: [],
        presentationRequests: [],
      },
      runtime,
    }
  }

  const activeProfile = input.activeProfile
  const featureAccess = input.host.featureAccess.buildFeatureAccess()
  const mapLogic = input.host.content.mapLogic[
    input.host.content.areas[activeProfile.profile.currentAreaId].mapId
  ]
  const worldBounds = computeWorldBounds(mapLogic)
  const currentAreaBounds = computeAreaBounds(
    mapLogic,
    activeProfile.profile.currentAreaId,
    worldBounds,
  )
  const moveSpeed =
    readExploreMoveSpeed(input.host.content, featureAccess, input.frameInput.dashPressed) *
    input.host.equipment.exploreMoveSpeedMultiplier
  const velocity = normalizeVector(input.frameInput.move)
  const speedRatio = Math.hypot(velocity.x, velocity.y)

  runtime.lastExploreVelocity = {
    x: velocity.x * moveSpeed,
    y: velocity.y * moveSpeed,
  }
  runtime.lastExploreMovementMode = input.frameInput.dashPressed
    ? "wideScan"
    : speedRatio <= 0.04
      ? "precisionReceive"
      : "normal"
  runtime.lastExploreSignalStability = runtime.lastExploreMovementMode === "precisionReceive"
    ? 0.9
    : runtime.lastExploreMovementMode === "wideScan"
      ? 0.38
      : 0.64

  const movementBounds = featureAccess.mapVisionUnlocked ? worldBounds : currentAreaBounds
  const nextPosition = clampToRect(
    {
      x: activeProfile.profile.playerPosition.x + velocity.x * moveSpeed * (input.frameInput.dtMs / 1000),
      y: activeProfile.profile.playerPosition.y + velocity.y * moveSpeed * (input.frameInput.dtMs / 1000),
    },
    movementBounds,
  )

  activeProfile.profile.playerPosition = nextPosition
  runtime.exploreElapsedMs += input.frameInput.dtMs
  if (velocity.x !== 0 || velocity.y !== 0) {
    runtime.lastExploreFacing = velocity
  }
  activeProfile.profile.currentAreaId = detectCurrentAreaId(
    mapLogic,
    input.host.content.areas,
    nextPosition,
    activeProfile.profile.currentAreaId,
  )

  const discoveredEvents = input.host.presentation.revealCurrentArea(nextPosition)
  const scanResult = updateExploreSignalConfidence({
    content: input.host.content,
    profileAggregate: activeProfile,
    mapLogic,
    featureAccess,
    playerPosition: nextPosition,
    dtMs: input.frameInput.dtMs,
    scanPressed: input.frameInput.scanPressed,
    exploreElapsedMs: runtime.exploreElapsedMs,
    lastExploreScanAtMs: runtime.lastExploreScanAtMs,
    scanRadius: input.host.equipment.scanRadius,
    scanCooldownMs: input.host.equipment.scanCooldownMs,
    exploreScanPulses: runtime.exploreScanPulses,
    newlyIdentifiedExploreNodeIds: runtime.newlyIdentifiedExploreNodeIds,
    getOrCreateTransmissionProgress: (transmissionId, areaId) =>
      input.host.progress.getOrCreateTransmissionProgress(transmissionId, areaId),
    nextInstanceId: (prefix) => input.host.ids.nextInstanceId(prefix),
  })
  runtime.lastExploreScanAtMs = scanResult.lastExploreScanAtMs
  runtime.exploreScanPulses = scanResult.exploreScanPulses

  const interactionEvents = input.host.presentation.handleExploreInteraction(
    mapLogic,
    nextPosition,
    input.frameInput.interactPressed,
  )
  const presentationRequests = flattenPresentationRequests([
    createExploreTrailPresentation({
      worldPosition: nextPosition,
      velocity,
      lifetimeMs: 280,
    }),
    discoveredEvents.presentationRequests,
    interactionEvents.presentationRequests,
  ])

  const menuEvents = input.host.menu.handleExploreMenu(input.frameInput)
  activeProfile.saveSlot.playTimeMs += input.frameInput.dtMs

  return {
    result: {
      snapshot: input.host.snapshot.createExploreSnapshot(),
      events: [...discoveredEvents.events, ...scanResult.events, ...interactionEvents.events, ...menuEvents],
      presentationRequests,
    },
    runtime,
  }
}

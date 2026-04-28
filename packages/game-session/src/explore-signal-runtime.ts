import type {
  AreaId,
  ContentBundle,
  FeatureAccessState,
  ExploreScanPulseViewModel,
  ExploreSignalHintViewModel,
  ProfileAggregate,
  TransmissionId,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
} from "@magnolia/contracts"
import { clamp01 } from "./battle-world"
import { isTransmissionSignalIdentified } from "./progression"
import type {
  ExploreInteractionTargetRenderState,
  ExploreNodeRenderState,
} from "./runtime-types"

const EXPLORE_SCAN_RADIUS = 860
const EXPLORE_SCAN_COOLDOWN_MS = 2400
const EXPLORE_SCAN_DURATION_MS = 1250
const EXPLORE_SIGNAL_HINT_DURATION_MS = 3600
const EXPLORE_SCAN_RESPONSE_WIDTH = 140
const EXPLORE_PASSIVE_SIGNAL_RADIUS = 520
const EXPLORE_PASSIVE_CONFIDENCE_RADIUS = 300
const EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE = 1
export const EXPLORE_SCAN_HINT_DISMISSED_FLAG = "tutorial.scan_hint.dismissed"

export type ExploreSignalRuntimeState = {
  elapsedMs: number
  lastScanAtMs: number
  scanPulses: ExploreScanPulseViewModel[]
}

export function updateExploreSignalRuntime(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  mapLogic: WorldMapLogic
  featureAccess: FeatureAccessState
  playerPosition: Vector2
  dtMs: number
  scanPressed: boolean
  runtime: ExploreSignalRuntimeState
  nextPulseId: () => string
  getOrCreateTransmissionProgress: (
    transmissionId: TransmissionId,
    areaId: AreaId,
  ) => TransmissionProgressRow
}): ExploreSignalRuntimeState {
  let lastScanAtMs = input.runtime.lastScanAtMs
  let scanPulses = input.runtime.scanPulses
  const canStartScan =
    input.scanPressed &&
    input.runtime.elapsedMs - lastScanAtMs >= EXPLORE_SCAN_COOLDOWN_MS

  if (canStartScan) {
    lastScanAtMs = input.runtime.elapsedMs
    if (!input.profileAggregate.profile.unlockedFlags.includes(EXPLORE_SCAN_HINT_DISMISSED_FLAG)) {
      input.profileAggregate.profile.unlockedFlags.push(EXPLORE_SCAN_HINT_DISMISSED_FLAG)
    }
    scanPulses = [
      ...scanPulses,
      {
        pulseId: input.nextPulseId(),
        startedAtMs: input.runtime.elapsedMs,
        radius: EXPLORE_SCAN_RADIUS,
        durationMs: EXPLORE_SCAN_DURATION_MS,
      },
    ]
  }

  scanPulses = scanPulses.filter(
    (pulse) => input.runtime.elapsedMs - pulse.startedAtMs <= pulse.durationMs,
  )

  updateTransmissionSignalConfidence({
    ...input,
    canStartScan,
  })

  return {
    ...input.runtime,
    lastScanAtMs,
    scanPulses,
  }
}

export function buildExploreSignalHints(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate | null
  mapLogic: WorldMapLogic
  featureAccess: FeatureAccessState
  playerPosition: Vector2
  elapsedMs: number
  lastScanAtMs: number
}): ExploreSignalHintViewModel[] {
  if (!input.profileAggregate) {
    return []
  }
  const transmissionProgress = Object.fromEntries(
    input.profileAggregate.transmissionProgress.map((progress) => [progress.transmissionId, progress]),
  ) as Record<TransmissionId, TransmissionProgressRow>
  const scanElapsedMs = input.elapsedMs - input.lastScanAtMs
  const scanHintActive = scanElapsedMs <= EXPLORE_SIGNAL_HINT_DURATION_MS

  const transmissionHints = input.mapLogic.transmissionNodes
    .filter((node) => input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId))
    .filter((node) => !isTransmissionSignalIdentified(transmissionProgress[node.transmissionId]))
    .flatMap<ExploreSignalHintViewModel>((node) => {
      const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
      const passiveStrength = clamp01(1 - distance / EXPLORE_PASSIVE_SIGNAL_RADIUS)
      const scanStrength = scanHintActive
        ? computeExploreScanHintStrength(distance, scanElapsedMs)
        : 0
      const strength = Math.max(passiveStrength, scanStrength * 0.9)
      if (strength <= 0.04) {
        return []
      }
      const transmission = input.content.transmissions[node.transmissionId]
      return [{
        nodeId: node.nodeId,
        kind: "transmission",
        category: transmission?.category,
        bearingRad: Math.atan2(node.y - input.playerPosition.y, node.x - input.playerPosition.x),
        distanceBand: readDistanceBand(distance),
        strength,
        confidence: transmissionProgress[node.transmissionId]?.signalConfidence ?? 0,
        expiresAtMs: scanStrength > 0 ? input.lastScanAtMs + EXPLORE_SIGNAL_HINT_DURATION_MS : undefined,
      }]
    })

  const collectibleHints = input.mapLogic.collectibleNodes
    .filter((node) => !input.profileAggregate?.profile.collectedNodeIds.includes(node.nodeId))
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .flatMap<ExploreSignalHintViewModel>((node) => {
      const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
      const passiveStrength = clamp01(1 - distance / (EXPLORE_PASSIVE_SIGNAL_RADIUS * 0.72))
      const scanStrength = scanHintActive
        ? computeExploreScanHintStrength(distance, scanElapsedMs)
        : 0
      const strength = Math.max(passiveStrength, scanStrength * 0.85)
      if (strength <= 0.06) {
        return []
      }
      return [{
        nodeId: node.nodeId,
        kind: node.collectibleKind === "hiddenEquipment" ? "equipment" : "repair",
        category: "maintenance",
        bearingRad: Math.atan2(node.y - input.playerPosition.y, node.x - input.playerPosition.x),
        distanceBand: readDistanceBand(distance),
        strength,
        confidence: strength,
        expiresAtMs: scanStrength > 0 ? input.lastScanAtMs + EXPLORE_SIGNAL_HINT_DURATION_MS : undefined,
      }]
    })

  return [...transmissionHints, ...collectibleHints]
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 6)
}

export function buildExploreInteractionTargets({
  playerPosition,
  visionRadius,
  visibleTransmissions,
  visibleCollectibles,
}: {
  playerPosition: { x: number; y: number }
  visionRadius: number
  visibleTransmissions: ExploreNodeRenderState[]
  visibleCollectibles: ExploreNodeRenderState[]
}): ExploreInteractionTargetRenderState[] {
  const targets: ExploreInteractionTargetRenderState[] = []

  // 画面側が content や visibility 条件を再走査しないよう、
  // session が「今クリックできる対象」だけを renderState として渡します。
  for (const node of visibleCollectibles) {
    const distanceToPlayer = worldDistance(playerPosition, node)
    if (distanceToPlayer > visionRadius || distanceToPlayer > (node.interactionRadius ?? 0)) {
      continue
    }
    targets.push({
      nodeId: node.nodeId,
      x: node.x,
      y: node.y,
      radius: node.markerKind === "resource" ? 17 : 20,
      distanceToPlayer,
    })
  }

  for (const node of visibleTransmissions) {
    const distanceToPlayer = worldDistance(playerPosition, node)
    if (
      node.state === "complete" ||
      distanceToPlayer > visionRadius ||
      distanceToPlayer > (node.interactionRadius ?? 0)
    ) {
      continue
    }
    targets.push({
      nodeId: node.nodeId,
      x: node.x,
      y: node.y,
      radius: 24,
      distanceToPlayer,
    })
  }

  return targets
}

function updateTransmissionSignalConfidence(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  mapLogic: WorldMapLogic
  featureAccess: FeatureAccessState
  playerPosition: Vector2
  dtMs: number
  canStartScan: boolean
  getOrCreateTransmissionProgress: (
    transmissionId: TransmissionId,
    areaId: AreaId,
  ) => TransmissionProgressRow
}): void {
  for (const node of input.mapLogic.transmissionNodes) {
    if (!input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId)) {
      continue
    }
    const existing = input.profileAggregate.transmissionProgress.find(
      (progress) => progress.transmissionId === node.transmissionId,
    )
    if (isTransmissionSignalIdentified(existing)) {
      continue
    }

    const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
    const passiveStrength = clamp01(1 - distance / EXPLORE_PASSIVE_CONFIDENCE_RADIUS)
    const scanConfidenceDelta = input.canStartScan
      ? computeExploreScanConfidenceDelta(distance)
      : 0
    const confidenceDelta =
      passiveStrength * (input.dtMs / 1000) * 0.16 +
      scanConfidenceDelta

    if (confidenceDelta <= 0) {
      continue
    }

    const progress = input.getOrCreateTransmissionProgress(
      node.transmissionId,
      input.content.transmissions[node.transmissionId]?.areaId ?? node.areaId,
    )
    progress.signalConfidence = Math.min(
      EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE,
      (progress.signalConfidence ?? 0) + confidenceDelta,
    )
    if (progress.signalConfidence >= EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE && !progress.signalDiscoveredAt) {
      progress.signalDiscoveredAt = new Date().toISOString()
    }
  }
}

function computeExploreScanConfidenceDelta(distance: number): number {
  // scan 範囲を広げても遠距離ノードが一度で識別済みにならないよう、距離減衰を強めます。
  const distanceStrength = clamp01(1 - distance / EXPLORE_SCAN_RADIUS)
  return Math.pow(distanceStrength, 1.8) * 0.64
}

function computeExploreScanHintStrength(distance: number, elapsedMs: number): number {
  const distanceStrength = clamp01(1 - distance / EXPLORE_SCAN_RADIUS)
  if (distanceStrength <= 0) {
    return 0
  }

  // pulse の波面が届いた後にだけ反応を出し、遠距離ほど遅れて弱く見えるようにします。
  const pulseProgress = easeOutCubic(clamp01(elapsedMs / EXPLORE_SCAN_DURATION_MS))
  const reachedRadius = EXPLORE_SCAN_RADIUS * pulseProgress
  if (distance > reachedRadius) {
    return 0
  }

  const responseStrength = 0.24 + clamp01((reachedRadius - distance) / EXPLORE_SCAN_RESPONSE_WIDTH) * 0.76
  return Math.pow(distanceStrength, 1.25) * responseStrength
}

function easeOutCubic(value: number): number {
  const inverse = 1 - clamp01(value)
  return 1 - inverse * inverse * inverse
}

function readDistanceBand(distance: number): ExploreSignalHintViewModel["distanceBand"] {
  if (distance <= 180) {
    return "near"
  }
  if (distance <= 360) {
    return "mid"
  }
  return "far"
}

function worldDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

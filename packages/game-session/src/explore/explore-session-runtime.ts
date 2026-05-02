import type {
  ContentBundle,
  DomainEvent,
  ExploreScanPulseViewModel,
  ExploreSignalHintViewModel,
  FeatureAccessState,
  ProfileAggregate,
  ProfileRow,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
  WorldMapNodeId,
} from "@magnolia/contracts"
import { clamp01 } from "../math"
import { isTransmissionSignalIdentified } from "../progression"
import type { ExploreNodeRenderState, ExploreRenderState } from "../runtime-types"
import { toRecord } from "../record-utils"

export const DEFAULT_EXPLORE_VISION_RADIUS = 132
export const EXPLORE_SCAN_COOLDOWN_MS = 2400
export const DEFAULT_EXPLORE_SCAN_RADIUS = 1080
export const MIN_EXPLORE_NODE_INTERACTION_RADIUS = 44

const EXPLORE_SCAN_DURATION_MS = 1250
const EXPLORE_SIGNAL_HINT_DURATION_MS = 3600
const EXPLORE_SCAN_RESPONSE_WIDTH = 140
const EXPLORE_PASSIVE_SIGNAL_RADIUS = 520
const EXPLORE_PASSIVE_CONFIDENCE_RADIUS = 300
const EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE = 1
const SCAN_HINT_DISMISSED_FLAG = "tutorial.scan_hint.dismissed"
const FIRST_MISSION_ID = "mission_good_morning"

export function resolveExploreNodeInteractionRadius(node: { interactionRadius?: number }): number {
  // map content の半径は小さめですが、画面上のアイコンは残響や外枠で少し大きく見えます。
  // 見た目上近い位置ではインタラクト意図を優先するため、runtime の判定にも下限を持たせます。
  return Math.max(node.interactionRadius ?? 0, MIN_EXPLORE_NODE_INTERACTION_RADIUS)
}

export function shouldShowScanTutorialHint(profile: ProfileRow): boolean {
  // 初回 scan の誘導は学習用です。scan 実行後、または初回ミッション完了後は再表示しません。
  return (
    !profile.unlockedFlags.includes(SCAN_HINT_DISMISSED_FLAG) &&
    !profile.clearedMissionIds.includes(FIRST_MISSION_ID)
  )
}

export function updateExploreSignalConfidence(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  mapLogic: WorldMapLogic
  featureAccess: FeatureAccessState
  playerPosition: Vector2
  dtMs: number
  scanPressed: boolean
  exploreElapsedMs: number
  lastExploreScanAtMs: number
  scanRadius: number
  scanCooldownMs: number
  exploreScanPulses: ExploreScanPulseViewModel[]
  newlyIdentifiedExploreNodeIds: Set<WorldMapNodeId>
  getOrCreateTransmissionProgress: (
    transmissionId: string,
    areaId: string,
  ) => TransmissionProgressRow
  nextInstanceId: (prefix: string) => string
}): {
  events: DomainEvent[]
  lastExploreScanAtMs: number
  exploreScanPulses: ExploreScanPulseViewModel[]
} {
  const events: DomainEvent[] = []
  let scanHit = false
  let nextLastExploreScanAtMs = input.lastExploreScanAtMs
  const canStartScan =
    input.scanPressed &&
    input.exploreElapsedMs - input.lastExploreScanAtMs >= input.scanCooldownMs

  if (canStartScan) {
    events.push({ type: "exploreScanStarted" })
    nextLastExploreScanAtMs = input.exploreElapsedMs
    input.profileAggregate.profile.unlockedFlags = uniqueIds([
      ...input.profileAggregate.profile.unlockedFlags,
      SCAN_HINT_DISMISSED_FLAG,
    ])
    input.exploreScanPulses.push({
      pulseId: input.nextInstanceId("explore_scan"),
      startedAtMs: input.exploreElapsedMs,
      radius: input.scanRadius,
      durationMs: EXPLORE_SCAN_DURATION_MS,
    })
  }

  const nextExploreScanPulses = input.exploreScanPulses.filter(
    (pulse) => input.exploreElapsedMs - pulse.startedAtMs <= pulse.durationMs,
  )

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
    const scanConfidenceDelta = canStartScan
      ? computeExploreScanConfidenceDelta(distance, input.scanRadius)
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
    const wasIdentified = isTransmissionSignalIdentified(progress)
    progress.signalConfidence = Math.min(
      EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE,
      readSignalConfidence(progress.signalConfidence) + confidenceDelta,
    )
    if (progress.signalConfidence >= EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE && !progress.signalDiscoveredAt) {
      progress.signalDiscoveredAt = new Date().toISOString()
      input.newlyIdentifiedExploreNodeIds.add(node.nodeId)
    }
    if (canStartScan && !wasIdentified && isTransmissionSignalIdentified(progress)) {
      scanHit = true
    }
  }

  if (!canStartScan) {
    return {
      events,
      lastExploreScanAtMs: nextLastExploreScanAtMs,
      exploreScanPulses: nextExploreScanPulses,
    }
  }

  for (const node of input.mapLogic.collectibleNodes) {
    if (input.profileAggregate.profile.collectedNodeIds.includes(node.nodeId)) {
      continue
    }
    if (input.profileAggregate.profile.identifiedNodeIds.includes(node.nodeId)) {
      continue
    }
    if (!input.featureAccess.visibleAreaIds.includes(node.areaId)) {
      continue
    }
    const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
    if (computeExploreScanConfidenceDelta(distance, input.scanRadius) < 0.45) {
      continue
    }
    input.profileAggregate.profile.identifiedNodeIds.push(node.nodeId)
    input.newlyIdentifiedExploreNodeIds.add(node.nodeId)
    scanHit = true
  }

  if (scanHit) {
    events.push({ type: "exploreScanHit" })
  }

  return {
    events,
    lastExploreScanAtMs: nextLastExploreScanAtMs,
    exploreScanPulses: nextExploreScanPulses,
  }
}

export function buildExploreSignalHints(input: {
  content: ContentBundle
  profileAggregate: ProfileAggregate
  mapLogic: WorldMapLogic
  featureAccess: FeatureAccessState
  playerPosition: Vector2
  exploreElapsedMs: number
  lastExploreScanAtMs: number
  scanRadius: number
  newlyIdentifiedExploreNodeIds: Set<WorldMapNodeId>
}): ExploreSignalHintViewModel[] {
  const transmissionProgress = toRecord(input.profileAggregate.transmissionProgress, "transmissionId")
  const scanElapsedMs = input.exploreElapsedMs - input.lastExploreScanAtMs
  const scanHintActive = scanElapsedMs <= EXPLORE_SIGNAL_HINT_DURATION_MS

  const transmissionHints = input.mapLogic.transmissionNodes
    .filter((node) => input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId))
    .flatMap<ExploreSignalHintViewModel>((node) => {
      const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
      const passiveStrength = clamp01(1 - distance / EXPLORE_PASSIVE_SIGNAL_RADIUS)
      const scanStrength = scanHintActive
        ? computeExploreScanHintStrength(distance, scanElapsedMs, input.scanRadius)
        : 0
      const confidence = readSignalConfidence(transmissionProgress[node.transmissionId]?.signalConfidence)
      const recorded = isTransmissionSignalIdentified(transmissionProgress[node.transmissionId])
      const strength = Math.max(passiveStrength, scanStrength * 0.9, recorded ? 0.18 : 0)
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
        strength: clamp01(strength),
        confidence,
        expiresAtMs: scanStrength > 0 ? input.lastExploreScanAtMs + EXPLORE_SIGNAL_HINT_DURATION_MS : undefined,
        detectedState: recorded ? "recorded" : readSignalDetectedState(confidence),
        lastScanAtMs: Number.isFinite(input.lastExploreScanAtMs) ? input.lastExploreScanAtMs : undefined,
        isNewlyIdentified: input.newlyIdentifiedExploreNodeIds.has(node.nodeId),
        recorded,
      }]
    })

  const collectibleHints = input.mapLogic.collectibleNodes
    .filter((node) => !input.profileAggregate.profile.collectedNodeIds.includes(node.nodeId))
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .flatMap<ExploreSignalHintViewModel>((node) => {
      const distance = Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
      const passiveStrength = clamp01(1 - distance / (EXPLORE_PASSIVE_SIGNAL_RADIUS * 0.72))
      const scanStrength = scanHintActive
        ? computeExploreScanHintStrength(distance, scanElapsedMs, input.scanRadius)
        : 0
      const recorded = input.profileAggregate.profile.identifiedNodeIds.includes(node.nodeId)
      const strength = Math.max(passiveStrength, scanStrength * 0.85, recorded ? 0.16 : 0)
      if (strength <= 0.06) {
        return []
      }
      return [{
        nodeId: node.nodeId,
        kind: node.collectibleKind === "hiddenEquipment" ? "equipment" : "repair",
        category: "maintenance",
        bearingRad: Math.atan2(node.y - input.playerPosition.y, node.x - input.playerPosition.x),
        distanceBand: readDistanceBand(distance),
        strength: clamp01(strength),
        confidence: recorded ? 1 : clamp01(strength),
        expiresAtMs: scanStrength > 0 ? input.lastExploreScanAtMs + EXPLORE_SIGNAL_HINT_DURATION_MS : undefined,
        detectedState: recorded ? "recorded" : strength >= 0.82 ? "identified" : strength >= 0.42 ? "ghost" : "hint",
        lastScanAtMs: Number.isFinite(input.lastExploreScanAtMs) ? input.lastExploreScanAtMs : undefined,
        isNewlyIdentified: input.newlyIdentifiedExploreNodeIds.has(node.nodeId),
        recorded,
      }]
    })

  return [...transmissionHints, ...collectibleHints]
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 6)
}

export function buildExploreInteractionTargets(input: {
  visibleTransmissions: ExploreNodeRenderState[]
  visibleWarps: ExploreNodeRenderState[]
  visibleCollectibles: ExploreNodeRenderState[]
  playerPosition: Vector2
  visionRadius: number
}): ExploreRenderState["interactionTargets"] {
  const toDistance = (node: ExploreNodeRenderState) =>
    Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)
  const toClickable = (node: ExploreNodeRenderState) => {
    const distance = toDistance(node)
    return distance <= input.visionRadius && distance <= resolveExploreNodeInteractionRadius(node)
  }
  const toTarget = (
    node: ExploreNodeRenderState,
    kind: ExploreRenderState["interactionTargets"][number]["kind"],
    screenHintPriority: number,
  ): ExploreRenderState["interactionTargets"][number] => ({
    nodeId: node.nodeId,
    kind,
    worldPosition: { x: node.x, y: node.y },
    visible: true,
    clickable: kind === "transmission" && node.state === "complete" ? false : toClickable(node),
    interactionRadius: resolveExploreNodeInteractionRadius(node),
    screenHintPriority,
    markerKind: node.markerKind,
  })

  // UI はクリック可否を再判定せず、この配列の `clickable` だけを入力受付に使います。
  return [
    ...input.visibleCollectibles.map((node) => toTarget(node, "collectible", 80)),
    ...input.visibleTransmissions.map((node) => toTarget(node, "transmission", 70)),
    ...input.visibleWarps.map((node) => toTarget(node, "warp", 55)),
  ].sort((left, right) => {
    if (left.clickable !== right.clickable) {
      return left.clickable ? -1 : 1
    }
    if (left.screenHintPriority !== right.screenHintPriority) {
      return right.screenHintPriority - left.screenHintPriority
    }
    return (
      Math.hypot(left.worldPosition.x - input.playerPosition.x, left.worldPosition.y - input.playerPosition.y) -
      Math.hypot(right.worldPosition.x - input.playerPosition.x, right.worldPosition.y - input.playerPosition.y)
    )
  })
}

function computeExploreScanConfidenceDelta(distance: number, scanRadius: number): number {
  // scan 範囲を広げても遠距離ノードが一度で識別済みにならないよう、距離減衰を強めます。
  const distanceStrength = clamp01(1 - distance / scanRadius)
  return Math.pow(distanceStrength, 1.8) * 0.64
}

function computeExploreScanHintStrength(distance: number, elapsedMs: number, scanRadius: number): number {
  const distanceStrength = clamp01(1 - distance / scanRadius)
  if (distanceStrength <= 0) {
    return 0
  }

  // pulse の波面が届いた後にだけ反応を出し、遠距離ほど遅れて弱く見えるようにします。
  const pulseProgress = easeOutCubic(clamp01(elapsedMs / EXPLORE_SCAN_DURATION_MS))
  const reachedRadius = scanRadius * pulseProgress
  if (distance > reachedRadius) {
    return 0
  }

  const responseStrength = 0.24 + clamp01((reachedRadius - distance) / EXPLORE_SCAN_RESPONSE_WIDTH) * 0.76
  // confidence 加算は遠距離ほど小さくしますが、UI 反応まで消すと外周の探索手掛かりが失われます。
  // scan 波面が届いた対象は、外周でも種別色の反応が残る下限を持たせます。
  const visualDistanceStrength = 0.08 + Math.pow(distanceStrength, 1.1) * 0.92
  return visualDistanceStrength * responseStrength
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

function readSignalDetectedState(
  confidence: number,
): NonNullable<ExploreSignalHintViewModel["detectedState"]> {
  if (confidence >= EXPLORE_SIGNAL_IDENTIFIED_CONFIDENCE) {
    return "identified"
  }
  if (confidence >= 0.42) {
    return "ghost"
  }
  return "hint"
}

function readSignalConfidence(value: number | undefined): number {
  // 古い保存データや開発中の値が 0..1 を外れても、描画層へ不正な半径を渡さない。
  return clamp01(value ?? 0)
}

function uniqueIds<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import type { ExplorePresentationState } from "@/app/explore-presentation"
import type { DisplayOptions } from "@/app/display-options"
import type { ExploreTrailState } from "./trail"

export type FrameRef<T> = { current: T }

export type CameraState = { x: number; y: number }

export type RebootSequenceState = {
  requestId: string
  startedAtMs: number
}

export type RebootSettleState = {
  requestId: string
  startedAtMs: number
}

export type ReleaseEdge = "top" | "right" | "bottom" | "left"

export type ReleaseSequenceState = {
  requestId: string
  startedAtMs: number
  focusEdge: ReleaseEdge
  focusPoint: { x: number; y: number }
  focusAnchor: number
}

export type RuntimeReleaseSequence = {
  progress: number
  focusEdge: ReleaseEdge
  focusPoint: { x: number; y: number }
  focusAnchor: number
  durationMs: number
}

export type RuntimeRebootSequence = { progress: number }

export type ExploreOverlayFrame = {
  viewport: Rect
  width: number
  height: number
  padding: number
  playerPoint: { x: number; y: number }
  visionPx: number
}

export type ExploreFrameRefs = {
  cameraRef: FrameRef<CameraState | null>
  trailStateRef: FrameRef<ExploreTrailState>
  rebootSequenceRef: FrameRef<RebootSequenceState | null>
  rebootSettleRef: FrameRef<RebootSettleState | null>
  releaseSequenceRef: FrameRef<ReleaseSequenceState | null>
}

export type DrawExploreFrameInput = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
  onOverlayFrame?: (frame: ExploreOverlayFrame) => void
  refs: ExploreFrameRefs
  width: number
  height: number
  now: number
}

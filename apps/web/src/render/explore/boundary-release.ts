
import type { MutableRefObject } from "react"
import type { ExploreRenderState } from "@magnolia/game-session"
import {
  pickNearestBoundaryEdge,
  readBoundaryFocus,
} from "@/render/explore/camera"

export type ReleaseSequenceState = {
  requestId: string
  startedAtMs: number
  focusEdge: "top" | "right" | "bottom" | "left"
  focusPoint: { x: number; y: number }
  focusAnchor: number
}

export function readReleaseSequence(input: {
  releaseSequenceRef: MutableRefObject<ReleaseSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
  renderState: ExploreRenderState
}): {
  progress: number
  focusEdge: ReleaseSequenceState["focusEdge"]
  focusPoint: { x: number; y: number }
  focusAnchor: number
  durationMs: number
} | null {
  if (!input.requestId) {
    input.releaseSequenceRef.current = null
    return null
  }

  if (input.releaseSequenceRef.current?.requestId !== input.requestId) {
    const focusEdge = pickNearestBoundaryEdge(
      input.renderState.playerPosition,
      input.renderState.areaBounds,
    )
    const boundaryFocus = readBoundaryFocus(
      input.renderState.areaBounds,
      focusEdge,
      input.renderState.playerPosition,
    )
    input.releaseSequenceRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
      focusEdge,
      focusPoint: boundaryFocus.point,
      focusAnchor: boundaryFocus.anchor,
    }
  }

  const sequence = input.releaseSequenceRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(0, Math.min(1, (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs))),
    focusEdge: sequence.focusEdge,
    focusPoint: sequence.focusPoint,
    focusAnchor: sequence.focusAnchor,
    durationMs: input.durationMs,
  }
}

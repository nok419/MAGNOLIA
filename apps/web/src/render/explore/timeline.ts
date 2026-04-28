import type { MutableRefObject } from "react"
import { DEFAULT_EXPLORE_VIEWPORT_HEIGHT } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import { REBOOT_SETTLE_BLACKOUT_RATIO } from "@/app/explore-presentation"
import { clampScalar, easeInOutSine, easeOutCubic, lerpPoint, lerpScalar } from "./math"

export const DEFAULT_VIEWPORT_HEIGHT = DEFAULT_EXPLORE_VIEWPORT_HEIGHT
export const REBOOT_CORE_START = 0.03
export const REBOOT_GATHER_START = 0.08
export const REBOOT_GATHER_DURATION = 0.28
export const REBOOT_CONSTRUCT_START = 0.18
export const REBOOT_CONSTRUCT_DURATION = 0.58
export const REBOOT_IGNITION_START = 0.76
export const REBOOT_IGNITION_DURATION = 0.1
export const REBOOT_REVEAL_START = 0.88

export type CameraState = { x: number; y: number }
export type RebootSequenceState = {
  requestId: string
  startedAtMs: number
}
export type RebootSettleState = {
  requestId: string
  startedAtMs: number
}
export type ReleaseSequenceState = {
  requestId: string
  startedAtMs: number
  focusEdge: "top" | "right" | "bottom" | "left"
  focusPoint: { x: number; y: number }
  focusAnchor: number
}

export type ReleaseSequenceFrame = {
  progress: number
  focusEdge: ReleaseSequenceState["focusEdge"]
  focusPoint: { x: number; y: number }
  focusAnchor: number
  durationMs: number
}

export function readRebootSequence(input: {
  rebootSequenceRef: MutableRefObject<RebootSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSequenceRef.current = null
    return null
  }

  if (input.rebootSequenceRef.current?.requestId !== input.requestId) {
    input.rebootSequenceRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSequenceRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(
        1,
        // reboot movie の進行は cue 全体の duration と一致させます。
        // 途中で通常画面に見えてしまう問題を避けるため、視覚演出だけを前倒しで
        // 完了させる処理は入れません。
        (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs),
      ),
    ),
  }
}

export function readRebootSettle(input: {
  rebootSettleRef: MutableRefObject<RebootSettleState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSettleRef.current = null
    return null
  }

  if (input.rebootSettleRef.current?.requestId !== input.requestId) {
    input.rebootSettleRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSettleRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(1, (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs)),
    ),
  }
}

export function readReleaseSequence(input: {
  releaseSequenceRef: MutableRefObject<ReleaseSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
  renderState: ExploreRenderState
}): ReleaseSequenceFrame | null {
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

export function resolveCameraViewport(input: {
  cameraRef: MutableRefObject<CameraState | null>
  worldBounds: Rect
  playerPosition: { x: number; y: number }
  viewportHeight: number
  aspectRatio: number
  rebootSequence: {
    progress: number
  } | null
  releaseSequence: {
    progress: number
    focusPoint: { x: number; y: number }
    focusAnchor: number
  } | null
}): Rect {
  const viewportWidth = input.viewportHeight * input.aspectRatio
  const targetCenter = input.releaseSequence
    ? interpolateReleaseCameraTarget(
        input.playerPosition,
        input.releaseSequence.focusPoint,
        input.releaseSequence.progress,
      )
    : input.playerPosition

  const clampedTarget = clampCameraCenterToWorld(
    targetCenter,
    input.worldBounds,
    viewportWidth,
    input.viewportHeight,
  )
  const currentCamera =
    input.cameraRef.current ??
    { x: clampedTarget.x, y: clampedTarget.y }
  const followRatio = input.rebootSequence ? 0.26 : input.releaseSequence ? 0.18 : 0.14

  input.cameraRef.current = {
    x: currentCamera.x + (clampedTarget.x - currentCamera.x) * followRatio,
    y: currentCamera.y + (clampedTarget.y - currentCamera.y) * followRatio,
  }

  return {
    x: input.cameraRef.current.x - viewportWidth / 2,
    y: input.cameraRef.current.y - input.viewportHeight / 2,
    width: viewportWidth,
    height: input.viewportHeight,
  }
}

export function readRebootViewportHeight(baseViewportHeight: number, progress: number): number {
  // ZOOM_IN_HEIGHT: 構築フェーズで近接する目標。数値が小さいほど機体が画面を占める。
  //   以前は 112。新規ゲーム導入では、機体が組み上がる瞬間をより劇的に
  //   見せるため 96 (約 3.3x 相対ズーム) に変更している。
  const ZOOM_IN_HEIGHT = 96
  const zoomInStart = REBOOT_GATHER_START
  const zoomInEnd = 0.34
  const zoomOutStart = REBOOT_REVEAL_START

  if (progress < zoomInStart) {
    return baseViewportHeight
  }
  // ズームイン: 導入後半からゆっくり寄り、構築フェーズでは近接視点を長めに維持します。
  if (progress < zoomInEnd) {
    return lerpScalar(
      baseViewportHeight,
      ZOOM_IN_HEIGHT,
      easeInOutSine((progress - zoomInStart) / Math.max(0.001, zoomInEnd - zoomInStart)),
    )
  }
  // 構築フェーズ中は絞ったまま維持し、通常視点への復帰を遅らせます。
  if (progress < zoomOutStart) {
    return ZOOM_IN_HEIGHT
  }
  // ズームアウトは終盤だけに寄せ、通常視点が早く出過ぎないようにします。
  return lerpScalar(
    ZOOM_IN_HEIGHT,
    baseViewportHeight,
    easeInOutSine((progress - zoomOutStart) / Math.max(0.001, 1 - zoomOutStart)),
  )
}

export function readRebootSettlePhase(progress: number) {
  if (progress <= REBOOT_SETTLE_BLACKOUT_RATIO) {
    return {
      worldRevealProgress: 0,
      bridgeShipAlpha: 1,
    }
  }

  const revealProgress = easeInOutSine(
    (progress - REBOOT_SETTLE_BLACKOUT_RATIO) /
      Math.max(0.001, 1 - REBOOT_SETTLE_BLACKOUT_RATIO),
  )

  return {
    worldRevealProgress: revealProgress,
    bridgeShipAlpha: 1 - easeInOutSine(revealProgress),
  }
}

function interpolateReleaseCameraTarget(
  playerPosition: { x: number; y: number },
  focusPoint: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  if (progress < 0.24) {
    const t = easeInOutSine(progress / 0.24)
    return lerpPoint(playerPosition, focusPoint, t)
  }
  if (progress < 0.72) {
    return focusPoint
  }
  const t = easeInOutSine((progress - 0.72) / 0.28)
  return lerpPoint(focusPoint, playerPosition, t)
}

export function readReleaseViewportHeight(baseViewportHeight: number, progress: number): number {
  if (progress < 0.24) {
    const t = easeInOutSine(progress / 0.24)
    return lerpScalar(baseViewportHeight, 150, t)
  }
  if (progress < 0.72) {
    return 150
  }
  const t = easeInOutSine((progress - 0.72) / 0.28)
  return lerpScalar(150, baseViewportHeight, t)
}

function clampCameraCenterToWorld(
  center: { x: number; y: number },
  worldBounds: Rect,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const minX = worldBounds.x + viewportWidth / 2
  const maxX = worldBounds.x + worldBounds.width - viewportWidth / 2
  const minY = worldBounds.y + viewportHeight / 2
  const maxY = worldBounds.y + worldBounds.height - viewportHeight / 2

  return {
    x: minX > maxX ? worldBounds.x + worldBounds.width / 2 : clampScalar(center.x, minX, maxX),
    y: minY > maxY ? worldBounds.y + worldBounds.height / 2 : clampScalar(center.y, minY, maxY),
  }
}

function pickNearestBoundaryEdge(
  position: { x: number; y: number },
  bounds: Rect,
): "top" | "right" | "bottom" | "left" {
  const distances = [
    { edge: "top" as const, distance: Math.abs(position.y - bounds.y) },
    { edge: "right" as const, distance: Math.abs(position.x - (bounds.x + bounds.width)) },
    { edge: "bottom" as const, distance: Math.abs(position.y - (bounds.y + bounds.height)) },
    { edge: "left" as const, distance: Math.abs(position.x - bounds.x) },
  ]
  distances.sort((left, right) => left.distance - right.distance)
  return distances[0]?.edge ?? "top"
}

function readBoundaryFocus(
  bounds: Rect,
  edge: "top" | "right" | "bottom" | "left",
  playerPosition: { x: number; y: number },
): { point: { x: number; y: number }; anchor: number } {
  // 寄る先は辺の中央固定ではなく、player に最も近い辺上の点にする。
  // これで camera が「何もない場所」ではなく、実際に遮っている境界へ向きやすくなる。
  switch (edge) {
    case "top": {
      const x = clampScalar(playerPosition.x, bounds.x, bounds.x + bounds.width)
      return {
        point: { x, y: bounds.y },
        anchor: (x - bounds.x) / Math.max(1, bounds.width),
      }
    }
    case "right": {
      const y = clampScalar(playerPosition.y, bounds.y, bounds.y + bounds.height)
      return {
        point: { x: bounds.x + bounds.width, y },
        anchor: (y - bounds.y) / Math.max(1, bounds.height),
      }
    }
    case "bottom": {
      const x = clampScalar(playerPosition.x, bounds.x, bounds.x + bounds.width)
      return {
        point: { x, y: bounds.y + bounds.height },
        anchor: (x - bounds.x) / Math.max(1, bounds.width),
      }
    }
    case "left": {
      const y = clampScalar(playerPosition.y, bounds.y, bounds.y + bounds.height)
      return {
        point: { x: bounds.x, y },
        anchor: (y - bounds.y) / Math.max(1, bounds.height),
      }
    }
  }
}

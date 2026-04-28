import type { MutableRefObject } from "react"
import type { Rect } from "@magnolia/game-session"

export type CameraState = { x: number; y: number }
export type ReleaseFocusEdge = "top" | "right" | "bottom" | "left"

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
  const zoomInStart = 0.08
  const zoomInEnd = 0.34
  const zoomOutStart = 0.88

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

export function pickNearestBoundaryEdge(
  position: { x: number; y: number },
  bounds: Rect,
): ReleaseFocusEdge {
  const distances = [
    { edge: "top" as const, distance: Math.abs(position.y - bounds.y) },
    { edge: "right" as const, distance: Math.abs(position.x - (bounds.x + bounds.width)) },
    { edge: "bottom" as const, distance: Math.abs(position.y - (bounds.y + bounds.height)) },
    { edge: "left" as const, distance: Math.abs(position.x - bounds.x) },
  ]
  distances.sort((left, right) => left.distance - right.distance)
  return distances[0]?.edge ?? "top"
}

export function readBoundaryFocus(
  bounds: Rect,
  edge: ReleaseFocusEdge,
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

function lerpPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  amount: number,
) {
  return {
    x: lerpScalar(from.x, to.x, amount),
    y: lerpScalar(from.y, to.y, amount),
  }
}

function lerpScalar(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function easeInOutSine(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return -(Math.cos(Math.PI * clamped) - 1) / 2
}

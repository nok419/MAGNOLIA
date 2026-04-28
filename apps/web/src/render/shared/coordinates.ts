import type { Rect } from "@magnolia/game-session"

export type CanvasPoint = { x: number; y: number }

export function worldToCanvasPoint(
  bounds: Rect,
  width: number,
  height: number,
  padding: number,
  worldX: number,
  worldY: number,
): CanvasPoint {
  const rx = (worldX - bounds.x) / Math.max(1, bounds.width)
  const ry = (worldY - bounds.y) / Math.max(1, bounds.height)
  return { x: padding + rx * (width - padding * 2), y: padding + ry * (height - padding * 2) }
}

export function canvasPointIsVisible(
  point: CanvasPoint,
  width: number,
  height: number,
  padding: number,
  margin: number,
): boolean {
  return (
    point.x >= padding - margin &&
    point.x <= width - padding + margin &&
    point.y >= padding - margin &&
    point.y <= height - padding + margin
  )
}

export function distanceBetweenCanvasPoints(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

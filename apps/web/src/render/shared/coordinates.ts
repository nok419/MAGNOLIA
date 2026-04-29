import type { Rect } from "@magnolia/game-session"

export function worldToCanvas(
  bounds: Rect,
  width: number,
  height: number,
  padding: number,
  wx: number,
  wy: number,
) {
  const rx = (wx - bounds.x) / Math.max(1, bounds.width)
  const ry = (wy - bounds.y) / Math.max(1, bounds.height)
  return {
    x: padding + rx * (width - padding * 2),
    y: padding + ry * (height - padding * 2),
  }
}

export function worldToSquareCanvas(
  bounds: Rect,
  size: number,
  wx: number,
  wy: number,
) {
  const rx = (wx - bounds.x) / Math.max(1, bounds.width)
  const ry = (wy - bounds.y) / Math.max(1, bounds.height)
  return { x: rx * size, y: ry * size }
}

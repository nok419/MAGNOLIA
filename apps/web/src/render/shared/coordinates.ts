export type CanvasRect = {
  x: number
  y: number
  width: number
  height: number
}

export function worldToCanvas(
  bounds: CanvasRect,
  width: number,
  height: number,
  padding: number,
  worldX: number,
  worldY: number,
) {
  const rx = (worldX - bounds.x) / Math.max(1, bounds.width)
  const ry = (worldY - bounds.y) / Math.max(1, bounds.height)
  return {
    x: padding + rx * (width - padding * 2),
    y: padding + ry * (height - padding * 2),
  }
}

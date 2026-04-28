export type RectLike = {
  x: number
  y: number
  width: number
  height: number
}

export type SizeLike = {
  width: number
  height: number
}

export function worldToCanvasPoint(input: {
  bounds: RectLike
  size: SizeLike
  padding?: number
  worldPosition: { x: number; y: number }
}) {
  const padding = input.padding ?? 0
  const rx = (input.worldPosition.x - input.bounds.x) / Math.max(1, input.bounds.width)
  const ry = (input.worldPosition.y - input.bounds.y) / Math.max(1, input.bounds.height)
  return {
    x: padding + rx * (input.size.width - padding * 2),
    y: padding + ry * (input.size.height - padding * 2),
  }
}

export function isCanvasPointVisible(input: {
  point: { x: number; y: number }
  size: SizeLike
  padding?: number
  margin?: number
}) {
  const padding = input.padding ?? 0
  const margin = input.margin ?? 0
  return (
    input.point.x >= padding - margin &&
    input.point.x <= input.size.width - padding + margin &&
    input.point.y >= padding - margin &&
    input.point.y <= input.size.height - padding + margin
  )
}

export function expandRect(rect: RectLike, amount: number): RectLike {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

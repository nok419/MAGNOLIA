import type { AreaId, TransmissionId } from "@magnolia/contracts"
import type { Rect } from "@magnolia/game-session"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import type { MapViewModel } from "@magnolia/game-session"
import {
  drawCarrierLineField,
  drawPeripheralVignette,
  drawScanPulse,
  drawSignalParticleField,
  drawVoidGradient,
} from "@/app/effect-primitives"
import { tokenRgba, visualToken } from "@/app/visual-tokens"
import { worldToCanvasPoint } from "@/render/shared/coordinates"

export type MapCanvasSelection =
  | { type: "area"; areaId: AreaId }
  | { type: "transmission"; areaId: AreaId; transmissionId: TransmissionId }

export type MapCanvasHitTarget =
  | { type: "area"; areaId: AreaId; x: number; y: number; radius: number }
  | { type: "transmission"; areaId: AreaId; transmissionId: TransmissionId; x: number; y: number; radius: number }

const MAP_PADDING = 18

export function drawMapCanvas(input: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  timeMs: number
  focusBounds: Rect
  viewModel: MapViewModel
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
}): MapCanvasHitTarget[] {
  const { ctx, width, height } = input
  const hitTargets: MapCanvasHitTarget[] = []

  drawVoidGradient(ctx, width, height)
  drawMapAmbientNoise(ctx, width, height, input.timeMs, input.viewModel.reduceMotion)

  drawMapFog(ctx, input.viewModel.fogBitmap, input.viewModel.worldBounds, input.focusBounds, width, height)
  drawMapGrid(ctx, input.focusBounds, width, height)

  for (const areaNode of input.viewModel.areaNodes) {
    const point = worldToCanvasPoint(input.focusBounds, width, height, MAP_PADDING, areaNode.x, areaNode.y)
    const isSelected = areaNode.areaId === input.selectedAreaId
    drawAreaPoint(ctx, point.x, point.y, isSelected)
    hitTargets.push({
      type: "area",
      areaId: areaNode.areaId,
      x: point.x,
      y: point.y,
      radius: 16,
    })
  }

  for (const node of input.viewModel.collectibleNodes) {
    const point = worldToCanvasPoint(input.focusBounds, width, height, MAP_PADDING, node.x, node.y)
    drawCollectibleMarker(ctx, {
      x: point.x,
      y: point.y,
      size: node.collectibleKind === "hiddenEquipment" ? 12 : 10,
      kind: node.collectibleKind,
      timeMs: input.timeMs,
      variant: "map",
    })
  }

  for (const node of input.viewModel.transmissionNodes) {
    const point = worldToCanvasPoint(input.focusBounds, width, height, MAP_PADDING, node.x, node.y)
    const isSelected = node.transmissionId === input.selectedTransmissionId
    drawTransmissionMarker(ctx, {
      x: point.x,
      y: point.y,
      size: isSelected ? 12 : 10,
      state: node.state,
      timeMs: input.timeMs,
      variant: "map",
      selected: isSelected,
    })
    hitTargets.push({
      type: "transmission",
      areaId: node.areaId,
      transmissionId: node.transmissionId,
      x: point.x,
      y: point.y,
      radius: 18,
    })
  }

  const playerPoint = worldToCanvasPoint(
    input.focusBounds,
    width,
    height,
    MAP_PADDING,
    input.viewModel.playerPosition.x,
    input.viewModel.playerPosition.y,
  )
  const playerAngle =
    Math.atan2(input.viewModel.playerFacing.y, input.viewModel.playerFacing.x) + Math.PI / 2
  const visionRadiusPx =
    (input.viewModel.visionRadius / Math.max(1, input.focusBounds.width)) * (width - MAP_PADDING * 2)
  drawMapVisionWave(ctx, playerPoint.x, playerPoint.y, visionRadiusPx, input.timeMs)
  drawPlayerPoint(ctx, playerPoint.x, playerPoint.y, playerAngle, input.timeMs)

  return hitTargets
}

export function resolveHitSelection(
  hitTargets: MapCanvasHitTarget[],
  x: number,
  y: number,
): MapCanvasSelection | undefined {
  const target = hitTargets
    .filter((candidate) => Math.hypot(candidate.x - x, candidate.y - y) <= candidate.radius)
    .sort(
      (left, right) =>
        Math.hypot(left.x - x, left.y - y) - Math.hypot(right.x - x, right.y - y),
    )[0]

  if (!target) {
    return undefined
  }

  if (target.type === "area") {
    return { type: "area", areaId: target.areaId }
  }

  return {
    type: "transmission",
    areaId: target.areaId,
    transmissionId: target.transmissionId,
  }
}

export function resolveFocusBounds(viewModel: MapViewModel, selectedAreaId?: AreaId): Rect {
  return selectedAreaId
    ? expandRect(viewModel.areasById[selectedAreaId]?.bounds ?? viewModel.worldBounds, 120)
    : expandRect(viewModel.worldBounds, 60)
}

function drawMapAmbientNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  reduceMotion: boolean,
) {
  // Map 背景は探索と同じ carrier line / particle を使い、画面ごとの粒子実装を増やしません。
  drawCarrierLineField(ctx, {
    seed: "map-carrier-line",
    width,
    height,
    timeMs,
    orientation: "diagonal",
    density: 12,
    curvature: 0.05,
    alpha: visualToken.alpha.backgroundLine * 0.42,
    centerQuietRatio: 0.18,
  })
  drawSignalParticleField(ctx, {
    seed: "map-particle-field",
    width,
    height,
    timeMs,
    density: "normal",
    depth: "far",
    drift: "current",
    colorRole: "line",
    reduceMotion,
    alpha: 0.58,
  })
  drawPeripheralVignette(ctx, { width, height, strength: 0.64 })
}

function drawMapVisionWave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  timeMs: number,
) {
  if (radius <= 1) {
    return
  }

  ctx.save()
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0016)
  const halo = ctx.createRadialGradient(x, y, radius * 0.66, x, y, radius * 1.08)
  halo.addColorStop(0, tokenRgba("signal", 0))
  halo.addColorStop(0.62, tokenRgba("signalBright", 0.026 + pulse * 0.018))
  halo.addColorStop(1, tokenRgba("signal", 0))
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius * 1.08, 0, Math.PI * 2)
  ctx.fill()

  drawScanPulse(ctx, {
    origin: { x, y },
    radius,
    progress: 0.18,
    strength: 0.12 + pulse * 0.08,
    shape: "circle",
    role: "analyze",
  })
  ctx.restore()
}

function drawMapFog(
  ctx: CanvasRenderingContext2D,
  fogBitmap: string,
  worldBounds: Rect,
  focusBounds: Rect,
  width: number,
  height: number,
) {
  const rows = fogBitmap.split("|")
  const bitmapHeight = rows.length
  const bitmapWidth = rows[0]?.length ?? 0
  if (bitmapHeight === 0 || bitmapWidth === 0) {
    return
  }

  const cellWidth = worldBounds.width / bitmapWidth
  const cellHeight = worldBounds.height / bitmapHeight

  ctx.save()
  for (let y = 0; y < bitmapHeight; y += 1) {
    for (let x = 0; x < bitmapWidth; x += 1) {
      if (rows[y]?.[x] === "1") {
        continue
      }
      const worldX = worldBounds.x + x * cellWidth
      const worldY = worldBounds.y + y * cellHeight
      const topLeft = worldToCanvasPoint(focusBounds, width, height, MAP_PADDING, worldX, worldY)
      const bottomRight = worldToCanvasPoint(
        focusBounds,
        width,
        height,
        MAP_PADDING,
        worldX + cellWidth,
        worldY + cellHeight,
      )
      ctx.fillStyle = tokenRgba("void", 0.78)
      ctx.fillRect(
        topLeft.x,
        topLeft.y,
        Math.max(1, bottomRight.x - topLeft.x),
        Math.max(1, bottomRight.y - topLeft.y),
      )
    }
  }
  ctx.restore()
}

function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  focusBounds: Rect,
  width: number,
  height: number,
) {
  ctx.save()
  ctx.strokeStyle = tokenRgba("signal", 0.08)
  ctx.lineWidth = 1
  const step = 80
  const startX = Math.floor(focusBounds.x / step) * step
  const endX = focusBounds.x + focusBounds.width
  const startY = Math.floor(focusBounds.y / step) * step
  const endY = focusBounds.y + focusBounds.height

  for (let x = startX; x <= endX; x += step) {
    const from = worldToCanvasPoint(focusBounds, width, height, MAP_PADDING, x, startY)
    const to = worldToCanvasPoint(focusBounds, width, height, MAP_PADDING, x, endY)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  for (let y = startY; y <= endY; y += step) {
    const from = worldToCanvasPoint(focusBounds, width, height, MAP_PADDING, startX, y)
    const to = worldToCanvasPoint(focusBounds, width, height, MAP_PADDING, endX, y)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawAreaPoint(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) {
  ctx.save()
  ctx.strokeStyle = selected ? tokenRgba("text", 0.98) : tokenRgba("signal", 0.82)
  ctx.fillStyle = selected ? tokenRgba("text", 0.12) : tokenRgba("signal", 0.1)
  ctx.lineWidth = selected ? 2.6 : 1.4
  ctx.beginPath()
  ctx.arc(x, y, selected ? 12 : 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawPlayerPoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  timeMs: number,
) {
  const pulse = 0.7 + 0.3 * Math.sin(timeMs * 0.004)
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 22)
  glow.addColorStop(0, tokenRgba("text", 0.2 * pulse))
  glow.addColorStop(0.45, tokenRgba("signal", 0.12 * pulse))
  glow.addColorStop(1, tokenRgba("signal", 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = tokenRgba("text", 0.98)
  ctx.strokeStyle = tokenRgba("signal", 0.9)
  ctx.lineWidth = 1.6
  ctx.shadowColor = tokenRgba("signalBright", 0.55)
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(8, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

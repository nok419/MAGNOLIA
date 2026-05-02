import type { AreaId, TransmissionId } from "@magnolia/contracts"
import { drawCollectibleMarker, drawTransmissionMarker } from "@/app/canvas-markers"
import type { DisplayOptions } from "@/app/display-options"
import { hex, rgba } from "@/render/shared/canvas-palette"
import { drawArtificialGrid, drawSignalPulse } from "@/render/shared/effects"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import { seededUnit } from "@/render/shared/render-math"
import type { WorldMapViewModel } from "@/view-models/map-view-model"

export type MapHitTarget =
  | { type: "area"; areaId: AreaId; x: number; y: number; radius: number }
  | { type: "transmission"; areaId: AreaId; transmissionId: TransmissionId; x: number; y: number; radius: number }

export function drawMapCanvas(input: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  timeMs: number
  focusBounds: WorldMapViewModel["focusBounds"]
  viewModel: WorldMapViewModel
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  displayOptions: Pick<DisplayOptions, "reduceFlashing" | "lowFrameRateMode">
}) {
  const { ctx, width, height } = input
  const padding = 18
  const hitTargets: MapHitTarget[] = []

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, rgba("voidDepth", 1))
  gradient.addColorStop(1, rgba("voidBase", 1))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  drawMapAmbientNoise(ctx, width, height, input.timeMs)

  drawMapFog(ctx, input.viewModel.fogBitmap, input.viewModel.worldBounds, input.focusBounds, width, height, padding)
  drawMapGrid(ctx, input.focusBounds, width, height, padding, input.displayOptions)

  for (const area of input.viewModel.areas) {
    const point = worldToCanvasPoint({
      bounds: input.focusBounds,
      size: { width, height },
      padding,
      worldPosition: area.position,
    })
    const isSelected = area.areaId === input.selectedAreaId
    drawAreaPoint(ctx, point.x, point.y, isSelected)
    hitTargets.push({
      type: "area",
      areaId: area.areaId,
      x: point.x,
      y: point.y,
      radius: 16,
    })
  }

  for (const node of input.viewModel.collectibles) {
    const point = worldToCanvasPoint({
      bounds: input.focusBounds,
      size: { width, height },
      padding,
      worldPosition: node.position,
    })
    drawCollectibleMarker(ctx, {
      x: point.x,
      y: point.y,
      size: node.markerKind === "equipment" ? 12 : 10,
      kind: node.markerKind,
      timeMs: input.timeMs,
      variant: "map",
      lowFrameRateMode: input.displayOptions.lowFrameRateMode,
    })
  }

  for (const node of input.viewModel.transmissions) {
    const point = worldToCanvasPoint({
      bounds: input.focusBounds,
      size: { width, height },
      padding,
      worldPosition: node.position,
    })
    const isSelected = node.transmissionId === input.selectedTransmissionId
    drawTransmissionMarker(ctx, {
      x: point.x,
      y: point.y,
      size: isSelected ? 12 : 10,
      state: node.state,
      timeMs: input.timeMs,
      variant: "map",
      selected: isSelected,
      lowFrameRateMode: input.displayOptions.lowFrameRateMode,
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

  const playerPoint = worldToCanvasPoint({
    bounds: input.focusBounds,
    size: { width, height },
    padding,
    worldPosition: input.viewModel.player.position,
  })
  const playerAngle =
    Math.atan2(input.viewModel.player.facing.y, input.viewModel.player.facing.x) + Math.PI / 2
  const visionRadiusPx =
    (input.viewModel.player.visionRadius / Math.max(1, input.focusBounds.width)) * (width - padding * 2)
  drawMapVisionWave(ctx, playerPoint.x, playerPoint.y, visionRadiusPx, input.timeMs, input.displayOptions)
  drawPlayerPoint(ctx, playerPoint.x, playerPoint.y, playerAngle, input.timeMs)

  return hitTargets
}

function drawMapAmbientNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
) {
  ctx.save()
  // 全体マップの平面感を減らすため、座標固定の微細な点を低不透明度で重ねる。
  const count = Math.max(90, Math.floor((width * height) / 9000))
  for (let i = 0; i < count; i += 1) {
    const seed = i * 97
    const x = seededUnit(seed + 1) * width
    const y = seededUnit(seed + 2) * height
    const twinkle = 0.62 + 0.38 * Math.sin(timeMs * 0.0012 + seed)
    const alpha = (0.018 + seededUnit(seed + 3) * 0.032) * twinkle
    ctx.fillStyle = rgba("lineStrong", alpha)
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

function drawMapVisionWave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  timeMs: number,
  displayOptions: Pick<DisplayOptions, "reduceFlashing" | "lowFrameRateMode">,
) {
  if (radius <= 1) {
    return
  }

  ctx.save()
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0016)
  const halo = ctx.createRadialGradient(x, y, radius * 0.66, x, y, radius * 1.08)
  halo.addColorStop(0, rgba("signalPrimary", 0))
  halo.addColorStop(0.62, rgba("lineStrong", 0.026 + pulse * 0.018))
  halo.addColorStop(1, rgba("signalPrimary", 0))
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius * 1.08, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = rgba("signalPrimary", 0.12 + pulse * 0.08)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  drawSignalPulse(ctx, {
    origin: { x, y },
    radius,
    progress: 0.45 + pulse * 0.12,
    paletteRole: "signalPrimary",
    intensity: 0.48,
    reduceFlashing: displayOptions.reduceFlashing,
    lowFrameRateMode: displayOptions.lowFrameRateMode,
    nowMs: timeMs,
    semantic: "scan",
  })
  ctx.restore()
}

function drawMapFog(
  ctx: CanvasRenderingContext2D,
  fogBitmap: string,
  worldBounds: WorldMapViewModel["worldBounds"],
  focusBounds: WorldMapViewModel["focusBounds"],
  width: number,
  height: number,
  padding: number,
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
      const topLeft = worldToCanvasPoint({
        bounds: focusBounds,
        size: { width, height },
        padding,
        worldPosition: { x: worldX, y: worldY },
      })
      const bottomRight = worldToCanvasPoint({
        bounds: focusBounds,
        size: { width, height },
        padding,
        worldPosition: { x: worldX + cellWidth, y: worldY + cellHeight },
      })
      ctx.fillStyle = rgba("voidBase", 0.78)
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
  focusBounds: WorldMapViewModel["focusBounds"],
  width: number,
  height: number,
  padding: number,
  displayOptions: Pick<DisplayOptions, "reduceFlashing" | "lowFrameRateMode">,
) {
  ctx.save()
  drawArtificialGrid(ctx, {
    width,
    height,
    spacing: displayOptions.lowFrameRateMode ? 96 : 48,
    paletteRole: "signalPrimary",
    intensity: 0.38,
    reduceFlashing: displayOptions.reduceFlashing,
    lowFrameRateMode: displayOptions.lowFrameRateMode,
    nowMs: 0,
    semantic: "surface",
  })
  ctx.strokeStyle = rgba("signalPrimary", 0.08)
  ctx.lineWidth = 1
  const step = 80
  const startX = Math.floor(focusBounds.x / step) * step
  const endX = focusBounds.x + focusBounds.width
  const startY = Math.floor(focusBounds.y / step) * step
  const endY = focusBounds.y + focusBounds.height

  for (let x = startX; x <= endX; x += step) {
    const from = worldToCanvasPoint({
      bounds: focusBounds,
      size: { width, height },
      padding,
      worldPosition: { x, y: startY },
    })
    const to = worldToCanvasPoint({
      bounds: focusBounds,
      size: { width, height },
      padding,
      worldPosition: { x, y: endY },
    })
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  for (let y = startY; y <= endY; y += step) {
    const from = worldToCanvasPoint({
      bounds: focusBounds,
      size: { width, height },
      padding,
      worldPosition: { x: startX, y },
    })
    const to = worldToCanvasPoint({
      bounds: focusBounds,
      size: { width, height },
      padding,
      worldPosition: { x: endX, y },
    })
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawAreaPoint(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) {
  ctx.save()
  ctx.strokeStyle = selected ? hex("signalReadable") : hex("signalPrimary")
  ctx.fillStyle = selected ? rgba("signalReadable", 0.12) : rgba("signalPrimary", 0.1)
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
  glow.addColorStop(0, rgba("signalReadable", 0.2 * pulse))
  glow.addColorStop(0.45, rgba("signalPrimary", 0.12 * pulse))
  glow.addColorStop(1, rgba("signalPrimary", 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = hex("signalReadable")
  ctx.strokeStyle = hex("signalPrimary")
  ctx.lineWidth = 1.6
  ctx.shadowColor = rgba("lineStrong", 0.55)
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

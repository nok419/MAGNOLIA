import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import type { DisplayOptions } from "@/app/display-options"
import { hex, rgba } from "@/render/shared/canvas-palette"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import type { MiniMapViewModel } from "@/view-models/map-view-model"

export const MINI_MAP_SIZE = 180

const CENTER = MINI_MAP_SIZE / 2
const RADIUS = MINI_MAP_SIZE / 2 - 6
const PHI_INV = 1 / 1.618033988749895
const TAU = Math.PI * 2
const TICK_COUNT = 72
const CARDINAL_TICKS = [0, 18, 36, 54]

export function drawMiniMapFrame(input: {
  ctx: CanvasRenderingContext2D
  viewModel: MiniMapViewModel
  displayOptions: DisplayOptions
  timeMs: number
  sweepAngle: number
}): void {
  const { ctx, viewModel, displayOptions, timeMs, sweepAngle } = input

  ctx.clearRect(0, 0, MINI_MAP_SIZE, MINI_MAP_SIZE)
  ctx.save()
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS, 0, TAU)
  ctx.clip()

  ctx.fillStyle = rgba("voidBase", 1)
  ctx.fillRect(0, 0, MINI_MAP_SIZE, MINI_MAP_SIZE)

  drawCells(ctx, viewModel.fogBitmap)
  drawInternalGrid(ctx)
  drawRangeRings(ctx)
  if (!displayOptions.reduceFlashing) {
    drawSweepCone(ctx, sweepAngle)
  }

  for (const node of viewModel.transmissions) {
    const p = project(viewModel, node.position.x, node.position.y)
    drawTransmissionMarker(ctx, {
      x: p.x,
      y: p.y,
      size: 4.8,
      state: node.state,
      timeMs,
      variant: "mini",
      lowFrameRateMode: displayOptions.lowFrameRateMode,
    })
  }

  for (const node of viewModel.collectibles) {
    const p = project(viewModel, node.position.x, node.position.y)
    drawCollectibleMarker(ctx, {
      x: p.x,
      y: p.y,
      size: 4.2,
      kind: node.markerKind,
      timeMs,
      variant: "mini",
      lowFrameRateMode: displayOptions.lowFrameRateMode,
    })
  }

  for (const hint of viewModel.signalHints) {
    drawSignalHintGhost(ctx, hint)
  }

  const pp = project(viewModel, viewModel.player.position.x, viewModel.player.position.y)
  const angle = Math.atan2(viewModel.player.facing.y, viewModel.player.facing.x) + Math.PI / 2
  const visionRadiusPx =
    (viewModel.player.visionRadius / Math.max(1, viewModel.worldBounds.width)) * MINI_MAP_SIZE

  drawPlayerGlow(ctx, pp.x, pp.y, timeMs)
  drawVisionCircle(ctx, pp.x, pp.y, visionRadiusPx, viewModel.player.tutorialRestricted, timeMs)
  drawMiniPlayer(ctx, pp.x, pp.y, angle, timeMs)

  ctx.restore()
  drawCrosshair(ctx)
  drawOuterRings(ctx)
  drawCompassTicks(ctx)
}

function drawCells(ctx: CanvasRenderingContext2D, fogBitmap: string): void {
  const rows = fogBitmap.split("|")
  const w = rows[0]?.length ?? 1
  const cw = MINI_MAP_SIZE / w
  const ch = MINI_MAP_SIZE / Math.max(1, rows.length)
  rows.forEach((row, yi) => {
    row.split("").forEach((cell, xi) => {
      ctx.fillStyle = cell === "1" ? rgba("signalPrimary", 0.1) : rgba("voidBase", 0.45)
      ctx.fillRect(xi * cw, yi * ch, cw, ch)
    })
  })
}

function drawInternalGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = rgba("signalPrimary", 0.04)
  ctx.lineWidth = 0.5
  const step = MINI_MAP_SIZE / 8
  for (let i = 1; i < 8; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, MINI_MAP_SIZE)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(MINI_MAP_SIZE, i * step)
    ctx.stroke()
  }
}

function drawRangeRings(ctx: CanvasRenderingContext2D): void {
  ctx.setLineDash([3, 6])
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgba("signalPrimary", 0.1)
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS * 0.33, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = rgba("signalPrimary", 0.12)
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS * 0.66, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawSweepCone(ctx: CanvasRenderingContext2D, angle: number): void {
  const coneAngle = 0.4
  const grad = ctx.createConicGradient(angle - coneAngle, CENTER, CENTER)
  grad.addColorStop(0, rgba("signalPrimary", 0))
  grad.addColorStop(coneAngle / TAU, rgba("signalPrimary", 0.08))
  grad.addColorStop((coneAngle * 1.01) / TAU, rgba("signalPrimary", 0))
  grad.addColorStop(1, rgba("signalPrimary", 0))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS, 0, TAU)
  ctx.fill()

  const lx = CENTER + Math.cos(angle) * RADIUS
  const ly = CENTER + Math.sin(angle) * RADIUS
  const lineGrad = ctx.createLinearGradient(CENTER, CENTER, lx, ly)
  lineGrad.addColorStop(0, rgba("signalPrimary", 0))
  lineGrad.addColorStop(0.3, rgba("signalPrimary", 0.25))
  lineGrad.addColorStop(1, rgba("signalPrimary", 0.06))
  ctx.strokeStyle = lineGrad
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(CENTER, CENTER)
  ctx.lineTo(lx, ly)
  ctx.stroke()
}

function drawCrosshair(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = rgba("signalPrimary", 0.12)
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(CENTER - RADIUS, CENTER)
  ctx.lineTo(CENTER + RADIUS, CENTER)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(CENTER, CENTER - RADIUS)
  ctx.lineTo(CENTER, CENTER + RADIUS)
  ctx.stroke()

  const cs = 3
  ctx.strokeStyle = rgba("signalPrimary", 0.2)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(CENTER, CENTER - cs)
  ctx.lineTo(CENTER + cs * PHI_INV, CENTER)
  ctx.lineTo(CENTER, CENTER + cs)
  ctx.lineTo(CENTER - cs * PHI_INV, CENTER)
  ctx.closePath()
  ctx.stroke()
}

function drawOuterRings(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = rgba("signalPrimary", 0.12)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS + 2, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = rgba("lineStrong", 0.4)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS, 0, TAU)
  ctx.stroke()
}

function drawCompassTicks(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < TICK_COUNT; i += 1) {
    const angle = (TAU / TICK_COUNT) * i - Math.PI / 2
    const isCardinal = CARDINAL_TICKS.includes(i)
    const innerR = isCardinal ? RADIUS - 8 : RADIUS - 3
    const outerR = RADIUS
    const x1 = CENTER + Math.cos(angle) * innerR
    const y1 = CENTER + Math.sin(angle) * innerR
    const x2 = CENTER + Math.cos(angle) * outerR
    const y2 = CENTER + Math.sin(angle) * outerR

    if (isCardinal) {
      ctx.strokeStyle = rgba("lineStrong", 0.5)
      ctx.lineWidth = 1.5
    } else if (i % 9 === 0) {
      ctx.strokeStyle = rgba("lineStrong", 0.25)
      ctx.lineWidth = 1
    } else if (i % 3 === 0) {
      ctx.strokeStyle = rgba("signalPrimary", 0.15)
      ctx.lineWidth = 0.7
    } else {
      continue
    }

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
}

function project(viewModel: MiniMapViewModel, x: number, y: number) {
  return worldToCanvasPoint({
    bounds: viewModel.worldBounds,
    size: { width: MINI_MAP_SIZE, height: MINI_MAP_SIZE },
    worldPosition: { x, y },
  })
}

function drawSignalHintGhost(
  ctx: CanvasRenderingContext2D,
  hint: MiniMapViewModel["signalHints"][number],
): void {
  const safeStrength = Math.max(0, Math.min(1, hint.strength))
  const safeConfidence = Math.max(0, Math.min(1, hint.confidence))
  const safeBearingRad = Number.isFinite(hint.bearingRad) ? hint.bearingRad : 0
  const detectedState = hint.detectedState ?? "hint"
  const radius = RADIUS * (0.7 + (1 - safeStrength) * 0.18)
  const arcWidth = 0.18 + Math.min(0.8, safeConfidence) * 0.18
  const stateAlpha = detectedState === "recorded" ? 0.24 : detectedState === "identified" ? 0.19 : 0.12
  const alpha = 0.04 + safeStrength * stateAlpha
  ctx.save()
  ctx.strokeStyle = rgba("signalReadable", alpha)
  ctx.lineWidth = detectedState === "recorded" ? 1.6 : detectedState === "identified" ? 1.3 : 1
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, radius, safeBearingRad - arcWidth, safeBearingRad + arcWidth)
  ctx.stroke()

  if (detectedState === "identified" || detectedState === "recorded") {
    const x = CENTER + Math.cos(safeBearingRad) * radius
    const y = CENTER + Math.sin(safeBearingRad) * radius
    ctx.beginPath()
    if (hint.kind === "repair") {
      ctx.moveTo(x - 3.5, y - 2)
      ctx.lineTo(x + 3.5, y - 2)
      ctx.moveTo(x - 3.5, y + 2)
      ctx.lineTo(x + 3.5, y + 2)
    } else if (hint.kind === "equipment" || hint.kind === "collectible") {
      ctx.moveTo(x, y - 4)
      ctx.lineTo(x + 2.6, y)
      ctx.lineTo(x, y + 4)
      ctx.lineTo(x - 2.6, y)
      ctx.closePath()
    } else {
      ctx.moveTo(x, y - 5)
      ctx.lineTo(x, y + 5)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawVisionCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  restricted: boolean,
  timeMs: number,
): void {
  ctx.save()
  const pulse = 0.72 + 0.28 * Math.sin(timeMs * 0.002)
  const halo = ctx.createRadialGradient(x, y, radius * 0.72, x, y, radius * 1.1)
  halo.addColorStop(0, rgba("signalPrimary", 0))
  halo.addColorStop(0.64, rgba("lineStrong", restricted ? 0.045 : 0.03))
  halo.addColorStop(1, rgba("signalPrimary", 0))
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius * 1.1, 0, TAU)
  ctx.fill()

  ctx.strokeStyle = restricted
    ? rgba("lineStrong", 0.24 + pulse * 0.08)
    : rgba("lineStrong", 0.15 + pulse * 0.06)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = rgba("signalPrimary", 0.055 * pulse)
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.78, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function drawPlayerGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, timeMs: number): void {
  const pulse = 0.72 + 0.28 * Math.sin(timeMs * 0.004)
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20)
  glowGrad.addColorStop(0, rgba("signalReadable", 0.22 * pulse))
  glowGrad.addColorStop(0.42, rgba("signalPrimary", 0.1 * pulse))
  glowGrad.addColorStop(1, rgba("signalPrimary", 0))
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(cx, cy, 20, 0, TAU)
  ctx.fill()
}

function drawMiniPlayer(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, timeMs: number): void {
  const h = 10
  const w = 6.5
  const corePulse = 0.75 + 0.25 * Math.sin(timeMs * 0.004)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.shadowColor = rgba("signalReadable", 0.7)
  ctx.shadowBlur = 5 + corePulse * 3
  ctx.fillStyle = hex("signalReadable")
  ctx.beginPath()
  ctx.moveTo(0, -h * 0.6)
  ctx.lineTo(-w / 2, h * 0.4)
  ctx.lineTo(0, h * 0.15)
  ctx.lineTo(w / 2, h * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

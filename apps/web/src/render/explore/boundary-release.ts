import type { Rect } from "@magnolia/game-session"
import { tokenRgba } from "@/app/visual-tokens"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import { clampScalar, easeInOutSine, easeOutCubic, lerpScalar, TAU } from "./math"

export function drawRestrictedBoundary(
  ctx: CanvasRenderingContext2D,
  input: {
    viewport: Rect
    areaBounds: Rect
    width: number
    height: number
    padding: number
    timeMs: number
    releaseSequence: {
      progress: number
      focusEdge: "top" | "right" | "bottom" | "left"
      focusAnchor: number
      focusPoint: { x: number; y: number }
    } | null
  },
) {
  const topLeft = worldToCanvasPoint(
    input.viewport,
    input.width,
    input.height,
    input.padding,
    input.areaBounds.x,
    input.areaBounds.y,
  )
  const bottomRight = worldToCanvasPoint(
    input.viewport,
    input.width,
    input.height,
    input.padding,
    input.areaBounds.x + input.areaBounds.width,
    input.areaBounds.y + input.areaBounds.height,
  )
  const rectX = Math.min(topLeft.x, bottomRight.x)
  const rectY = Math.min(topLeft.y, bottomRight.y)
  const rectW = Math.abs(bottomRight.x - topLeft.x)
  const rectH = Math.abs(bottomRight.y - topLeft.y)
  const releaseProgress = input.releaseSequence?.progress ?? 0
  const boundaryAlpha = input.releaseSequence
    ? readReleaseBoundaryAlpha(releaseProgress)
    : 1

  if (boundaryAlpha <= 0.01) {
    return
  }

  ctx.save()
  drawBoundaryBeam(ctx, {
    x: rectX,
    y: rectY,
    width: rectW,
    height: rectH,
    alpha: boundaryAlpha * (input.releaseSequence ? 0.34 : 1),
    timeMs: input.timeMs,
  })

  if (input.releaseSequence) {
    const focusPoint = worldToCanvasPoint(
      input.viewport,
      input.width,
      input.height,
      input.padding,
      input.releaseSequence.focusPoint.x,
      input.releaseSequence.focusPoint.y,
    )
    drawBoundaryReleaseShockwave(ctx, {
      x: focusPoint.x,
      y: focusPoint.y,
      width: rectW,
      height: rectH,
      progress: releaseProgress,
      timeMs: input.timeMs,
    })
    drawBoundaryPerimeterDissolve(ctx, {
      x: rectX,
      y: rectY,
      width: rectW,
      height: rectH,
      originEdge: input.releaseSequence.focusEdge,
      originAnchor: input.releaseSequence.focusAnchor,
      progress: releaseProgress,
      timeMs: input.timeMs,
    })
  }
  ctx.restore()
}

function drawBoundaryBeam(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; alpha: number; timeMs: number },
) {
  const pulse = 0.9 + Math.sin(input.timeMs * 0.00125) * 0.1
  const beamAlpha = input.alpha * pulse

  ctx.save()
  ctx.strokeStyle = tokenRgba("text", 0.16 * beamAlpha)
  ctx.lineWidth = 18
  ctx.shadowColor = tokenRgba("text", 0.3 * beamAlpha)
  ctx.shadowBlur = 28
  ctx.strokeRect(input.x, input.y, input.width, input.height)

  ctx.strokeStyle = tokenRgba("signalBright", 0.32 * beamAlpha)
  ctx.lineWidth = 9
  ctx.shadowBlur = 16
  ctx.strokeRect(input.x, input.y, input.width, input.height)

  ctx.strokeStyle = tokenRgba("text", 0.75 * beamAlpha)
  ctx.lineWidth = 2.2
  ctx.shadowBlur = 8
  ctx.strokeRect(input.x, input.y, input.width, input.height)

  drawBoundaryFlux(ctx, { ...input, beamAlpha })
  ctx.restore()
}

function drawBoundaryFlux(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; alpha: number; timeMs: number; beamAlpha: number },
) {
  const flow = (input.timeMs * 0.14) % 1
  ctx.save()
  ctx.strokeStyle = tokenRgba("text", 0.42 * input.beamAlpha)
  ctx.lineWidth = 1.3
  ctx.shadowColor = tokenRgba("text", 0.35 * input.beamAlpha)
  ctx.shadowBlur = 10

  for (let index = 0; index < 12; index += 1) {
    const offset = ((index / 12) + flow) % 1
    const segmentLength = 0.05 + ((index % 4) * 0.01)
    drawBeamSegment(ctx, {
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      offset,
      length: segmentLength,
    })
  }

  ctx.restore()
}

function drawBeamSegment(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; offset: number; length: number },
) {
  const perimeter = input.width * 2 + input.height * 2
  const start = input.offset * perimeter
  const end = Math.min(perimeter, start + input.length * perimeter)

  drawSegmentOnPerimeter(ctx, input, start, end)
  if (end >= perimeter) {
    drawSegmentOnPerimeter(ctx, input, 0, end - perimeter)
  }
}

function drawSegmentOnPerimeter(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  start: number,
  end: number,
) {
  let cursor = start
  while (cursor < end) {
    const topEnd = rect.width
    const rightEnd = topEnd + rect.height
    const bottomEnd = rightEnd + rect.width
    const leftEnd = bottomEnd + rect.height

    if (cursor < topEnd) {
      const localEnd = Math.min(end, topEnd)
      ctx.beginPath()
      ctx.moveTo(rect.x + cursor, rect.y)
      ctx.lineTo(rect.x + localEnd, rect.y)
      ctx.stroke()
      cursor = localEnd
      continue
    }

    if (cursor < rightEnd) {
      const localStart = cursor - topEnd
      const localEnd = Math.min(end, rightEnd) - topEnd
      ctx.beginPath()
      ctx.moveTo(rect.x + rect.width, rect.y + localStart)
      ctx.lineTo(rect.x + rect.width, rect.y + localEnd)
      ctx.stroke()
      cursor = Math.min(end, rightEnd)
      continue
    }

    if (cursor < bottomEnd) {
      const localStart = cursor - rightEnd
      const localEnd = Math.min(end, bottomEnd) - rightEnd
      ctx.beginPath()
      ctx.moveTo(rect.x + rect.width - localStart, rect.y + rect.height)
      ctx.lineTo(rect.x + rect.width - localEnd, rect.y + rect.height)
      ctx.stroke()
      cursor = Math.min(end, bottomEnd)
      continue
    }

    if (cursor < leftEnd) {
      const localStart = cursor - bottomEnd
      const localEnd = Math.min(end, leftEnd) - bottomEnd
      ctx.beginPath()
      ctx.moveTo(rect.x, rect.y + rect.height - localStart)
      ctx.lineTo(rect.x, rect.y + rect.height - localEnd)
      ctx.stroke()
      cursor = Math.min(end, leftEnd)
      continue
    }

    break
  }
}

function drawBoundaryReleaseShockwave(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    progress: number
    timeMs: number
  },
) {
  const waveProgress = readReleaseDissolveProgress(input.progress)
  const residualAlpha = readReleaseResidualAlpha(input.progress)
  if (waveProgress <= 0.001 || residualAlpha <= 0.01) {
    return
  }

  const maxRadius = Math.max(48, Math.hypot(input.width, input.height) * 0.8)
  const primaryRadius = lerpScalar(16, maxRadius, easeOutCubic(waveProgress))
  const secondaryRadius = Math.max(12, primaryRadius * 0.58)

  ctx.save()
  ctx.strokeStyle = tokenRgba("signalBright", 0.36 * residualAlpha)
  ctx.lineWidth = 2.1
  ctx.shadowColor = tokenRgba("signalBright", 0.42 * residualAlpha)
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(input.x, input.y, primaryRadius, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = tokenRgba("text", 0.16 * residualAlpha)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(input.x, input.y, secondaryRadius, 0, TAU)
  ctx.stroke()

  for (let index = 0; index < 10; index += 1) {
    const angle = (TAU / 10) * index + input.timeMs * 0.0005
    const innerRadius = Math.max(10, primaryRadius * 0.2)
    const outerRadius = primaryRadius + 12 + (index % 3) * 10
    ctx.strokeStyle = tokenRgba("signalBright", 0.18 * residualAlpha)
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(
      input.x + Math.cos(angle) * innerRadius,
      input.y + Math.sin(angle) * innerRadius,
    )
    ctx.lineTo(
      input.x + Math.cos(angle) * outerRadius,
      input.y + Math.sin(angle) * outerRadius,
    )
    ctx.stroke()
  }
  ctx.restore()
}

function drawBoundaryPerimeterDissolve(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    originEdge: "top" | "right" | "bottom" | "left"
    originAnchor: number
    progress: number
    timeMs: number
  },
) {
  const dissolveProgress = readReleaseDissolveProgress(input.progress)
  const residualAlpha = readReleaseResidualAlpha(input.progress)
  if (dissolveProgress <= 0.001 || residualAlpha <= 0.01) {
    return
  }

  const perimeter = Math.max(1, (input.width + input.height) * 2)
  const originOffset = readPerimeterOffset(input, input.originEdge, input.originAnchor)
  const clearedDistance = perimeter * 0.5 * dissolveProgress
  const segmentCount = Math.max(44, Math.round(perimeter / 24))
  const releaseBand = Math.max(18, perimeter * 0.065)

  ctx.save()
  ctx.lineCap = "round"
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStart = (perimeter * index) / segmentCount
    const segmentEnd = Math.min(
      perimeter,
      segmentStart + perimeter / segmentCount - 3 - (index % 3),
    )
    const segmentCenter = segmentStart + (segmentEnd - segmentStart) / 2
    const wrappedDistance = readWrappedPerimeterDistance(
      segmentCenter,
      originOffset,
      perimeter,
    )

    if (wrappedDistance <= clearedDistance) {
      const edgeSample = readPerimeterEdgeSample(input, segmentCenter)
      const bandFactor = clampScalar(
        1 - Math.abs(wrappedDistance - clearedDistance) / releaseBand,
        0,
        1,
      )
      const strandCount = bandFactor > 0.18 ? 2 + (index % 2) : 1
      for (let strandIndex = 0; strandIndex < strandCount; strandIndex += 1) {
        const strandSeed = segmentCenter * 0.12 + strandIndex * 17
        const drift = (10 + strandIndex * 5) * (0.44 + bandFactor * 0.86)
        drawBoundaryReleaseStrand(ctx, {
          edge: edgeSample.edge,
          rect: input,
          anchor: clampScalar(
            edgeSample.anchor + (strandIndex - (strandCount - 1) / 2) * 0.016,
            0,
            1,
          ),
          length: 14 + strandIndex * 7 + (index % 4) * 2,
          drift,
          alpha: residualAlpha * (0.18 + bandFactor * 0.18 - strandIndex * 0.02),
          timeMs: input.timeMs + strandSeed * 10,
        })
      }
      continue
    }

    const intactFactor = clampScalar(
      (wrappedDistance - clearedDistance) / Math.max(18, perimeter * 0.08),
      0,
      1,
    )
    ctx.strokeStyle = tokenRgba("text", 0.76 * residualAlpha * intactFactor)
    ctx.lineWidth = 2.6
    ctx.shadowColor = tokenRgba("signalBright", 0.42 * residualAlpha * intactFactor)
    ctx.shadowBlur = 10
    drawSegmentOnPerimeter(ctx, input, segmentStart, segmentEnd)
  }
  ctx.restore()
}

function drawBoundaryReleaseStrand(
  ctx: CanvasRenderingContext2D,
  input: {
    edge: "top" | "right" | "bottom" | "left"
    rect: { x: number; y: number; width: number; height: number }
    anchor: number
    length: number
    drift: number
    alpha: number
    timeMs: number
  },
) {
  if (input.alpha <= 0.01) {
    return
  }

  const shimmer = 0.8 + Math.sin(input.timeMs * 0.0035 + input.anchor * 9) * 0.2
  ctx.save()
  ctx.strokeStyle = tokenRgba("signalBright", input.alpha * shimmer)
  ctx.lineWidth = 1.35
  ctx.shadowColor = tokenRgba("signalBright", input.alpha * 0.9)
  ctx.shadowBlur = 10
  ctx.beginPath()

  switch (input.edge) {
    case "top": {
      const x = input.rect.x + input.rect.width * input.anchor
      ctx.moveTo(x, input.rect.y)
      ctx.lineTo(x + Math.sin(input.timeMs * 0.002 + input.anchor * 6) * 8, input.rect.y - input.drift)
      break
    }
    case "right": {
      const y = input.rect.y + input.rect.height * input.anchor
      ctx.moveTo(input.rect.x + input.rect.width, y)
      ctx.lineTo(input.rect.x + input.rect.width + input.drift, y + Math.sin(input.timeMs * 0.002 + input.anchor * 6) * 8)
      break
    }
    case "bottom": {
      const x = input.rect.x + input.rect.width * input.anchor
      ctx.moveTo(x, input.rect.y + input.rect.height)
      ctx.lineTo(x + Math.sin(input.timeMs * 0.002 + input.anchor * 6) * 8, input.rect.y + input.rect.height + input.drift)
      break
    }
    case "left": {
      const y = input.rect.y + input.rect.height * input.anchor
      ctx.moveTo(input.rect.x, y)
      ctx.lineTo(input.rect.x - input.drift, y + Math.sin(input.timeMs * 0.002 + input.anchor * 6) * 8)
      break
    }
  }

  ctx.stroke()
  ctx.restore()
}

function readReleaseBoundaryAlpha(progress: number): number {
  if (progress < 0.08) {
    return 1
  }
  if (progress < 0.46) {
    return 1 - easeInOutSine((progress - 0.08) / 0.38) * 0.9
  }
  if (progress < 0.68) {
    return 0.1 * (1 - easeInOutSine((progress - 0.46) / 0.22))
  }
  return 0
}

function readReleaseDissolveProgress(progress: number): number {
  if (progress < 0.06) {
    return 0
  }
  if (progress < 0.62) {
    return easeOutCubic((progress - 0.06) / 0.56)
  }
  return 1
}

function readReleaseResidualAlpha(progress: number): number {
  if (progress < 0.68) {
    return 1
  }
  if (progress < 0.94) {
    return 1 - easeInOutSine((progress - 0.68) / 0.26)
  }
  return 0
}

function readPerimeterOffset(
  rect: { width: number; height: number },
  edge: "top" | "right" | "bottom" | "left",
  anchor: number,
) {
  switch (edge) {
    case "top":
      return rect.width * anchor
    case "right":
      return rect.width + rect.height * anchor
    case "bottom":
      return rect.width + rect.height + rect.width * (1 - anchor)
    case "left":
      return rect.width * 2 + rect.height + rect.height * (1 - anchor)
  }
}

function readWrappedPerimeterDistance(
  offset: number,
  origin: number,
  perimeter: number,
) {
  const delta = Math.abs(offset - origin)
  return Math.min(delta, perimeter - delta)
}

function readPerimeterEdgeSample(
  rect: { width: number; height: number },
  offset: number,
): { edge: "top" | "right" | "bottom" | "left"; anchor: number } {
  const perimeter = rect.width * 2 + rect.height * 2
  const normalized = ((offset % perimeter) + perimeter) % perimeter
  const topEnd = rect.width
  const rightEnd = topEnd + rect.height
  const bottomEnd = rightEnd + rect.width

  if (normalized < topEnd) {
    return { edge: "top", anchor: normalized / Math.max(1, rect.width) }
  }
  if (normalized < rightEnd) {
    return {
      edge: "right",
      anchor: (normalized - topEnd) / Math.max(1, rect.height),
    }
  }
  if (normalized < bottomEnd) {
    return {
      edge: "bottom",
      anchor: 1 - (normalized - rightEnd) / Math.max(1, rect.width),
    }
  }
  return {
    edge: "left",
    anchor: 1 - (normalized - bottomEnd) / Math.max(1, rect.height),
  }
}

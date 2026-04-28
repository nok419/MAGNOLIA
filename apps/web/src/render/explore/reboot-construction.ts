import type { ShipVariant } from "@magnolia/contracts"
import { computeHullMetrics, drawShip } from "@/app/ship-renderer"
import { tokenRgba } from "@/app/visual-tokens"
import { clampScalar, easeOutCubic, lerpScalar, seededUnit, TAU } from "./math"

export function drawRebootConstruction(
  ctx: CanvasRenderingContext2D,
  input: {
    center: { x: number; y: number }
    angle: number
    timeMs: number
    progress: number
    scale: number
    shipVariant: ShipVariant
  },
) {
  const shellAlpha = 0.2 + input.progress * 0.5
  const ringRadius = lerpScalar(42, 16, easeOutCubic(input.progress))
  // 構築フェーズ全体の描画スケール。演出で見せる間は caller から K=2.6 が
  // 渡され、ignition → reveal の settle 窓で K=1.0 (= drawExplorePlayer のサイズ) まで
  // 縮小されます。これにより reveal 時点で wireframe と本体 ship がぴったり重なります。
  const K = input.scale

  ctx.save()
  ctx.translate(input.center.x, input.center.y)
  ctx.scale(K, K)
  drawRebootConstructionRings(ctx, input.timeMs, input.progress, K)

  ctx.save()
  ctx.rotate(input.angle)
  drawRebootHullFragments(ctx, computeHullMetrics(0.72), input.timeMs, input.progress, K)

  ctx.strokeStyle = tokenRgba("signalBright", shellAlpha)
  ctx.lineWidth = 1.2 / K
  ctx.shadowColor = tokenRgba("line", 0.85)
  ctx.shadowBlur = 22 / K
  drawPlayerWireframe(ctx, input.progress)
  drawRebootInternalCircuit(ctx, computeHullMetrics(0.72), input.progress, K)

  ctx.globalAlpha = 0.24 + input.progress * 0.24
  ctx.fillStyle = tokenRgba("signalBright", 1)
  drawPlayerHullFill(ctx, input.progress)

  const resolvedProgress = clampScalar((input.progress - 0.58) / 0.42, 0, 1)
  if (resolvedProgress > 0.001) {
    ctx.save()
    ctx.globalAlpha = 0.14 + resolvedProgress * 0.2
    drawShip(ctx, {
      variant: input.shipVariant,
      center: { x: 0, y: 0 },
      scale: 0.72,
      stroke: tokenRgba("text", 0.9),
      fill: tokenRgba("signalBright", 0.08),
      lineWidth: 0.9 / K,
      glow: { color: tokenRgba("line", 0.8), blur: 10 / K },
      core: {
        color: tokenRgba("signalBright", 0.9),
        glowColor: tokenRgba("line", 0.95),
        glowBlur: 8 / K,
        radius: 1.8 / K,
        pulse: resolvedProgress,
      },
      reveal: resolvedProgress,
      revealFill: clampScalar((resolvedProgress - 0.16) / 0.84, 0, 1),
      timeMs: input.timeMs,
      artDetailStrength: 0.85,
    })
    ctx.restore()
  }

  ctx.shadowBlur = 0
  const hull = computeHullMetrics(0.72)
  const scanY = hull.tipY + ((input.progress * 1.5 + Math.sin(input.timeMs * 0.004) * 0.08) % 1) *
    (hull.baseY - hull.tipY + 16)
  const scanWidth = (hull.bodyW / 2 + hull.wingGap + hull.wingW) * 2.4
  const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6)
  scanGrad.addColorStop(0, tokenRgba("line", 0))
  scanGrad.addColorStop(0.5, tokenRgba("text", 0.6 * input.progress))
  scanGrad.addColorStop(1, tokenRgba("line", 0))
  ctx.globalAlpha = 1
  ctx.fillStyle = scanGrad
  ctx.fillRect(-scanWidth / 2, scanY - 6, scanWidth, 12)

  ctx.restore()

  ctx.strokeStyle = tokenRgba("line", 0.18 + input.progress * 0.22)
  ctx.lineWidth = 1.2 / K
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius * 1.45, 0, TAU)
  ctx.stroke()

  const tickCount = 12
  const tickOuterR = ringRadius * 1.62
  const tickInnerR = ringRadius * 1.5
  ctx.strokeStyle = tokenRgba("line", 0.35 + input.progress * 0.28)
  ctx.lineWidth = 1 / K
  for (let tickIndex = 0; tickIndex < tickCount; tickIndex += 1) {
    const angle = (TAU / tickCount) * tickIndex + input.timeMs * 0.0004
    const isMajor = tickIndex % 3 === 0
    const outerRadius = isMajor ? tickOuterR + 4 : tickOuterR
    ctx.beginPath()
    ctx.moveTo(Math.cos(angle) * tickInnerR, Math.sin(angle) * tickInnerR)
    ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius)
    ctx.stroke()
  }

  for (let index = 0; index < 6; index += 1) {
    const burstAngle = (TAU / 6) * index + input.timeMs * 0.0015
    const burstRadius = ringRadius * (0.7 + (index % 3) * 0.16)
    const burstX = Math.cos(burstAngle) * burstRadius
    const burstY = Math.sin(burstAngle) * burstRadius
    ctx.globalAlpha = 0.18 + input.progress * 0.22
    ctx.fillStyle = index % 2 === 0 ? tokenRgba("text", 1) : tokenRgba("line", 1)
    ctx.beginPath()
    ctx.arc(burstX, burstY, 1.6 + (index % 2) * 0.5, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

function drawRebootConstructionRings(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  progress: number,
  scale: number,
) {
  const resolved = easeOutCubic(progress)
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineCap = "round"
  for (let ringIndex = 0; ringIndex < 4; ringIndex += 1) {
    const radius = lerpScalar(58 - ringIndex * 5, 24 + ringIndex * 5, resolved)
    const alpha = (0.22 - ringIndex * 0.035) * (0.5 + resolved * 0.5)
    const spin = timeMs * (0.0009 + ringIndex * 0.00018) * (ringIndex % 2 === 0 ? 1 : -1)
    ctx.strokeStyle = tokenRgba("line", alpha)
    ctx.lineWidth = (1.2 - ringIndex * 0.12) / scale
    ctx.shadowColor = tokenRgba("signal", 0.55)
    ctx.shadowBlur = 10 / scale
    for (let segment = 0; segment < 2; segment += 1) {
      const start = spin + segment * Math.PI + ringIndex * 0.36
      ctx.beginPath()
      ctx.arc(0, 0, radius, start, start + TAU * (0.22 + ringIndex * 0.035))
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawRebootHullFragments(
  ctx: CanvasRenderingContext2D,
  hull: ReturnType<typeof computeHullMetrics>,
  timeMs: number,
  progress: number,
  scale: number,
) {
  const targets = [
    { x: 0, y: hull.tipY },
    { x: -hull.bodyW * 0.5, y: hull.baseY },
    { x: hull.bodyW * 0.5, y: hull.baseY },
    { x: 0, y: hull.bodyNotchY },
    { x: -hull.bodyW * 0.95, y: hull.baseY - hull.wingH * 0.45 },
    { x: hull.bodyW * 0.95, y: hull.baseY - hull.wingH * 0.45 },
  ]

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineCap = "round"
  for (let index = 0; index < 34; index += 1) {
    const target = targets[index % targets.length]
    const delay = (index % 9) * 0.035
    const local = clampScalar((progress - delay) / 0.46, 0, 1)
    if (local <= 0.001) {
      continue
    }
    const eased = easeOutCubic(local)
    const angle = seededUnit(index * 11 + 3) * TAU + timeMs * 0.00022
    const distance = lerpScalar(62 + seededUnit(index * 17) * 42, 0, eased)
    const jitterX = (seededUnit(index * 23) - 0.5) * hull.bodyW * 0.28
    const jitterY = (seededUnit(index * 29) - 0.5) * hull.bodyH * 0.22
    const x = target.x + jitterX * (1 - eased) + Math.cos(angle) * distance
    const y = target.y + jitterY * (1 - eased) + Math.sin(angle) * distance
    const alpha = Math.sin(local * Math.PI) * (0.18 + progress * 0.42)
    if (alpha <= 0.01) {
      continue
    }

    ctx.strokeStyle = tokenRgba("signalBright", alpha)
    ctx.lineWidth = (0.7 + seededUnit(index * 31) * 0.7) / scale
    ctx.shadowColor = tokenRgba("line", 0.75)
    ctx.shadowBlur = 7 / scale
    const len = 2.4 + seededUnit(index * 37) * 4.8
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootInternalCircuit(
  ctx: CanvasRenderingContext2D,
  hull: ReturnType<typeof computeHullMetrics>,
  progress: number,
  scale: number,
) {
  const circuitProgress = clampScalar((progress - 0.22) / 0.58, 0, 1)
  if (circuitProgress <= 0.001) {
    return
  }

  ctx.save()
  ctx.globalAlpha = 0.22 + circuitProgress * 0.34
  ctx.strokeStyle = tokenRgba("signalBright", 0.72)
  ctx.lineWidth = 0.55 / scale
  ctx.shadowColor = tokenRgba("signal", 0.5)
  ctx.shadowBlur = 5 / scale
  const revealY = lerpScalar(hull.baseY + 4, hull.tipY - 4, easeOutCubic(circuitProgress))

  const paths = [
    [
      { x: 0, y: hull.baseY },
      { x: 0, y: hull.bodyNotchY },
      { x: 0, y: hull.tipY * 0.72 },
    ],
    [
      { x: -hull.bodyW * 0.24, y: hull.baseY * 0.54 },
      { x: -hull.bodyW * 0.1, y: hull.bodyNotchY },
      { x: -hull.bodyW * 0.18, y: hull.tipY * 0.32 },
    ],
    [
      { x: hull.bodyW * 0.24, y: hull.baseY * 0.54 },
      { x: hull.bodyW * 0.1, y: hull.bodyNotchY },
      { x: hull.bodyW * 0.18, y: hull.tipY * 0.32 },
    ],
  ]

  for (const path of paths) {
    ctx.beginPath()
    let started = false
    for (const point of path) {
      if (point.y < revealY) {
        continue
      }
      if (!started) {
        ctx.moveTo(point.x, point.y)
        started = true
      } else {
        ctx.lineTo(point.x, point.y)
      }
    }
    if (started) {
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawPlayerWireframe(ctx: CanvasRenderingContext2D, progress: number) {
  const metrics = computeHullMetrics(0.72)
  const reveal = easeOutCubic(progress)

  traceRebootSolidBody(ctx, metrics, reveal)
  ctx.stroke()

  for (const side of [-1, 1] as const) {
    traceRebootSolidWing(ctx, metrics, side, reveal)
    ctx.stroke()
    traceRebootSolidRearFin(ctx, metrics, side, reveal)
    ctx.stroke()
  }

  ctx.save()
  ctx.globalAlpha *= 0.72 * reveal
  ctx.lineWidth = Math.max(0.45, ctx.lineWidth * 0.58)
  ctx.beginPath()
  ctx.moveTo(0, metrics.tipY + metrics.bodyH * 0.1)
  ctx.lineTo(0, metrics.baseY * 0.5 * reveal)
  ctx.moveTo(-metrics.bodyW * 0.18 * reveal, -metrics.bodyH * 0.02 * reveal)
  ctx.lineTo(-metrics.bodyW * 0.56 * reveal, (metrics.baseY - metrics.wingH * 0.1) * reveal)
  ctx.moveTo(metrics.bodyW * 0.18 * reveal, -metrics.bodyH * 0.02 * reveal)
  ctx.lineTo(metrics.bodyW * 0.56 * reveal, (metrics.baseY - metrics.wingH * 0.1) * reveal)
  ctx.stroke()
  ctx.restore()
}

function drawPlayerHullFill(ctx: CanvasRenderingContext2D, progress: number) {
  const metrics = computeHullMetrics(0.72)
  const reveal = easeOutCubic(Math.max(0, (progress - 0.16) / 0.84))

  traceRebootSolidBody(ctx, metrics, reveal)
  ctx.fill()
}

function traceRebootSolidWing(
  ctx: CanvasRenderingContext2D,
  metrics: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
  const rootX = side * metrics.bodyW * 0.22
  const rootY = metrics.baseY * 0.42
  const outerX = side * (metrics.bodyW * 0.5 + metrics.wingGap + metrics.wingW * 1.08)
  const outerY = metrics.baseY * 0.46
  const innerX = side * metrics.bodyW * 0.36
  const innerY = -metrics.bodyH * 0.2

  ctx.beginPath()
  ctx.moveTo(rootX, rootY)
  ctx.lineTo(outerX * reveal, outerY * reveal)
  ctx.lineTo(innerX * reveal, innerY * reveal)
  ctx.closePath()
}

function traceRebootSolidRearFin(
  ctx: CanvasRenderingContext2D,
  metrics: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(side * metrics.bodyW * 0.1, metrics.baseY * 0.82)
  ctx.lineTo(side * metrics.bodyW * 0.26 * reveal, metrics.baseY * 1.1 * reveal)
  ctx.lineTo(side * metrics.bodyW * 0.02 * reveal, metrics.baseY * 0.98 * reveal)
  ctx.closePath()
}

function traceRebootSolidBody(
  ctx: CanvasRenderingContext2D,
  metrics: ReturnType<typeof computeHullMetrics>,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(0, metrics.tipY)
  ctx.lineTo(-metrics.bodyW * 0.48 * reveal, metrics.baseY * 0.58 * reveal)
  ctx.lineTo(-metrics.bodyW * 0.16 * reveal, metrics.baseY * reveal)
  ctx.lineTo(0, metrics.bodyNotchY * reveal)
  ctx.lineTo(metrics.bodyW * 0.16 * reveal, metrics.baseY * reveal)
  ctx.lineTo(metrics.bodyW * 0.48 * reveal, metrics.baseY * 0.58 * reveal)
  ctx.closePath()
}

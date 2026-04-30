import { TAU, clampScalar } from "@/render/shared/render-math"

export function drawVisionFog(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  center: { x: number; y: number },
  radius: number,
  now: number,
  intensity: number = 1,
) {
  if (intensity <= 0.001) {
    return
  }
  const visibleRadius = Math.max(0.5, radius)
  ctx.save()
  ctx.fillStyle = `rgba(0, 0, 0, ${(0.42 * intensity).toFixed(3)})`
  ctx.fillRect(0, 0, W, H)

  ctx.globalCompositeOperation = "destination-out"
  const fogGrad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, visibleRadius)
  fogGrad.addColorStop(0, "rgba(0,0,0,1)")
  fogGrad.addColorStop(0.72, "rgba(0,0,0,0.95)")
  fogGrad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = fogGrad
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = "source-over"

  const pulse = 0.18 + 0.08 * Math.sin(now * 0.0018)
  ctx.strokeStyle = `rgba(150, 220, 255, ${(pulse * intensity).toFixed(3)})`
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius, 0, TAU)
  ctx.stroke()

  const halo = ctx.createRadialGradient(
    center.x,
    center.y,
    visibleRadius * 0.86,
    center.x,
    center.y,
    visibleRadius * 1.18,
  )
  halo.addColorStop(0, "rgba(93, 164, 209, 0)")
  halo.addColorStop(0.5, `rgba(150, 220, 255, ${(0.035 * intensity).toFixed(3)})`)
  halo.addColorStop(1, "rgba(93, 164, 209, 0)")
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius * 1.18, 0, TAU)
  ctx.fill()

  ctx.strokeStyle = `rgba(93, 164, 209, ${(pulse * 0.22 * intensity).toFixed(3)})`
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius * 1.05, 0, TAU)
  ctx.stroke()

  ctx.restore()
}

export function drawVisionScannerOverlay(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  now: number,
  restricted: boolean,
  intensity: number = 1,
) {
  if (intensity <= 0.001) {
    return
  }
  const visibleRadius = Math.max(0.5, radius)
  ctx.save()
  ctx.globalAlpha = intensity
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius * 0.98, 0, TAU)
  ctx.clip()

  drawVisionSweep(ctx, center, visibleRadius, now, restricted)
  drawVisionRipples(ctx, center, visibleRadius, now, restricted)
  ctx.restore()
}

function drawVisionSweep(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  now: number,
  restricted: boolean,
) {
  const sweepAngle = now * (restricted ? 0.00075 : 0.00105) - Math.PI / 2
  const coneWidth = restricted ? 0.24 : 0.34
  const gradient = ctx.createConicGradient(sweepAngle - coneWidth, center.x, center.y)

  gradient.addColorStop(0, "rgba(93, 164, 209, 0)")
  gradient.addColorStop(0.04, `rgba(93, 164, 209, ${restricted ? "0.02" : "0.035"})`)
  gradient.addColorStop(0.1, `rgba(180, 236, 255, ${restricted ? "0.06" : "0.1"})`)
  gradient.addColorStop(coneWidth / TAU, "rgba(93, 164, 209, 0)")
  gradient.addColorStop(1, "rgba(93, 164, 209, 0)")

  ctx.save()
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, TAU)
  ctx.fill()

  const lineX = center.x + Math.cos(sweepAngle) * radius
  const lineY = center.y + Math.sin(sweepAngle) * radius
  const lineGradient = ctx.createLinearGradient(center.x, center.y, lineX, lineY)
  lineGradient.addColorStop(0, "rgba(180, 236, 255, 0)")
  lineGradient.addColorStop(0.3, `rgba(180, 236, 255, ${restricted ? "0.08" : "0.16"})`)
  lineGradient.addColorStop(1, "rgba(180, 236, 255, 0)")
  ctx.strokeStyle = lineGradient
  ctx.lineWidth = restricted ? 0.9 : 1.25
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(lineX, lineY)
  ctx.stroke()
  ctx.restore()
}

function drawVisionRipples(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  now: number,
  restricted: boolean,
) {
  const startRadius = radius * 0.08
  const usableRadius = radius * 0.88
  const rippleSources = restricted
    ? [
        { periodMs: 7600, phaseOffsetMs: 0, alphaScale: 0.72 },
        { periodMs: 9800, phaseOffsetMs: 2400, alphaScale: 0.52 },
        { periodMs: 12600, phaseOffsetMs: 5200, alphaScale: 0.4 },
      ]
    : [
        { periodMs: 6200, phaseOffsetMs: 0, alphaScale: 1 },
        { periodMs: 8200, phaseOffsetMs: 2200, alphaScale: 0.78 },
        { periodMs: 10400, phaseOffsetMs: 4700, alphaScale: 0.6 },
      ]

  ctx.save()
  for (const source of rippleSources) {
    const progress = ((now + source.phaseOffsetMs) % source.periodMs) / source.periodMs
    const ringRadius = startRadius + usableRadius * progress
    const fadeIn = clampScalar(progress / 0.16, 0, 1)
    const fadeOut = clampScalar((1 - progress) / 0.14, 0, 1)
    const alpha =
      (restricted ? 0.07 : 0.11) *
      source.alphaScale *
      fadeIn *
      fadeOut *
      (1 - progress * 0.32)

    if (alpha <= 0.004) {
      continue
    }

    ctx.strokeStyle = `rgba(150, 220, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = restricted ? 0.8 + (1 - progress) * 0.45 : 1 + (1 - progress) * 0.7
    ctx.beginPath()
    ctx.arc(center.x, center.y, ringRadius, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

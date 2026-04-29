import { TAU, clampScalar } from "@/render/shared/canvas-math"

export function isCanvasPointVisible(
  point: { x: number; y: number },
  width: number,
  height: number,
  padding: number,
  margin: number,
) {
  return (
    point.x >= padding - margin &&
    point.x <= width - padding + margin &&
    point.y >= padding - margin &&
    point.y <= height - padding + margin
  )
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function computeSightAlpha(
  pos: { x: number; y: number },
  player: { x: number; y: number },
  visionPx: number,
) {
  // 探索円の内側でアイテムを完全可視。外側はフルマーカーを非表示にし、
  // 代わりに `drawNavCueLayer` が リム・コンパス + 種別色ピンポイント を出す。
  // 以前はここで floor 0.08 を返していたが、「画面内だが範囲外で見えてしまう」
  // 問題を解消するため、探索範囲を出ると完全に 0 へ落とす設計に変更した。
  const d = dist(pos, player)
  if (d <= visionPx * 0.78) return 1
  const outerRadius = visionPx * 1.16
  if (d >= outerRadius) return 0
  const fade = 1 - (d - visionPx * 0.78) / Math.max(1, outerRadius - visionPx * 0.78)
  return fade
}

/* ============================================================
   BACKGROUND
   ============================================================ */

export function drawVisionFog(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  center: { x: number; y: number },
  radius: number,
  now: number,
  // 0..1: settle 中だけ 0→1 で立ち上がる。通常は 1。0 だとフォグ・円ともに非描画。
  intensity: number = 1,
) {
  if (intensity <= 0.001) {
    return
  }
  const visibleRadius = Math.max(0.5, radius)
  ctx.save()
  // punch out see-through area with compositing
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

  // 視界円は強い輪郭ではなく、センサーの薄い波として見せる。
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

  // secondary faint ring
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
  reduceFlashing: boolean = false,
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

  // reduceFlashing 時は回転するスイープを止め、低速の同心円だけを残します。
  if (!reduceFlashing) {
    drawVisionSweep(ctx, center, visibleRadius, now, restricted)
  }
  drawVisionRipples(ctx, center, visibleRadius, now, restricted || reduceFlashing)
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
  // 波紋は常時どれかが見えるよう、周期と位相をずらした source を重ねます。
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

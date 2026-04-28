import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import { drawScanPulse } from "@/app/effect-primitives"
import { tokenRgba } from "@/app/visual-tokens"
import {
  canvasPointIsVisible,
  distanceBetweenCanvasPoints,
  worldToCanvasPoint,
} from "@/render/shared/coordinates"
import { drawRestrictedBoundary } from "./boundary-release"
import { clampScalar, easeOutCubic, PHI_INV, TAU } from "./math"
import { drawNavCueLayer, resolveCollectibleNavKind, type NavCueTarget } from "./nav-cues"
import { drawExplorePlayer } from "./player"
import { drawTrail, updateTrail, type TrailState } from "./trail"

function computeSightAlpha(
  pos: { x: number; y: number },
  player: { x: number; y: number },
  visionPx: number,
) {
  // 探索円の内側でアイテムを完全可視。外側はフルマーカーを非表示にし、
  // 代わりに `drawNavCueLayer` が リム・コンパス + 種別色ピンポイント を出す。
  // 以前はここで floor 0.08 を返していたが、「画面内だが範囲外で見えてしまう」
  // 問題を解消するため、探索範囲を出ると完全に 0 へ落とす設計に変更した。
  const d = distanceBetweenCanvasPoints(pos, player)
  if (d <= visionPx * 0.78) return 1
  const outerRadius = visionPx * 1.16
  if (d >= outerRadius) return 0
  const fade = 1 - (d - visionPx * 0.78) / Math.max(1, outerRadius - visionPx * 0.78)
  return fade
}

export function drawExploreScene(
  ctx: CanvasRenderingContext2D,
  input: {
    snapshot: ExploreSnapshot
    renderState: ExploreRenderState
    viewport: Rect
    width: number
    height: number
    padding: number
    playerPoint: { x: number; y: number }
    playerAngle: number
    visionPx: number
    // 0..1: 視界フォグ/円/スキャン/アイテム可視化の総合不透明度。
    // 通常は 1、reboot-settle 中だけ 0 → 1 に立ち上げる。
    visionIntensity: number
    playerOpacity: number
    trailOpacity: number
    timeMs: number
    releaseSequence: {
      progress: number
      focusEdge: "top" | "right" | "bottom" | "left"
      focusAnchor: number
      focusPoint: { x: number; y: number }
    } | null
    shipVariant: ShipVariant
    trailState: TrailState
  },
) {
  const useVisionMask = true
  const visionIntensity = clampScalar(input.visionIntensity, 0, 1)
  const playerOpacity = clampScalar(input.playerOpacity, 0, 1)
  const trailOpacity = clampScalar(input.trailOpacity, 0, 1)

  // ── off-vision nav cue ターゲット収集バッファ ──
  // 画面内だが探索範囲外のアイテム/装備/ミッション/ワープを集め、
  // ループ終盤で drawNavCueLayer に渡して
  //   A: 探索円周上のコンパス弧 / C: 種別色ピンポイント
  // (+ 将来 B: 共鳴パルス) として描画する。
  const offVisionTargets: NavCueTarget[] = []

  // ここはデザイン変更が入りやすい描画レイヤです。
  // ノードの見た目はこの層で差し替え、可視/不可視の判定は session selector を正本にします。
  for (const node of input.renderState.visibleWarps) {
    const point = worldToCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!canvasPointIsVisible(point, input.width, input.height, input.padding, 20)) {
      continue
    }
    const sightAlpha = useVisionMask
      ? computeSightAlpha(point, input.playerPoint, input.visionPx)
      : 1
    // settle 中はセンサー系全体が立ち上がる最中なので、アイテム可視化にも同じ係数を掛ける。
    const alpha = sightAlpha * visionIntensity
    if (alpha <= 0.03) {
      if (visionIntensity > 0.2) {
        offVisionTargets.push({ kind: "warp", point })
      }
      continue
    }
    ctx.globalAlpha = alpha
    drawDiamond(ctx, point, 7, tokenRgba("memory", 1), true)
  }

  ctx.globalAlpha = 1
  drawVisionFog(
    ctx,
    input.width,
    input.height,
    input.playerPoint,
    input.visionPx,
    input.timeMs,
    visionIntensity,
  )
  if (input.renderState.tutorialRestricted || input.releaseSequence) {
    drawRestrictedBoundary(ctx, {
      viewport: input.viewport,
      areaBounds: input.renderState.areaBounds,
      width: input.width,
      height: input.height,
      padding: input.padding,
      timeMs: input.timeMs,
      releaseSequence: input.releaseSequence,
    })
  }
  drawExploreScanPulseLayer(ctx, {
    playerPoint: input.playerPoint,
    viewport: input.viewport,
    width: input.width,
    padding: input.padding,
    elapsedMs: input.renderState.elapsedMs,
    pulses: input.renderState.scanPulses,
    alpha: visionIntensity,
  })
  drawSignalHintLayer(ctx, {
    playerPoint: input.playerPoint,
    visionPx: input.visionPx,
    hints: input.renderState.signalHints,
    alpha: visionIntensity,
  })

  for (const node of input.renderState.visibleCollectibles) {
    const point = worldToCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!canvasPointIsVisible(point, input.width, input.height, input.padding, 24)) {
      continue
    }
    const sightAlpha = useVisionMask
      ? computeSightAlpha(point, input.playerPoint, input.visionPx)
      : 1
    const alpha = sightAlpha * visionIntensity
    if (alpha <= 0.03) {
      if (visionIntensity > 0.2) {
        offVisionTargets.push({ kind: resolveCollectibleNavKind(node.markerKind), point })
      }
      continue
    }
    ctx.globalAlpha = alpha
    drawCollectibleMarker(ctx, {
      x: point.x,
      y: point.y,
      size: node.markerKind === "resource" ? 8 : 10,
      kind: node.markerKind ?? "investigation",
      timeMs: input.timeMs,
    })
  }

  for (const node of input.renderState.visibleTransmissions) {
    const point = worldToCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!canvasPointIsVisible(point, input.width, input.height, input.padding, 24)) {
      continue
    }
    const sightAlpha = useVisionMask
      ? computeSightAlpha(point, input.playerPoint, input.visionPx)
      : 1
    const alpha = sightAlpha * visionIntensity
    if (alpha <= 0.03) {
      if (visionIntensity > 0.2) {
        offVisionTargets.push({ kind: "mission", point })
      }
      continue
    }
    ctx.globalAlpha = alpha
    drawTransmissionMarker(ctx, {
      x: point.x,
      y: point.y,
      size: 13,
      state: node.state ?? "locked",
      timeMs: input.timeMs,
    })
  }

  // アイテム描画後、探索外ターゲットのナビ層を重ねる (フォグの上、プレイヤー/軌跡の下)。
  if (offVisionTargets.length > 0) {
    ctx.save()
    ctx.globalAlpha = visionIntensity
    drawNavCueLayer(ctx, {
      playerPoint: input.playerPoint,
      visionPx: input.visionPx,
      targets: offVisionTargets,
      timeMs: input.timeMs,
    })
    ctx.restore()
  }

  ctx.globalAlpha = 1
  updateTrail(input.trailState, input.renderState.playerPosition.x, input.renderState.playerPosition.y, input.timeMs)
  if (trailOpacity > 0.001) {
    ctx.save()
    ctx.globalAlpha = trailOpacity
    drawTrail(ctx, input.trailState, input.timeMs, input.viewport, input.width, input.height, input.padding)
    ctx.restore()
  }
  if (playerOpacity > 0.001) {
    ctx.save()
    ctx.globalAlpha = playerOpacity
    drawExplorePlayer(
      ctx,
      input.playerPoint.x,
      input.playerPoint.y,
      input.playerAngle,
      input.timeMs,
      input.shipVariant,
    )
    ctx.restore()
  }
  drawVisionScannerOverlay(
    ctx,
    input.playerPoint,
    input.visionPx,
    input.timeMs,
    input.renderState.tutorialRestricted,
    visionIntensity,
  )
}

function drawExploreScanPulseLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    viewport: Rect
    width: number
    padding: number
    elapsedMs: number
    pulses: ExploreRenderState["scanPulses"]
    alpha: number
  },
) {
  if (input.alpha <= 0.001 || input.pulses.length === 0) {
    return
  }
  const worldToPx = (input.width - input.padding * 2) / Math.max(1, input.viewport.width)
  ctx.save()
  for (const pulse of input.pulses) {
    const progress = clampScalar((input.elapsedMs - pulse.startedAtMs) / Math.max(1, pulse.durationMs), 0, 1)
    const radius = pulse.radius * worldToPx * easeOutCubic(progress)
    const fade = (1 - progress) * input.alpha
    if (fade <= 0.01) {
      continue
    }
    drawScanPulse(ctx, {
      origin: input.playerPoint,
      radius,
      progress,
      strength: fade,
      shape: "circle",
      role: "discover",
    })
  }
  ctx.restore()
}

function drawSignalHintLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    hints: ExploreRenderState["signalHints"]
    alpha: number
  },
) {
  if (input.alpha <= 0.001 || input.hints.length === 0) {
    return
  }

  ctx.save()
  for (const hint of input.hints) {
    const color = readSignalHintColor(hint)
    const bandRadius =
      hint.distanceBand === "near"
        ? input.visionPx * 0.78
        : hint.distanceBand === "mid"
          ? input.visionPx * 0.9
          : input.visionPx * 1.02
    const arcHalf = hint.category === "broadcast" ? 0.34 : hint.category === "automated" ? 0.22 : 0.16
    const alpha = input.alpha * (0.18 + hint.strength * 0.58)

    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = hint.kind === "transmission" ? 2 : 1.4
    ctx.beginPath()
    ctx.arc(
      input.playerPoint.x,
      input.playerPoint.y,
      bandRadius,
      hint.bearingRad - arcHalf,
      hint.bearingRad + arcHalf,
    )
    ctx.stroke()

    const markerX = input.playerPoint.x + Math.cos(hint.bearingRad) * bandRadius
    const markerY = input.playerPoint.y + Math.sin(hint.bearingRad) * bandRadius
    ctx.globalAlpha = alpha * 0.7
    if (hint.kind === "equipment" || hint.kind === "repair") {
      ctx.strokeRect(markerX - 3, markerY - 3, 6, 6)
    } else {
      ctx.beginPath()
      ctx.arc(markerX, markerY, 2.5 + hint.confidence * 2.5, 0, TAU)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function readSignalHintColor(
  hint: ExploreRenderState["signalHints"][number],
): string {
  if (hint.kind === "equipment") {
    return tokenRgba("memory", 0.88)
  }
  if (hint.kind === "repair") {
    return tokenRgba("signalBright", 0.82)
  }
  switch (hint.category) {
    case "broadcast":
      return tokenRgba("signalBright", 0.86)
    case "automated":
      return tokenRgba("line", 0.78)
    case "maintenance":
      return tokenRgba("textSecondary", 0.74)
    case "private":
    default:
      return tokenRgba("text", 0.76)
  }
}

/* ============================================================
   VISION FOG — radial gradient + pulse ring
   ============================================================ */
function drawVisionFog(
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
  ctx.fillStyle = tokenRgba("void", 0.42 * intensity)
  ctx.fillRect(0, 0, W, H)

  ctx.globalCompositeOperation = "destination-out"
  const fogGrad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, visibleRadius)
  fogGrad.addColorStop(0, tokenRgba("void", 1))
  fogGrad.addColorStop(0.72, tokenRgba("void", 0.95))
  fogGrad.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = fogGrad
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = "source-over"

  // 視界円は強い輪郭ではなく、センサーの薄い波として見せる。
  const pulse = 0.18 + 0.08 * Math.sin(now * 0.0018)
  ctx.strokeStyle = tokenRgba("signalBright", pulse * intensity)
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
  halo.addColorStop(0, tokenRgba("signal", 0))
  halo.addColorStop(0.5, tokenRgba("signalBright", 0.035 * intensity))
  halo.addColorStop(1, tokenRgba("signal", 0))
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius * 1.18, 0, TAU)
  ctx.fill()

  // secondary faint ring
  ctx.strokeStyle = tokenRgba("signal", pulse * 0.22 * intensity)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(center.x, center.y, visibleRadius * 1.05, 0, TAU)
  ctx.stroke()

  ctx.restore()
}

function drawVisionScannerOverlay(
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

  // 走査演出は HUD の上塗りとして最後に描き、背景やオブジェクトに埋もれないようにします。
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

  gradient.addColorStop(0, tokenRgba("signal", 0))
  gradient.addColorStop(0.04, tokenRgba("signal", restricted ? 0.02 : 0.035))
  gradient.addColorStop(0.1, tokenRgba("signalBright", restricted ? 0.06 : 0.1))
  gradient.addColorStop(coneWidth / TAU, tokenRgba("signal", 0))
  gradient.addColorStop(1, tokenRgba("signal", 0))

  ctx.save()
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, TAU)
  ctx.fill()

  const lineX = center.x + Math.cos(sweepAngle) * radius
  const lineY = center.y + Math.sin(sweepAngle) * radius
  const lineGradient = ctx.createLinearGradient(center.x, center.y, lineX, lineY)
  lineGradient.addColorStop(0, tokenRgba("signalBright", 0))
  lineGradient.addColorStop(0.3, tokenRgba("signalBright", restricted ? 0.08 : 0.16))
  lineGradient.addColorStop(1, tokenRgba("signalBright", 0))
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

    ctx.strokeStyle = tokenRgba("signalBright", alpha)
    ctx.lineWidth = restricted ? 0.8 + (1 - progress) * 0.45 : 1 + (1 - progress) * 0.7
    ctx.beginPath()
    ctx.arc(center.x, center.y, ringRadius, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

function drawDiamondPath(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, r: number) {
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - r)
  ctx.lineTo(pos.x + r * PHI_INV, pos.y)
  ctx.lineTo(pos.x, pos.y + r)
  ctx.lineTo(pos.x - r * PHI_INV, pos.y)
  ctx.closePath()
}

function drawDiamond(
  ctx: CanvasRenderingContext2D, pos: { x: number; y: number },
  r: number, color: string, glow: boolean,
) {
  ctx.save()
  const base = ctx.globalAlpha
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8 }
  ctx.globalAlpha = base * 0.12; ctx.fillStyle = color
  drawDiamondPath(ctx, pos, r); ctx.fill()
  ctx.globalAlpha = base * 0.85; ctx.strokeStyle = color; ctx.lineWidth = 1.5
  drawDiamondPath(ctx, pos, r); ctx.stroke()
  ctx.restore()
}

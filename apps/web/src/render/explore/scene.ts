import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import { drawCollectibleMarker, drawTransmissionMarker } from "@/app/canvas-markers"
import { clampScalar } from "@/render/shared/canvas-math"
import { worldToCanvas } from "@/render/shared/coordinates"
import { drawRestrictedBoundary } from "./release"
import { drawExploreScanPulseLayer, drawSignalHintLayer } from "./signal-layers"
import { drawNavCueLayer, resolveCollectibleNavKind, type NavCueTarget } from "./nav-cue"
import { drawExplorePlayer } from "./player"
import { drawDiamond } from "./primitives"
import { drawTrail, updateTrail, type ExploreTrailState } from "./trail"
import { computeSightAlpha, drawVisionFog, drawVisionScannerOverlay, isCanvasPointVisible } from "./vision"
import type { RuntimeReleaseSequence } from "./types"

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
    trailState: ExploreTrailState
    releaseSequence: {
      progress: number
      focusEdge: "top" | "right" | "bottom" | "left"
      focusAnchor: number
      focusPoint: { x: number; y: number }
    } | null
    reduceFlashing: boolean
    shipVariant: ShipVariant
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
    const point = worldToCanvas(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isCanvasPointVisible(point, input.width, input.height, input.padding, 20)) {
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
    drawDiamond(ctx, point, 7, "#f0c674", true)
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
    reduceFlashing: input.reduceFlashing,
  })
  drawSignalHintLayer(ctx, {
    playerPoint: input.playerPoint,
    visionPx: input.visionPx,
    hints: input.renderState.signalHints,
    alpha: visionIntensity,
    reduceFlashing: input.reduceFlashing,
  })

  for (const node of input.renderState.visibleCollectibles) {
    const point = worldToCanvas(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isCanvasPointVisible(point, input.width, input.height, input.padding, 24)) {
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
    const point = worldToCanvas(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isCanvasPointVisible(point, input.width, input.height, input.padding, 24)) {
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
    input.reduceFlashing,
  )
}

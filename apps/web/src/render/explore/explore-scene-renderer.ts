import { hex } from "@/render/shared/canvas-palette"

import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import type { ExploreChannelPresentationRequest, TimedPresentationRequest } from "@/app/presentation/presentation-state"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import { drawExploreScanPulseLayer } from "@/render/explore/scan-pulse"
import { drawSignalHintLayer } from "@/render/explore/signal-hints"
import {
  drawTrail,
  updateTrail,
  type ExploreTrailState,
} from "@/render/explore/trail"
import { drawVisionFog, drawVisionScannerOverlay } from "@/render/explore/vision"
import { worldToCanvasPoint, isCanvasPointVisible } from "@/render/shared/coordinates"
import { clampScalar } from "@/render/explore/explore-render-utils"
import { drawExplorePlayer } from "@/render/explore/explore-player"
import { drawRestrictedBoundary, type BoundaryReleaseSequence } from "@/render/explore/restricted-boundary"
import { drawNavCueLayer, resolveCollectibleNavKind, type NavCueTarget } from "@/render/explore/nav-cue"
import { drawScanCooldownMeter, type ScanCooldownMeterState } from "@/render/explore/scan-cooldown-meter"

function toCanvasPoint(bounds: Rect, width: number, height: number, padding: number, wx: number, wy: number) {
  return worldToCanvasPoint({
    bounds,
    size: { width, height },
    padding,
    worldPosition: { x: wx, y: wy },
  })
}

function isPointVisible(
  point: { x: number; y: number },
  width: number,
  height: number,
  padding: number,
  margin: number,
) {
  return isCanvasPointVisible({
    point,
    size: { width, height },
    padding,
    margin,
  })
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

const NAV_CUE_TARGET_LIMIT = 8
const LOW_FRAME_RATE_NAV_CUE_TARGET_LIMIT = 5

function selectNavCueTargets(
  targets: NavCueTarget[],
  playerPoint: { x: number; y: number },
  lowFrameRateMode: boolean,
): NavCueTarget[] {
  const limit = lowFrameRateMode ? LOW_FRAME_RATE_NAV_CUE_TARGET_LIMIT : NAV_CUE_TARGET_LIMIT
  if (targets.length <= limit) {
    return targets
  }

  // 画面に複数候補が入る場合は、操作判断に使いやすい近い対象を優先します。
  return targets
    .map((target) => ({ target, distance: dist(target.point, playerPoint) }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map((entry) => entry.target)
}

function computeSightAlpha(
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

export function readExploreTrailEventBoost(
  events: TimedPresentationRequest<ExploreChannelPresentationRequest>[],
  now: number,
): number {
  // session 由来の trail event は寿命だけを表示側で読む。移動可否や発生条件は session 側を正本にします。
  return events.reduce((maxBoost, event) => {
    if (event.request.cueId !== "explore.player.trail") {
      return maxBoost
    }
    const lifetimeMs = Math.max(1, event.request.lifetimeMs)
    const progress = clampScalar((now - event.startedAtMs) / lifetimeMs, 0, 1)
    return Math.max(maxBoost, 1 - progress)
  }, 0)
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
    releaseSequence: BoundaryReleaseSequence | null
    shipVariant: ShipVariant
    trailState: ExploreTrailState
    trailEventBoost: number
    scanMeterState: ScanCooldownMeterState
    reduceFlashing: boolean
    lowFrameRateMode: boolean
  },
) {
  const useVisionMask = true
  const visionIntensity = clampScalar(input.visionIntensity, 0, 1)
  const playerOpacity = clampScalar(input.playerOpacity, 0, 1)
  const trailOpacity = clampScalar(input.trailOpacity * (1 + input.trailEventBoost * 0.25), 0, 1)

  // ── off-vision nav cue ターゲット収集バッファ ──
  // 画面内だが探索範囲外のアイテム/装備/ミッション/ワープを集め、
  // ループ終盤で drawNavCueLayer に渡して
  //   A: 探索円周上のコンパス弧 / C: 種別色ピンポイント
  // (+ 将来 B: 共鳴パルス) として描画する。
  const offVisionTargets: NavCueTarget[] = []

  // ここはデザイン変更が入りやすい描画レイヤです。
  // ノードの見た目はこの層で差し替え、可視/不可視の判定は session selector を正本にします。
  for (const node of input.renderState.visibleWarps) {
    const point = toCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isPointVisible(point, input.width, input.height, input.padding, 20)) {
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
    drawDiamond(ctx, point, 7, hex("residualWarmth"), true)
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
    lowFrameRateMode: input.lowFrameRateMode,
  })
  drawSignalHintLayer(ctx, {
    playerPoint: input.playerPoint,
    visionPx: input.visionPx,
    hints: input.renderState.signalHints,
    alpha: visionIntensity,
    reduceFlashing: input.reduceFlashing,
    lowFrameRateMode: input.lowFrameRateMode,
  })

  for (const node of input.renderState.visibleCollectibles) {
    const point = toCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isPointVisible(point, input.width, input.height, input.padding, 24)) {
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
      lowFrameRateMode: input.lowFrameRateMode,
    })
  }

  for (const node of input.renderState.visibleTransmissions) {
    const point = toCanvasPoint(input.viewport, input.width, input.height, input.padding, node.x, node.y)
    if (!isPointVisible(point, input.width, input.height, input.padding, 24)) {
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
      lowFrameRateMode: input.lowFrameRateMode,
    })
  }

  // アイテム描画後、探索外ターゲットのナビ層を重ねる (フォグの上、プレイヤー/軌跡の下)。
  const navCueTargets = selectNavCueTargets(
    offVisionTargets,
    input.playerPoint,
    input.lowFrameRateMode,
  )
  if (navCueTargets.length > 0) {
    ctx.save()
    ctx.globalAlpha = visionIntensity
    drawNavCueLayer(ctx, {
      playerPoint: input.playerPoint,
      visionPx: input.visionPx,
      targets: navCueTargets,
      timeMs: input.timeMs,
    })
    ctx.restore()
  }

  ctx.globalAlpha = 1
  updateTrail(
    input.trailState,
    input.renderState.playerPosition.x,
    input.renderState.playerPosition.y,
    input.timeMs,
    input.lowFrameRateMode,
  )
  if (trailOpacity > 0.001) {
    ctx.save()
    ctx.globalAlpha = trailOpacity
    drawTrail(
      ctx,
      input.trailState,
      input.timeMs,
      input.viewport,
      input.width,
      input.height,
      input.padding,
      input.lowFrameRateMode,
    )
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
  drawScanCooldownMeter(ctx, {
    state: input.scanMeterState,
    playerPoint: input.playerPoint,
    ratio: input.renderState.scanCooldownRatio,
    alpha: visionIntensity * playerOpacity,
    timeMs: input.timeMs,
    reduceFlashing: input.reduceFlashing,
    lowFrameRateMode: input.lowFrameRateMode,
  })
  drawVisionScannerOverlay(
    ctx,
    input.playerPoint,
    input.visionPx,
    input.timeMs,
    input.renderState.tutorialRestricted,
    visionIntensity,
  )
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

function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - r)
  ctx.lineTo(pos.x + r, pos.y)
  ctx.lineTo(pos.x, pos.y + r)
  ctx.lineTo(pos.x - r, pos.y)
  ctx.closePath()
}

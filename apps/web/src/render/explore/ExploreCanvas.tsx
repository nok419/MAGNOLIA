import { useEffect, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { DEFAULT_EXPLORE_VIEWPORT_HEIGHT } from "@magnolia/contracts"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState } from "@magnolia/game-session"
import type { Rect } from "@magnolia/game-session"
import {
  REBOOT_SETTLE_BLACKOUT_RATIO,
  type ExplorePresentationState,
} from "@/app/explore-presentation"
import type {
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import type { DisplayOptions } from "@/app/display-options"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
  type CollectibleMarkerKind,
} from "@/app/canvas-markers"
import { computeHullMetrics, drawShip } from "@/app/ship-renderer"
import { drawBackground, drawFogGrid } from "@/render/explore/background"
import {
  pickNearestBoundaryEdge,
  readBoundaryFocus,
  readRebootViewportHeight,
  readReleaseViewportHeight,
  resolveCameraViewport,
  type CameraState,
} from "@/render/explore/camera"
import { drawExploreScanPulseLayer } from "@/render/explore/scan-pulse"
import { drawSignalHintLayer } from "@/render/explore/signal-hints"
import {
  createExploreTrailState,
  drawTrail,
  updateTrail,
  type ExploreTrailState,
} from "@/render/explore/trail"
import { drawVisionFog, drawVisionScannerOverlay } from "@/render/explore/vision"

type ExploreCanvasProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  exploreEvents?: TimedPresentationRequest<ExploreChannelPresentationRequest>[]
  /** 自機見た目バリアント。詳細は `apps/web/src/app/ship-renderer.ts` を参照。 */
  shipVariant: ShipVariant
  onOverlayFrame?: (frame: ExploreOverlayFrame) => void
  displayOptions: DisplayOptions
}

export type ExploreOverlayFrame = {
  viewport: Rect
  width: number
  height: number
  padding: number
  playerPoint: { x: number; y: number }
  visionPx: number
}

const PHI = 1.618033988749895
const PHI_INV = 1 / PHI
const TAU = Math.PI * 2
const DEFAULT_VIEWPORT_HEIGHT = DEFAULT_EXPLORE_VIEWPORT_HEIGHT
const REBOOT_CORE_START = 0.03
const REBOOT_GATHER_START = 0.08
const REBOOT_GATHER_DURATION = 0.28
const REBOOT_CONSTRUCT_START = 0.18
const REBOOT_CONSTRUCT_DURATION = 0.58
const REBOOT_IGNITION_START = 0.76
const REBOOT_IGNITION_DURATION = 0.1
const REBOOT_REVEAL_START = 0.88

type RebootSequenceState = {
  requestId: string
  startedAtMs: number
}
type RebootSettleState = {
  requestId: string
  startedAtMs: number
}
type ReleaseSequenceState = {
  requestId: string
  startedAtMs: number
  focusEdge: "top" | "right" | "bottom" | "left"
  focusPoint: { x: number; y: number }
  focusAnchor: number
}

export function ExploreCanvas({
  snapshot,
  renderState,
  presentation,
  exploreEvents = [],
  shipVariant,
  onOverlayFrame,
  displayOptions,
}: ExploreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const cameraRef = useRef<CameraState | null>(null)
  const trailStateRef = useRef(createExploreTrailState())
  const rebootSequenceRef = useRef<RebootSequenceState | null>(null)
  const rebootSettleRef = useRef<RebootSettleState | null>(null)
  const releaseSequenceRef = useRef<ReleaseSequenceState | null>(null)
  // reboot/release 演出中は renderState の参照が更新されないフレームが発生し、
  // キャンバスが静止してしまうため、演出中だけ rAF で強制リフレッシュする。
  // animTick は useEffect の dep に入って再描画を誘発する。
  const [animTick, setAnimTick] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        sizeRef.current.w = entry.contentRect.width
        sizeRef.current.h = entry.contentRect.height
      }
    })
    ro.observe(canvas.parentElement ?? canvas)
    return () => ro.disconnect()
  }, [])

  // 演出中は rAF で毎フレーム tick を更新、終了後は停止して無駄な再描画を回避する。
  useEffect(() => {
    if (presentation.kind === "none") return
    let rafId = 0
    const tick = () => {
      setAnimTick((t) => (t + 1) & 0xffff)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [presentation.kind, presentation.kind === "none" ? "" : presentation.requestId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const W = sizeRef.current.w || window.innerWidth
    const H = sizeRef.current.h || window.innerHeight
    const dpr = displayOptions.canvasPixelRatio
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const PADDING = 12
    const now = performance.now()
    const trailEventBoost = readExploreTrailEventBoost(exploreEvents, now)
    const rebootSequenceRequestId =
      presentation.kind === "reboot" ? presentation.requestId : undefined
    const rebootSequenceDurationMs =
      presentation.kind === "reboot" ? presentation.durationMs : undefined
    const rebootSettleRequestId =
      presentation.kind === "reboot-settle" ? presentation.requestId : undefined
    const rebootSettleDurationMs =
      presentation.kind === "reboot-settle" ? presentation.durationMs : undefined
    const releaseSequenceRequestId =
      presentation.kind === "release" ? presentation.requestId : undefined
    const releaseSequenceDurationMs =
      presentation.kind === "release" ? presentation.durationMs : undefined
    const rebootSequence = readRebootSequence({
      rebootSequenceRef,
      requestId: rebootSequenceRequestId,
      durationMs: rebootSequenceDurationMs ?? 4800,
      now,
    })
    const rebootSettle = readRebootSettle({
      rebootSettleRef,
      requestId: rebootSettleRequestId,
      durationMs: rebootSettleDurationMs ?? 1600,
      now,
    })
    const releaseSequence = readReleaseSequence({
      releaseSequenceRef,
      requestId: releaseSequenceRequestId,
      durationMs: releaseSequenceDurationMs ?? 1200,
      now,
      renderState,
    })
    const rebootSettlePhase = rebootSettle
      ? readRebootSettlePhase(rebootSettle.progress)
      : null
    const visionIntensity = rebootSettlePhase
      ? rebootSettlePhase.worldRevealProgress
      : 1
    const viewportHeight = rebootSequence
      ? readRebootViewportHeight(DEFAULT_VIEWPORT_HEIGHT, rebootSequence.progress)
      : releaseSequence
        ? readReleaseViewportHeight(DEFAULT_VIEWPORT_HEIGHT, releaseSequence.progress)
        : DEFAULT_VIEWPORT_HEIGHT
    const drawableWidth = Math.max(1, W - PADDING * 2)
    const drawableHeight = Math.max(1, H - PADDING * 2)
    // 1 枚の大きな world map を前提に、画面には camera viewport だけを出します。
    // player を完全固定せず少し遅れて追従させることで、画面外へ地続きで続く感覚を保ちます。
    const viewport = resolveCameraViewport({
      cameraRef,
      worldBounds: renderState.worldBounds,
      playerPosition: renderState.playerPosition,
      viewportHeight,
      aspectRatio: Math.max(1, drawableWidth / drawableHeight),
      rebootSequence,
      releaseSequence,
    })

    const pp = worldToCanvas(viewport, W, H, PADDING, renderState.playerPosition.x, renderState.playerPosition.y)
    const visionPx = Math.max(0.5, (renderState.visionRadius / Math.max(1, viewport.width)) * drawableWidth)
    const angle = Math.atan2(renderState.playerFacing.y, renderState.playerFacing.x) + Math.PI / 2

    // DOM 側の誘導表示は、canvas と同じ座標変換結果を使うことで自機やアイコンへ正確に追従します。
    onOverlayFrame?.({
      viewport,
      width: W,
      height: H,
      padding: PADDING,
      playerPoint: pp,
      visionPx,
    })

    if (rebootSequence) {
      drawRebootBackdrop(ctx, W, H, now, pp, rebootSequence.progress)
      drawRebootSequence(ctx, {
        width: W,
        height: H,
        playerPoint: pp,
        playerAngle: angle,
        visionPx,
        timeMs: now,
        progress: rebootSequence.progress,
        shipVariant,
      })
    } else if (rebootSettlePhase) {
      drawRebootBlackoutBackdrop(ctx, W, H, now, pp)
      drawRebootSettleBridge(ctx, pp, now, rebootSettle?.progress ?? 0)
      ctx.save()
      ctx.globalAlpha = rebootSettlePhase.bridgeShipAlpha
      drawExplorePlayer(ctx, pp.x, pp.y, angle, now, shipVariant)
      ctx.restore()

      if (rebootSettlePhase.worldRevealProgress > 0.001) {
        ctx.save()
        ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
        drawBackground(ctx, W, H, now, viewport)
        ctx.restore()

        ctx.save()
        ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
        drawFogGrid(ctx, W, H, PADDING, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
        ctx.restore()

        drawExploreScene(ctx, {
          snapshot,
          renderState,
          viewport,
          width: W,
          height: H,
          padding: PADDING,
          playerPoint: pp,
          playerAngle: angle,
          visionPx,
          visionIntensity,
          playerOpacity: rebootSettlePhase.worldRevealProgress,
          trailOpacity: rebootSettlePhase.worldRevealProgress,
          timeMs: now,
          releaseSequence,
          shipVariant,
          trailState: trailStateRef.current,
          trailEventBoost,
        })
      }
    } else {
      drawBackground(ctx, W, H, now, viewport)
      drawFogGrid(ctx, W, H, PADDING, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
      drawExploreScene(ctx, {
        snapshot,
        renderState,
        viewport,
        width: W,
        height: H,
        padding: PADDING,
        playerPoint: pp,
        playerAngle: angle,
        visionPx,
        visionIntensity,
        playerOpacity: 1,
        trailOpacity: 1,
        timeMs: now,
        releaseSequence,
        shipVariant,
        trailState: trailStateRef.current,
        trailEventBoost,
      })
    }
  }, [
    renderState,
    snapshot,
    presentation,
    shipVariant,
    onOverlayFrame,
    displayOptions,
    animTick,
    exploreEvents,
  ])

  return <canvas ref={canvasRef} className="explore-canvas-full" />
}

/* ============================================================
   COORDINATE TRANSFORM
   ============================================================ */
function worldToCanvas(bounds: Rect, W: number, H: number, pad: number, wx: number, wy: number) {
  const rx = (wx - bounds.x) / Math.max(1, bounds.width)
  const ry = (wy - bounds.y) / Math.max(1, bounds.height)
  return { x: pad + rx * (W - pad * 2), y: pad + ry * (H - pad * 2) }
}

function isCanvasPointVisible(
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

function readExploreTrailEventBoost(
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

function readRebootSequence(input: {
  rebootSequenceRef: MutableRefObject<RebootSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSequenceRef.current = null
    return null
  }

  if (input.rebootSequenceRef.current?.requestId !== input.requestId) {
    input.rebootSequenceRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSequenceRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(
        1,
        // reboot movie の進行は cue 全体の duration と一致させます。
        // 途中で通常画面に見えてしまう問題を避けるため、視覚演出だけを前倒しで
        // 完了させる処理は入れません。
        (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs),
      ),
    ),
  }
}

function readRebootSettle(input: {
  rebootSettleRef: MutableRefObject<RebootSettleState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSettleRef.current = null
    return null
  }

  if (input.rebootSettleRef.current?.requestId !== input.requestId) {
    input.rebootSettleRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSettleRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(1, (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs)),
    ),
  }
}

function readReleaseSequence(input: {
  releaseSequenceRef: MutableRefObject<ReleaseSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
  renderState: ExploreRenderState
}): {
  progress: number
  focusEdge: ReleaseSequenceState["focusEdge"]
  focusPoint: { x: number; y: number }
  focusAnchor: number
  durationMs: number
} | null {
  if (!input.requestId) {
    input.releaseSequenceRef.current = null
    return null
  }

  if (input.releaseSequenceRef.current?.requestId !== input.requestId) {
    const focusEdge = pickNearestBoundaryEdge(
      input.renderState.playerPosition,
      input.renderState.areaBounds,
    )
    const boundaryFocus = readBoundaryFocus(
      input.renderState.areaBounds,
      focusEdge,
      input.renderState.playerPosition,
    )
    input.releaseSequenceRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
      focusEdge,
      focusPoint: boundaryFocus.point,
      focusAnchor: boundaryFocus.anchor,
    }
  }

  const sequence = input.releaseSequenceRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(0, Math.min(1, (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs))),
    focusEdge: sequence.focusEdge,
    focusPoint: sequence.focusPoint,
    focusAnchor: sequence.focusAnchor,
    durationMs: input.durationMs,
  }
}

function readRebootSettlePhase(progress: number) {
  if (progress <= REBOOT_SETTLE_BLACKOUT_RATIO) {
    return {
      worldRevealProgress: 0,
      bridgeShipAlpha: 1,
    }
  }

  const revealProgress = easeInOutSine(
    (progress - REBOOT_SETTLE_BLACKOUT_RATIO) /
      Math.max(0.001, 1 - REBOOT_SETTLE_BLACKOUT_RATIO),
  )

  return {
    worldRevealProgress: revealProgress,
    bridgeShipAlpha: 1 - easeInOutSine(revealProgress),
  }
}

function drawExploreScene(
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
    trailState: ExploreTrailState
    trailEventBoost: number
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
  })
  drawSignalHintLayer(ctx, {
    playerPoint: input.playerPoint,
    visionPx: input.visionPx,
    hints: input.renderState.signalHints,
    alpha: visionIntensity,
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
  )
}

/**
 * リブート演出のタイムライン:
 *   0.00 - 0.03  silent prep        (何もなかった空間)
 *   0.03 - 0.16  core seed          中央に起動核だけが発生する
 *   0.08 - 0.36  gather phase       周辺から粒子とリングが収束する
 *   0.18 - 0.76  construct phase    機体の線、面、コアが段階的に復元される
 *   0.76 - 0.86  ignition pulse     機体が点火して安定化する
 *   0.86 - 0.88  final hold         完成した機体を暗い画面内で見せる
 *   0.88 - 1.00  reveal phase       通常探索への受け渡し直前に視界を開く
 *
 * フェーズ境界で短い "phase transition pulse" を挿入することで、
 * 「システムが段階的に立ち上がる」テンポを明示する。
 */
function drawRebootSequence(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    playerPoint: { x: number; y: number }
    playerAngle: number
    visionPx: number
    timeMs: number
    progress: number
    shipVariant: ShipVariant
  },
) {
  const gatherProgress = clampScalar(
    (input.progress - REBOOT_GATHER_START) / REBOOT_GATHER_DURATION,
    0,
    1,
  )
  const constructProgress = clampScalar(
    (input.progress - REBOOT_CONSTRUCT_START) / REBOOT_CONSTRUCT_DURATION,
    0,
    1,
  )
  const ignitionProgress = clampScalar(
    (input.progress - REBOOT_IGNITION_START) / REBOOT_IGNITION_DURATION,
    0,
    1,
  )
  const revealProgress = clampScalar(
    (input.progress - REBOOT_REVEAL_START) / Math.max(0.001, 1 - REBOOT_REVEAL_START),
    0,
    1,
  )
  const coreProgress = clampScalar((input.progress - REBOOT_CORE_START) / 0.13, 0, 1)

  // 背景のアンビエント深化: reboot 中は画面全体にごく淡い青のラジアルグロー
  drawRebootAmbient(ctx, input.width, input.height, input.playerPoint, input.progress)
  drawRebootCoreSeed(ctx, input.playerPoint, input.timeMs, coreProgress)

  // フェーズ境界のパルス。開始、構築、点火、探索受け渡しの節目を短く光らせます。
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_GATHER_START, 0.06, 34, 0.46)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_CONSTRUCT_START, 0.07, 66, 0.68)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_IGNITION_START, 0.08, 120, 0.74)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_REVEAL_START, 0.08, 180, 0.46)

  if (gatherProgress > 0.001) {
    drawRebootAssemblyAperture(ctx, input.playerPoint, input.timeMs, gatherProgress, constructProgress)
    drawRebootField(ctx, input.playerPoint, input.timeMs, gatherProgress)
  }

  if (constructProgress > 0.001) {
    // サイズの「settle (着地)」: 演出用の K=2.6 から探索時の K=1.0 まで
    // ignition 開始 (0.84) → reveal 開始 (0.94) の 10% 窓で滑らかに縮めます。
    // reveal に入る瞬間には構築 wireframe が drawExplorePlayer (scale=0.7) と
    // 同サイズで重なっているため、その後の重ね合わせでサイズ段差なしに繋がります。
    const settleProgress = clampScalar(
      (input.progress - REBOOT_IGNITION_START) /
        Math.max(0.001, REBOOT_REVEAL_START - REBOOT_IGNITION_START),
      0,
      1,
    )
    const constructScale = lerpScalar(2.6, 1.0, easeInOutSine(settleProgress))

    // reveal に入ったら完全にフェードアウト (窓幅 0.06 = reveal 全域で ゼロまで)。
    // これがないと、wireframe と本体 ship が重なったまま残る。
    const constructFadeOut =
      input.progress < REBOOT_REVEAL_START
        ? 1
        : Math.max(0, 1 - (input.progress - REBOOT_REVEAL_START) / 0.06)
    if (constructFadeOut > 0.005) {
      ctx.save()
      ctx.globalAlpha = constructFadeOut
      drawRebootConstruction(ctx, {
        center: input.playerPoint,
        angle: input.playerAngle,
        timeMs: input.timeMs,
        progress: constructProgress,
        scale: constructScale,
        shipVariant: input.shipVariant,
      })
      ctx.restore()
    }
  }

  // ── 点火パルス: 構築完了から final hold / reveal への橋渡し ──
  //   中央から外へ広がる強いショックウェーブ。画面全体が一瞬明るくなる。
  if (ignitionProgress > 0.001) {
    drawRebootIgnition(ctx, input.playerPoint, ignitionProgress)
  }

  if (constructProgress > 0.001) {
    drawRebootFinalHold(ctx, {
      width: input.width,
      height: input.height,
      center: input.playerPoint,
      progress: input.progress,
    })
  }

  if (revealProgress > 0.001) {
    // 構築 wireframe は reveal 開始時点で既に K=1.0 (探索と同サイズ) に settle 済み。
    // ここから探索用の機体を重ねるだけで「機体がそのままの形で安定する」印象になります。
    ctx.save()
    ctx.globalAlpha = easeOutCubic(revealProgress)
    drawExplorePlayer(
      ctx,
      input.playerPoint.x,
      input.playerPoint.y,
      input.playerAngle,
      input.timeMs,
      input.shipVariant,
    )
    ctx.restore()

    drawRebootCompletionHalo(ctx, {
      width: input.width,
      height: input.height,
      center: input.playerPoint,
      angle: input.playerAngle,
      progress: revealProgress,
      timeMs: input.timeMs,
    })
  }
}

function drawRebootBlackoutBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  center: { x: number; y: number },
) {
  ctx.save()
  ctx.fillStyle = "#010204"
  ctx.fillRect(0, 0, width, height)

  const pulse = 0.04 + (0.5 + 0.5 * Math.sin(timeMs * 0.00042)) * 0.03
  const grad = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    Math.max(width, height) * 0.42,
  )
  grad.addColorStop(0, `rgba(150, 220, 255, ${pulse.toFixed(3)})`)
  grad.addColorStop(0.32, `rgba(36, 76, 124, ${(pulse * 0.46).toFixed(3)})`)
  grad.addColorStop(1, "rgba(1, 2, 4, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawRebootSettleBridge(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  const early = 1 - easeOutCubic(clampScalar(progress / REBOOT_SETTLE_BLACKOUT_RATIO, 0, 1))
  const reveal = easeOutCubic(
    clampScalar(
      (progress - REBOOT_SETTLE_BLACKOUT_RATIO) /
        Math.max(0.001, 1 - REBOOT_SETTLE_BLACKOUT_RATIO),
      0,
      1,
    ),
  )
  const bridgeAlpha = clampScalar(early * 0.8 + (1 - reveal) * 0.22, 0, 1)
  if (bridgeAlpha <= 0.01) {
    return
  }

  ctx.save()
  ctx.globalAlpha = bridgeAlpha
  ctx.strokeStyle = "rgba(150, 220, 255, 0.38)"
  ctx.lineWidth = 1.1
  ctx.shadowColor = "rgba(93, 164, 209, 0.42)"
  ctx.shadowBlur = 16
  const baseRadius = 22 + Math.sin(timeMs * 0.002) * 1.4
  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const radius = baseRadius + ringIndex * 16 + reveal * 52
    const start = timeMs * 0.0007 * (ringIndex % 2 === 0 ? 1 : -1) + ringIndex * 0.7
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start, start + TAU * (0.34 + ringIndex * 0.08))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start + Math.PI, start + Math.PI + TAU * 0.18)
    ctx.stroke()
  }

  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.22 * bridgeAlpha).toFixed(3)})`
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(center.x - 44, center.y)
  ctx.lineTo(center.x - 18, center.y)
  ctx.moveTo(center.x + 18, center.y)
  ctx.lineTo(center.x + 44, center.y)
  ctx.moveTo(center.x, center.y - 44)
  ctx.lineTo(center.x, center.y - 18)
  ctx.moveTo(center.x, center.y + 18)
  ctx.lineTo(center.x, center.y + 44)
  ctx.stroke()

  const activationProgress = clampScalar((progress - 0.78) / 0.18, 0, 1)
  if (activationProgress > 0.001) {
    const wave = easeOutCubic(activationProgress)
    ctx.save()
    ctx.globalAlpha = (1 - wave) * 0.62
    ctx.strokeStyle = "rgba(190, 238, 255, 0.58)"
    ctx.lineWidth = 1.4
    ctx.shadowColor = "rgba(120, 210, 255, 0.62)"
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(center.x, center.y, 28 + wave * 260, 0, TAU)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = Math.sin(Math.PI * activationProgress) * 0.45
    const shipGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 92)
    shipGlow.addColorStop(0, "rgba(220, 248, 255, 0.32)")
    shipGlow.addColorStop(0.35, "rgba(93, 164, 209, 0.12)")
    shipGlow.addColorStop(1, "rgba(93, 164, 209, 0)")
    ctx.fillStyle = shipGlow
    ctx.beginPath()
    ctx.arc(center.x, center.y, 92, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

function drawRebootBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  center: { x: number; y: number },
  progress: number,
  opacity: number = 1,
) {
  const breathe = 0.5 + 0.5 * Math.sin(timeMs * 0.00024)
  const awake = easeOutCubic(clampScalar((progress - REBOOT_CORE_START) / 0.18, 0, 1))
  const radialAlpha = (0.1 + progress * 0.07 + breathe * 0.02) * awake
  if (opacity <= 0.001) {
    return
  }
  ctx.save()
  ctx.globalAlpha = opacity
  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, "#050912")
  base.addColorStop(0.58, "#03060d")
  base.addColorStop(1, "#010204")
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  const radial = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    Math.max(width, height) * 0.72,
  )
  radial.addColorStop(0, `rgba(93, 164, 209, ${radialAlpha.toFixed(3)})`)
  radial.addColorStop(0.4, `rgba(36, 76, 124, ${(radialAlpha * 0.45).toFixed(3)})`)
  radial.addColorStop(1, "rgba(1, 2, 4, 0)")
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = `rgba(93, 164, 209, ${((0.024 + progress * 0.018) * awake).toFixed(3)})`
  ctx.lineWidth = 1
  const ringCount = 4
  for (let index = 0; index < ringCount; index += 1) {
    const ringProgress = (index + 1) / ringCount
    const radius = 90 + ringProgress * Math.max(width, height) * 0.22 + Math.sin(timeMs * 0.00035 + index) * 6
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

/** 全体を覆う淡い青のラジアルグロー。reboot 中の「空間の息遣い」を背景に足す。 */
function drawRebootAmbient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  overallProgress: number,
) {
  // construct 末期まで徐々に明るくなり、reveal 開始直前から退いていきます。
  const intensity = overallProgress < REBOOT_IGNITION_START
    ? overallProgress / REBOOT_IGNITION_START
    : 1 - (overallProgress - REBOOT_IGNITION_START) / Math.max(0.001, 1 - REBOOT_IGNITION_START)
  const alpha = 0.08 * clampScalar(intensity, 0, 1)
  if (alpha < 0.004) return

  ctx.save()
  const maxR = Math.max(width, height) * 0.8
  const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, maxR)
  grad.addColorStop(0, `rgba(120, 190, 255, ${(alpha * 1.4).toFixed(3)})`)
  grad.addColorStop(0.35, `rgba(93, 164, 209, ${alpha.toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawRebootCoreSeed(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  if (progress <= 0.001) {
    return
  }

  const eased = easeOutCubic(progress)
  const breath = 0.72 + Math.sin(timeMs * 0.006) * 0.18
  const coreRadius = lerpScalar(1.8, 8.5, eased)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  const halo = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 96)
  halo.addColorStop(0, `rgba(232, 247, 255, ${(0.28 * eased * breath).toFixed(3)})`)
  halo.addColorStop(0.34, `rgba(93, 164, 209, ${(0.18 * eased).toFixed(3)})`)
  halo.addColorStop(1, "rgba(1, 2, 4, 0)")
  ctx.fillStyle = halo
  ctx.fillRect(center.x - 100, center.y - 100, 200, 200)

  ctx.fillStyle = `rgba(238, 249, 255, ${(0.72 * eased).toFixed(3)})`
  ctx.shadowColor = "rgba(150, 220, 255, 0.9)"
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(center.x, center.y, coreRadius, 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 12
  ctx.strokeStyle = `rgba(150, 220, 255, ${(0.36 * eased).toFixed(3)})`
  ctx.lineWidth = 1
  for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
    const radius = coreRadius + 14 + ringIndex * 13 + Math.sin(timeMs * 0.002 + ringIndex) * 1.2
    const start = timeMs * 0.0011 * (ringIndex % 2 === 0 ? 1 : -1)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start, start + TAU * (0.24 + ringIndex * 0.12))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start + Math.PI, start + Math.PI + TAU * 0.16)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootAssemblyAperture(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  gatherProgress: number,
  constructProgress: number,
) {
  const gather = easeOutCubic(gatherProgress)
  const construct = easeOutCubic(constructProgress)
  const alpha = clampScalar(gather * (1 - construct * 0.38), 0, 1)
  if (alpha <= 0.01) {
    return
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = "rgba(120, 200, 255, 0.36)"
  ctx.lineWidth = 1
  ctx.shadowColor = "rgba(93, 164, 209, 0.42)"
  ctx.shadowBlur = 12

  for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
    const radius = lerpScalar(172 - ringIndex * 12, 42 + ringIndex * 8, gather)
    const spin = timeMs * (0.00036 + ringIndex * 0.00008) * (ringIndex % 2 === 0 ? 1 : -1)
    const arcLength = TAU * (0.12 + ringIndex * 0.025)
    for (let segment = 0; segment < 3; segment += 1) {
      const start = spin + segment * (TAU / 3) + ringIndex * 0.28
      ctx.beginPath()
      ctx.arc(center.x, center.y, radius, start, start + arcLength)
      ctx.stroke()
    }
  }

  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.18 * alpha).toFixed(3)})`
  ctx.lineWidth = 0.8
  for (let axis = 0; axis < 4; axis += 1) {
    const angle = axis * (Math.PI / 2) + timeMs * 0.00018
    const inner = lerpScalar(86, 22, gather)
    const outer = lerpScalar(210, 56, gather)
    ctx.beginPath()
    ctx.moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner)
    ctx.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootFinalHold(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    center: { x: number; y: number }
    progress: number
  },
) {
  const holdStart = 0.9
  const holdEnd = REBOOT_REVEAL_START
  const holdProgress = clampScalar(
    (input.progress - holdStart) / Math.max(0.001, holdEnd - holdStart),
    0,
    1,
  )
  if (holdProgress <= 0.001) {
    return
  }

  const alpha = 0.12 * (1 - holdProgress)
  ctx.save()
  const grad = ctx.createRadialGradient(
    input.center.x,
    input.center.y,
    20,
    input.center.x,
    input.center.y,
    Math.max(input.width, input.height) * 0.44,
  )
  grad.addColorStop(0, `rgba(220, 238, 255, ${(alpha * 0.8).toFixed(3)})`)
  grad.addColorStop(0.42, `rgba(93, 164, 209, ${alpha.toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, input.width, input.height)
  ctx.restore()
}

function drawRebootCompletionHalo(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    center: { x: number; y: number }
    angle: number
    progress: number
    timeMs: number
  },
) {
  const reveal = easeOutCubic(input.progress)
  const radius = lerpScalar(22, 58, reveal)
  const pulse = 0.86 + Math.sin(input.timeMs * 0.0022) * 0.14

  ctx.save()
  const hull = computeHullMetrics(0.72)
  ctx.translate(input.center.x, input.center.y)
  ctx.rotate(input.angle)
  ctx.strokeStyle = `rgba(228, 241, 255, ${(0.34 + reveal * 0.2).toFixed(3)})`
  ctx.lineWidth = 1.2
  ctx.shadowColor = `rgba(214, 236, 255, ${(0.24 + reveal * 0.18).toFixed(3)})`
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(0, hull.tipY * 0.92)
  ctx.lineTo(hull.bodyW * 0.66, hull.baseY * 0.24)
  ctx.lineTo(0, hull.baseY * 0.7)
  ctx.lineTo(-hull.bodyW * 0.66, hull.baseY * 0.24)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  ctx.save()
  const grad = ctx.createRadialGradient(
    input.center.x,
    input.center.y,
    radius * 0.22,
    input.center.x,
    input.center.y,
    radius * 1.38,
  )
  grad.addColorStop(0, `rgba(240, 248, 255, ${(0.14 * input.progress * pulse).toFixed(3)})`)
  grad.addColorStop(0.42, `rgba(93, 164, 209, ${(0.12 * input.progress).toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, input.width, input.height)

  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.34 * input.progress).toFixed(3)})`
  ctx.lineWidth = 1.6
  ctx.shadowColor = `rgba(214, 236, 255, ${(0.24 * input.progress).toFixed(3)})`
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, radius, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 * reveal).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, radius * 0.7, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** フェーズ境界パルス: 指定 threshold の直後に短い拡散リングが一度走る。 */
function drawRebootPhasePulse(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  progress: number,
  threshold: number,
  window: number,
  maxRadius: number,
  strength: number,
) {
  const localProgress = (progress - threshold) / window
  if (localProgress < 0 || localProgress > 1) return
  // 前半で拡散・減衰
  const ease = 1 - Math.pow(1 - localProgress, 2.5)
  const radius = maxRadius * ease
  const alpha = (1 - localProgress) * strength * 0.6

  ctx.save()
  ctx.strokeStyle = `rgba(140, 210, 255, ${alpha.toFixed(3)})`
  ctx.lineWidth = 1 + (1 - localProgress) * 1.2
  ctx.shadowColor = "rgba(140, 210, 255, 0.6)"
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** 点火パルス (ignition): 構築完了から reveal へ橋渡しする強い拡散ショックウェーブ。 */
function drawRebootIgnition(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  progress: number,
) {
  // 3 枚のリングを phase-offset でずらす
  const rings = [
    { offset: 0,    maxR: 280, width: 3.5, alphaBase: 0.45 },
    { offset: 0.15, maxR: 210, width: 2.0, alphaBase: 0.35 },
    { offset: 0.3,  maxR: 140, width: 1.2, alphaBase: 0.28 },
  ]
  ctx.save()
  for (const ring of rings) {
    const local = clampScalar(progress - ring.offset, 0, 1)
    if (local <= 0) continue
    const ease = 1 - Math.pow(1 - local, 2.6)
    const r = ring.maxR * ease
    const alpha = (1 - local) * ring.alphaBase
    if (alpha < 0.01) continue
    ctx.strokeStyle = `rgba(200, 230, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = ring.width * (1 - local * 0.5)
    ctx.shadowColor = "rgba(140, 210, 255, 0.8)"
    ctx.shadowBlur = 24
    ctx.beginPath()
    ctx.arc(center.x, center.y, r, 0, TAU)
    ctx.stroke()
  }
  // 中央の強い輝点 (短時間)
  const coreAlpha = Math.max(0, 1 - progress * 1.3) * 0.8
  if (coreAlpha > 0.01) {
    const coreR = 14 * (1 + progress * 2)
    const coreGrad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreR)
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha.toFixed(3)})`)
    coreGrad.addColorStop(0.3, `rgba(200, 230, 255, ${(coreAlpha * 0.6).toFixed(3)})`)
    coreGrad.addColorStop(1, "rgba(93, 164, 209, 0)")
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(center.x, center.y, coreR, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawRebootField(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  ctx.save()

  // ── 1. 外周の収縮グリッド (3 重リング) ──
  //   広い空間から演算格子が折り畳まれてくる印象。半径は progress に応じて内側へ。
  const ringCount = 3
  for (let r = 0; r < ringCount; r++) {
    const baseR = 280 - r * 45
    const collapseR = lerpScalar(baseR, 72 + r * 8, easeOutCubic(progress))
    const ringAlpha = (0.18 - r * 0.04) * (0.4 + 0.6 * progress)
    ctx.strokeStyle = `rgba(140, 210, 255, ${ringAlpha.toFixed(3)})`
    ctx.lineWidth = 0.9
    ctx.setLineDash([6 + r * 2, 8 + r * 3])
    ctx.lineDashOffset = -timeMs * 0.018 * (r % 2 === 0 ? 1 : -1)
    ctx.beginPath()
    ctx.arc(center.x, center.y, collapseR, 0, TAU)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // ── 2. 放射ライン (元のロジックを洗練) ──
  const lineCount = 18
  for (let index = 0; index < lineCount; index += 1) {
    const angle = (TAU / lineCount) * index + timeMs * 0.00012
    const sourceRadius = lerpScalar(220, 40, easeOutCubic(progress))
    const sourceX = center.x + Math.cos(angle) * sourceRadius
    const sourceY = center.y + Math.sin(angle) * sourceRadius
    const lineGradient = ctx.createLinearGradient(sourceX, sourceY, center.x, center.y)
    lineGradient.addColorStop(0, "rgba(93, 164, 209, 0)")
    lineGradient.addColorStop(0.58, "rgba(93, 164, 209, 0.18)")
    lineGradient.addColorStop(1, "rgba(214, 236, 255, 0.55)")
    ctx.strokeStyle = lineGradient
    ctx.lineWidth = 1 + (index % 3) * 0.6
    ctx.beginPath()
    ctx.moveTo(sourceX, sourceY)
    ctx.lineTo(center.x, center.y)
    ctx.stroke()
  }

  // ── 3. データストリーム (内向きの流れるトレイル) ──
  //   外周から中心へ向かう elongated trail。1 つ 1 つが「取り込まれるデータパケット」の印象。
  const streamCount = 12
  for (let s = 0; s < streamCount; s++) {
    const angle = (TAU / streamCount) * s + s * 1.7
    const cycleT = ((timeMs * 0.0008 + s * 0.17) % 1)
    const startR = lerpScalar(260, 30, easeOutCubic(progress)) * (1 - cycleT)
    const endR = startR * 0.6
    const sx = center.x + Math.cos(angle) * startR
    const sy = center.y + Math.sin(angle) * startR
    const ex = center.x + Math.cos(angle) * endR
    const ey = center.y + Math.sin(angle) * endR
    const streamAlpha = (1 - cycleT) * 0.45 * progress
    if (streamAlpha < 0.02) continue
    const streamGrad = ctx.createLinearGradient(sx, sy, ex, ey)
    streamGrad.addColorStop(0, "rgba(93, 164, 209, 0)")
    streamGrad.addColorStop(1, `rgba(220, 240, 255, ${streamAlpha.toFixed(3)})`)
    ctx.strokeStyle = streamGrad
    ctx.lineWidth = 1.6
    ctx.lineCap = "round"
    ctx.shadowColor = "rgba(140, 210, 255, 0.5)"
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // ── 4. 周回モート (元のロジック) ──
  for (let moteIndex = 0; moteIndex < 40; moteIndex += 1) {
    const angle = (TAU / 40) * moteIndex + timeMs * 0.0004
    const orbit = lerpScalar(180, 8, easeOutCubic(progress))
    const x = center.x + Math.cos(angle * 1.2 + moteIndex) * orbit
    const y = center.y + Math.sin(angle * 0.9 + moteIndex * 0.5) * orbit
    const radius = 0.8 + (moteIndex % 4) * 0.35
    ctx.globalAlpha = 0.08 + progress * 0.18
    ctx.fillStyle = moteIndex % 5 === 0 ? "#eaf7ff" : "#8ccfff"
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

function drawRebootConstruction(
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
  // 縮小されます。これにより reveal 時点で wireframe と本体 ship がぴったり重なり、
  // 重ね合わせに段差が出ない仕組みです。
  const K = input.scale

  // まず座標系を機体中心へ移し、全体を K 倍に拡大。以降の描画は中心相対 (0, 0) 基準。
  ctx.save()
  ctx.translate(input.center.x, input.center.y)
  ctx.scale(K, K)
  drawRebootConstructionRings(ctx, input.timeMs, input.progress, K)

  // ── 1. wireframe + fill (回転は機体角度に沿わせる) ──
  ctx.save()
  ctx.rotate(input.angle)
  drawRebootHullFragments(ctx, computeHullMetrics(0.72), input.timeMs, input.progress, K)

  ctx.strokeStyle = `rgba(214, 236, 255, ${shellAlpha.toFixed(3)})`
  ctx.lineWidth = 1.2 / K // ctx.scale で太線にならないよう逆補正
  ctx.shadowColor = "rgba(140, 210, 255, 0.85)"
  ctx.shadowBlur = 22 / K
  drawPlayerWireframe(ctx, input.progress)
  drawRebootInternalCircuit(ctx, computeHullMetrics(0.72), input.progress, K)

  ctx.globalAlpha = 0.24 + input.progress * 0.24
  ctx.fillStyle = "rgba(180, 228, 255, 1)"
  drawPlayerHullFill(ctx, input.progress)

  const resolvedProgress = clampScalar((input.progress - 0.58) / 0.42, 0, 1)
  if (resolvedProgress > 0.001) {
    ctx.save()
    ctx.globalAlpha = 0.14 + resolvedProgress * 0.2
    drawShip(ctx, {
      variant: input.shipVariant,
      center: { x: 0, y: 0 },
      scale: 0.72,
      stroke: "rgba(238, 249, 255, 0.9)",
      fill: "rgba(190, 228, 255, 0.08)",
      lineWidth: 0.9 / K,
      glow: { color: "rgba(140, 210, 255, 0.8)", blur: 10 / K },
      core: {
        color: "rgba(226, 248, 255, 0.9)",
        glowColor: "rgba(120, 210, 255, 0.95)",
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

  // ── 2. 縦方向スキャンバー ──
  //   機体を「下→上」に走査する白い帯。進捗と sin 変動で周期的に位置が揺れる。
  ctx.shadowBlur = 0
  const hull = computeHullMetrics(0.72)
  const scanY = hull.tipY + ((input.progress * 1.5 + Math.sin(input.timeMs * 0.004) * 0.08) % 1) *
    (hull.baseY - hull.tipY + 16)
  const scanWidth = (hull.bodyW / 2 + hull.wingGap + hull.wingW) * 2.4
  const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6)
  scanGrad.addColorStop(0, "rgba(140, 210, 255, 0)")
  scanGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.6 * input.progress).toFixed(3)})`)
  scanGrad.addColorStop(1, "rgba(140, 210, 255, 0)")
  ctx.globalAlpha = 1
  ctx.fillStyle = scanGrad
  ctx.fillRect(-scanWidth / 2, scanY - 6, scanWidth, 12)

  ctx.restore()

  // ── 3. 外周リング 2 重 ──
  ctx.strokeStyle = `rgba(140, 210, 255, ${(0.18 + input.progress * 0.22).toFixed(3)})`
  ctx.lineWidth = 1.2 / K
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius * 1.45, 0, TAU)
  ctx.stroke()

  // ── 4. schematic ticks (12 分割) ──
  const tickCount = 12
  const tickOuterR = ringRadius * 1.62
  const tickInnerR = ringRadius * 1.5
  ctx.strokeStyle = `rgba(140, 210, 255, ${(0.35 + input.progress * 0.28).toFixed(3)})`
  ctx.lineWidth = 1 / K
  for (let t = 0; t < tickCount; t++) {
    const a = (TAU / tickCount) * t + input.timeMs * 0.0004
    const isMajor = t % 3 === 0
    const outerR = isMajor ? tickOuterR + 4 : tickOuterR
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * tickInnerR, Math.sin(a) * tickInnerR)
    ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR)
    ctx.stroke()
  }

  // ── 5. 構築バースト点 ──
  for (let index = 0; index < 6; index += 1) {
    const burstAngle = (TAU / 6) * index + input.timeMs * 0.0015
    const burstRadius = ringRadius * (0.7 + (index % 3) * 0.16)
    const burstX = Math.cos(burstAngle) * burstRadius
    const burstY = Math.sin(burstAngle) * burstRadius
    ctx.globalAlpha = 0.18 + input.progress * 0.22
    ctx.fillStyle = index % 2 === 0 ? "#f4fbff" : "#8dd3ff"
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
    ctx.strokeStyle = `rgba(140, 210, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = (1.2 - ringIndex * 0.12) / scale
    ctx.shadowColor = "rgba(93, 164, 209, 0.55)"
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

    ctx.strokeStyle = `rgba(218, 242, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = (0.7 + seededUnit(index * 31) * 0.7) / scale
    ctx.shadowColor = "rgba(140, 210, 255, 0.75)"
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
  ctx.strokeStyle = "rgba(180, 230, 255, 0.72)"
  ctx.lineWidth = 0.55 / scale
  ctx.shadowColor = "rgba(93, 164, 209, 0.5)"
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
  const m = computeHullMetrics(0.72)
  const reveal = easeOutCubic(progress)

  traceRebootSolidBody(ctx, m, reveal)
  ctx.stroke()

  for (const side of [-1, 1] as const) {
    traceRebootSolidWing(ctx, m, side, reveal)
    ctx.stroke()
    traceRebootSolidRearFin(ctx, m, side, reveal)
    ctx.stroke()
  }

  // 起動演出では、三角形ベースの完成形に近い稜線を先に見せます。
  ctx.save()
  ctx.globalAlpha *= 0.72 * reveal
  ctx.lineWidth = Math.max(0.45, ctx.lineWidth * 0.58)
  ctx.beginPath()
  ctx.moveTo(0, m.tipY + m.bodyH * 0.1)
  ctx.lineTo(0, m.baseY * 0.5 * reveal)
  ctx.moveTo(-m.bodyW * 0.18 * reveal, -m.bodyH * 0.02 * reveal)
  ctx.lineTo(-m.bodyW * 0.56 * reveal, (m.baseY - m.wingH * 0.1) * reveal)
  ctx.moveTo(m.bodyW * 0.18 * reveal, -m.bodyH * 0.02 * reveal)
  ctx.lineTo(m.bodyW * 0.56 * reveal, (m.baseY - m.wingH * 0.1) * reveal)
  ctx.stroke()
  ctx.restore()
}

function drawPlayerHullFill(ctx: CanvasRenderingContext2D, progress: number) {
  const m = computeHullMetrics(0.72)
  const reveal = easeOutCubic(Math.max(0, (progress - 0.16) / 0.84))

  traceRebootSolidBody(ctx, m, reveal)
  ctx.fill()
}

function traceRebootSolidWing(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
  const rootX = side * m.bodyW * 0.22
  const rootY = m.baseY * 0.42
  const outerX = side * (m.bodyW * 0.5 + m.wingGap + m.wingW * 1.08)
  const outerY = m.baseY * 0.46
  const innerX = side * m.bodyW * 0.36
  const innerY = -m.bodyH * 0.2

  ctx.beginPath()
  ctx.moveTo(rootX, rootY)
  ctx.lineTo(outerX * reveal, outerY * reveal)
  ctx.lineTo(innerX * reveal, innerY * reveal)
  ctx.closePath()
}

function traceRebootSolidRearFin(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(side * m.bodyW * 0.1, m.baseY * 0.82)
  ctx.lineTo(side * m.bodyW * 0.26 * reveal, m.baseY * 1.1 * reveal)
  ctx.lineTo(side * m.bodyW * 0.02 * reveal, m.baseY * 0.98 * reveal)
  ctx.closePath()
}

function traceRebootSolidBody(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.lineTo(-m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(0, m.bodyNotchY * reveal)
  ctx.lineTo(m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.closePath()
}

function lerpScalar(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function clampScalar(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function easeInOutSine(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return -(Math.cos(Math.PI * clamped) - 1) / 2
}

function easeOutCubic(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return 1 - (1 - clamped) ** 3
}

/* ============================================================
   PLAYER SHIP — direction-facing, bright, glowing
   ============================================================ */
function drawExplorePlayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  now: number,
  variant: ShipVariant,
) {
  // 探索時の自機は「画面中央の静かな光」としての存在感を優先する。
  // 戦闘時より glow を強め、art 装飾は強度フルで使う。
  const pulse = 0.6 + 0.4 * Math.sin(now * 0.004)
  drawShip(ctx, {
    variant,
    center: { x: cx, y: cy },
    scale: 0.7,
    rotation: angle,
    stroke: "#ffffff",
    fill: "rgba(200, 230, 255, 0.12)",
    lineWidth: 1.5,
    glow: { color: "rgba(140, 210, 255, 0.8)", blur: 16 },
    core: {
      color: "rgba(140, 220, 255, 1)",
      glowColor: "rgba(93, 200, 255, 1)",
      glowBlur: 10,
      radius: 2.2,
      pulse,
    },
    timeMs: now,
    artDetailStrength: 1,
  })
}

function drawDiamondPath(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, r: number) {
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - r)
  ctx.lineTo(pos.x + r * PHI_INV, pos.y)
  ctx.lineTo(pos.x, pos.y + r)
  ctx.lineTo(pos.x - r * PHI_INV, pos.y)
  ctx.closePath()
}

function drawRestrictedBoundary(
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
  const topLeft = worldToCanvas(
    input.viewport,
    input.width,
    input.height,
    input.padding,
    input.areaBounds.x,
    input.areaBounds.y,
  )
  const bottomRight = worldToCanvas(
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
    const focusPoint = worldToCanvas(
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
  ctx.strokeStyle = `rgba(247, 251, 255, ${0.16 * beamAlpha})`
  ctx.lineWidth = 18
  ctx.shadowColor = `rgba(247, 251, 255, ${0.3 * beamAlpha})`
  ctx.shadowBlur = 28
  ctx.strokeRect(input.x, input.y, input.width, input.height)

  ctx.strokeStyle = `rgba(214, 236, 255, ${0.32 * beamAlpha})`
  ctx.lineWidth = 9
  ctx.shadowBlur = 16
  ctx.strokeRect(input.x, input.y, input.width, input.height)

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * beamAlpha})`
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
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 * input.beamAlpha})`
  ctx.lineWidth = 1.3
  ctx.shadowColor = `rgba(255, 255, 255, ${0.35 * input.beamAlpha})`
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
  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.36 * residualAlpha).toFixed(3)})`
  ctx.lineWidth = 2.1
  ctx.shadowColor = `rgba(214, 236, 255, ${(0.42 * residualAlpha).toFixed(3)})`
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(input.x, input.y, primaryRadius, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = `rgba(255, 255, 255, ${(0.16 * residualAlpha).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(input.x, input.y, secondaryRadius, 0, TAU)
  ctx.stroke()

  for (let index = 0; index < 10; index += 1) {
    const angle = (TAU / 10) * index + input.timeMs * 0.0005
    const innerRadius = Math.max(10, primaryRadius * 0.2)
    const outerRadius = primaryRadius + 12 + (index % 3) * 10
    ctx.strokeStyle = `rgba(214, 236, 255, ${(0.18 * residualAlpha).toFixed(3)})`
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
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.76 * residualAlpha * intactFactor).toFixed(3)})`
    ctx.lineWidth = 2.6
    ctx.shadowColor = `rgba(214, 236, 255, ${(0.42 * residualAlpha * intactFactor).toFixed(3)})`
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
  ctx.strokeStyle = `rgba(214, 236, 255, ${(input.alpha * shimmer).toFixed(3)})`
  ctx.lineWidth = 1.35
  ctx.shadowColor = `rgba(214, 236, 255, ${(input.alpha * 0.9).toFixed(3)})`
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

/* ============================================================
   OFF-VISION NAVIGATION CUES (A + C, with future B hook)

   「画面内だが探索範囲外」のアイテム/装備/ミッション/ワープを
   ささやかに誘導するレイヤ。闇の中の探索体験を損なわない範囲で、
   見落としや未マッピングを減らす目的。

     A: rim compass arc  — 探索円の円周上に、ターゲット方向を示す
        種別色の短い弧を描く。距離には非依存 (= 常に同じ強度で方向だけ示す)。
     C: dim pinpoint     — ターゲット位置に種別色のごく淡い点を置く。
        halo + 中心コアで距離感だけ滲ませる。

   将来の B (共鳴パルス) は `drawNavCueLayer` の末尾にフックポイントがある。
   ターゲット種別色: equipment=青 / item=白 / mission=橙 / warp=tan 橙。

   静謐さを保つため alpha は 0.3 前後を上限に抑える。呼吸パルスは
   ターゲット座標で phase を散らし、複数のキューが同期して強く明滅しないようにする。
   ============================================================ */

type NavCueKind = "equipment" | "item" | "mission" | "warp"

type NavCueTarget = {
  kind: NavCueKind
  point: { x: number; y: number }
}

function resolveCollectibleNavKind(
  markerKind: CollectibleMarkerKind | undefined,
): NavCueKind {
  // 装備系は青、それ以外 (resource / investigation / selfRepairPoints) は白。
  if (markerKind === "equipment" || markerKind === "hiddenEquipment") {
    return "equipment"
  }
  return "item"
}

const NAV_CUE_COLORS: Record<NavCueKind, { rgb: string }> = {
  equipment: { rgb: "158, 212, 255" }, // 柔らかい青
  item:      { rgb: "220, 230, 245" }, // ほんのり青白い白
  mission:   { rgb: "255, 192, 137" }, // 琥珀色
  warp:      { rgb: "240, 198, 116" }, // タン寄りの橙
}

function drawNavCueLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    targets: NavCueTarget[]
    timeMs: number
  },
) {
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // C: pinpoint を先に敷く (rim arc の方が上、目立たせる優先順)。
  for (const t of input.targets) {
    drawNavCuePinpoint(ctx, t, input.timeMs)
  }

  // A: rim arc。探索円周上にターゲット方向を示す短い弧を各ターゲットぶん。
  for (const t of input.targets) {
    drawNavCueRimArc(ctx, input.playerPoint, input.visionPx, t, input.timeMs)
  }

  // [Future B] 共鳴パルス挿入ポイント:
  //   drawNavCueResonancePulse(ctx, input.playerPoint, input.visionPx, input.targets, input.timeMs)
  //   探索円から外側へ拡散する淡い環。ターゲットに触れた瞬間だけ一瞬明滅させる等の演出を想定。
  //   rim arc と同時描画する際は、パルスを先 (背面) に描いて arc が前に立つ順序にする。

  ctx.restore()
}

/** C: 種別色の「星」ピンポイント。探索範囲外のターゲット位置に描画。
 *
 *  宇宙の星を想起させる控えめな美術効果 (十字スパイクは使わず、光の階調で表現):
 *    - Layer 1: 遠いぼかし外周 (= シャドウ層)。広く・淡く・ほぼ動かない。
 *    - Layer 2: 中間ハロー。twinkle で明滅。
 *    - Layer 3: 中央コア + shadowBlur の柔らかな芯光。
 *    - Layer 4: 2〜3 粒の微小パーティクル (地味)。周回ではなくごく弱い線的ドリフトで、
 *      時間と共に alpha が膨らむ / 消える。出現位置は星ごとの seed で分散。
 *  alpha 上限は全層で 0.35 以下に抑え、画面に並んでも喧しくない強度とする。 */
function drawNavCuePinpoint(
  ctx: CanvasRenderingContext2D,
  target: NavCueTarget,
  timeMs: number,
) {
  const color = NAV_CUE_COLORS[target.kind]

  // 座標由来の決定的な seed (0..1)。個体差 (スケール / パーティクル位置) 用。
  const seedRaw = Math.sin(target.point.x * 12.9898 + target.point.y * 78.233) * 43758.5453
  const seed = seedRaw - Math.floor(seedRaw)
  const seed2Raw = seed * 7.13
  const seed2 = seed2Raw - Math.floor(seed2Raw)
  const scale = 0.85 + seed * 0.4

  // 複合 twinkle: 3 系統の正弦を合成。低速 2 + 高速 1 で単純な呼吸を避ける。
  const phaseA = target.point.x * 0.013 + target.point.y * 0.011
  const phaseB = target.point.x * 0.019 - target.point.y * 0.007
  const phaseC = target.point.x * 0.031 + target.point.y * 0.029
  const t = timeMs * 0.001
  const slow = 0.55 * Math.sin(t * 1.4 + phaseA) + 0.45 * Math.sin(t * 0.83 + phaseB)
  const fast = 0.25 * Math.sin(t * 3.7 + phaseC)
  const wave = slow * 0.85 + fast * 0.15
  const twinkle01 = Math.max(0, Math.min(1, 0.5 + 0.5 * wave))
  const brightness = 0.55 + 0.45 * Math.pow(twinkle01, 1.4)

  ctx.save()

  // Layer 1: 遠いぼかし外周 (シャドウ)。広く淡く、twinkle にはほぼ反応させない。
  const shadowR = 16 * scale
  const shadow = ctx.createRadialGradient(
    target.point.x, target.point.y, 0,
    target.point.x, target.point.y, shadowR,
  )
  shadow.addColorStop(0, `rgba(${color.rgb}, ${(0.09 * (0.85 + 0.15 * twinkle01)).toFixed(3)})`)
  shadow.addColorStop(0.55, `rgba(${color.rgb}, 0.03)`)
  shadow.addColorStop(1, `rgba(${color.rgb}, 0)`)
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, shadowR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 2: 中間ハロー。twinkle に連動して明滅。
  const haloR = 7 * scale
  const halo = ctx.createRadialGradient(
    target.point.x, target.point.y, 0,
    target.point.x, target.point.y, haloR,
  )
  halo.addColorStop(0, `rgba(${color.rgb}, ${(0.3 * brightness).toFixed(3)})`)
  halo.addColorStop(0.45, `rgba(${color.rgb}, ${(0.1 * brightness).toFixed(3)})`)
  halo.addColorStop(1, `rgba(${color.rgb}, 0)`)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, haloR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 3: 中央コア。shadowBlur でふわっとした芯光。
  ctx.shadowColor = `rgba(${color.rgb}, 0.55)`
  ctx.shadowBlur = 6
  ctx.fillStyle = `rgba(${color.rgb}, ${(0.65 + 0.25 * twinkle01).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, (1.4 + 0.35 * twinkle01) * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Layer 4: 地味なパーティクル。3 粒、それぞれ独立した位相で浮かび上がっては消える。
  // 周回せず、星から少し離れた位置にごく弱い光点として明滅させる。
  drawNavCueParticles(ctx, target.point, color.rgb, scale, seed, seed2, t)

  ctx.restore()
}

/** 星の周囲に浮かぶ地味な粒子。各粒子は独自位相で ease-in/out の明滅を繰り返す。 */
function drawNavCueParticles(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  colorRgb: string,
  scale: number,
  seed: number,
  seed2: number,
  t: number,
) {
  const count = 3
  for (let i = 0; i < count; i++) {
    // 粒子ごとの固有 seed (座標と index から決定)。
    const ps = ((seed * 13.37 + i * 2.71 + seed2 * 5.19) % 1 + 1) % 1
    const pa = ((seed2 * 19.73 + i * 3.14 + seed * 1.41) % 1 + 1) % 1
    // 周回ではなく、毎サイクルほぼ同じ位置に浮かび上がる (drift を最小限に)。
    const angle = ps * Math.PI * 2 + Math.sin(t * 0.2 + pa * 6) * 0.25
    const distance = (5 + ps * 4) * scale
    const px = center.x + Math.cos(angle) * distance
    const py = center.y + Math.sin(angle) * distance

    // 1 周期 ≈ 3.8 〜 5.2 秒で ease-in/out。粒子ごとに位相をずらして同期させない。
    const period = 3.8 + pa * 1.4
    const phase = (t / period + ps) % 1
    // phase 0 → 0.5 でふわっと上がり 0.5 → 1 で消える 0..1 のベル型。
    const envelope = phase < 0.5
      ? 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)
      : 0.5 + 0.5 * Math.cos((phase - 0.5) * 2 * Math.PI)
    const alpha = 0.18 * envelope

    if (alpha < 0.01) continue

    ctx.fillStyle = `rgba(${colorRgb}, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, (0.6 + 0.3 * envelope) * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A: 探索円周上に、ターゲット方向を示す短い色付きリム弧。 */
function drawNavCueRimArc(
  ctx: CanvasRenderingContext2D,
  playerPoint: { x: number; y: number },
  visionPx: number,
  target: NavCueTarget,
  timeMs: number,
) {
  const color = NAV_CUE_COLORS[target.kind]
  const dx = target.point.x - playerPoint.x
  const dy = target.point.y - playerPoint.y
  const angle = Math.atan2(dy, dx)
  // 弧は距離非依存。短く、方向のみ。
  const arcSpan = 0.09 // rad (≈5.15°)
  const rimRadius = visionPx * 1.0

  // 個別 phase で非同期パルス
  const phase = target.point.x * 0.02 - target.point.y * 0.015
  const breathe = 0.65 + 0.35 * Math.sin(timeMs * 0.0022 + phase)

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = `rgba(${color.rgb}, 0.45)`
  ctx.shadowBlur = 6

  // 幅広の光層 (低 alpha で柔らかい光)
  ctx.strokeStyle = `rgba(${color.rgb}, ${(0.18 * breathe).toFixed(3)})`
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.arc(playerPoint.x, playerPoint.y, rimRadius, angle - arcSpan, angle + arcSpan)
  ctx.stroke()

  // 芯線 (明るめ、細い)
  ctx.strokeStyle = `rgba(${color.rgb}, ${(0.5 * breathe).toFixed(3)})`
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.arc(playerPoint.x, playerPoint.y, rimRadius, angle - arcSpan * 0.78, angle + arcSpan * 0.78)
  ctx.stroke()

  ctx.restore()
}

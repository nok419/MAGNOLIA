import { useEffect, useRef, useState } from "react"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import type { ExplorePresentationState } from "@/app/explore-presentation"
import type { DisplayOptions } from "@/app/display-options"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import { drawBackground, drawFogGrid } from "./background"
import { drawExplorePlayer } from "./player"
import {
  drawRebootBackdrop,
  drawRebootBlackoutBackdrop,
  drawRebootSequence,
  drawRebootSettleBridge,
} from "./reboot-sequence"
import { drawExploreScene } from "./scene"
import { createTrailState, syncTrailPreviousPosition, type TrailState } from "./trail"
import {
  DEFAULT_VIEWPORT_HEIGHT,
  readRebootSequence,
  readRebootSettle,
  readRebootSettlePhase,
  readRebootViewportHeight,
  readReleaseSequence,
  readReleaseViewportHeight,
  resolveCameraViewport,
  type CameraState,
  type RebootSequenceState,
  type RebootSettleState,
  type ReleaseSequenceState,
} from "./timeline"

type ExploreCanvasProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  /** 自機見た目バリアント。詳細は apps/web/src/app/ship-renderer.ts を参照。 */
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
export function ExploreCanvas({
  snapshot,
  renderState,
  presentation,
  shipVariant,
  onOverlayFrame,
  displayOptions,
}: ExploreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const cameraRef = useRef<CameraState | null>(null)
  const trailRef = useRef<TrailState>(createTrailState())
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
    // 1 枚の大きな world map を前提に、画面には camera viewport だけを出します。
    // player を完全固定せず少し遅れて追従させることで、画面外へ地続きで続く感覚を保ちます。
    const viewport = resolveCameraViewport({
      cameraRef,
      worldBounds: renderState.worldBounds,
      playerPosition: renderState.playerPosition,
      viewportHeight,
      aspectRatio: Math.max(1, (W - PADDING * 2) / Math.max(1, H - PADDING * 2)),
      rebootSequence,
      releaseSequence,
    })

    const pp = worldToCanvasPoint(
      viewport,
      W,
      H,
      PADDING,
      renderState.playerPosition.x,
      renderState.playerPosition.y,
    )
    const visionPx = (renderState.visionRadius / Math.max(1, viewport.width)) * (W - PADDING * 2)
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
        drawBackground(ctx, W, H, now, viewport, displayOptions.reduceFlashing)
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
          trailState: trailRef.current,
        })
      }
    } else {
      drawBackground(ctx, W, H, now, viewport, displayOptions.reduceFlashing)
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
        trailState: trailRef.current,
      })
    }

    syncTrailPreviousPosition(trailRef.current, renderState.playerPosition.x, renderState.playerPosition.y)
  }, [
    renderState,
    snapshot,
    presentation,
    shipVariant,
    onOverlayFrame,
    displayOptions,
    animTick,
  ])

  return <canvas ref={canvasRef} className="explore-canvas-full" />
}

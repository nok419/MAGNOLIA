import { useEffect, useRef, useState } from "react"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState } from "@magnolia/game-session"
import type { ExplorePresentationState } from "@/app/explore-presentation"
import type { DisplayOptions } from "@/app/display-options"
import {
  createExploreTrailState,
  drawExploreFrame,
  type CameraState,
  type ExploreOverlayFrame,
  type RebootSequenceState,
  type RebootSettleState,
  type ReleaseSequenceState,
} from "@/render/explore"

export type { ExploreOverlayFrame } from "@/render/explore"

type ExploreCanvasProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  /** 自機見た目バリアント。詳細は `apps/web/src/app/ship-renderer.ts` を参照。 */
  shipVariant: ShipVariant
  onOverlayFrame?: (frame: ExploreOverlayFrame) => void
  displayOptions: DisplayOptions
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
    let lastDrawAt = 0
    const tick = (now: number) => {
      const canDraw =
        !displayOptions.lowFrameRateMode ||
        now - lastDrawAt >= displayOptions.targetFrameIntervalMs
      if (canDraw) {
        lastDrawAt = now
        setAnimTick((t) => (t + 1) & 0xffff)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [
    presentation.kind,
    presentation.kind === "none" ? "" : presentation.requestId,
    displayOptions.lowFrameRateMode,
    displayOptions.targetFrameIntervalMs,
  ])

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

    drawExploreFrame(ctx, {
      snapshot,
      renderState,
      presentation,
      shipVariant,
      displayOptions,
      onOverlayFrame,
      refs: {
        cameraRef,
        trailStateRef,
        rebootSequenceRef,
        rebootSettleRef,
        releaseSequenceRef,
      },
      width: W,
      height: H,
      now: performance.now(),
    })
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

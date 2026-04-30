
import { useEffect, useRef } from "react"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState } from "@magnolia/game-session"
import type { ExplorePresentationState } from "@/app/explore-presentation"
import type {
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import type { DisplayOptions } from "@/app/display-options"
import { prepareDevicePixelCanvas } from "@/render/canvas-host/device-pixel-canvas"
import { useCanvasAnimationTick } from "@/render/canvas-host/use-canvas-animation-loop"
import { useObservedCanvasSize } from "@/render/canvas-host/use-canvas-size"
import type { CameraState } from "@/render/explore/camera"
import { createExploreTrailState } from "@/render/explore/trail"
import type { RebootSequenceState } from "@/render/explore/reboot-sequence"
import type { RebootSettleState } from "@/render/explore/reboot-settle"
import type { ReleaseSequenceState } from "@/render/explore/boundary-release"
import { drawExploreFrame, type ExploreOverlayFrame } from "@/render/explore/draw-explore-frame"
import { createScanCooldownMeterState } from "@/render/explore/scan-cooldown-meter"

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

export type { ExploreOverlayFrame } from "@/render/explore/draw-explore-frame"

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
  const sizeRef = useObservedCanvasSize(canvasRef, { observeParent: true })
  const cameraRef = useRef<CameraState | null>(null)
  const trailStateRef = useRef(createExploreTrailState())
  const rebootSequenceRef = useRef<RebootSequenceState | null>(null)
  const rebootSettleRef = useRef<RebootSettleState | null>(null)
  const releaseSequenceRef = useRef<ReleaseSequenceState | null>(null)
  const scanMeterStateRef = useRef(createScanCooldownMeterState())
  // 演出中は renderState の参照が更新されないフレームがあるため、host 側だけ tick を進めます。
  const animTick = useCanvasAnimationTick(
    presentation.kind !== "none",
    [presentation.kind, presentation.kind === "none" ? "" : presentation.requestId],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = sizeRef.current.width || window.innerWidth
    const H = sizeRef.current.height || window.innerHeight
    const ctx = prepareDevicePixelCanvas({
      canvas,
      width: W,
      height: H,
      pixelRatio: displayOptions.canvasPixelRatio,
    })
    if (!ctx) return

    drawExploreFrame({
      ctx,
      width: W,
      height: H,
      snapshot,
      renderState,
      presentation,
      exploreEvents,
      shipVariant,
      onOverlayFrame,
      displayOptions,
      refs: {
        cameraRef,
        trailStateRef,
        rebootSequenceRef,
        rebootSettleRef,
        releaseSequenceRef,
        scanMeterStateRef,
      },
    })
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

import { useRef } from "react"
import type { DisplayOptions } from "@/app/display-options"
import { prepareDevicePixelCanvas } from "@/render/canvas-host/device-pixel-canvas"
import { useCanvasAnimationLoop } from "@/render/canvas-host/use-canvas-animation-loop"
import { drawMiniMapFrame, MINI_MAP_SIZE } from "@/render/map/minimap-renderer"
import type { MiniMapViewModel } from "@/view-models/map-view-model"

type MiniMapProps = {
  viewModel: MiniMapViewModel
  displayOptions: DisplayOptions
}

const TAU = Math.PI * 2

export function MiniMap({ viewModel, displayOptions }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sweepAngleRef = useRef(0)

  useCanvasAnimationLoop((timeMs) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = prepareDevicePixelCanvas({
      canvas,
      width: MINI_MAP_SIZE,
      height: MINI_MAP_SIZE,
      pixelRatio: displayOptions.canvasPixelRatio,
    })
    if (!ctx) return

    sweepAngleRef.current = (sweepAngleRef.current + (displayOptions.reduceFlashing ? 0.002 : 0.008)) % TAU
    drawMiniMapFrame({
      ctx,
      viewModel,
      displayOptions,
      timeMs,
      sweepAngle: sweepAngleRef.current,
    })
  }, [displayOptions, viewModel])

  return <canvas ref={canvasRef} className="mini-map-canvas" />
}

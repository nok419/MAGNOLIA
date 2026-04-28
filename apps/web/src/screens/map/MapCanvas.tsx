import { useEffect, useMemo, useRef } from "react"
import type { AreaId, TransmissionId } from "@magnolia/contracts"
import type { MapViewModel } from "@magnolia/game-session"
import {
  drawMapCanvas,
  resolveFocusBounds,
  resolveHitSelection,
  type MapCanvasHitTarget,
  type MapCanvasSelection,
} from "@/screens/map/map-canvas-renderer"
export type { MapCanvasSelection } from "@/screens/map/map-canvas-renderer"

type MapCanvasProps = {
  viewModel: MapViewModel
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  onSelectTarget: (selection: MapCanvasSelection | undefined) => void
}

const MIN_CANVAS_SIZE = 320

export function MapCanvas({
  viewModel,
  selectedAreaId,
  selectedTransmissionId,
  onSelectTarget,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hitTargetsRef = useRef<MapCanvasHitTarget[]>([])
  const focusBounds = useMemo(
    () => resolveFocusBounds(viewModel, selectedAreaId),
    [selectedAreaId, viewModel],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        sizeRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        }
      }
    })

    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    let frameId = 0
    let running = true

    // map の marker は pulse を持つため、session state と独立した描画時刻で更新します。
    const drawFrame = (timeMs: number) => {
      if (!running) {
        return
      }

      const width = Math.max(MIN_CANVAS_SIZE, sizeRef.current.width || canvas.clientWidth || 640)
      const height = Math.max(MIN_CANVAS_SIZE, sizeRef.current.height || canvas.clientHeight || 640)
      const dpr = viewModel.canvasPixelRatio
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      hitTargetsRef.current = drawMapCanvas({
        ctx,
        width,
        height,
        timeMs,
        focusBounds,
        viewModel,
        selectedAreaId,
        selectedTransmissionId,
      })

      frameId = window.requestAnimationFrame(drawFrame)
    }

    frameId = window.requestAnimationFrame(drawFrame)
    return () => {
      running = false
      window.cancelAnimationFrame(frameId)
    }
  }, [
    focusBounds,
    selectedAreaId,
    selectedTransmissionId,
    viewModel,
  ])

function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    onSelectTarget(resolveHitSelection(hitTargetsRef.current, x, y))
  }

  return (
    <canvas
      ref={canvasRef}
      className="map-screen__canvas"
      onClick={handleCanvasClick}
    />
  )
}

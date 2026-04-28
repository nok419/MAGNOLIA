import { useEffect, useRef } from "react"
import type { DisplayOptions } from "@/app/display-options"
import { shouldDrawVisualFrame } from "@/app/display-options"
import {
  drawCarrierLineField,
  drawPeripheralVignette,
  drawScanPulse,
  drawSignalParticleField,
  drawSoftBloom,
  drawVoidGradient,
} from "@/app/effect-primitives"
import { hashString, seededUnit, timeBucket } from "@/app/visual-seed"

type SignalBackdropCanvasProps = {
  className?: string
  displayOptions?: DisplayOptions
}

export function SignalBackdropCanvas({ className, displayOptions }: SignalBackdropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const canvasElement: HTMLCanvasElement = canvas
    const context: CanvasRenderingContext2D = ctx

    let animationFrameId = 0
    let dpr = displayOptions?.canvasPixelRatio ?? Math.min(window.devicePixelRatio || 1, 2)
    let lastDrawAt = 0
    const size = { width: 1, height: 1 }
    const layoutTarget = canvasElement.parentElement ?? canvasElement
    const seed = hashString("title:signal-backdrop")

    function resize() {
      dpr = displayOptions?.canvasPixelRatio ?? Math.min(window.devicePixelRatio || 1, 2)
      const rect = layoutTarget.getBoundingClientRect()
      size.width = Math.max(1, rect.width)
      size.height = Math.max(1, rect.height)
      canvasElement.width = size.width * dpr
      canvasElement.height = size.height * dpr
      canvasElement.style.width = `${size.width}px`
      canvasElement.style.height = `${size.height}px`
    }

    resize()
    const resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(layoutTarget)
    window.addEventListener("resize", resize)

    function step(t: number) {
      const options = displayOptions ?? {
        reduceFlashing: false,
        lowFrameRateMode: false,
        targetFrameIntervalMs: 1000 / 60,
        canvasPixelRatio: dpr,
      }
      if (!shouldDrawVisualFrame({ now: t, lastDrawAt, options })) {
        animationFrameId = window.requestAnimationFrame(step)
        return
      }
      lastDrawAt = t

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      drawVoidGradient(context, size.width, size.height)
      drawSoftBloom(context, {
        x: size.width * 0.5,
        y: size.height * 0.46,
        radius: size.width * 0.34,
        role: "signal",
        alpha: 0.08,
      })
      drawSoftBloom(context, {
        x: size.width * 0.72,
        y: size.height * 0.24,
        radius: size.width * 0.22,
        role: "memory",
        alpha: 0.018,
      })

      drawCarrierLineField(context, {
        seed: seed + 7,
        width: size.width,
        height: size.height,
        timeMs: t,
        orientation: "horizontal",
        density: 12,
        curvature: 0.08,
        alpha: 0.065,
        focus: { x: size.width * 0.5, y: size.height * 0.46 },
        centerQuietRatio: 0.24,
      })
      drawCarrierLineField(context, {
        seed: seed + 19,
        width: size.width,
        height: size.height,
        timeMs: t,
        orientation: "radial",
        density: 7,
        curvature: 0.12,
        alpha: 0.04,
        focus: { x: size.width * 0.5, y: size.height * 0.47 },
        centerQuietRatio: 0.28,
      })
      drawSignalParticleField(context, {
        seed: seed + 31,
        width: size.width,
        height: size.height,
        timeMs: t,
        density: "dense",
        depth: "far",
        drift: "current",
        colorRole: "line",
        reduceMotion: options.lowFrameRateMode,
        alpha: 0.82,
      })
      drawSignalParticleField(context, {
        seed: seed + 43,
        width: size.width,
        height: size.height,
        timeMs: t,
        density: "sparse",
        depth: "mid",
        drift: "toward-focus",
        colorRole: "memory",
        reduceMotion: true,
        alpha: 0.08,
        focus: { x: size.width * 0.5, y: size.height * 0.47 },
      })

      drawTitleScanPulses(context, {
        width: size.width,
        height: size.height,
        timeMs: t,
        seed,
        reduceFlashing: options.reduceFlashing,
      })
      drawPeripheralVignette(context, { width: size.width, height: size.height, strength: 0.9 })

      animationFrameId = window.requestAnimationFrame(step)
    }

    animationFrameId = window.requestAnimationFrame(step)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [displayOptions])

  return (
    <canvas
      ref={canvasRef}
      className={["title-screen__particles", className].filter(Boolean).join(" ")}
    />
  )
}

function drawTitleScanPulses(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; timeMs: number; seed: number; reduceFlashing: boolean },
) {
  if (input.reduceFlashing) {
    return
  }

  for (let index = 0; index < 3; index += 1) {
    const intervalMs = 12000 + index * 3200
    const cycle = timeBucket(input.timeMs + index * 2400, intervalMs)
    const progress = ((input.timeMs + index * 2400) % intervalMs) / intervalMs
    const originX =
      (seededUnit(input.seed + index * 17 + cycle * 31) < 0.5 ? -0.08 : 1.08) * input.width
    const originY = (0.24 + seededUnit(input.seed + index * 23 + cycle * 37) * 0.52) * input.height

    drawScanPulse(ctx, {
      origin: { x: originX, y: originY },
      radius: 36 + progress * input.width * (0.34 + index * 0.08),
      progress,
      strength: 0.12,
      shape: "arc",
      role: "connect",
    })
  }
}

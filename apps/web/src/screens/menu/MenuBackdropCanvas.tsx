import { useEffect, useRef } from "react"
import type { DisplayOptions } from "@/app/display-options"
import { shouldDrawVisualFrame } from "@/app/display-options"
import {
  drawCarrierLineField,
  drawPeripheralVignette,
  drawSignalParticleField,
  drawVoidGradient,
} from "@/app/effect-primitives"
import { hashString } from "@/app/visual-seed"

type MenuTab = "equipment" | "archive" | "settings"

export function MenuBackdropCanvas({
  activeTab,
  displayOptions,
}: {
  activeTab: MenuTab
  displayOptions: DisplayOptions
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const canvasElement: HTMLCanvasElement = canvas
    const context: CanvasRenderingContext2D = ctx

    let animId = 0
    const dpr = displayOptions.canvasPixelRatio
    let lastDrawAt = 0
    const size = { width: 1, height: 1 }
    const seed = hashString(`menu:${activeTab}`)

    function resize() {
      size.width = Math.max(1, window.innerWidth)
      size.height = Math.max(1, window.innerHeight)
      canvasElement.width = size.width * dpr
      canvasElement.height = size.height * dpr
      canvasElement.style.width = `${size.width}px`
      canvasElement.style.height = `${size.height}px`
    }
    resize()
    window.addEventListener("resize", resize)

    function step(t: number) {
      if (!shouldDrawVisualFrame({ now: t, lastDrawAt, options: displayOptions })) {
        animId = requestAnimationFrame(step)
        return
      }
      lastDrawAt = t
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      drawVoidGradient(context, size.width, size.height)
      drawCarrierLineField(context, {
        seed: seed + 17,
        width: size.width,
        height: size.height,
        timeMs: t,
        orientation: "horizontal",
        density: 10,
        curvature: 0.05,
        alpha: 0.07,
        focus: readMenuFocus(activeTab, size.width, size.height),
        centerQuietRatio: 0.28,
      })
      drawCarrierLineField(context, {
        seed: seed + 29,
        width: size.width,
        height: size.height,
        timeMs: t,
        orientation: "diagonal",
        density: 5,
        curvature: 0.04,
        alpha: 0.04,
      })
      drawSignalParticleField(context, {
        seed: seed + 41,
        width: size.width,
        height: size.height,
        timeMs: t,
        density: "normal",
        depth: "far",
        drift: "current",
        colorRole: "line",
        reduceMotion: displayOptions.lowFrameRateMode,
        alpha: 0.92,
      })
      drawSignalParticleField(context, {
        seed: seed + 53,
        width: size.width,
        height: size.height,
        timeMs: t,
        density: "sparse",
        depth: "far",
        drift: "toward-focus",
        colorRole: activeTab === "archive" ? "memory" : "signal",
        reduceMotion: true,
        alpha: activeTab === "archive" ? 0.22 : 0.12,
        focus: readMenuFocus(activeTab, size.width, size.height),
      })
      drawPeripheralVignette(context, { width: size.width, height: size.height, strength: 0.84 })

      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)
    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animId)
    }
  }, [activeTab, displayOptions])

  return <canvas ref={canvasRef} className="menu-screen__bg" />
}

function readMenuFocus(activeTab: MenuTab, width: number, height: number) {
  const xRatio = activeTab === "equipment" ? 0.32 : activeTab === "archive" ? 0.54 : 0.72
  return { x: width * xRatio, y: height * 0.48 }
}

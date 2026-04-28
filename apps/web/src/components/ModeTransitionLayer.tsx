import { useLayoutEffect, useRef, useState } from "react"
import type { DisplayOptions } from "@/app/display-options"
import { drawScreenVeilTransition } from "@/app/effect-primitives"
import { visualToken } from "@/app/visual-tokens"

type ModeTransitionLayerProps = {
  screenKey: string
  displayOptions: DisplayOptions
}

type TransitionState = {
  id: number
  fromKey: string
  toKey: string
  startedAt: number
  durationMs: number
}

export function ModeTransitionLayer({ screenKey, displayOptions }: ModeTransitionLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastScreenKeyRef = useRef(screenKey)
  const frameRef = useRef<number | null>(null)
  const transitionRef = useRef<TransitionState | null>(null)
  const [transition, setTransition] = useState<TransitionState | null>(null)

  useLayoutEffect(() => {
    if (lastScreenKeyRef.current === screenKey) {
      return
    }
    const nextTransition: TransitionState = {
      id: Date.now(),
      fromKey: lastScreenKeyRef.current,
      toKey: screenKey,
      startedAt: performance.now(),
      durationMs: resolveModeTransitionDurationMs(
        lastScreenKeyRef.current,
        screenKey,
        displayOptions.reduceFlashing,
      ),
    }
    lastScreenKeyRef.current = screenKey
    transitionRef.current = nextTransition
    setTransition(nextTransition)
  }, [displayOptions.reduceFlashing, screenKey])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !transition) {
      return
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    const canvasElement = canvas
    const context = ctx
    let disposed = false
    let lastFrameAt = Number.NEGATIVE_INFINITY

    function resizeCanvas() {
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      const width = Math.max(1, window.innerWidth)
      const height = Math.max(1, window.innerHeight)
      canvasElement.width = Math.floor(width * ratio)
      canvasElement.height = Math.floor(height * ratio)
      canvasElement.style.width = `${width}px`
      canvasElement.style.height = `${height}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    function draw(now: number) {
      if (disposed) {
        return
      }
      const active = transitionRef.current
      if (!active) {
        context.clearRect(0, 0, window.innerWidth, window.innerHeight)
        return
      }
      const minFrameInterval = displayOptions.lowFrameRateMode ? 1000 / 24 : 0
      if (minFrameInterval > 0 && now - lastFrameAt < minFrameInterval) {
        frameRef.current = requestAnimationFrame(draw)
        return
      }
      lastFrameAt = now
      const width = window.innerWidth
      const height = window.innerHeight
      const progress = Math.min(1, (now - active.startedAt) / active.durationMs)
      context.clearRect(0, 0, width, height)

      // 遷移演出はスクリーン固有の state を持たず、screenKey の変化だけを根拠に描画します。
      drawScreenVeilTransition(context, {
        seed: `mode:${active.fromKey}:${active.toKey}`,
        width,
        height,
        timeMs: now,
        progress,
        fromKey: active.fromKey,
        toKey: active.toKey,
        reduceFlashing: displayOptions.reduceFlashing,
      })

      if (progress >= 1) {
        transitionRef.current = null
        setTransition(null)
        context.clearRect(0, 0, width, height)
        return
      }
      frameRef.current = requestAnimationFrame(draw)
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    // 画面差し替え直後の初回フレームを透明にしないため、描画開始だけは同期します。
    draw(performance.now())

    return () => {
      disposed = true
      window.removeEventListener("resize", resizeCanvas)
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [displayOptions.lowFrameRateMode, displayOptions.reduceFlashing, transition])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        pointerEvents: "none",
        opacity: transition ? 1 : 0,
      }}
    />
  )
}

function resolveModeTransitionDurationMs(fromKey: string, toKey: string, reduceFlashing: boolean): number {
  if (isExploreBattleTransition(fromKey, toKey)) {
    return reduceFlashing
      ? visualToken.duration.expressive
      : visualToken.duration.veil + visualToken.duration.communication
  }
  return reduceFlashing ? visualToken.duration.communication : visualToken.duration.veil
}

function isExploreBattleTransition(fromKey: string, toKey: string): boolean {
  return (fromKey === "explore" && toKey === "battle") || (fromKey === "battle" && toKey === "explore")
}

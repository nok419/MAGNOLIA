import { useEffect, useState, type DependencyList } from "react"

export function useCanvasAnimationLoop(
  onFrame: (timeMs: number) => void,
  deps: DependencyList,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    let frameId = 0
    let running = true

    // requestAnimationFrame の開始と停止を一箇所に寄せ、canvas host ごとの解除漏れを避けます。
    const tick = (timeMs: number) => {
      if (!running) {
        return
      }
      onFrame(timeMs)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(frameId)
    }
  }, [enabled, ...deps])
}

export function useCanvasAnimationTick(
  enabled: boolean,
  deps: DependencyList,
): number {
  const [tick, setTick] = useState(0)

  useCanvasAnimationLoop(
    () => {
      setTick((value) => (value + 1) & 0xffff)
    },
    deps,
    enabled,
  )

  return tick
}

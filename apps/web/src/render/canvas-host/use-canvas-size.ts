import { useEffect, useRef, type RefObject } from "react"

export type ObservedCanvasSize = {
  width: number
  height: number
}

export function useObservedCanvasSize(
  targetRef: RefObject<HTMLElement | null>,
  options: {
    observeParent?: boolean
    initialSize?: ObservedCanvasSize
  } = {},
) {
  const sizeRef = useRef<ObservedCanvasSize>(options.initialSize ?? { width: 0, height: 0 })

  useEffect(() => {
    const target = targetRef.current
    const observedTarget = options.observeParent ? target?.parentElement : target
    if (!observedTarget) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      sizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
    })

    resizeObserver.observe(observedTarget)
    return () => resizeObserver.disconnect()
  }, [options.observeParent, targetRef])

  return sizeRef
}

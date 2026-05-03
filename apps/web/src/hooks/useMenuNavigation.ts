import { useCallback, useEffect, useState } from "react"
import { audioEvents } from "@/audio"

type MenuNavigationOptions = {
  itemCount: number
  onSelect: (index: number) => void
  onCancel?: () => void
  soundVolume?: number
  /** wrap around when reaching edges */
  wrap?: boolean
}

/**
 * 共通メニュー操作フック
 * ↑↓キー / マウスホイール でフォーカス移動、Enter/Z で選択、Escape で戻る
 */
export function useMenuNavigation({
  itemCount,
  onSelect,
  onCancel,
  soundVolume = 1,
  wrap = true,
}: MenuNavigationOptions) {
  const [focusIndex, setFocusIndex] = useState(0)

  const clamp = useCallback(
    (n: number) => {
      if (itemCount <= 0) return 0
      if (wrap) return ((n % itemCount) + itemCount) % itemCount
      return Math.max(0, Math.min(itemCount - 1, n))
    },
    [itemCount, wrap],
  )

  useEffect(() => {
    if (focusIndex >= itemCount && itemCount > 0) {
      setFocusIndex(itemCount - 1)
    }
  }, [itemCount, focusIndex])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          e.preventDefault()
          setFocusIndex((prev) => {
            const next = clamp(prev - 1)
            if (next !== prev) {
              audioEvents.menuMove("up", { volume: soundVolume })
            }
            return next
          })
          break
        case "ArrowDown":
        case "KeyS":
          e.preventDefault()
          setFocusIndex((prev) => {
            const next = clamp(prev + 1)
            if (next !== prev) {
              audioEvents.menuMove("down", { volume: soundVolume })
            }
            return next
          })
          break
        case "Enter":
        case "NumpadEnter":
        case "KeyZ":
          e.preventDefault()
          audioEvents.menuConfirm({ volume: soundVolume })
          onSelect(focusIndex)
          break
        case "Escape":
        case "KeyX":
          e.preventDefault()
          audioEvents.menuCancel({ volume: soundVolume })
          onCancel?.()
          break
      }
    }

    function handleWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) < 4) return
      e.preventDefault()
      const direction = e.deltaY > 0 ? "down" : "up"
      setFocusIndex((prev) => {
        const next = clamp(prev + (direction === "down" ? 1 : -1))
        if (next !== prev) {
          audioEvents.menuMove(direction, { volume: soundVolume })
        }
        return next
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("wheel", handleWheel)
    }
  }, [focusIndex, itemCount, clamp, onSelect, onCancel, soundVolume])

  return { focusIndex, setFocusIndex }
}

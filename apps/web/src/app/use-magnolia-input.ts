import { useEffect, useRef } from "react"
import type { RootSnapshot, SettingsRow, Vector2 } from "@magnolia/contracts"

const ZERO_VECTOR = { x: 0, y: 0 }
const FALLBACK_MOVE_CODES = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
}
const INTERACT_FALLBACK_CODES = ["Enter", "NumpadEnter"]
const MAP_FALLBACK_CODES = ["KeyM"]
const EQUIPMENT_FALLBACK_CODES = ["KeyE"]
const DASH_FALLBACK_CODES = ["ShiftRight"]

type MouseButtons = {
  left: boolean
  right: boolean
}

export function useMagnoliaInput() {
  const keyStateRef = useRef(new Set<string>())
  const mouseButtonsRef = useRef<MouseButtons>({
    left: false,
    right: false,
  })
  const previousMouseButtonsRef = useRef<MouseButtons>({
    left: false,
    right: false,
  })
  const previousButtonsRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldPreventDefaultForKey(event.code)) {
        event.preventDefault()
      }
      keyStateRef.current.add(event.code)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (shouldPreventDefaultForKey(event.code)) {
        event.preventDefault()
      }
      keyStateRef.current.delete(event.code)
    }

    function handleBlur() {
      // フォーカス外れ後は入力の継続判定を捨て、復帰時に押しっぱなし扱いを残しません。
      keyStateRef.current.clear()
      mouseButtonsRef.current.left = false
      mouseButtonsRef.current.right = false
      previousMouseButtonsRef.current.left = false
      previousMouseButtonsRef.current.right = false
      previousButtonsRef.current = {}
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (event.button === 0) {
        mouseButtonsRef.current.left = true
      }
      if (event.button === 2) {
        mouseButtonsRef.current.right = true
      }
    }

    function handleMouseUp(event: MouseEvent) {
      if (event.button === 0) {
        mouseButtonsRef.current.left = false
      }
      if (event.button === 2) {
        mouseButtonsRef.current.right = false
      }
    }

    function handleContextMenu(event: MouseEvent) {
      event.preventDefault()
    }

    window.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("contextmenu", handleContextMenu)

    return () => {
      window.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("contextmenu", handleContextMenu)
    }
  }, [])

  return {
    get mouseButtons(): MouseButtons {
      return mouseButtonsRef.current
    },
    readMovementVector(settings: SettingsRow): Vector2 {
      return readMovementVector(settings, keyStateRef.current)
    },
    isDashPressed(settings: SettingsRow): boolean {
      return isPressedAny(
        [settings.keybindings.dash, ...DASH_FALLBACK_CODES],
        keyStateRef.current,
      )
    },
    isMapPressed(settings: SettingsRow): boolean {
      return isJustPressedAny(
        [settings.keybindings.openMap, ...MAP_FALLBACK_CODES],
        keyStateRef.current,
        previousButtonsRef.current,
      )
    },
    isEquipmentPressed(settings: SettingsRow): boolean {
      return isJustPressedAny(
        [settings.keybindings.openEquipment, ...EQUIPMENT_FALLBACK_CODES],
        keyStateRef.current,
        previousButtonsRef.current,
      )
    },
    isClosePanelPressed(screen: RootSnapshot["screen"], settings: SettingsRow): boolean {
      const codes =
        screen === "map"
          ? [settings.keybindings.openMap, ...MAP_FALLBACK_CODES, "Escape"]
          : screen === "equipment"
            ? [settings.keybindings.openEquipment, ...EQUIPMENT_FALLBACK_CODES, "Escape"]
            : [settings.keybindings.openSettings, "Escape"]

      return isJustPressedAny(codes, keyStateRef.current, previousButtonsRef.current)
    },
    isInteractPressed(settings: SettingsRow): boolean {
      return isJustPressedAny(
        [settings.keybindings.interact, ...INTERACT_FALLBACK_CODES],
        keyStateRef.current,
        previousButtonsRef.current,
      )
    },
    isPrimaryMouseJustPressed(): boolean {
      const currentlyPressed = mouseButtonsRef.current.left
      const wasPressed = previousMouseButtonsRef.current.left
      previousMouseButtonsRef.current.left = currentlyPressed
      return currentlyPressed && !wasPressed
    },
    syncButtonEdges(settings: SettingsRow): void {
      syncButtonEdges(settings, keyStateRef.current, previousButtonsRef.current)
      previousMouseButtonsRef.current.left = mouseButtonsRef.current.left
      previousMouseButtonsRef.current.right = mouseButtonsRef.current.right
    },
  }
}

function readMovementVector(
  settings: SettingsRow,
  keyState: Set<string>,
): Vector2 {
  const x =
    Number(
      isPressedAny(
        [settings.keybindings.moveRight, ...FALLBACK_MOVE_CODES.right],
        keyState,
      ),
    ) -
    Number(
      isPressedAny(
        [settings.keybindings.moveLeft, ...FALLBACK_MOVE_CODES.left],
        keyState,
      ),
    )
  const y =
    Number(
      isPressedAny(
        [settings.keybindings.moveDown, ...FALLBACK_MOVE_CODES.down],
        keyState,
      ),
    ) -
    Number(
      isPressedAny(
        [settings.keybindings.moveUp, ...FALLBACK_MOVE_CODES.up],
        keyState,
      ),
    )

  if (x === 0 && y === 0) {
    return ZERO_VECTOR
  }

  // 斜め移動だけ速くならないよう、入力ベクトルは正規化します。
  const length = Math.hypot(x, y)
  return {
    x: x / length,
    y: y / length,
  }
}

function isPressedAny(
  codes: Array<string | undefined>,
  keyState: Set<string>,
): boolean {
  return codes.some((code) => {
    if (!code) {
      return false
    }
    return keyState.has(code)
  })
}

function isJustPressedAny(
  codes: Array<string | undefined>,
  keyState: Set<string>,
  previousButtons: Record<string, boolean>,
): boolean {
  return uniqueCodes(codes).some((code) => isJustPressed(code, keyState, previousButtons))
}

function isJustPressed(
  code: string | undefined,
  keyState: Set<string>,
  previousButtons: Record<string, boolean>,
): boolean {
  if (!code) {
    return false
  }

  const isCurrentlyPressed = keyState.has(code)
  const wasPressed = previousButtons[code] ?? false
  previousButtons[code] = isCurrentlyPressed
  return isCurrentlyPressed && !wasPressed
}

function syncButtonEdges(
  settings: SettingsRow,
  keyState: Set<string>,
  previousButtons: Record<string, boolean>,
): void {
  const trackedCodes = uniqueCodes([
    ...Object.values(settings.keybindings),
    ...FALLBACK_MOVE_CODES.up,
    ...FALLBACK_MOVE_CODES.down,
    ...FALLBACK_MOVE_CODES.left,
    ...FALLBACK_MOVE_CODES.right,
    ...INTERACT_FALLBACK_CODES,
    ...MAP_FALLBACK_CODES,
    ...EQUIPMENT_FALLBACK_CODES,
    ...DASH_FALLBACK_CODES,
  ])

  for (const code of trackedCodes) {
    previousButtons[code] = keyState.has(code)
  }
}

function uniqueCodes(codes: Array<string | undefined>): string[] {
  return Array.from(new Set(codes.filter((code): code is string => Boolean(code))))
}

function shouldPreventDefaultForKey(code: string): boolean {
  return [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Enter",
    "NumpadEnter",
  ].includes(code)
}

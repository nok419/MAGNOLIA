import { useEffect, useRef } from "react"
import type { RootSnapshot, SettingsRow, Vector2 } from "@magnolia/contracts"

const ZERO_VECTOR = { x: 0, y: 0 }
const EXPLORE_CLICK_MOVE_STOP_DISTANCE = 4
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
const SCAN_FALLBACK_CODES = ["Space"]

type MouseButtons = {
  left: boolean
  right: boolean
}

type PointerPressStamp = {
  pointerId: number
  button: number
  timeStamp: number
}

export function useMagnoliaInput() {
  const keyStateRef = useRef(new Set<string>())
  const mouseButtonsRef = useRef<MouseButtons>({
    left: false,
    right: false,
  })
  const queuedMousePressRef = useRef<MouseButtons>({
    left: false,
    right: false,
  })
  const previousMouseButtonsRef = useRef<MouseButtons>({
    left: false,
    right: false,
  })
  const previousButtonsRef = useRef<Record<string, boolean>>({})
  const lastPointerPressRef = useRef<PointerPressStamp | null>(null)
  const lastActivityAtRef = useRef(Date.now())
  const exploreMoveTargetRef = useRef<Vector2 | null>(null)

  useEffect(() => {
    function markActivity(now = Date.now()) {
      lastActivityAtRef.current = now
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldPreventDefaultForKey(event.code)) {
        event.preventDefault()
      }
      markActivity()
      keyStateRef.current.add(event.code)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (shouldPreventDefaultForKey(event.code)) {
        event.preventDefault()
      }
      markActivity()
      keyStateRef.current.delete(event.code)
    }

    function handleBlur() {
      // フォーカス外れ後は入力の継続判定を捨て、復帰時に押しっぱなし扱いを残しません。
      keyStateRef.current.clear()
      mouseButtonsRef.current.left = false
      mouseButtonsRef.current.right = false
      queuedMousePressRef.current.left = false
      queuedMousePressRef.current.right = false
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
    function markActivity(now = Date.now()) {
      lastActivityAtRef.current = now
    }

    function syncMouseButtonsFromMask(buttons: number) {
      const nextLeft = (buttons & 1) !== 0
      const nextRight = (buttons & 2) !== 0

      // 複数ボタン同時押しでは event.button が環境依存で落ちることがあるため、
      // buttons bitmask の遷移を押下 edge として扱います。
      if (nextLeft && !mouseButtonsRef.current.left) {
        queuedMousePressRef.current.left = true
      }
      if (nextRight && !mouseButtonsRef.current.right) {
        queuedMousePressRef.current.right = true
      }
      mouseButtonsRef.current.left = nextLeft
      mouseButtonsRef.current.right = nextRight
    }

    function queueMouseButtonPress(button: number) {
      if (button === 0) {
        queuedMousePressRef.current.left = true
        mouseButtonsRef.current.left = true
      }
      if (button === 2) {
        queuedMousePressRef.current.right = true
        mouseButtonsRef.current.right = true
      }
    }

    function handleMouseDown(event: MouseEvent) {
      markActivity()
      if (event.buttons > 0) {
        syncMouseButtonsFromMask(event.buttons)
      } else {
        queueMouseButtonPress(event.button)
      }
    }

    function handleMouseUp(event: MouseEvent) {
      markActivity()
      syncMouseButtonsFromMask(event.buttons)
    }

    function handleMouseMove(event: MouseEvent) {
      if (event.buttons > 0) {
        markActivity()
      }
      syncMouseButtonsFromMask(event.buttons)
    }

    function handlePointerDown(event: PointerEvent) {
      if (isDuplicatePointerPress(event, lastPointerPressRef.current)) {
        return
      }
      markActivity()
      lastPointerPressRef.current = {
        pointerId: event.pointerId,
        button: event.button,
        timeStamp: event.timeStamp,
      }
      if (event.buttons > 0) {
        syncMouseButtonsFromMask(event.buttons)
      } else {
        queueMouseButtonPress(event.button)
      }
    }

    function handlePointerUp(event: PointerEvent) {
      markActivity()
      syncMouseButtonsFromMask(event.buttons)
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.buttons > 0) {
        markActivity()
      }
      syncMouseButtonsFromMask(event.buttons)
    }

    function handlePointerCancel(event: PointerEvent) {
      markActivity()
      syncMouseButtonsFromMask(event.buttons)
    }

    function handleContextMenu(event: MouseEvent) {
      event.preventDefault()
    }

    const supportsPointerEvents = "PointerEvent" in window
    if (supportsPointerEvents) {
      // pointer event を正経路にし、mouse event は pointer 非対応環境だけの fallback にします。
      window.addEventListener("pointerdown", handlePointerDown, true)
      window.addEventListener("pointermove", handlePointerMove, true)
      window.addEventListener("pointerup", handlePointerUp, true)
      window.addEventListener("pointercancel", handlePointerCancel, true)
    } else {
      window.addEventListener("mousedown", handleMouseDown, true)
      window.addEventListener("mousemove", handleMouseMove, true)
      window.addEventListener("mouseup", handleMouseUp, true)
    }
    window.addEventListener("contextmenu", handleContextMenu, true)

    return () => {
      if (supportsPointerEvents) {
        window.removeEventListener("pointerdown", handlePointerDown, true)
        window.removeEventListener("pointermove", handlePointerMove, true)
        window.removeEventListener("pointerup", handlePointerUp, true)
        window.removeEventListener("pointercancel", handlePointerCancel, true)
      } else {
        window.removeEventListener("mousedown", handleMouseDown, true)
        window.removeEventListener("mousemove", handleMouseMove, true)
        window.removeEventListener("mouseup", handleMouseUp, true)
      }
      window.removeEventListener("contextmenu", handleContextMenu, true)
    }
  }, [])

  return {
    getLastActivityAt(): number {
      return lastActivityAtRef.current
    },
    markActivity(now = Date.now()): void {
      lastActivityAtRef.current = now
    },
    hasActiveInput(): boolean {
      return keyStateRef.current.size > 0 || mouseButtonsRef.current.left || mouseButtonsRef.current.right
    },
    get mouseButtons(): MouseButtons {
      return mouseButtonsRef.current
    },
    readMovementVector(settings: SettingsRow): Vector2 {
      return readMovementVector(settings, keyStateRef.current)
    },
    readExploreMovementVector(settings: SettingsRow, currentPosition: Vector2): Vector2 {
      const keyboardMove = readMovementVector(settings, keyStateRef.current)
      if (keyboardMove.x !== 0 || keyboardMove.y !== 0) {
        // 手動移動が入ったらクリック移動を中断し、意図しない再追従を残しません。
        exploreMoveTargetRef.current = null
        return keyboardMove
      }

      const target = exploreMoveTargetRef.current
      if (!target) {
        return ZERO_VECTOR
      }

      const dx = target.x - currentPosition.x
      const dy = target.y - currentPosition.y
      const distance = Math.hypot(dx, dy)
      if (distance <= EXPLORE_CLICK_MOVE_STOP_DISTANCE) {
        exploreMoveTargetRef.current = null
        return ZERO_VECTOR
      }

      return {
        x: dx / distance,
        y: dy / distance,
      }
    },
    setExploreMoveTarget(target: Vector2 | null): void {
      exploreMoveTargetRef.current = target
    },
    consumePrimaryMousePress(): void {
      queuedMousePressRef.current.left = false
      previousMouseButtonsRef.current.left = mouseButtonsRef.current.left
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
    isScanPressed(settings: SettingsRow): boolean {
      // scan は任意タイミングで 1 回だけ出す操作なので、押下の立ち上がりだけを拾います。
      return isJustPressedAny(
        [settings.keybindings.scan, ...SCAN_FALLBACK_CODES],
        keyStateRef.current,
        previousButtonsRef.current,
      )
    },
    isPrimaryMouseJustPressed(): boolean {
      const queuedPress = queuedMousePressRef.current.left
      queuedMousePressRef.current.left = false
      const currentlyPressed = mouseButtonsRef.current.left
      const wasPressed = previousMouseButtonsRef.current.left
      previousMouseButtonsRef.current.left = currentlyPressed
      return queuedPress || (currentlyPressed && !wasPressed)
    },
    isSecondaryMouseJustPressed(): boolean {
      // 探索では副ボタンを scan に使うため、左クリックとは独立した edge を持ちます。
      const queuedPress = queuedMousePressRef.current.right
      queuedMousePressRef.current.right = false
      const currentlyPressed = mouseButtonsRef.current.right
      const wasPressed = previousMouseButtonsRef.current.right
      previousMouseButtonsRef.current.right = currentlyPressed
      return queuedPress || (currentlyPressed && !wasPressed)
    },
    syncButtonEdges(settings: SettingsRow): void {
      syncButtonEdges(settings, keyStateRef.current, previousButtonsRef.current)
      queuedMousePressRef.current.left = false
      queuedMousePressRef.current.right = false
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
    ...SCAN_FALLBACK_CODES,
  ])

  for (const code of trackedCodes) {
    previousButtons[code] = keyState.has(code)
  }
}

function uniqueCodes(codes: Array<string | undefined>): string[] {
  return Array.from(new Set(codes.filter((code): code is string => Boolean(code))))
}

function isDuplicatePointerPress(event: PointerEvent, previous: PointerPressStamp | null): boolean {
  if (!previous) {
    return false
  }

  return (
    previous.pointerId === event.pointerId &&
    previous.button === event.button &&
    previous.timeStamp === event.timeStamp
  )
}

function shouldPreventDefaultForKey(code: string): boolean {
  return [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Enter",
    "NumpadEnter",
    "Space",
  ].includes(code)
}

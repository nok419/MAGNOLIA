import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import { ActionButton } from "@/components/ActionButton"
import { ScrambleText } from "@/components/common"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import { useMenuNavigation } from "@/hooks/useMenuNavigation"
import { TITLE_UI_SOUND_VOLUME } from "@/audio"
import type { ScrambleOptions } from "@/hooks/useScrambleText"
import type { SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
import type { DisplayOptions } from "@/app/display-options"

type TitleScreenProps = {
  slots: SaveSlotSummary[]
  slotSelectMode: SlotSelectMode | null
  onOpenSlotSelect: (mode: SlotSelectMode) => void
  onCloseSlotSelect: () => void
  onConfirmSlot: (slotId: 1 | 2 | 3) => void
  onStartDebugMode: () => void
  onOpenSettings: () => void
  displayOptions: DisplayOptions
}

type MenuEntry = {
  label: string
  tone: "primary" | "ghost" | "danger"
  disabled: boolean
  action: () => void
}

type TitleRipple = {
  id: number
  x: number
  y: number
}

const TITLE_LINE_SCRAMBLE_OPTIONS: ScrambleOptions = {
  activeGlyphCount: 3,
  randomizeStartFrames: true,
  framesPerGlyph: 104,
  maxFrames: 170,
  shuffleProbability: 0.16,
}

const TITLE_MENU_SCRAMBLE_OPTIONS: ScrambleOptions = {
  activeGlyphCount: 1,
  randomizeStartFrames: true,
  framesPerGlyph: 84,
  maxFrames: 132,
  shuffleProbability: 0.14,
}

const TITLE_SLOT_SCRAMBLE_OPTIONS: ScrambleOptions = {
  activeGlyphCount: 2,
  randomizeStartFrames: true,
  framesPerGlyph: 92,
  maxFrames: 150,
  shuffleProbability: 0.15,
}

export function TitleScreen({
  slots,
  slotSelectMode,
  onOpenSlotSelect,
  onCloseSlotSelect,
  onConfirmSlot,
  onStartDebugMode,
  onOpenSettings,
  displayOptions,
}: TitleScreenProps) {
  const hasUsedSlot = slots.some((slot) => !slot.isEmpty)
  const [departing, setDeparting] = useState(false)
  const [ripples, setRipples] = useState<TitleRipple[]>([])
  const rippleIdRef = useRef(0)
  const menuButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const slotButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const titleScrambleTrigger = useSparseScrambleTrigger({
    minMs: 18000,
    maxMs: 32000,
    enabled: !displayOptions.reduceFlashing,
  })
  const eyebrowScrambleTrigger = useSparseScrambleTrigger({
    minMs: 22000,
    maxMs: 42000,
    enabled: !displayOptions.reduceFlashing,
  })
  const slotScrambleTrigger = useSparseScrambleTrigger({
    minMs: 21000,
    maxMs: 39000,
    enabled: !displayOptions.reduceFlashing,
  })
  const menuScrambleTrigger = useSparseScrambleTrigger({
    minMs: 36000,
    maxMs: 66000,
    enabled: !displayOptions.reduceFlashing,
  })

  const phase: "title" | "slotSelect" = slotSelectMode ? "slotSelect" : "title"

  const menuItems: MenuEntry[] = [
    { label: "new game", tone: "primary", disabled: false, action: () => onOpenSlotSelect("newGame") },
    { label: "continue", tone: "ghost", disabled: !hasUsedSlot, action: () => onOpenSlotSelect("continue") },
    { label: "option", tone: "ghost", disabled: false, action: onOpenSettings },
    {
      label: "debug mode",
      tone: "ghost",
      disabled: false,
      action: () => {
        // debug mode は slot 選択を経由しないため、ここで title 離脱状態へ切り替えます。
        setDeparting(true)
        onStartDebugMode()
      },
    },
  ]
  const enabledMenuItems = menuItems.filter((item) => !item.disabled)
  const enabledToFullIndex = enabledMenuItems.map((item) => menuItems.indexOf(item))

  const enabledSlots = slotSelectMode
    ? slots.filter((slot) => !(slotSelectMode === "continue" && slot.isEmpty))
    : []

  const isSlotPhase = phase === "slotSelect"
  const navCount = departing ? 0 : (isSlotPhase ? enabledSlots.length : enabledMenuItems.length)
  const emitRipple = useCallback((point: { x: number; y: number }) => {
    const id = rippleIdRef.current + 1
    rippleIdRef.current = id
    setRipples((current) => [...current.slice(-5), { id, x: point.x, y: point.y }])
  }, [])

  const emitRippleFromElement = useCallback((element: HTMLElement | null) => {
    if (!element) return
    const screen = element.closest(".title-screen")
    if (!(screen instanceof HTMLElement)) return
    const screenRect = screen.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    emitRipple({
      x: elementRect.left - screenRect.left + elementRect.width / 2,
      y: elementRect.top - screenRect.top + elementRect.height / 2,
    })
  }, [emitRipple])

  const handleTitlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (departing) return
    const rect = event.currentTarget.getBoundingClientRect()
    emitRipple({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }, [departing, emitRipple])

  const handleSelect = useCallback(
    (idx: number) => {
      if (departing) return
      if (isSlotPhase) {
        const slot = enabledSlots[idx]
        if (!slot) return
        emitRippleFromElement(slotButtonRefs.current[slot.slotId] ?? null)
        setDeparting(true)
        onConfirmSlot(slot.slotId)
        return
      }

      const fullIdx = enabledToFullIndex[idx]
      if (fullIdx !== undefined) {
        emitRippleFromElement(menuButtonRefs.current[fullIdx] ?? null)
        menuItems[fullIdx]?.action()
      }
    },
    [departing, emitRippleFromElement, enabledSlots, enabledToFullIndex, isSlotPhase, menuItems, onConfirmSlot],
  )

  const handleCancel = useCallback(() => {
    if (isSlotPhase && !departing) {
      onCloseSlotSelect()
    }
  }, [departing, isSlotPhase, onCloseSlotSelect])

  const { focusIndex, setFocusIndex } = useMenuNavigation({
    itemCount: navCount,
    onSelect: handleSelect,
    onCancel: isSlotPhase ? handleCancel : undefined,
    soundVolume: TITLE_UI_SOUND_VOLUME,
  })

  useEffect(() => {
    setFocusIndex(0)
  }, [phase, setFocusIndex])

  const focusedFullIndex = !isSlotPhase ? (enabledToFullIndex[focusIndex] ?? -1) : -1
  const focusedSlotId = isSlotPhase ? (enabledSlots[focusIndex]?.slotId ?? null) : null

  return (
    <main
      className={`title-screen ${departing ? "title-screen--departing" : ""}`}
      onPointerDown={handleTitlePointerDown}
    >
      <SignalBackdropCanvas displayOptions={displayOptions} />
      <div className="title-screen__backdrop" />
      <div className="title-click-ripples" aria-hidden="true">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="title-click-ripple"
            style={{
              ["--title-ripple-x" as keyof CSSProperties]: `${ripple.x}px`,
              ["--title-ripple-y" as keyof CSSProperties]: `${ripple.y}px`,
            }}
            onAnimationEnd={() => {
              setRipples((current) => current.filter((item) => item.id !== ripple.id))
            }}
          />
        ))}
      </div>

      <section className="title-screen__panel">
        <p className="title-screen__eyebrow">
          <ScrambleText
            text="transmission system"
            trigger={`eyebrow:${eyebrowScrambleTrigger}`}
            reduceFlashing={displayOptions.reduceFlashing}
            options={TITLE_LINE_SCRAMBLE_OPTIONS}
          />
        </p>
        <MagnoliaLogo
          scrambleTrigger={titleScrambleTrigger}
          reduceFlashing={displayOptions.reduceFlashing}
        />

        <div className="title-phases">
          <div className={`title-phase ${phase === "title" ? "title-phase--active" : ""}`}>
            <p className="title-screen__summary">
              <ScrambleText
                text="signal in the haze"
                trigger={`${phase}:${titleScrambleTrigger}`}
                reduceFlashing={displayOptions.reduceFlashing}
                options={TITLE_LINE_SCRAMBLE_OPTIONS}
              />
            </p>
            <nav className="title-screen__actions">
              {menuItems.map((item, i) => (
                <ActionButton
                  key={item.label}
                  ref={(node) => {
                    menuButtonRefs.current[i] = node
                  }}
                  tone={item.tone}
                  disabled={item.disabled}
                  data-focused={i === focusedFullIndex ? "" : undefined}
                  onClick={item.action}
                >
                  {i === focusedFullIndex && !item.disabled ? "▸ " : "  "}
                  <ScrambleText
                    text={item.label}
                    trigger={`${item.label}:${menuScrambleTrigger}`}
                    reduceFlashing={displayOptions.reduceFlashing}
                    options={TITLE_MENU_SCRAMBLE_OPTIONS}
                  />
                </ActionButton>
              ))}
            </nav>
          </div>

          <div className={`title-phase ${phase === "slotSelect" ? "title-phase--active" : ""}`}>
            <p className="title-screen__summary">
              <ScrambleText
                text={
                  slotSelectMode === "newGame"
                    ? "select save slot to initialize"
                    : "select data to resume"
                }
                trigger={`${phase}:${slotSelectMode ?? ""}:${slotScrambleTrigger}`}
                reduceFlashing={displayOptions.reduceFlashing}
                options={TITLE_LINE_SCRAMBLE_OPTIONS}
              />
            </p>
            <div className="title-slots">
              {slots.map((slot) => {
                const disabled = slotSelectMode === "continue" && slot.isEmpty
                const focused = slot.slotId === focusedSlotId && !disabled
                const active = !slot.isEmpty
                return (
                  <button
                    key={slot.slotId}
                    ref={(node) => {
                      slotButtonRefs.current[slot.slotId] = node
                    }}
                    type="button"
                    className={[
                      "title-slot",
                      focused ? "title-slot--focused" : "",
                      active ? "title-slot--active" : "",
                    ].join(" ")}
                    disabled={disabled}
                    onClick={() => {
                      if (departing) return
                      setDeparting(true)
                      onConfirmSlot(slot.slotId)
                    }}
                  >
                    <span className="title-slot__number">
                      {String(slot.slotId).padStart(2, "0")}
                    </span>
                    <div className="title-slot__content">
                      <div className="title-slot__header">
                        <span className="title-slot__label">
                          <ScrambleText
                            text={slot.label}
                            trigger={`slot-label:${slot.slotId}:${slotScrambleTrigger}`}
                            reduceFlashing={displayOptions.reduceFlashing}
                            options={TITLE_SLOT_SCRAMBLE_OPTIONS}
                          />
                        </span>
                        <span className={`title-slot__status ${active ? "title-slot__status--active" : ""}`}>
                          {active ? "active" : "empty"}
                        </span>
                      </div>
                      <strong className="title-slot__area">
                        <ScrambleText
                          text={slot.currentAreaName ?? "新規データ"}
                          trigger={`slot-area:${slot.slotId}:${slotScrambleTrigger}`}
                          reduceFlashing={displayOptions.reduceFlashing}
                          options={TITLE_SLOT_SCRAMBLE_OPTIONS}
                        />
                      </strong>
                      <div className="title-slot__meta">
                        <span>{slot.updatedAt ?? "未使用"}</span>
                        <span>{slot.playTimeLabel}</span>
                      </div>
                    </div>
                    <span className="title-slot__bracket title-slot__bracket--tl" />
                    <span className="title-slot__bracket title-slot__bracket--br" />
                  </button>
                )
              })}
            </div>
            <ActionButton tone="ghost" onClick={onCloseSlotSelect}>
              back
            </ActionButton>
          </div>
        </div>
      </section>

      <div className={`title-curtain ${departing ? "title-curtain--active" : ""}`} />
    </main>
  )
}

function useSparseScrambleTrigger(input: {
  minMs: number
  maxMs: number
  enabled: boolean
}): number {
  const [trigger, setTrigger] = useState(0)

  useEffect(() => {
    if (!input.enabled) {
      return undefined
    }

    let timerId = 0
    const scheduleNext = () => {
      const delay = input.minMs + Math.random() * Math.max(0, input.maxMs - input.minMs)
      timerId = window.setTimeout(() => {
        setTrigger((value) => value + 1)
        scheduleNext()
      }, delay)
    }

    // 一定間隔にしないことで、UI が時計のように見えるのを避けます。
    scheduleNext()
    return () => window.clearTimeout(timerId)
  }, [input.enabled, input.maxMs, input.minMs])

  return trigger
}

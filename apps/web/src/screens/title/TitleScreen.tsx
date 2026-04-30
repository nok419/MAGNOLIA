import { useCallback, useEffect, useState } from "react"
import { ActionButton } from "@/components/ActionButton"
import { ScrambleText } from "@/components/common"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import { useMenuNavigation } from "@/hooks/useMenuNavigation"
import type { SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
import type { DisplayOptions } from "@/app/display-options"

type TitleScreenProps = {
  slots: SaveSlotSummary[]
  slotSelectMode: SlotSelectMode | null
  onOpenSlotSelect: (mode: SlotSelectMode) => void
  onCloseSlotSelect: () => void
  onConfirmSlot: (slotId: 1 | 2 | 3) => void
  onOpenSettings: () => void
  displayOptions: DisplayOptions
}

type MenuEntry = {
  label: string
  tone: "primary" | "ghost" | "danger"
  disabled: boolean
  action: () => void
}

export function TitleScreen({
  slots,
  slotSelectMode,
  onOpenSlotSelect,
  onCloseSlotSelect,
  onConfirmSlot,
  onOpenSettings,
  displayOptions,
}: TitleScreenProps) {
  const hasUsedSlot = slots.some((slot) => !slot.isEmpty)
  const [departing, setDeparting] = useState(false)

  const phase: "title" | "slotSelect" = slotSelectMode ? "slotSelect" : "title"

  const menuItems: MenuEntry[] = [
    { label: "new game", tone: "primary", disabled: false, action: () => onOpenSlotSelect("newGame") },
    { label: "continue", tone: "ghost", disabled: !hasUsedSlot, action: () => onOpenSlotSelect("continue") },
    { label: "option", tone: "ghost", disabled: false, action: onOpenSettings },
    { label: "exit", tone: "danger", disabled: true, action: () => {} },
  ]
  const enabledMenuItems = menuItems.filter((item) => !item.disabled)
  const enabledToFullIndex = enabledMenuItems.map((item) => menuItems.indexOf(item))

  const enabledSlots = slotSelectMode
    ? slots.filter((slot) => !(slotSelectMode === "continue" && slot.isEmpty))
    : []

  const isSlotPhase = phase === "slotSelect"
  const navCount = departing ? 0 : (isSlotPhase ? enabledSlots.length : enabledMenuItems.length)

  const handleSelect = useCallback(
    (idx: number) => {
      if (departing) return
      if (isSlotPhase) {
        const slot = enabledSlots[idx]
        if (!slot) return
        setDeparting(true)
        onConfirmSlot(slot.slotId)
        return
      }

      const fullIdx = enabledToFullIndex[idx]
      if (fullIdx !== undefined) {
        menuItems[fullIdx]?.action()
      }
    },
    [departing, enabledSlots, enabledToFullIndex, isSlotPhase, menuItems, onConfirmSlot],
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
  })

  useEffect(() => {
    setFocusIndex(0)
  }, [phase, setFocusIndex])

  const focusedFullIndex = !isSlotPhase ? (enabledToFullIndex[focusIndex] ?? -1) : -1
  const focusedSlotId = isSlotPhase ? (enabledSlots[focusIndex]?.slotId ?? null) : null

  return (
    <main className={`title-screen ${departing ? "title-screen--departing" : ""}`}>
      <SignalBackdropCanvas displayOptions={displayOptions} />
      <div className="title-screen__backdrop" />

      <section className="title-screen__panel">
        <p className="title-screen__eyebrow">
          <ScrambleText
            text="transmission system"
            reduceFlashing={displayOptions.reduceFlashing}
          />
        </p>
        <MagnoliaLogo />

        <div className="title-phases">
          <div className={`title-phase ${phase === "title" ? "title-phase--active" : ""}`}>
            <p className="title-screen__summary">
              <ScrambleText
                text="signal in the haze"
                trigger={phase}
                reduceFlashing={displayOptions.reduceFlashing}
              />
            </p>
            <nav className="title-screen__actions">
              {menuItems.map((item, i) => (
                <ActionButton
                  key={item.label}
                  tone={item.tone}
                  disabled={item.disabled}
                  data-focused={i === focusedFullIndex ? "" : undefined}
                  onClick={item.action}
                >
                  {i === focusedFullIndex && !item.disabled ? "▸ " : "  "}
                  {item.label}
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
                trigger={`${phase}:${slotSelectMode ?? ""}`}
                reduceFlashing={displayOptions.reduceFlashing}
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
                        <span className="title-slot__label">{slot.label}</span>
                        <span className={`title-slot__status ${active ? "title-slot__status--active" : ""}`}>
                          {active ? "active" : "empty"}
                        </span>
                      </div>
                      <strong className="title-slot__area">
                        {slot.currentAreaName ?? "新規データ"}
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

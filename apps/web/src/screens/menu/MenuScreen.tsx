import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import type {
  ArchiveViewModel,
  ContentBundle,
  EquipmentPanelViewModel,
  MenuViewModel,
  SaveSlotId,
  SaveSlotRow,
  SettingsRow,
  ShipVariant,
} from "@magnolia/contracts"
import { KeyVisualModal } from "@/components/KeyVisualModal"
import { audioEvents } from "@/audio"
import type { DisplayOptions } from "@/app/display-options"
import { ArchivePanel } from "@/screens/menu/ArchivePanel"
import { EquipmentPanel } from "@/screens/menu/EquipmentPanel"
import { MenuBackdropCanvas } from "@/screens/menu/MenuBackdropCanvas"
import { SettingsPanel } from "@/screens/menu/SettingsPanel"
import type { EquipmentCategoryKey } from "@/screens/menu/equipment-category"

type MenuTab = "equipment" | "archive" | "settings"

type MenuScreenProps = {
  menuViewModel: MenuViewModel
  content: ContentBundle
  equipmentViewModel?: EquipmentPanelViewModel
  archiveViewModel?: ArchiveViewModel
  settings: SettingsRow
  saveSlots: SaveSlotRow[]
  initialTab?: MenuTab
  unseenEquipmentIds: string[]
  equipmentGuideTargetId?: string | null
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
  onEquip: (equipmentId: string, slot: string, subsystemIndex?: 0 | 1) => void
  onUnequip: (equipmentId: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (equipmentId: string) => void
  onUpgrade: (equipmentId: string) => void
  onSelectTransmission: (areaId: string, transmissionId: string) => void
  onSetVolume: (channel: keyof SettingsRow["volumes"], value: SettingsRow["volumes"][keyof SettingsRow["volumes"]]) => void
  onSetDifficulty: (difficulty: SettingsRow["difficulty"]) => void
  onToggleSwitch: (path: "reduceFlashing" | "lowFrameRateMode", value: boolean) => void
  onSetShipVariant: (variant: ShipVariant) => void
  onSaveCurrent: () => void
  onSaveToSlot: (slotId: SaveSlotId) => void
  onReturnToTitle: () => void
  onBack: () => void
  displayOptions: DisplayOptions
}

type MenuClickGlitch = {
  id: number
  x: number
  y: number
}

export function MenuScreen({
  menuViewModel,
  content,
  equipmentViewModel,
  archiveViewModel,
  settings,
  saveSlots,
  initialTab,
  unseenEquipmentIds,
  equipmentGuideTargetId,
  onMarkEquipmentSeen,
  onEquip,
  onUnequip,
  onPurchase,
  onUpgrade,
  onSelectTransmission,
  onSetVolume,
  onSetDifficulty,
  onToggleSwitch,
  onSetShipVariant,
  onSaveCurrent,
  onSaveToSlot,
  onReturnToTitle,
  onBack,
  displayOptions,
}: MenuScreenProps) {
  // この画面は UI 合成だけを担当し、装備判定や保存判定は props で受け取った結果をそのまま使います。
  const availableTabModels = menuViewModel.tabs.filter((tab) => tab.available)
  const tabs = availableTabModels.map((tab) => tab.tab)

  const defaultTab = initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]
  const [activeTab, setActiveTab] = useState<MenuTab>(defaultTab)
  const [selectedCategory, setSelectedCategory] = useState<EquipmentCategoryKey>("main")
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  // key visual
  const [keyVisualVariant, setKeyVisualVariant] = useState<"fullscreen" | "windowed" | null>(null)
  const [clickGlitches, setClickGlitches] = useState<MenuClickGlitch[]>([])
  const clickGlitchIdRef = useRef(0)

  const emitClickGlitch = useCallback((point: { x: number; y: number }) => {
    const id = clickGlitchIdRef.current + 1
    clickGlitchIdRef.current = id
    setClickGlitches((current) => [...current.slice(-7), { id, x: point.x, y: point.y }])
  }, [])

  const handleMenuPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || keyVisualVariant) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    emitClickGlitch({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }, [emitClickGlitch, keyVisualVariant])

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    if (activeTab !== "equipment" || !equipmentViewModel || !equipmentGuideTargetId) {
      return
    }
    const guidedEquipment = equipmentViewModel.catalog.items.find(
      (item) => item.equipmentId === equipmentGuideTargetId,
    )
    const guidedCategory = guidedEquipment
      ? readGuideCategoryForSlot(guidedEquipment.slot)
      : null
    if (!guidedCategory) {
      return
    }

    // E 起点の初回ガイドでは、選択状態そのものを目的の経路へ寄せます。
    // 手動で探させず、os カテゴリ、MAGNOLIA、装備ボタンが同時に視界へ入るようにします。
    setSelectedCategory(guidedCategory)
    setSelectedEquipmentId(equipmentGuideTargetId)
  }, [activeTab, equipmentGuideTargetId, equipmentViewModel])

  const handleSelectTab = useCallback((tab: MenuTab) => {
    if (tab !== activeTab) {
      // MenuScreen 内のタブ切替は session screen を変えないため、装備 panel を開く音はここで鳴らします。
      if (tab === "equipment") {
        audioEvents.equipmentPanelOpen()
      } else {
        audioEvents.equipmentArchiveCategorySelect()
      }
    }
    setActiveTab(tab)
  }, [activeTab])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (keyVisualVariant) {
        return
      }
      if (event.repeat) {
        return
      }
      if (event.code === "Escape" || (activeTab === "equipment" && event.code === "KeyE")) {
        event.preventDefault()
        onBack()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [keyVisualVariant, activeTab, onBack])

  return (
    <main className="menu-screen" onPointerDown={handleMenuPointerDown}>
      <MenuBackdropCanvas displayOptions={displayOptions} />
      <div className="menu-click-glitches" aria-hidden="true">
        {clickGlitches.map((glitch) => (
          <span
            key={glitch.id}
            className="menu-click-glitch"
            style={{
              ["--menu-click-glitch-x" as keyof CSSProperties]: `${glitch.x}px`,
              ["--menu-click-glitch-y" as keyof CSSProperties]: `${glitch.y}px`,
            }}
            onAnimationEnd={() => {
              setClickGlitches((current) => current.filter((item) => item.id !== glitch.id))
            }}
          />
        ))}
      </div>

      {/* tab bar */}
      <nav className="menu-tabs" role="tablist" aria-label="menu sections">
        {availableTabModels.map((tabModel) => {
          const tab = tabModel.tab
          const tabClassName = [
            "menu-tab",
            `menu-tab--${tab}`,
            activeTab === tab ? "menu-tab--active" : "",
          ].filter(Boolean).join(" ")
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={tabClassName}
              onClick={() => handleSelectTab(tab)}
            >
              {tab}
              {tabModel.badgeCount > 0 ? <span className="menu-tab__badge">{tabModel.badgeCount}</span> : null}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <button type="button" className="menu-tab menu-tab--back" onClick={onBack}>
          esc: close
        </button>
      </nav>

      {/* tab content */}
      <div className="menu-content">
        {activeTab === "equipment" && equipmentViewModel ? (
          <EquipmentPanel
            viewModel={equipmentViewModel}
            selectedCategory={selectedCategory}
            selectedEquipmentId={selectedEquipmentId}
            onSelectCategory={setSelectedCategory}
            onSelectEquipment={setSelectedEquipmentId}
            onEquip={onEquip}
            onUnequip={onUnequip}
            onPurchase={onPurchase}
            onUpgrade={onUpgrade}
            shipVariant={settings.shipVariant}
            onSelectShipVariant={onSetShipVariant}
            unseenEquipmentIds={unseenEquipmentIds}
            onMarkEquipmentSeen={onMarkEquipmentSeen}
          />
        ) : activeTab === "archive" && archiveViewModel ? (
          <ArchivePanel
            viewModel={archiveViewModel}
            onSelectTransmission={onSelectTransmission}
          />
        ) : (
          <SettingsPanel
            settings={settings}
            saveSlots={saveSlots}
            canSave={menuViewModel.canSave}
            onOpenKeyVisual={(variant) => setKeyVisualVariant(variant)}
            onSetVolume={onSetVolume}
            onSetDifficulty={onSetDifficulty}
            onToggleSwitch={onToggleSwitch}
            onSaveCurrent={onSaveCurrent}
            onSaveToSlot={onSaveToSlot}
            onReturnToTitle={onReturnToTitle}
          />
        )}
      </div>
      {keyVisualVariant && (
        <KeyVisualModal
          variant={keyVisualVariant}
          onClose={() => setKeyVisualVariant(null)}
          displayOptions={displayOptions}
          content={content}
        />
      )}
    </main>
  )
}

function readGuideCategoryForSlot(
  slot: EquipmentPanelViewModel["catalog"]["items"][number]["slot"],
): EquipmentCategoryKey | null {
  if (slot === "main" || slot === "sub" || slot === "os") {
    return slot
  }
  if (slot === "subsystem") {
    return "subsystem1"
  }
  return null
}

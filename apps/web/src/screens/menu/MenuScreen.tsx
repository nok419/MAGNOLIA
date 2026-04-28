import { useEffect, useState } from "react"
import type {
  ArchiveAccessState,
  ContentBundle,
  EquipmentSlot,
  FeatureAccessState,
  ProfileAggregate,
  SaveSlotId,
  SaveSlotRow,
  SettingsRow,
  ShipVariant,
} from "@magnolia/contracts"
import { KeyVisualModal } from "@/components/KeyVisualModal"
import type { DisplayOptions } from "@/app/display-options"
import { ArchivePanel } from "@/screens/menu/ArchivePanel"
import { EquipmentPanel } from "@/screens/menu/EquipmentPanel"
import { MenuBackdropCanvas } from "@/screens/menu/MenuBackdropCanvas"
import { SettingsPanel } from "@/screens/menu/SettingsPanel"

type MenuTab = "equipment" | "archive" | "settings"

type MenuScreenProps = {
  content: ContentBundle
  profile: ProfileAggregate | null
  settings: SettingsRow
  saveSlots: SaveSlotRow[]
  featureAccess: FeatureAccessState
  archiveAccess?: ArchiveAccessState
  selectedTransmissionId?: string
  initialTab?: MenuTab
  unseenEquipmentIds: string[]
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
  onEquip: (equipmentId: string, slot: string, subsystemIndex?: 0 | 1) => void
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

export function MenuScreen({
  content,
  profile,
  settings,
  saveSlots,
  featureAccess,
  archiveAccess,
  selectedTransmissionId,
  initialTab,
  unseenEquipmentIds,
  onMarkEquipmentSeen,
  onEquip,
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
  const hasEquipment = Boolean(profile) && featureAccess.canOpenEquipment
  const hasArchive = Boolean(profile) && featureAccess.canOpenArchive

  const tabs: MenuTab[] = []
  if (hasEquipment) tabs.push("equipment")
  if (hasArchive) tabs.push("archive")
  tabs.push("settings")

  const defaultTab = initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]
  const [activeTab, setActiveTab] = useState<MenuTab>(defaultTab)
  const [selectedCategory, setSelectedCategory] = useState<EquipmentSlot>("main")
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  // key visual
  const [keyVisualVariant, setKeyVisualVariant] = useState<"fullscreen" | "windowed" | null>(null)

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

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
    <main className="menu-screen">
      <MenuBackdropCanvas displayOptions={displayOptions} />

      {/* tab bar */}
      <nav className="menu-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`menu-tab ${activeTab === tab ? "menu-tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="menu-tab menu-tab--back" onClick={onBack}>
          esc: close
        </button>
      </nav>

      {/* tab content */}
      <div className="menu-content">
        {activeTab === "equipment" && profile ? (
          <EquipmentPanel
            content={content}
            profile={profile}
            selectedCategory={selectedCategory}
            selectedEquipmentId={selectedEquipmentId}
            onSelectCategory={setSelectedCategory}
            onSelectEquipment={setSelectedEquipmentId}
            onEquip={onEquip}
            onPurchase={onPurchase}
            onUpgrade={onUpgrade}
            shipVariant={settings.shipVariant}
            onSelectShipVariant={onSetShipVariant}
            unseenEquipmentIds={unseenEquipmentIds}
            onMarkEquipmentSeen={onMarkEquipmentSeen}
          />
        ) : activeTab === "archive" && profile && archiveAccess ? (
          <ArchivePanel
            areas={content.areas}
            transmissions={content.transmissions}
            profile={profile}
            archiveAccess={archiveAccess}
            selectedTransmissionId={selectedTransmissionId}
            onSelectTransmission={onSelectTransmission}
          />
        ) : (
          <SettingsPanel
            settings={settings}
            saveSlots={saveSlots}
            canSave={Boolean(profile)}
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
        />
      )}
    </main>
  )
}

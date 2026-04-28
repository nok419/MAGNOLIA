import type { ContentBundle, EquipmentSlot, ProfileAggregate, ShipVariant } from "@magnolia/contracts"
import { ShipStatusPanel } from "@/screens/menu/ShipStatusPanel"
import { EquipmentArcList } from "./EquipmentArcList"
import { EquipmentDetailPanel } from "./EquipmentDetailPanel"
import { SLOT_CATEGORIES, shouldMaskEquipmentInfo } from "./equipment-utils"

export function EquipmentPanel({
  content,
  profile,
  selectedCategory,
  selectedEquipmentId,
  onSelectCategory,
  onSelectEquipment,
  onEquip,
  onPurchase,
  onUpgrade,
  shipVariant,
  onSelectShipVariant,
  unseenEquipmentIds,
  onMarkEquipmentSeen,
}: {
  content: ContentBundle
  profile: ProfileAggregate
  selectedCategory: EquipmentSlot
  selectedEquipmentId: string | null
  onSelectCategory: (slot: EquipmentSlot) => void
  onSelectEquipment: (id: string | null) => void
  onEquip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (id: string) => void
  onUpgrade: (id: string) => void
  shipVariant: ShipVariant
  onSelectShipVariant: (variant: ShipVariant) => void
  unseenEquipmentIds: string[]
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
}) {
  const owned = new Set(profile.profile.ownedEquipmentIds)
  const equipped = profile.profile.equipped
  const filteredItems = Object.values(content.equipment).filter(
    (eq) => eq.slot === selectedCategory,
  )
  const unseenSet = new Set(unseenEquipmentIds)
  const unseenCountByCategory = countUnseenEquipmentByCategory(content, unseenEquipmentIds)

  const handleSelectEquipment = (id: string | null) => {
    // NEW 表示は選択した項目だけを確認済みにし、カテゴリの未確認数と同じ状態を見ます。
    if (id && unseenSet.has(id)) {
      onMarkEquipmentSeen([id])
    }
    onSelectEquipment(id)
  }

  const selected = selectedEquipmentId ? content.equipment[selectedEquipmentId] : undefined
  const isSelectedOwned = selectedEquipmentId ? owned.has(selectedEquipmentId) : false
  const isSelectedMasked = selected ? shouldMaskEquipmentInfo(selected, isSelectedOwned) : false
  const isSelectedEquipped = selectedEquipmentId
    ? equipped.main === selectedEquipmentId ||
      equipped.sub === selectedEquipmentId ||
      equipped.os === selectedEquipmentId ||
      equipped.subsystems.includes(selectedEquipmentId)
    : false
  const currentLevel = selectedEquipmentId
    ? profile.profile.equipmentLevels?.[selectedEquipmentId] ?? 0
    : 0
  const canUpgrade = Boolean(selected && isSelectedOwned && currentLevel < selected.maxLevel)

  return (
    <div className="equip-4col">
      <ShipStatusPanel
        content={content}
        profile={profile}
        selectedCategory={selectedCategory}
        onSelectCategory={(slot) => {
          onSelectCategory(slot)
          onSelectEquipment(null)
        }}
        shipVariant={shipVariant}
        onSelectShipVariant={onSelectShipVariant}
      />

      <div className="equip-categories">
        {SLOT_CATEGORIES.map((cat) => {
          const isActive = cat.key === selectedCategory
          const unseenCount = unseenCountByCategory.get(cat.key) ?? 0
          const hasUnseen = unseenCount > 0 && !isActive
          return (
            <button
              key={cat.key}
              type="button"
              className={`equip-cat ${isActive ? "equip-cat--active" : ""}${hasUnseen ? " equip-cat--has-new" : ""}`}
              onClick={() => {
                onSelectCategory(cat.key)
                onSelectEquipment(null)
              }}
            >
              <span className="equip-cat__label">
                {isActive ? "▸ " : ""}{cat.label}
              </span>
              {hasUnseen ? (
                <span className="equip-cat__new-badge" aria-label={`${unseenCount} 件の未確認装備`}>
                  NEW
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <EquipmentArcList
        items={filteredItems}
        owned={owned}
        equipped={equipped}
        selectedEquipmentId={selectedEquipmentId}
        onSelectEquipment={handleSelectEquipment}
        unseenEquipmentIds={unseenSet}
      />

      <EquipmentDetailPanel
        selected={selected}
        isSelectedOwned={isSelectedOwned}
        isSelectedMasked={isSelectedMasked}
        isSelectedEquipped={isSelectedEquipped}
        currentLevel={currentLevel}
        canUpgrade={canUpgrade}
        equipped={equipped}
        selfRepairPoints={profile.profile.selfRepairPoints}
        onEquip={onEquip}
        onPurchase={onPurchase}
        onUpgrade={onUpgrade}
      />
    </div>
  )
}

function countUnseenEquipmentByCategory(
  content: ContentBundle,
  unseenEquipmentIds: string[],
): Map<EquipmentSlot, number> {
  const unseenCountByCategory = new Map<EquipmentSlot, number>()
  for (const equipmentId of unseenEquipmentIds) {
    const equipment = content.equipment[equipmentId]
    if (!equipment) continue
    unseenCountByCategory.set(
      equipment.slot,
      (unseenCountByCategory.get(equipment.slot) ?? 0) + 1,
    )
  }
  return unseenCountByCategory
}

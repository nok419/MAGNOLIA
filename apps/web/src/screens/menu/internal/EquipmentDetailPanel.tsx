import type { EquipmentMaster, ProfileAggregate } from "@magnolia/contracts"
import { ActionButton } from "@/components/ActionButton"
import { ProcurementPanel } from "./ProcurementPanel"
import { equipmentIdFragment, resolveUpgradeCost } from "./equipment-utils"

export function EquipmentDetailPanel({
  selected,
  isSelectedOwned,
  isSelectedMasked,
  isSelectedEquipped,
  currentLevel,
  canUpgrade,
  equipped,
  selfRepairPoints,
  onEquip,
  onPurchase,
  onUpgrade,
}: {
  selected: EquipmentMaster | undefined
  isSelectedOwned: boolean
  isSelectedMasked: boolean
  isSelectedEquipped: boolean
  currentLevel: number
  canUpgrade: boolean
  equipped: ProfileAggregate["profile"]["equipped"]
  selfRepairPoints: number
  onEquip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (id: string) => void
  onUpgrade: (id: string) => void
}) {
  return (
    <div className="equip-detail">
      <div className="equip-detail__decorator equip-detail__decorator--tl" />
      <div className="equip-detail__decorator equip-detail__decorator--tr" />
      <div className="equip-detail__decorator equip-detail__decorator--bl" />
      <div className="equip-detail__decorator equip-detail__decorator--br" />
      <div className="equip-detail__scanline" aria-hidden="true" />
      <div className="equip-detail__edge" aria-hidden="true" />

      {selected ? (
        isSelectedMasked ? (
          <MaskedEquipmentDetail selected={selected} />
        ) : (
          <VisibleEquipmentDetail
            selected={selected}
            isSelectedOwned={isSelectedOwned}
            isSelectedEquipped={isSelectedEquipped}
            currentLevel={currentLevel}
            canUpgrade={canUpgrade}
            equipped={equipped}
            selfRepairPoints={selfRepairPoints}
            onEquip={onEquip}
            onPurchase={onPurchase}
            onUpgrade={onUpgrade}
          />
        )
      ) : (
        <div className="equip-empty-state fade-in">
          <div className="equip-empty-state__circle" />
          <p className="equip-empty-state__text">// AWAITING SELECTION</p>
        </div>
      )}
    </div>
  )
}

function MaskedEquipmentDetail({ selected }: { selected: EquipmentMaster }) {
  return (
    <div className="equip-detail__content fade-in">
      <header className="equip-detail__header">
        <span className="equip-detail__eyebrow">
          <span className="equip-detail__diamond">◇</span>
          catalog // undocumented
        </span>
        <span className="equip-detail__id">0x----</span>
      </header>
      <div className="equip-detail__rule" aria-hidden="true" />
      <h3 className="detail-title">???</h3>
      <div className="equip-detail__meta">
        <span className="equip-detail__slot-chip equip-detail__slot-chip--muted">
          {selected.slot}
        </span>
        <span className="equip-detail__level" aria-label="level locked">
          <span className="equip-detail__level-label">LV</span>
          <span className="equip-detail__level-dots">
            {Array.from({ length: Math.max(1, selected.maxLevel) }).map((_, idx) => (
              <span key={idx} className="equip-detail__level-dot" />
            ))}
          </span>
        </span>
      </div>
      <p className="muted-text equip-detail__desc">詳細不明</p>
      <p className="equip-detail__footer-note">// ENTRY.SEALED</p>
    </div>
  )
}

function VisibleEquipmentDetail({
  selected,
  isSelectedOwned,
  isSelectedEquipped,
  currentLevel,
  canUpgrade,
  equipped,
  selfRepairPoints,
  onEquip,
  onPurchase,
  onUpgrade,
}: {
  selected: EquipmentMaster
  isSelectedOwned: boolean
  isSelectedEquipped: boolean
  currentLevel: number
  canUpgrade: boolean
  equipped: ProfileAggregate["profile"]["equipped"]
  selfRepairPoints: number
  onEquip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (id: string) => void
  onUpgrade: (id: string) => void
}) {
  return (
    <div className="equip-detail__content fade-in">
      <header className="equip-detail__header">
        <span className="equip-detail__eyebrow">
          <span className="equip-detail__diamond">◇</span>
          catalog // {selected.slot}-class
        </span>
        <span className="equip-detail__id">0x{equipmentIdFragment(selected.equipmentId)}</span>
      </header>
      <div className="equip-detail__rule" aria-hidden="true" />
      <h3 className="detail-title">{selected.name}</h3>
      <div className="equip-detail__meta">
        <span className="equip-detail__slot-chip">{selected.slot}</span>
        <span
          className="equip-detail__level"
          aria-label={`level ${currentLevel} of ${selected.maxLevel}`}
        >
          <span className="equip-detail__level-label">LV</span>
          <span className="equip-detail__level-dots">
            {Array.from({ length: selected.maxLevel }).map((_, idx) => (
              <span
                key={idx}
                className={`equip-detail__level-dot${idx < currentLevel ? " equip-detail__level-dot--on" : ""}`}
              />
            ))}
          </span>
          <span className="equip-detail__level-val">
            {currentLevel}/{selected.maxLevel}
          </span>
        </span>
      </div>
      <p className="equip-detail__desc">{selected.description}</p>
      <blockquote className="equip-detail__flavor">
        <span className="equip-detail__flavor-mark" aria-hidden="true" />
        <span>{selected.flavorText}</span>
      </blockquote>
      <div className="equip-detail__actions">
        {isSelectedOwned ? (
          <div className="button-row">
            {selected.slot === "subsystem" ? (
              <>
                {[0, 1].map((subsystemIndex) => {
                  const alreadyEquippedAtTarget =
                    equipped.subsystems[subsystemIndex] === selected.equipmentId
                  return (
                    <ActionButton
                      key={subsystemIndex}
                      tone={alreadyEquippedAtTarget ? "ghost" : "primary"}
                      disabled={alreadyEquippedAtTarget}
                      onClick={() =>
                        onEquip(selected.equipmentId, selected.slot, subsystemIndex as 0 | 1)
                      }
                      style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
                    >
                      {alreadyEquippedAtTarget
                        ? `subsystem ${subsystemIndex + 1}`
                        : `equip s${subsystemIndex + 1}`}
                    </ActionButton>
                  )
                })}
              </>
            ) : (
              <ActionButton
                tone={isSelectedEquipped ? "ghost" : "primary"}
                disabled={isSelectedEquipped}
                onClick={() => onEquip(selected.equipmentId, selected.slot)}
                style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
              >
                {isSelectedEquipped ? "装備中" : "装備する"}
              </ActionButton>
            )}
          </div>
        ) : null}

        {!isSelectedOwned && selected.unlockSource?.kind === "purchase" ? (
          <ProcurementPanel
            mode="purchase"
            cost={selected.unlockSource.selfRepairPointCost}
            balance={selfRepairPoints}
            onAction={() => onPurchase(selected.equipmentId)}
          />
        ) : null}

        {canUpgrade ? (
          <ProcurementPanel
            mode="upgrade"
            cost={resolveUpgradeCost(selected, currentLevel)}
            balance={selfRepairPoints}
            levelInfo={{
              current: currentLevel,
              next: currentLevel + 1,
              max: selected.maxLevel,
            }}
            onAction={() => onUpgrade(selected.equipmentId)}
          />
        ) : null}

        {!isSelectedOwned && selected.unlockSource?.kind !== "purchase" ? (
          <div className="equip-detail__locked-note">
            <span className="equip-detail__locked-mark">▲</span>
            <span>ロック中 — 条件を満たすと解放されます</span>
          </div>
        ) : null}

        {isSelectedOwned && currentLevel >= selected.maxLevel ? (
          <div className="equip-detail__max-note">
            <span className="equip-detail__max-mark">◆</span>
            <span>最大レベル到達 (Lv.{selected.maxLevel})</span>
          </div>
        ) : null}
      </div>
      <p className="equip-detail__footer-note">
        // ENTRY.0x{equipmentIdFragment(selected.equipmentId)}
      </p>
    </div>
  )
}

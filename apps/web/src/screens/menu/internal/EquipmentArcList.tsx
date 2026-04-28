import { useEffect, useRef } from "react"
import type { EquipmentMaster, ProfileAggregate } from "@magnolia/contracts"
import { shouldMaskEquipmentInfo } from "./equipment-utils"

export function EquipmentArcList({
  items,
  owned,
  equipped,
  selectedEquipmentId,
  onSelectEquipment,
  unseenEquipmentIds,
}: {
  items: EquipmentMaster[]
  owned: Set<string>
  equipped: ProfileAggregate["profile"]["equipped"]
  selectedEquipmentId: string | null
  onSelectEquipment: (id: string | null) => void
  unseenEquipmentIds: Set<string>
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // キーボード操作や外部遷移で選択が変わった時、選択項目を表示範囲へ戻します。
    if (!selectedEquipmentId) return
    const container = scrollRef.current
    if (!container) return
    const idx = items.findIndex((eq) => eq.equipmentId === selectedEquipmentId)
    if (idx < 0) return
    const target = container.children[idx] as HTMLElement | undefined
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [items, selectedEquipmentId])

  if (items.length === 0) {
    return (
      <div className="equip-list equip-list--plain">
        <p className="muted-text">この分類の装備はありません</p>
      </div>
    )
  }

  return (
    <div className="equip-list equip-list--plain" ref={scrollRef}>
      {items.map((eq) => {
        const isOwn = owned.has(eq.equipmentId)
        const isMasked = shouldMaskEquipmentInfo(eq, isOwn)
        const isEq =
          equipped.main === eq.equipmentId ||
          equipped.sub === eq.equipmentId ||
          equipped.os === eq.equipmentId ||
          equipped.subsystems.includes(eq.equipmentId)
        const isSel = eq.equipmentId === selectedEquipmentId
        const isNew = unseenEquipmentIds.has(eq.equipmentId)

        return (
          <button
            key={eq.equipmentId}
            type="button"
            className={`list-card${isSel ? " list-card--selected" : ""}${isNew ? " list-card--new" : ""}`}
            onClick={() => onSelectEquipment(eq.equipmentId)}
          >
            {isNew ? (
              <span className="equip-item-new" aria-label="未確認の装備">
                NEW
              </span>
            ) : null}
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>
              {isMasked ? "???" : eq.name}
              {isEq ? <span className="equip-badge">装備中</span> : null}
              {!isOwn ? <span className="equip-badge equip-badge--locked">未入手</span> : null}
            </p>
            <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
              {isMasked ? "詳細不明" : eq.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

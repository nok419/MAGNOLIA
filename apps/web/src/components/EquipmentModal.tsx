import type { ContentBundle } from "@magnolia/contracts"
import { ActionButton } from "@/components/ActionButton"
import { useCallback, useEffect } from "react"

export type EquipmentModalProps = {
  content: ContentBundle
  nodeId: string
  onDismiss: () => void
}

export function EquipmentModal({
  content,
  nodeId,
  onDismiss,
}: EquipmentModalProps) {
  // map logic を正本にし、取得 node から表示対象の装備を解決します。
  let equipmentId = ""
  for (const mapLogic of Object.values(content.mapLogic)) {
    const node = mapLogic.collectibleNodes.find((n) => n.nodeId === nodeId)
    if (node && node.collectibleKind === "hiddenEquipment" && node.equipmentId) {
      equipmentId = node.equipmentId
      break
    }
  }

  const equipment = content.equipment[equipmentId]

  // 装備取得は確認だけの modal なので、主要キーで閉じられるようにします。
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.code === "Enter" ||
        e.code === "NumpadEnter" ||
        e.code === "Space" ||
        e.code === "Escape"
      ) {
        onDismiss()
      }
    },
    [onDismiss],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  if (!equipment) {
    return null
  }

  return (
    <div className="equipment-modal-backdrop" onClick={onDismiss}>
      <div
        className="equipment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="equipment-modal-title" className="equipment-modal__title">
          equipment acquired
        </h2>
        <div className="equipment-modal__box">
          <h3 className="equipment-modal__name">{equipment.name}</h3>
          <p className="equipment-modal__desc">{equipment.summary}</p>
          <div className="equipment-modal__stats">
            <span className="equipment-modal__tag">Slot: {equipment.slot}</span>
            {equipment.passiveEffectIds.length > 0 && (
              <span className="equipment-modal__tag equipment-modal__tag--effect">
                Passive
              </span>
            )}
            {equipment.activeEffectIds.length > 0 && (
              <span className="equipment-modal__tag equipment-modal__tag--effect">
                Active
              </span>
            )}
          </div>
        </div>
        <div className="equipment-modal__actions">
          <ActionButton tone="primary" onClick={onDismiss}>
            OK
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

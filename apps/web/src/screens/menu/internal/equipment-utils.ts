import type { EquipmentMaster, EquipmentSlot } from "@magnolia/contracts"

export const SLOT_CATEGORIES: { key: EquipmentSlot; label: string }[] = [
  { key: "main", label: "main" },
  { key: "sub", label: "sub" },
  { key: "os", label: "os" },
  { key: "subsystem", label: "subsystem" },
]

export function shouldMaskEquipmentInfo(equipment: EquipmentMaster, owned: boolean): boolean {
  return !owned && equipment.unlockSource.kind !== "purchase"
}

export function resolveUpgradeCost(equipment: EquipmentMaster, currentLevel: number): number {
  const nextLevel = currentLevel + 1
  const params = equipment.levelParams.find((p) => p.level === nextLevel)
  return params?.selfRepairPointCost ?? 0
}

export function equipmentIdFragment(equipmentId: string): string {
  let hash = 0
  for (let i = 0; i < equipmentId.length; i++) {
    hash = ((hash << 5) - hash + equipmentId.charCodeAt(i)) | 0
  }
  return (hash >>> 0)
    .toString(16)
    .toUpperCase()
    .slice(-4)
    .padStart(4, "0")
}

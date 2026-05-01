import type { EquipmentSlot, SubsystemIndex } from "@magnolia/contracts"

export type EquipmentCategoryKey = "main" | "sub" | "os" | "subsystem1" | "subsystem2"

export function readEquipmentCategorySlot(category: EquipmentCategoryKey): EquipmentSlot {
  return category === "subsystem1" || category === "subsystem2" ? "subsystem" : category
}

export function readEquipmentCategorySubsystemIndex(
  category: EquipmentCategoryKey,
): SubsystemIndex | undefined {
  if (category === "subsystem1") {
    return 0
  }
  if (category === "subsystem2") {
    return 1
  }
  return undefined
}

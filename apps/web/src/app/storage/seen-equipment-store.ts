const SEEN_EQUIPMENT_STORAGE_PREFIX = "magnolia.seenEquipment:"

export function readSeenEquipmentFromStorage(profileId: string | null | undefined): string[] {
  if (!profileId || typeof window === "undefined") {
    return []
  }
  try {
    const raw = window.localStorage.getItem(`${SEEN_EQUIPMENT_STORAGE_PREFIX}${profileId}`)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
  } catch {
    return []
  }
}

export function writeSeenEquipmentToStorage(profileId: string | null | undefined, ids: string[]): void {
  if (!profileId || typeof window === "undefined") {
    return
  }
  try {
    // seen equipment は UI preference です。profile import/export の正本には含めません。
    window.localStorage.setItem(
      `${SEEN_EQUIPMENT_STORAGE_PREFIX}${profileId}`,
      JSON.stringify(Array.from(new Set(ids))),
    )
  } catch {
    // localStorage が使えない環境でも進行データは壊さないため、既読表示だけ諦めます。
  }
}

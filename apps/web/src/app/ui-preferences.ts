const SEEN_EQUIPMENT_STORAGE_PREFIX = "magnolia.seenEquipment:"
const SCAN_HINT_DISMISSED_STORAGE_PREFIX = "magnolia.scanHintDismissed:"

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
    window.localStorage.setItem(
      `${SEEN_EQUIPMENT_STORAGE_PREFIX}${profileId}`,
      JSON.stringify(Array.from(new Set(ids))),
    )
  } catch {
    // localStorage が無効な環境では、表示中 state だけで NEW 表示を抑えます。
  }
}

export function readScanHintDismissedFromStorage(profileId: string | null | undefined): boolean {
  if (!profileId || typeof window === "undefined") {
    return false
  }
  try {
    return window.localStorage.getItem(`${SCAN_HINT_DISMISSED_STORAGE_PREFIX}${profileId}`) === "1"
  } catch {
    return false
  }
}

export function writeScanHintDismissedToStorage(profileId: string | null | undefined): void {
  if (!profileId || typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(`${SCAN_HINT_DISMISSED_STORAGE_PREFIX}${profileId}`, "1")
  } catch {
    // localStorage が使えない環境では、現在の React state だけで再表示を抑えます。
  }
}

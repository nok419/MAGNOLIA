import type { ContentBundle, RootSnapshot } from "@magnolia/contracts"
import type { SaveSlotSummary } from "@/app/app-types"
import { formatPlayTime, formatTimestamp } from "@/app/display-helpers"

export function buildSaveSlotSummaries(
  snapshot: RootSnapshot | null,
  content: ContentBundle | null,
): SaveSlotSummary[] {
  if (!snapshot) {
    return []
  }

  return snapshot.saveSlots.slots.map((slot) => ({
    slotId: slot.slotId,
    label: slot.label,
    updatedAt: formatTimestamp(slot.updatedAt),
    currentAreaName:
      slot.currentAreaId && content?.areas[slot.currentAreaId]
        ? content.areas[slot.currentAreaId].name
        : undefined,
    playTimeLabel: formatPlayTime(slot.playTimeMs),
    isEmpty: !slot.profileId,
  }))
}

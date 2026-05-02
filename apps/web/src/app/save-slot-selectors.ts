import type { RootSnapshot, SaveSlotId } from "@magnolia/contracts"

type SaveSlot = RootSnapshot["saveSlots"]["slots"][number]

const PROGRESS_SAVE_SLOT_IDS: readonly SaveSlotId[] = [2, 3]
const DEFAULT_PROGRESS_SAVE_SLOT_ID: SaveSlotId = 2

export function isTitleSaveSlotEmpty(slot: SaveSlot): boolean {
  // タイトルでは、作成直後でプレイ時間がないデータを続きから遊べるデータとして扱いません。
  return !slot.profileId || slot.playTimeMs <= 0
}

export function isProgressSaveSlotId(slotId: SaveSlotId): boolean {
  return PROGRESS_SAVE_SLOT_IDS.includes(slotId)
}

export function listProgressSaveSlots(
  slots: RootSnapshot["saveSlots"]["slots"],
): SaveSlot[] {
  // SLOT 1 はデモ時の new game 用に空表示を維持するため、保存先候補から外します。
  return slots.filter((slot) => isProgressSaveSlotId(slot.slotId))
}

export function selectIdleAutoSaveSlot(
  slots: RootSnapshot["saveSlots"]["slots"],
): SaveSlotId {
  return selectProgressSaveSlot(slots)
}

export function selectSettingsQuickSaveSlot(
  slots: RootSnapshot["saveSlots"]["slots"],
  currentSlotId: SaveSlotId | undefined,
): SaveSlotId {
  if (currentSlotId && isProgressSaveSlotId(currentSlotId)) {
    return currentSlotId
  }
  return selectProgressSaveSlot(slots)
}

function selectProgressSaveSlot(
  slots: RootSnapshot["saveSlots"]["slots"],
): SaveSlotId {
  const progressSlots = listProgressSaveSlots(slots)
  const emptySlot = progressSlots.find((slot) => isTitleSaveSlotEmpty(slot))
  if (emptySlot) {
    return emptySlot.slotId
  }

  // 空きがない場合は、保存用 slot の中で最も古い updatedAt を上書きします。
  const oldestSlot = [...progressSlots].sort(
    (left, right) => readSlotUpdatedAtMs(left.updatedAt) - readSlotUpdatedAtMs(right.updatedAt),
  )[0]
  return oldestSlot?.slotId ?? DEFAULT_PROGRESS_SAVE_SLOT_ID
}

export function readSlotUpdatedAtMs(updatedAt: string | undefined): number {
  if (!updatedAt) {
    return 0
  }
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

export type WebScreen =
  | "title"
  | "slotSelect"
  | "explore"
  | "battle"
  | "archive"
  | "equipment"
  | "settings"

export type SlotSelectMode = "newGame" | "continue"

export type SaveSlotSummary = {
  slotId: 1 | 2 | 3
  label: string
  updatedAt?: string
  currentAreaName?: string
  playTimeLabel: string
  isEmpty: boolean
}

export type IdleAutoSaveViewModel = {
  status: "countdown" | "saving"
  remainingSeconds: number
  targetSlotId: 1 | 2 | 3
}

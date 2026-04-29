import type { GameCommand } from "@magnolia/contracts"
import { MagnoliaGameSession } from "@magnolia/game-session"

export type CommandTarget =
  | "map"
  | "archive"
  | "equipment"
  | "settings"
  | "closePanel"
  | "returnToTitle"
  | "saveCurrentSlot"

const COMMAND_TABLE: Record<CommandTarget, GameCommand> = {
  map: { type: "openMap" },
  archive: { type: "openArchive" },
  equipment: { type: "openEquipment" },
  settings: { type: "openSettings" },
  closePanel: { type: "closePanel" },
  returnToTitle: { type: "returnToTitle" },
  saveCurrentSlot: { type: "saveToCurrentSlot" },
}

export function canOpenMap(session: MagnoliaGameSession): boolean {
  return session.getExploreSnapshot()?.featureAccess.canOpenMap ?? false
}

export async function dispatchCommandTarget(input: {
  session: MagnoliaGameSession
  target: CommandTarget
  onLockedMap: () => void
}): Promise<boolean> {
  if (input.target === "map" && !canOpenMap(input.session)) {
    input.onLockedMap()
    return false
  }

  await input.session.dispatch(COMMAND_TABLE[input.target])
  return true
}

import type { GameCommand } from "@magnolia/contracts"

type CommandOf<Type extends GameCommand["type"]> = Extract<GameCommand, { type: Type }>

export type GameCommandHandlers = {
  startNewGameAtSlot: (command: CommandOf<"startNewGameAtSlot">) => Promise<void>
  resumeSaveSlot: (command: CommandOf<"resumeSaveSlot">) => Promise<void>
  openArchive: (command: CommandOf<"openArchive">) => void
  openEquipment: (command: CommandOf<"openEquipment">) => void
  openSettings: (command: CommandOf<"openSettings">) => void
  openMap: (command: CommandOf<"openMap">) => void
  closePanel: (command: CommandOf<"closePanel">) => void
  equipItem: (command: CommandOf<"equipItem">) => void
  unequipItem: (command: CommandOf<"unequipItem">) => void
  purchaseEquipment: (command: CommandOf<"purchaseEquipment">) => void
  upgradeEquipment: (command: CommandOf<"upgradeEquipment">) => void
  startMission: (command: CommandOf<"startMission">) => void
  returnToExplore: (command: CommandOf<"returnToExplore">) => Promise<void>
  returnToTitle: (command: CommandOf<"returnToTitle">) => void
  warpToArea: (command: CommandOf<"warpToArea">) => void
  saveToCurrentSlot: (command: CommandOf<"saveToCurrentSlot">) => Promise<void>
  saveToSlot: (command: CommandOf<"saveToSlot">) => Promise<void>
  changeSetting: (command: CommandOf<"changeSetting">) => Promise<void>
  collectItem: (command: CommandOf<"collectItem">) => void
  interactExploreNode: (command: CommandOf<"interactExploreNode">) => void
}

export async function dispatchGameCommand(
  command: GameCommand,
  handlers: GameCommandHandlers,
): Promise<void> {
  switch (command.type) {
    case "startNewGameAtSlot":
      await handlers.startNewGameAtSlot(command)
      return
    case "resumeSaveSlot":
      await handlers.resumeSaveSlot(command)
      return
    case "openArchive":
      handlers.openArchive(command)
      return
    case "openEquipment":
      handlers.openEquipment(command)
      return
    case "openSettings":
      handlers.openSettings(command)
      return
    case "openMap":
      handlers.openMap(command)
      return
    case "closePanel":
      handlers.closePanel(command)
      return
    case "equipItem":
      handlers.equipItem(command)
      return
    case "unequipItem":
      handlers.unequipItem(command)
      return
    case "purchaseEquipment":
      handlers.purchaseEquipment(command)
      return
    case "upgradeEquipment":
      handlers.upgradeEquipment(command)
      return
    case "startMission":
      handlers.startMission(command)
      return
    case "returnToExplore":
      await handlers.returnToExplore(command)
      return
    case "returnToTitle":
      handlers.returnToTitle(command)
      return
    case "warpToArea":
      handlers.warpToArea(command)
      return
    case "saveToCurrentSlot":
      await handlers.saveToCurrentSlot(command)
      return
    case "saveToSlot":
      await handlers.saveToSlot(command)
      return
    case "changeSetting":
      await handlers.changeSetting(command)
      return
    case "collectItem":
      handlers.collectItem(command)
      return
    case "interactExploreNode":
      handlers.interactExploreNode(command)
      return
  }
}

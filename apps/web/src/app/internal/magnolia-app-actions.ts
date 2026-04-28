import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type {
  AreaId,
  DomainEvent,
  EquipmentId,
  PresentationRequest,
  SaveSlotId,
  SettingsRow,
  TransmissionId,
  WorldMapNodeId,
} from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import type { SlotSelectMode } from "@/app/app-types"
import { dismissOverlayPresentation } from "@/app/internal/overlay-presentations"
import { writeSeenEquipmentToStorage } from "@/app/internal/seen-equipment-storage"
import type { MagnoliaAppState } from "./magnolia-app-state"

export type CommandTarget =
  | "map"
  | "archive"
  | "equipment"
  | "settings"
  | "closePanel"
  | "returnToTitle"
  | "saveCurrentSlot"

type SyncFromSession = (
  session: MagnoliaGameSession,
  incomingPresentationRequests?: PresentationRequest[],
  incomingEvents?: DomainEvent[],
) => void

export function createMagnoliaAppActions({
  sessionRef,
  stateRef,
  setState,
  tryOpenMap,
  syncFromSession,
}: {
  sessionRef: MutableRefObject<MagnoliaGameSession | null>
  stateRef: MutableRefObject<MagnoliaAppState>
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
  tryOpenMap: (session: MagnoliaGameSession) => boolean
  syncFromSession: SyncFromSession
}) {
  return {
    markEquipmentSeen(equipmentIds: string[]) {
      if (equipmentIds.length === 0) {
        return
      }
      setState((current) => {
        const profileId = current.profile?.profile.profileId
        const merged = Array.from(new Set([...current.seenEquipmentIds, ...equipmentIds]))
        writeSeenEquipmentToStorage(profileId, merged)
        return { ...current, seenEquipmentIds: merged }
      })
    },
    openSlotSelect(mode: SlotSelectMode) {
      setState((current) => ({
        ...current,
        slotSelectMode: mode,
      }))
    },
    closeSlotSelect() {
      setState((current) => ({
        ...current,
        slotSelectMode: null,
      }))
    },
    async confirmSlot(slotId: SaveSlotId) {
      const session = sessionRef.current
      const mode = stateRef.current.slotSelectMode
      if (!session || !mode) {
        return
      }

      if (mode === "newGame") {
        await session.dispatch({
          type: "startNewGameAtSlot",
          slotId,
          difficulty: session.getSettings().difficulty,
        })
      } else {
        await session.dispatch({
          type: "resumeSaveSlot",
          slotId,
        })
      }

      setState((current) => ({
        ...current,
        slotSelectMode: null,
      }))
      syncFromSession(session)
    },
    async runCommand(target: CommandTarget) {
      const session = sessionRef.current
      if (!session) {
        return
      }

      switch (target) {
        case "map":
          if (!tryOpenMap(session)) {
            return
          }
          await session.dispatch({ type: "openMap" })
          break
        case "archive":
          await session.dispatch({ type: "openArchive" })
          break
        case "equipment":
          await session.dispatch({ type: "openEquipment" })
          break
        case "settings":
          await session.dispatch({ type: "openSettings" })
          break
        case "closePanel":
          await session.dispatch({ type: "closePanel" })
          break
        case "returnToTitle":
          await session.dispatch({ type: "returnToTitle" })
          break
        case "saveCurrentSlot":
          await session.dispatch({ type: "saveToCurrentSlot" })
          break
      }

      syncFromSession(session)
    },
    async startMission(missionId: string) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "startMission",
        missionId,
      })
      syncFromSession(session)
    },
    async warpToArea(areaId: AreaId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "warpToArea",
        areaId,
      })
      syncFromSession(session)
    },
    async returnToExplore() {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({ type: "returnToExplore" })
      syncFromSession(session)
    },
    dismissEquipmentModal() {
      setState((current) => ({
        ...current,
        equipmentModalNodeId: null,
      }))
    },
    selectArchive(areaId: AreaId, transmissionId: TransmissionId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      session.selectArchive(areaId, transmissionId)
      syncFromSession(session)
    },
    async openArchiveAt(areaId: AreaId, transmissionId: TransmissionId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      session.selectArchive(areaId, transmissionId)
      await session.dispatch({ type: "openArchive" })
      syncFromSession(session)
    },
    async equipPrimary(slot: "main" | "sub" | "os", equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "equipItem",
        slot,
        equipmentId,
      })
      syncFromSession(session)
    },
    async equipSubsystem(subsystemIndex: 0 | 1, equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "equipItem",
        slot: "subsystem",
        subsystemIndex,
        equipmentId,
      })
      syncFromSession(session)
    },
    async purchaseEquipment(equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "purchaseEquipment",
        equipmentId,
      })
      syncFromSession(session)
    },
    async upgradeEquipment(equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "upgradeEquipment",
        equipmentId,
      })
      syncFromSession(session)
    },
    async saveToSlot(slotId: SaveSlotId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "saveToSlot",
        slotId,
      })
      syncFromSession(session)
    },
    async setVolume(
      channel: keyof SettingsRow["volumes"],
      nextValue: SettingsRow["volumes"][keyof SettingsRow["volumes"]],
    ) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "changeSetting",
        path: `volumes.${channel}`,
        value: nextValue,
      })
      syncFromSession(session)
    },
    async setDifficulty(nextValue: SettingsRow["difficulty"]) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "changeSetting",
        path: "difficulty",
        value: nextValue,
      })
      syncFromSession(session)
    },
    async toggleSwitch(path: "reduceFlashing" | "lowFrameRateMode", nextValue: boolean) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "changeSetting",
        path,
        value: nextValue,
      })
      syncFromSession(session)
    },
    async interactExploreNode(nodeId: WorldMapNodeId) {
      const session = sessionRef.current
      if (!session) return
      const result = session.interactExploreNode(nodeId)
      syncFromSession(session, result.presentationRequests, result.events)
    },
    async setShipVariant(nextValue: SettingsRow["shipVariant"]) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await session.dispatch({
        type: "changeSetting",
        path: "shipVariant",
        value: nextValue,
      })
      syncFromSession(session)
    },
    dismissActiveOverlayPresentation() {
      setState((current) => dismissOverlayPresentation(current))
    },
  }
}

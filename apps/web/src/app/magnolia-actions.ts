import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react"
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
import { TITLE_UI_SOUND_VOLUME, audioEvents } from "@/audio"
import type { SlotSelectMode } from "@/app/app-types"
import type { MagnoliaAppState } from "@/app/app-state"
import { dismissOverlayPresentation } from "@/app/presentation/overlay-queue"
import {
  isProgressSaveSlotId,
  selectSettingsQuickSaveSlot,
} from "@/app/save-slot-selectors"
import { dispatchAndSync } from "@/app/session-command-runner"
import { writeSeenEquipmentToStorage } from "@/app/storage/seen-equipment-store"
import type { ExploreInteractionContext } from "@/app/session-sync"

export type CommandTarget =
  | "map"
  | "archive"
  | "equipment"
  | "settings"
  | "closePanel"
  | "returnToTitle"
  | "saveProgressSlot"

type CreateMagnoliaActionsParams = {
  sessionRef: RefObject<MagnoliaGameSession | null>
  stateRef: RefObject<MagnoliaAppState>
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
  syncFromSession(
    session: MagnoliaGameSession,
    incomingPresentationRequests?: PresentationRequest[],
    incomingEvents?: DomainEvent[],
    exploreInteractionContext?: ExploreInteractionContext,
  ): void
}

export function createMagnoliaActions({
  sessionRef,
  stateRef,
  setState,
  syncFromSession,
}: CreateMagnoliaActionsParams) {
  const runSessionCommand = (
    session: MagnoliaGameSession,
    command: Parameters<typeof dispatchAndSync>[1],
    options: Partial<Parameters<typeof dispatchAndSync>[2]> = {},
  ) =>
    dispatchAndSync(session, command, {
      ...options,
      setState,
      syncFromSession,
    })

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
      audioEvents.uiOpen({ volume: TITLE_UI_SOUND_VOLUME })
      setState((current) => ({
        ...current,
        slotSelectMode: mode,
      }))
    },
    closeSlotSelect() {
      audioEvents.uiClose({ volume: TITLE_UI_SOUND_VOLUME })
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

      // タイトル確定後は短い暗転を見せてから session を進めます。
      const waitForTitleConfirmCue =
        mode === "newGame"
          ? audioEvents.newGameSelected()
          : audioEvents.loadGameSelected()
      await waitForTitleConfirmCue

      await runSessionCommand(
        session,
        mode === "newGame"
          ? {
              type: "startNewGameAtSlot",
              slotId,
              difficulty: session.getSettings().difficulty,
            }
          : {
              type: "resumeSaveSlot",
              slotId,
            },
        {
          beforeSync: () => {
            setState((current) => ({
              ...current,
              slotSelectMode: null,
            }))
          },
        },
      )
    },
    async startDebugMode() {
      const session = sessionRef.current
      if (!session) {
        return
      }

      // debug mode は slot を上書きしない検証用 profile として開始します。
      const waitForTitleConfirmCue = audioEvents.newGameSelected()
      await waitForTitleConfirmCue

      await runSessionCommand(
        session,
        {
          type: "startDebugMode",
          difficulty: session.getSettings().difficulty,
        },
        {
          beforeSync: () => {
            setState((current) => ({
              ...current,
              slotSelectMode: null,
            }))
          },
        },
      )
    },
    async runCommand(target: CommandTarget) {
      const session = sessionRef.current
      if (!session) {
        return
      }

      switch (target) {
        case "map":
          await runSessionCommand(session, { type: "openMap" })
          break
        case "archive":
          await runSessionCommand(session, { type: "openArchive" })
          break
        case "equipment":
          await runSessionCommand(session, { type: "openEquipment" })
          break
        case "settings":
          await runSessionCommand(session, { type: "openSettings" })
          break
        case "closePanel":
          await runSessionCommand(session, { type: "closePanel" })
          break
        case "returnToTitle":
          await runSessionCommand(session, { type: "returnToTitle" })
          break
        case "saveProgressSlot":
          await runSessionCommand(session, {
            type: "saveToSlot",
            // settings の quick save は SLOT 1 を空表示に保つため、保存用 slot へ書き込みます。
            slotId: selectSettingsQuickSaveSlot(
              stateRef.current.snapshot?.saveSlots.slots ?? session.getSnapshot().saveSlots.slots,
              stateRef.current.profile?.profile.slotId,
            ),
          })
          break
      }
    },
    async startMission(missionId: string) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "startMission",
        missionId,
      })
    },
    async warpToArea(areaId: AreaId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "warpToArea",
        areaId,
      })
    },
    async returnToExplore() {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, { type: "returnToExplore" })
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
      await runSessionCommand(session, { type: "openArchive" })
    },
    async equipPrimary(slot: "main" | "sub" | "os", equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "equipItem",
        slot,
        equipmentId,
      }, {
        afterDispatch: () => {
          if (!session.getLastCommandErrorReason()) {
            clearEquipmentGuideIfTarget(setState, equipmentId)
          }
        },
      })
    },
    async equipSubsystem(subsystemIndex: 0 | 1, equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "equipItem",
        slot: "subsystem",
        subsystemIndex,
        equipmentId,
      }, {
        afterDispatch: () => {
          if (!session.getLastCommandErrorReason()) {
            clearEquipmentGuideIfTarget(setState, equipmentId)
          }
        },
      })
    },
    async unequipPrimary(slot: "main" | "sub" | "os", equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "unequipItem",
        slot,
        equipmentId,
      })
    },
    async unequipSubsystem(subsystemIndex: 0 | 1, equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "unequipItem",
        slot: "subsystem",
        subsystemIndex,
        equipmentId,
      })
    },
    async purchaseEquipment(equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(
        session,
        {
          type: "purchaseEquipment",
          equipmentId,
        },
        {
          afterDispatch: () => {
            if (!session.getLastCommandErrorReason()) {
              audioEvents.equipmentArchiveDetailDecision()
            }
          },
        },
      )
    },
    async upgradeEquipment(equipmentId: EquipmentId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(
        session,
        {
          type: "upgradeEquipment",
          equipmentId,
        },
        {
          afterDispatch: () => {
            if (!session.getLastCommandErrorReason()) {
              audioEvents.equipmentUpgrade()
            }
          },
        },
      )
    },
    async saveToSlot(slotId: SaveSlotId) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      if (!stateRef.current.snapshot || !isProgressSaveSlotId(slotId)) {
        return
      }
      await runSessionCommand(session, {
        type: "saveToSlot",
        slotId,
      })
    },
    async setVolume(
      channel: keyof SettingsRow["volumes"],
      nextValue: SettingsRow["volumes"][keyof SettingsRow["volumes"]],
    ) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "changeSetting",
        path: `volumes.${channel}`,
        value: nextValue,
      })
    },
    async setDifficulty(nextValue: SettingsRow["difficulty"]) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "changeSetting",
        path: "difficulty",
        value: nextValue,
      })
    },
    async toggleSwitch(path: "reduceFlashing" | "lowFrameRateMode", nextValue: boolean) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "changeSetting",
        path,
        value: nextValue,
      })
    },
    async interactExploreNode(nodeId: WorldMapNodeId, context?: ExploreInteractionContext) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(
        session,
        { type: "interactExploreNode", nodeId },
        { exploreInteractionContext: context },
      )
    },
    async setShipVariant(nextValue: SettingsRow["shipVariant"]) {
      const session = sessionRef.current
      if (!session) {
        return
      }
      await runSessionCommand(session, {
        type: "changeSetting",
        path: "shipVariant",
        value: nextValue,
      })
    },
    dismissActiveOverlayPresentation() {
      setState((current) => ({
        ...current,
        presentation: dismissOverlayPresentation(current.presentation),
      }))
    },
  }
}

function clearEquipmentGuideIfTarget(
  setState: Dispatch<SetStateAction<MagnoliaAppState>>,
  equipmentId: EquipmentId,
): void {
  setState((current) => {
    if (current.equipmentGuideTargetId !== equipmentId) {
      return current
    }
    return {
      ...current,
      equipmentGuideTargetId: null,
    }
  })
}

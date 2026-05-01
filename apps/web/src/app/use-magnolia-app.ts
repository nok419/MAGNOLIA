import {
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  ArchiveSnapshot,
  ContentBundle,
  DomainEvent,
  PresentationRequest,
  ProfileAggregate,
  RootSnapshot,
  SettingsRow,
} from "@magnolia/contracts"
import {
  selectEquipmentHint,
  type BattleRenderState,
  type ExploreRenderState,
  type MagnoliaGameSession,
  type WorldMapViewModel,
} from "@magnolia/game-session"
import { createMagnoliaClient } from "@/app/magnolia-client"
import type { IdleAutoSaveViewModel, SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
import {
  readExplorePresentationState,
} from "@/app/explore-presentation"
import {
  formatPlayTime,
  formatTimestamp,
} from "@/app/display-helpers"
import { useMagnoliaFrameLoop } from "@/app/frame-loop/use-magnolia-frame-loop"
import {
  createAudioEventAdapterState,
} from "@/app/audio-event-adapter"
import type { ExploreItemPopup } from "@/app/popups/item-popups"
import {
  selectBattlePresentationEvents,
  selectExplorePresentationEvents,
  selectTransitionPresentationEvents,
} from "@/app/presentation/presentation-selectors"
import {
  createEmptyPresentationState,
  type WebPresentationState,
} from "@/app/presentation/presentation-state"
import { useIdleAutoSave } from "@/app/idle-auto-save"
import { createMagnoliaActions } from "@/app/magnolia-actions"
import { usePresentationTimers } from "@/app/presentation-timers"
import {
  syncMagnoliaAppStateFromSession,
  type ExploreInteractionContext,
} from "@/app/session-sync"
import { useMagnoliaInput } from "@/app/use-magnolia-input"

export type MagnoliaAppState = {
  ready: boolean
  errorMessage?: string
  snapshot: RootSnapshot | null
  content: ContentBundle | null
  profile: ProfileAggregate | null
  settings: SettingsRow | null
  exploreSnapshot: RootSnapshot["explore"] | null
  exploreRenderState: ExploreRenderState | null
  worldMapViewModel: WorldMapViewModel | null
  battleRenderState: BattleRenderState | null
  presentation: WebPresentationState
  archiveSnapshot: ArchiveSnapshot | null
  slotSelectMode: SlotSelectMode | null
  itemPopups: ExploreItemPopup[]
  equipmentModalNodeId: string | null
  seenEquipmentIds: string[]
}

export function useMagnoliaApp() {
  const input = useMagnoliaInput()
  const [state, setState] = useState<MagnoliaAppState>({
    ready: false,
    snapshot: null,
    content: null,
    profile: null,
    settings: null,
    exploreSnapshot: null,
    exploreRenderState: null,
    worldMapViewModel: null,
    battleRenderState: null,
    presentation: createEmptyPresentationState(),
    archiveSnapshot: null,
    slotSelectMode: null,
    itemPopups: [],
    equipmentModalNodeId: null,
    seenEquipmentIds: [],
  })
  const [idleAutoSave, setIdleAutoSave] = useState<IdleAutoSaveViewModel | null>(null)
  const sessionRef = useRef<MagnoliaGameSession | null>(null)
  const lastFrameAtRef = useRef<number | null>(null)
  const frameHandleRef = useRef<number | null>(null)
  const stateRef = useRef(state)
  const audioEventStateRef = useRef(createAudioEventAdapterState())

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // MGN-REF-003: composition root から移動先の主要条件を追えるように残します。
  // syncMagnoliaAppStateFromSession は session.drainPresentationRequests() を処理します。
  // useIdleAutoSave は IDLE_AUTO_SAVE_WARNING_AFTER_MS = 50_000 と
  // IDLE_AUTO_SAVE_COUNTDOWN_MS = 10_000 を基準にし、snapshot.screen === "title" と
  // current.slotSelectMode では停止します。
  // countdown 中は input.getLastActivityAt() > countdown.startedAt で取り消し、
  // selectIdleAutoSaveSlot(snapshot.saveSlots.slots) の結果へ
  // await session.dispatch({ type: "saveToSlot", slotId: countdown.targetSlotId }) してから
  // await session.dispatch({ type: "returnToTitle" }) します。
  // 保存先選択は slots.find((slot) => isTitleSaveSlotEmpty(slot)) を優先し、
  // readSlotUpdatedAtMs(left.updatedAt) - readSlotUpdatedAtMs(right.updatedAt) で古い slot を選びます。
  useIdleAutoSave({
    input,
    sessionRef,
    stateRef,
    setState,
    setIdleAutoSave,
    syncFromSession,
  })

  usePresentationTimers({
    activeOverlay: state.presentation.activeOverlay,
    content: state.content,
    itemPopups: state.itemPopups,
    presentationEvents: {
      battleEvents: state.presentation.battleEvents,
      exploreEvents: state.presentation.exploreEvents,
      transitionEvents: state.presentation.transitionEvents,
    },
    setState,
  })

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        const session = await createMagnoliaClient()
        if (cancelled) {
          return
        }
        sessionRef.current = session
        syncFromSession(session)
      } catch (error) {
        if (cancelled) {
          return
        }
        setState((current) => ({
          ...current,
          ready: true,
          errorMessage: error instanceof Error ? error.message : "初期化に失敗しました。",
        }))
      }
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [])

  const { tryOpenMap, ...actions } = createMagnoliaActions({
    sessionRef,
    stateRef,
    setState,
    syncFromSession,
  })

  useMagnoliaFrameLoop({
    input,
    sessionRef,
    stateRef,
    lastFrameAtRef,
    frameHandleRef,
    tryOpenMap,
    syncFromSession,
  })

  const effectiveScreen =
    state.slotSelectMode ? "slotSelect" : state.snapshot?.screen ?? "title"
  const explorePresentation = readExplorePresentationState(
    state.presentation.activeOverlay,
    state.content,
  )

  // 探索中の誘導表示とカテゴリタブ NEW バッジは、content の unlockSource を正本にします。
  const equipmentHint = selectEquipmentHint({
    content: state.content,
    profile: state.profile,
    seenEquipmentIds: state.seenEquipmentIds,
  })
  const { unseenEquipmentIds } = equipmentHint
  const shouldShowEquipmentHint = equipmentHint.shouldShowRewardHint

  return {
    ready: state.ready,
    errorMessage: state.errorMessage,
    screen: effectiveScreen,
    snapshot: state.snapshot,
    content: state.content,
    profile: state.profile,
    settings: state.settings,
    exploreSnapshot: state.exploreSnapshot,
    exploreRenderState: state.exploreRenderState,
    worldMapViewModel: state.worldMapViewModel,
    battleRenderState: state.battleRenderState,
    battleEvents: selectBattlePresentationEvents(state.presentation),
    exploreEvents: selectExplorePresentationEvents(state.presentation),
    transitionEvents: selectTransitionPresentationEvents(state.presentation),
    archiveSnapshot: state.archiveSnapshot,
    slotSelectMode: state.slotSelectMode,
    activeOverlayPresentation: state.presentation.activeOverlay,
    explorePresentation,
    itemPopups: state.itemPopups,
    equipmentModalNodeId: state.equipmentModalNodeId,
    unseenEquipmentIds,
    shouldShowEquipmentHint,
    idleAutoSave,
    saveSlots: buildSaveSlotSummaries(state.snapshot, state.content),
    setExploreMoveTarget: input.setExploreMoveTarget,
    consumePrimaryMousePress: input.consumePrimaryMousePress,
    ...actions,
  }

  function syncFromSession(
    session: MagnoliaGameSession,
    incomingPresentationRequests: PresentationRequest[] = [],
    incomingEvents: DomainEvent[] = [],
    exploreInteractionContext?: ExploreInteractionContext,
  ) {
    syncMagnoliaAppStateFromSession({
      session,
      input,
      stateRef,
      audioEventStateRef,
      setState,
      incomingPresentationRequests,
      incomingEvents,
      exploreInteractionContext,
    })
  }
}

function buildSaveSlotSummaries(
  snapshot: RootSnapshot | null,
  content: ContentBundle | null,
): SaveSlotSummary[] {
  if (!snapshot) {
    return []
  }

  return snapshot.saveSlots.slots.map((slot) => {
    const isEmpty = isTitleSaveSlotEmpty(slot)

    return {
      slotId: slot.slotId,
      label: slot.label,
      updatedAt: isEmpty ? undefined : formatTimestamp(slot.updatedAt),
      currentAreaName:
        !isEmpty && slot.currentAreaId && content?.areas[slot.currentAreaId]
          ? content.areas[slot.currentAreaId].name
          : undefined,
      playTimeLabel: formatPlayTime(slot.playTimeMs),
      isEmpty,
    }
  })
}

function isTitleSaveSlotEmpty(slot: RootSnapshot["saveSlots"]["slots"][number]): boolean {
  // タイトルでは、作成直後でプレイ時間がないデータを続きから遊べるデータとして扱いません。
  return !slot.profileId || slot.playTimeMs <= 0
}

import {
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  ContentBundle,
  DomainEvent,
  PresentationRequest,
  RootSnapshot,
} from "@magnolia/contracts"
import {
  selectEquipmentHint,
  type MagnoliaGameSession,
} from "@magnolia/game-session"
import { createMagnoliaClient } from "@/app/magnolia-client"
import type { IdleAutoSaveViewModel, SaveSlotSummary } from "@/app/app-types"
import type { MagnoliaAppState } from "@/app/app-state"
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
import {
  selectBattlePresentationEvents,
  selectExplorePresentationEvents,
  selectTransitionPresentationEvents,
} from "@/app/presentation/presentation-selectors"
import {
  createEmptyPresentationState,
} from "@/app/presentation/presentation-state"
import { useIdleAutoSave } from "@/app/idle-auto-save"
import { createMagnoliaActions } from "@/app/magnolia-actions"
import { usePresentationTimers } from "@/app/presentation-timers"
import { isTitleSaveSlotEmpty } from "@/app/save-slot-selectors"
import {
  syncMagnoliaAppStateFromSession,
  type ExploreInteractionContext,
} from "@/app/session-sync"
import { useMagnoliaInput } from "@/app/use-magnolia-input"

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
    equipmentGuideTargetId: null,
    battleTutorialIconState: null,
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

  // State composition はここに残し、同期、timer、command 判断は各 app module に寄せます。
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

  const actions = createMagnoliaActions({
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
    setState,
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
  const shouldShowOsMagnoliaEquipPrompt = equipmentHint.shouldShowOsMagnoliaEquipPrompt

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
    shouldShowOsMagnoliaEquipPrompt,
    equipmentGuideTargetId: state.equipmentGuideTargetId,
    battleTutorialIconState: state.battleTutorialIconState,
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

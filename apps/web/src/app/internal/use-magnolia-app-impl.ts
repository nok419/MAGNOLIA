import {
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  DomainEvent,
  PresentationRequest,
} from "@magnolia/contracts"
import { MagnoliaGameSession } from "@magnolia/game-session"
import {
  createDexieSaveRepository,
  loadContentBundle,
} from "@magnolia/persistence"
import {
  readExplorePresentationState,
  readPresentationDurationMs,
  REBOOT_SEQUENCE_CUE_ID,
  shouldAutoDismissOverlayPresentation,
} from "@/app/explore-presentation"
import {
  resolveUnseenEquipmentIds,
  shouldShowRewardEquipmentHint,
} from "@/app/equipment-hints"
import {
  createExplorePopup,
  pushExplorePopup,
} from "@/app/internal/explore-popups"
import {
  dismissOverlayPresentation,
  transitionRebootToSettle,
} from "@/app/internal/overlay-presentations"
import { buildSaveSlotSummaries } from "@/app/internal/save-slot-summaries"
import {
  INITIAL_MAGNOLIA_APP_STATE,
  type MagnoliaAppState,
} from "@/app/internal/magnolia-app-state"
import { createMagnoliaAppActions } from "@/app/internal/magnolia-app-actions"
import { syncMagnoliaStateFromSession } from "@/app/internal/sync-from-session"
import { useMagnoliaFrameLoop } from "@/app/internal/use-magnolia-frame-loop"
import { useMagnoliaInput } from "@/app/use-magnolia-input"

export function useMagnoliaApp() {
  const input = useMagnoliaInput()
  const [state, setState] = useState<MagnoliaAppState>(INITIAL_MAGNOLIA_APP_STATE)
  const sessionRef = useRef<MagnoliaGameSession | null>(null)
  const lastFrameAtRef = useRef<number | null>(null)
  const frameHandleRef = useRef<number | null>(null)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const activePresentation = state.activeOverlayPresentation
    const content = state.content
    if (!activePresentation || !shouldAutoDismissOverlayPresentation(activePresentation)) {
      return
    }

    // 自動終了する overlay は、cue 定義の表示時間を正本として順に消します。
    const durationMs = readPresentationDurationMs(content, activePresentation.cueId)

    const timeoutId = window.setTimeout(() => {
      setState((current) => {
        // reboot 本編が明けた瞬間に素の探索画面へ戻ると「機体登場 → 操作開始」が
        // 段差として見えるため、本編直後に settle 区間を挟む。HUD を浮上させ、
        // 視界フォグ/円/スキャンをゼロから立ち上げるだけの静かなフェーズ。
        if (activePresentation.cueId === REBOOT_SEQUENCE_CUE_ID) {
          return transitionRebootToSettle(current, activePresentation.requestId)
        }
        return dismissOverlayPresentation(current, activePresentation.requestId)
      })
    }, durationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [state.activeOverlayPresentation, state.content])

  useEffect(() => {
    if (state.itemPopups.length === 0) {
      return
    }

    const now = Date.now()
    const nextExpiryAt = Math.min(...state.itemPopups.map((popup) => popup.expiresAt))
    const delayMs = Math.max(0, nextExpiryAt - now)
    const timeoutId = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        itemPopups: current.itemPopups.filter((popup) => popup.expiresAt > Date.now()),
      }))
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [state.itemPopups])

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        // Web 側はこのフックだけが content / save / session を接続します。
        // 画面コンポーネントから repository や session へ直接触れない前提を守ります。
        const content = loadContentBundle()
        const repository = createDexieSaveRepository({ content })
        const session = new MagnoliaGameSession({
          content,
          repository,
        })
        await session.initialize()
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

  function showLockedMapPopup() {
    setState((current) => ({
      ...current,
      itemPopups: pushExplorePopup(
        current.itemPopups,
        createExplorePopup("locked", "os magnolia が必要です。"),
      ),
    }))
  }

  function tryOpenMap(session: MagnoliaGameSession): boolean {
    const canOpenMap = session.getExploreSnapshot()?.featureAccess.canOpenMap ?? false
    if (canOpenMap) {
      return true
    }

    // 探索中の失敗理由は短い popup で返し、操作の流れ自体は止めません。
    showLockedMapPopup()
    return false
  }

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
    state.activeOverlayPresentation,
    state.content,
  )

  // 取得済みだがまだ装備画面で確認していない装備。
  // 探索中の誘導表示とカテゴリタブ NEW バッジの共通ソース。
  const unseenEquipmentIds = resolveUnseenEquipmentIds(state.profile, state.seenEquipmentIds)
  const shouldShowEquipmentHint = shouldShowRewardEquipmentHint({
    content: state.content,
    profile: state.profile,
    unseenEquipmentIds,
  })
  const actions = createMagnoliaAppActions({
    sessionRef,
    stateRef,
    setState,
    tryOpenMap,
    syncFromSession,
  })

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
    mapViewModel: state.mapViewModel,
    battleRenderState: state.battleRenderState,
    archiveSnapshot: state.archiveSnapshot,
    slotSelectMode: state.slotSelectMode,
    activeOverlayPresentation: state.activeOverlayPresentation,
    explorePresentation,
    itemPopups: state.itemPopups,
    equipmentModalNodeId: state.equipmentModalNodeId,
    unseenEquipmentIds,
    shouldShowEquipmentHint,
    saveSlots: buildSaveSlotSummaries(state.snapshot, state.content),
    ...actions,
  }

  function syncFromSession(
    session: MagnoliaGameSession,
    incomingPresentationRequests: PresentationRequest[] = [],
    incomingEvents: DomainEvent[] = [],
  ) {
    syncMagnoliaStateFromSession({
      session,
      input,
      setState,
      incomingPresentationRequests,
      incomingEvents,
    })
  }
}

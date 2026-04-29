import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  AreaId,
  ContentBundle,
  DomainEvent,
  EquipmentId,
  PresentationRequest,
  RootSnapshot,
  SaveSlotId,
  SettingsRow,
  TransmissionId,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  MagnoliaGameSession,
  selectBattleResultViewModel,
  selectEquipmentHint,
} from "@magnolia/game-session"
import {
  createDexieSaveRepository,
  loadContentBundle,
} from "@magnolia/persistence"
import type { SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
import {
  readExplorePresentationState,
  readPresentationDurationMs,
  REBOOT_SEQUENCE_CUE_ID,
  shouldAutoDismissOverlayPresentation,
} from "@/app/explore-presentation"
import {
  formatPlayTime,
  formatTimestamp,
} from "@/app/display-helpers"
import { useMagnoliaInput } from "@/app/use-magnolia-input"
import type { MagnoliaAppState } from "@/app/app-state"
import {
  dispatchCommandTarget,
  type CommandTarget,
} from "@/app/app-commands"
import { useMagnoliaFrameLoop } from "@/app/frame-loop"
import {
  buildCollectiblePopups,
  createExplorePopup,
  pushExplorePopup,
} from "@/app/item-popups"
import {
  dismissOverlayPresentation,
  mergePresentationRequests,
  selectTimedPresentationRequests,
  transitionRebootToSettle,
} from "@/app/presentation-queue"
import {
  readScanHintDismissedFromStorage,
  readSeenEquipmentFromStorage,
  writeScanHintDismissedToStorage,
  writeSeenEquipmentToStorage,
} from "@/app/ui-preferences"

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
    battleResultViewModel: null,
    archiveSnapshot: null,
    slotSelectMode: null,
    activeOverlayPresentation: null,
    pendingOverlayPresentations: [],
    activeNonOverlayPresentations: [],
    itemPopups: [],
    equipmentModalNodeId: null,
    seenEquipmentIds: [],
    scanHintDismissed: false,
  })
  const sessionRef = useRef<MagnoliaGameSession | null>(null)
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
    controls: input,
    sessionRef,
    stateRef,
    tryOpenMap,
    syncFromSession,
  })

  const effectiveScreen =
    state.slotSelectMode ? "slotSelect" : state.snapshot?.screen ?? "title"
  const explorePresentation = readExplorePresentationState(
    state.activeOverlayPresentation,
    state.content,
  )

  // mission 報酬由来の未確認装備がある間だけ、探索画面で E キー誘導を出します。
  // 特定 ID ではなく content の rewardEquipmentIds と装備済み状態から判定します。
  const equipmentHint = selectEquipmentHint({
    content: state.content,
    profile: state.profile,
    seenEquipmentIds: state.seenEquipmentIds,
  })
  const hasMissionResult = (state.profile?.missionRuns.length ?? 0) > 0
  const shouldShowScanHint = !state.scanHintDismissed && !hasMissionResult

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
    battleResultViewModel: state.battleResultViewModel,
    archiveSnapshot: state.archiveSnapshot,
    slotSelectMode: state.slotSelectMode,
    activeOverlayPresentation: state.activeOverlayPresentation,
    explorePresentation,
    battlePresentationRequests: selectTimedPresentationRequests(
      state.activeNonOverlayPresentations,
      "battle",
    ),
    explorePresentationRequests: selectTimedPresentationRequests(
      state.activeNonOverlayPresentations,
      "explore",
    ),
    transitionPresentationRequests: selectTimedPresentationRequests(
      state.activeNonOverlayPresentations,
      "transition",
    ),
    itemPopups: state.itemPopups,
    equipmentModalNodeId: state.equipmentModalNodeId,
    unseenEquipmentIds: equipmentHint.unseenEquipmentIds,
    shouldShowEquipmentHint: equipmentHint.shouldShowEquipmentHint,
    shouldShowScanHint,
    markScanHintDismissed() {
      setState((current) => {
        if (current.scanHintDismissed) {
          return current
        }
        writeScanHintDismissedToStorage(current.profile?.profile.profileId)
        return { ...current, scanHintDismissed: true }
      })
    },
    saveSlots: buildSaveSlotSummaries(state.snapshot, state.content),
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

      const dispatched = await dispatchCommandTarget({
        session,
        target,
        onLockedMap: showLockedMapPopup,
      })
      if (dispatched) {
        syncFromSession(session)
      }
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
      await session.dispatch({ type: "interactExploreNode", nodeId })
      syncFromSession(session)
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

  function syncFromSession(
    session: MagnoliaGameSession,
    incomingPresentationRequests: PresentationRequest[] = [],
    incomingEvents: DomainEvent[] = [],
  ) {
    const queuedPresentationRequests = session.drainPresentationRequests()
    const queuedDomainEvents = session.drainDomainEvents()

    const snapshot = session.getSnapshot()
    const content = session.getContentBundle()
    const profile = session.getProfileAggregate()
    const settings = session.getSettings()
    const exploreSnapshot = session.getExploreSnapshot()
    const exploreRenderState = session.getExploreRenderState()
    const worldMapViewModel = session.getWorldMapViewModel()
    const battleRenderState = session.getBattleRenderState()
    const battleResultViewModel =
      battleRenderState
        ? selectBattleResultViewModel({ content, renderState: battleRenderState })
        : null
    const archiveSnapshot = session.getArchiveSnapshot()
    const parsedPopups = buildCollectiblePopups(
      [...queuedDomainEvents, ...incomingEvents],
      content,
    )

    input.syncButtonEdges(settings)

    startTransition(() => {
      setState((current) => {
        // プロファイル切り替え時だけ localStorage から seen 一覧を取り直す。
        // 同一プロファイル内の呼び出しでは既存 state を維持し、書き込み直後の巻き戻しを防ぐ。
        const previousProfileId = current.profile?.profile.profileId ?? null
        const nextProfileId = profile?.profile.profileId ?? null
        const seenEquipmentIds =
          previousProfileId === nextProfileId
            ? current.seenEquipmentIds
            : readSeenEquipmentFromStorage(nextProfileId)
        const scanHintDismissed =
          previousProfileId === nextProfileId
            ? current.scanHintDismissed
            : readScanHintDismissedFromStorage(nextProfileId)

        return {
          ...current,
          ready: true,
          errorMessage: undefined,
          snapshot,
          content,
          profile,
          settings,
          exploreSnapshot,
          exploreRenderState,
          worldMapViewModel,
          battleRenderState,
          battleResultViewModel,
          archiveSnapshot,
          seenEquipmentIds,
          scanHintDismissed,
          itemPopups: [
            ...current.itemPopups.filter((popup) => popup.expiresAt > Date.now()),
            ...parsedPopups.popups,
          ].slice(-3),
          // 隠し装備は通常 popup ではなく、専用 modal で内容を見せます。
          equipmentModalNodeId: parsedPopups.equipmentModalNodeId ?? current.equipmentModalNodeId,
          ...mergePresentationRequests(
            current,
            [...queuedPresentationRequests, ...incomingPresentationRequests],
            content,
          ),
        }
      })
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

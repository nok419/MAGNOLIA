import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  ArchiveSnapshot,
  AreaId,
  ContentBundle,
  DomainEvent,
  EquipmentId,
  ExploreTransitionSourceFrame,
  PresentationRequest,
  ProfileAggregate,
  RootSnapshot,
  SaveSlotId,
  SettingsRow,
  TransmissionId,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  MagnoliaGameSession,
  selectEquipmentHint,
  type BattleRenderState,
  type ExploreRenderState,
  type WorldMapViewModel,
} from "@magnolia/game-session"
import { createMagnoliaClient } from "@/app/magnolia-client"
import type { IdleAutoSaveViewModel, SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
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
import { useMagnoliaFrameLoop } from "@/app/frame-loop/use-magnolia-frame-loop"
import {
  createAudioEventAdapterState,
  playSessionAudioEvents,
} from "@/app/audio-event-adapter"
import { audioEvents } from "@/audio"
import {
  buildCollectiblePopups,
  createExplorePopup,
  type ExploreItemPopup,
  pushExplorePopup,
} from "@/app/popups/item-popups"
import {
  dismissOverlayPresentation,
  transitionRebootToSettle,
} from "@/app/presentation/overlay-queue"
import {
  mergePresentationRequests,
  pruneExpiredPresentationEvents,
} from "@/app/presentation/presentation-reducer"
import {
  selectBattlePresentationEvents,
  selectExplorePresentationEvents,
  selectTransitionPresentationEvents,
} from "@/app/presentation/presentation-selectors"
import {
  createEmptyPresentationState,
  type WebPresentationState,
} from "@/app/presentation/presentation-state"
import {
  readSeenEquipmentFromStorage,
  writeSeenEquipmentToStorage,
} from "@/app/storage/seen-equipment-store"
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

type CommandTarget =
  | "map"
  | "archive"
  | "equipment"
  | "settings"
  | "closePanel"
  | "returnToTitle"
  | "saveCurrentSlot"

type ExploreInteractionContext = {
  nodeId: WorldMapNodeId
  worldPosition: { x: number; y: number }
  sourceFrame: ExploreTransitionSourceFrame
}

const IDLE_AUTO_SAVE_WARNING_AFTER_MS = 50_000
const IDLE_AUTO_SAVE_COUNTDOWN_MS = 10_000
const IDLE_AUTO_SAVE_TICK_MS = 250

type IdleAutoSaveCountdown = {
  startedAt: number
  deadlineAt: number
  targetSlotId: SaveSlotId
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
  const idleCountdownRef = useRef<IdleAutoSaveCountdown | null>(null)
  const idleAutoSavingRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const session = sessionRef.current
      const current = stateRef.current
      const snapshot = current.snapshot

      if (
        !session ||
        !snapshot ||
        !current.profile ||
        snapshot.screen === "title" ||
        current.slotSelectMode
      ) {
        clearIdleAutoSaveCountdown()
        input.markActivity(Date.now())
        return
      }

      const now = Date.now()
      if (input.hasActiveInput()) {
        // 押しっぱなしの移動や攻撃は継続中の操作として扱い、無操作に入りません。
        input.markActivity(now)
      }

      const countdown = idleCountdownRef.current
      if (countdown) {
        if (input.getLastActivityAt() > countdown.startedAt) {
          clearIdleAutoSaveCountdown()
          return
        }
        const remainingMs = countdown.deadlineAt - now
        if (remainingMs <= 0) {
          void completeIdleAutoSave(session)
          return
        }
        setIdleAutoSave({
          status: "countdown",
          remainingSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
          targetSlotId: countdown.targetSlotId,
        })
        return
      }

      if (now - input.getLastActivityAt() >= IDLE_AUTO_SAVE_WARNING_AFTER_MS) {
        const targetSlotId = selectIdleAutoSaveSlot(snapshot.saveSlots.slots)
        idleCountdownRef.current = {
          startedAt: now,
          deadlineAt: now + IDLE_AUTO_SAVE_COUNTDOWN_MS,
          targetSlotId,
        }
        setIdleAutoSave({
          status: "countdown",
          remainingSeconds: Math.ceil(IDLE_AUTO_SAVE_COUNTDOWN_MS / 1000),
          targetSlotId,
        })
      }
    }, IDLE_AUTO_SAVE_TICK_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const activePresentation = state.presentation.activeOverlay
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
          return {
            ...current,
            presentation: transitionRebootToSettle(current.presentation, activePresentation.requestId),
          }
        }
        return {
          ...current,
          presentation: dismissOverlayPresentation(current.presentation, activePresentation.requestId),
        }
      })
    }, durationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [state.presentation.activeOverlay, state.content])

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
    const expiringEvents = [
      ...state.presentation.battleEvents,
      ...state.presentation.exploreEvents,
      ...state.presentation.transitionEvents,
    ]
    if (expiringEvents.length === 0) {
      return
    }

    const now = Date.now()
    const nextExpiryAt = Math.min(...expiringEvents.map((event) => event.expiresAt))
    const timeoutId = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        presentation: pruneExpiredPresentationEvents(current.presentation, Date.now()),
      }))
    }, Math.max(0, nextExpiryAt - now))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [state.presentation.battleEvents, state.presentation.exploreEvents, state.presentation.transitionEvents])

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
      audioEvents.uiOpen()
      setState((current) => ({
        ...current,
        slotSelectMode: mode,
      }))
    },
    closeSlotSelect() {
      audioEvents.uiClose()
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
        audioEvents.newGameSelected()
      } else {
        await session.dispatch({
          type: "resumeSaveSlot",
          slotId,
        })
        audioEvents.loadGameSelected()
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
    async interactExploreNode(nodeId: WorldMapNodeId, context?: ExploreInteractionContext) {
      const session = sessionRef.current
      if (!session) return
      await session.dispatch({ type: "interactExploreNode", nodeId })
      syncFromSession(session, [], [], context)
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
      setState((current) => ({
        ...current,
        presentation: dismissOverlayPresentation(current.presentation),
      }))
    },
  }

  function clearIdleAutoSaveCountdown() {
    idleCountdownRef.current = null
    idleAutoSavingRef.current = false
    setIdleAutoSave(null)
  }

  async function completeIdleAutoSave(session: MagnoliaGameSession) {
    const countdown = idleCountdownRef.current
    if (!countdown || idleAutoSavingRef.current) {
      return
    }

    idleAutoSavingRef.current = true
    setIdleAutoSave({
      status: "saving",
      remainingSeconds: 0,
      targetSlotId: countdown.targetSlotId,
    })

    try {
      await session.dispatch({ type: "saveToSlot", slotId: countdown.targetSlotId })
      await session.dispatch({ type: "returnToTitle" })
      idleCountdownRef.current = null
      input.markActivity(Date.now())
      syncFromSession(session)
    } catch (error) {
      idleCountdownRef.current = null
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "自動保存に失敗しました。",
      }))
    } finally {
      idleAutoSavingRef.current = false
      setIdleAutoSave(null)
    }
  }

  function syncFromSession(
    session: MagnoliaGameSession,
    incomingPresentationRequests: PresentationRequest[] = [],
    incomingEvents: DomainEvent[] = [],
    exploreInteractionContext?: ExploreInteractionContext,
  ) {
    const queuedPresentationRequests = session.drainPresentationRequests()
    const queuedDomainEvents = session.drainDomainEvents()
    const presentationRequests = attachExploreTransitionSource(
      [
        ...queuedPresentationRequests,
        ...incomingPresentationRequests,
      ],
      exploreInteractionContext,
    )
    const domainEvents = [...queuedDomainEvents, ...incomingEvents]

    const snapshot = session.getSnapshot()
    const content = session.getContentBundle()
    const profile = session.getProfileAggregate()
    const settings = session.getSettings()
    const exploreSnapshot = session.getExploreSnapshot()
    const exploreRenderState = session.getExploreRenderState()
    const worldMapViewModel = session.getWorldMapViewModel()
    const battleRenderState = session.getBattleRenderState()
    const archiveSnapshot = session.getArchiveSnapshot()
    const parsedPopups = buildCollectiblePopups(domainEvents, content)
    const now = Date.now()

    input.syncButtonEdges(settings)
    // 音声は browser side effect なので、session ではなく Web adapter で意味イベントから変換します。
    playSessionAudioEvents({
      state: audioEventStateRef.current,
      previousSnapshot: stateRef.current.snapshot,
      nextSnapshot: snapshot,
      presentationRequests,
      domainEvents,
    })

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
          presentation: mergePresentationRequests({
            current: current.presentation,
            requests: presentationRequests,
            content,
            now,
            battleElapsedMs: battleRenderState?.elapsedMs,
          }),
          archiveSnapshot,
          seenEquipmentIds,
          itemPopups: [
            ...current.itemPopups.filter((popup) => popup.expiresAt > Date.now()),
            ...parsedPopups.popups,
          ].slice(-3),
          // 隠し装備は通常 popup ではなく、専用 modal で内容を見せます。
          equipmentModalNodeId: parsedPopups.equipmentModalNodeId ?? current.equipmentModalNodeId,
        }
      })
    })
  }
}

function attachExploreTransitionSource(
  requests: PresentationRequest[],
  context: ExploreInteractionContext | undefined,
): PresentationRequest[] {
  if (!context) {
    return requests
  }

  return requests.map((request) => {
    if (request.channel !== "transition") {
      return request
    }
    const distance = Math.hypot(
      request.worldPosition.x - context.worldPosition.x,
      request.worldPosition.y - context.worldPosition.y,
    )
    if (distance > 1) {
      return request
    }

    // transition layer は担当範囲外ですが、探索側でクリック時の画面 anchor を渡せる形にします。
    return {
      ...request,
      sourceFrame: context.sourceFrame,
    }
  })
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

function selectIdleAutoSaveSlot(
  slots: RootSnapshot["saveSlots"]["slots"],
): SaveSlotId {
  const emptySlot = slots.find((slot) => isTitleSaveSlotEmpty(slot))
  if (emptySlot) {
    return emptySlot.slotId
  }

  // 空きがない場合は、要求通り最も古い updatedAt のスロットを自動保存先にします。
  const oldestSlot = [...slots].sort(
    (left, right) => readSlotUpdatedAtMs(left.updatedAt) - readSlotUpdatedAtMs(right.updatedAt),
  )[0]
  return oldestSlot?.slotId ?? 1
}

function readSlotUpdatedAtMs(updatedAt: string | undefined): number {
  if (!updatedAt) {
    return 0
  }
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

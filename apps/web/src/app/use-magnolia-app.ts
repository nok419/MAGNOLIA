import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  ArchiveSnapshot,
  AreaId,
  CollectibleMapNode,
  ContentBundle,
  DomainEvent,
  EquipmentId,
  PresentationRequest,
  ProfileAggregate,
  RootSnapshot,
  SaveSlotId,
  SettingsRow,
  TransmissionId,
} from "@magnolia/contracts"
import {
  MagnoliaGameSession,
  type BattleRenderState,
  type ExploreRenderState,
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
  REBOOT_SETTLE_CUE_ID,
  shouldAutoDismissOverlayPresentation,
  type OverlayPresentationRequest,
} from "@/app/explore-presentation"
import {
  formatPlayTime,
  formatTimestamp,
  readEquipmentSlotLabel,
} from "@/app/display-helpers"
import { useMagnoliaInput } from "@/app/use-magnolia-input"

type MagnoliaAppState = {
  ready: boolean
  errorMessage?: string
  snapshot: RootSnapshot | null
  content: ContentBundle | null
  profile: ProfileAggregate | null
  settings: SettingsRow | null
  exploreSnapshot: RootSnapshot["explore"] | null
  exploreRenderState: ExploreRenderState | null
  battleRenderState: BattleRenderState | null
  archiveSnapshot: ArchiveSnapshot | null
  slotSelectMode: SlotSelectMode | null
  activeOverlayPresentation: OverlayPresentationRequest | null
  pendingOverlayPresentations: OverlayPresentationRequest[]
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

const FRAME_INTERVAL_MS = 1000 / 60
const ZERO_VECTOR = { x: 0, y: 0 }
const OVERLAY_CHANNEL = "overlay"
const ITEM_POPUP_DURATION_MS = 2200
const SEEN_EQUIPMENT_STORAGE_PREFIX = "magnolia.seenEquipment:"
const MISSION_GOOD_MORNING_ID = "mission_good_morning"

function readSeenEquipmentFromStorage(profileId: string | null | undefined): string[] {
  if (!profileId || typeof window === "undefined") {
    return []
  }
  try {
    const raw = window.localStorage.getItem(`${SEEN_EQUIPMENT_STORAGE_PREFIX}${profileId}`)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
  } catch {
    return []
  }
}

function writeSeenEquipmentToStorage(profileId: string | null | undefined, ids: string[]): void {
  if (!profileId || typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(
      `${SEEN_EQUIPMENT_STORAGE_PREFIX}${profileId}`,
      JSON.stringify(Array.from(new Set(ids))),
    )
  } catch {
    // ignore quota / disabled storage
  }
}

type ExploreItemPopup = {
  id: string
  title: string
  detail: string
  expiresAt: number
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
    battleRenderState: null,
    archiveSnapshot: null,
    slotSelectMode: null,
    activeOverlayPresentation: null,
    pendingOverlayPresentations: [],
    itemPopups: [],
    equipmentModalNodeId: null,
    seenEquipmentIds: [],
  })
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

  useEffect(() => {
    function stepFrame(now: number) {
      frameHandleRef.current = window.requestAnimationFrame(stepFrame)

      const session = sessionRef.current
      const appState = stateRef.current
      const snapshot = appState.snapshot

      if (!session || !snapshot || appState.slotSelectMode) {
        lastFrameAtRef.current = now
        return
      }

      const previousFrameAt = lastFrameAtRef.current ?? now
      lastFrameAtRef.current = now
      const dtMs = Math.max(8, Math.min(34, now - previousFrameAt || FRAME_INTERVAL_MS))
      const settings = session.getSettings()
      const explorePresentation = readExplorePresentationState(
        appState.activeOverlayPresentation,
        appState.content,
      )

      const pausesWorld =
        snapshot.screen === "explore"
          ? explorePresentation.pausesWorld
          : Boolean(appState.activeOverlayPresentation?.blocking)
      if (pausesWorld) {
        input.syncButtonEdges(settings)
        return
      }

      if (
        (snapshot.screen === "archive" ||
          snapshot.screen === "equipment" ||
          snapshot.screen === "settings" ||
          snapshot.screen === "map") &&
        input.isClosePanelPressed(snapshot.screen, settings)
      ) {
        // 開閉に同じキーを使うため、画面を閉じる瞬間に押下状態を消費して再オープンを防ぎます。
        input.syncButtonEdges(settings)
        void session.dispatch({ type: "closePanel" }).then(() => syncFromSession(session))
        return
      }

      // equipment modal が出ている間も explore をポーズ
      if (snapshot.screen === "explore" && stateRef.current.equipmentModalNodeId) {
        return
      }

      if (snapshot.screen === "explore") {
        const mapPressed = input.isMapPressed(settings)
        const equipmentPressed = input.isEquipmentPressed(settings)
        // explore 専用の演出 state を正本にし、入力停止の条件をここ 1 か所へ寄せます。
        const inputsLocked = explorePresentation.blocksInput

        if (mapPressed && !inputsLocked) {
          if (!tryOpenMap(session)) {
            input.syncButtonEdges(settings)
            return
          }
          // M 押下をここで消費しないと、map 画面へ入った直後に閉じ判定へ流れます。
          input.syncButtonEdges(settings)
          void session.dispatch({ type: "openMap" }).then(() => syncFromSession(session))
          return
        }

        if (equipmentPressed && !inputsLocked) {
          // E 押下を消費し、equipment 画面へ入った直後の即時 close を防ぎます。
          input.syncButtonEdges(settings)
          void session.dispatch({ type: "openEquipment" }).then(() => syncFromSession(session))
          return
        }

        const result = session.stepExplore({
          dtMs,
          move: inputsLocked
            ? ZERO_VECTOR
            : input.readMovementVector(settings),
          dashPressed: inputsLocked
            ? false
            : input.isDashPressed(settings),
          interactPressed: inputsLocked
            ? false
            : input.isInteractPressed(settings),
        })
        syncFromSession(session, result.presentationRequests, result.events)
        return
      }

      if (snapshot.screen === "map") {
        input.syncButtonEdges(settings)
        return
      }

      if (snapshot.screen === "battle") {
        const mouseButtons = input.mouseButtons
        const result = session.stepBattle({
          dtMs,
          move: input.readMovementVector(settings),
          fireMain: mouseButtons.left,
          fireSub: mouseButtons.right,
          focus: input.isDashPressed(settings),
          pausePressed: false,
        })
        syncFromSession(session, result.presentationRequests)
        return
      }

      input.syncButtonEdges(settings)
    }

    frameHandleRef.current = window.requestAnimationFrame(stepFrame)

    return () => {
      if (frameHandleRef.current !== null) {
        window.cancelAnimationFrame(frameHandleRef.current)
      }
    }
  }, [])

  const effectiveScreen =
    state.slotSelectMode ? "slotSelect" : state.snapshot?.screen ?? "title"
  const explorePresentation = readExplorePresentationState(
    state.activeOverlayPresentation,
    state.content,
  )

  // 取得済みだがまだ装備画面で確認していない装備。
  // 探索中の誘導表示とカテゴリタブ NEW バッジの共通ソース。
  const ownedEquipmentIds = state.profile?.profile.ownedEquipmentIds ?? []
  const seenEquipmentSet = new Set(state.seenEquipmentIds)
  const unseenEquipmentIds = ownedEquipmentIds.filter((id) => !seenEquipmentSet.has(id))
  // mission 01 をクリア済みでまだ未確認装備がある間だけ、探索画面で E キー誘導を出す。
  const shouldShowEquipmentHint =
    (state.profile?.profile.clearedMissionIds.includes(MISSION_GOOD_MORNING_ID) ?? false) &&
    unseenEquipmentIds.length > 0

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
    // 現行の Web 実装では overlay channel だけを React で描画します。
    // それ以外の channel は将来の演出実装まで queue せず、state を軽く保ちます。
    const incomingOverlayRequests = filterOverlayPresentations(incomingPresentationRequests)
    const queuedOverlayRequests = filterOverlayPresentations(session.drainPresentationRequests())

    const snapshot = session.getSnapshot()
    const content = session.getContentBundle()
    const profile = session.getProfileAggregate()
    const settings = session.getSettings()
    const exploreSnapshot = session.getExploreSnapshot()
    const exploreRenderState = session.getExploreRenderState()
    const battleRenderState = session.getBattleRenderState()
    const archiveSnapshot = session.getArchiveSnapshot()
    const parsedPopups = buildCollectiblePopups(incomingEvents, content)

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
          battleRenderState,
          archiveSnapshot,
          seenEquipmentIds,
          itemPopups: [
            ...current.itemPopups.filter((popup) => popup.expiresAt > Date.now()),
            ...parsedPopups.popups,
          ].slice(-3),
          // 隠し装備は通常 popup ではなく、専用 modal で内容を見せます。
          equipmentModalNodeId: parsedPopups.equipmentModalNodeId ?? current.equipmentModalNodeId,
          ...mergeOverlayPresentations(current, [
            ...queuedOverlayRequests,
            ...incomingOverlayRequests,
          ]),
        }
      })
    })
  }
}

function createExplorePopup(title: string, detail: string): ExploreItemPopup {
  return {
    id: `${title}:${detail}:${Date.now()}`,
    title,
    detail,
    expiresAt: Date.now() + ITEM_POPUP_DURATION_MS,
  }
}

function pushExplorePopup(
  currentPopups: ExploreItemPopup[],
  popup: ExploreItemPopup,
): ExploreItemPopup[] {
  const activePopups = currentPopups.filter((entry) => entry.expiresAt > Date.now())

  // 同じ locked 通知を短時間に重ね過ぎると読みにくいので、同内容は入れ替えます。
  const deduped = activePopups.filter(
    (entry) => !(entry.title === popup.title && entry.detail === popup.detail),
  )

  return [...deduped, popup].slice(-3)
}

function filterOverlayPresentations(
  requests: PresentationRequest[],
): OverlayPresentationRequest[] {
  return requests.filter(
    (request): request is OverlayPresentationRequest => request.channel === OVERLAY_CHANNEL,
  )
}

function mergeOverlayPresentations(
  current: MagnoliaAppState,
  nextRequests: OverlayPresentationRequest[],
): Pick<MagnoliaAppState, "activeOverlayPresentation" | "pendingOverlayPresentations"> {
  if (nextRequests.length === 0) {
    return {
      activeOverlayPresentation: current.activeOverlayPresentation,
      pendingOverlayPresentations: current.pendingOverlayPresentations,
    }
  }

  const queue = [...current.pendingOverlayPresentations]
  const knownRequestIds = new Set<string>(
    [
      current.activeOverlayPresentation?.requestId,
      ...current.pendingOverlayPresentations.map((request) => request.requestId),
    ].filter((value): value is string => Boolean(value)),
  )

  for (const request of nextRequests) {
    if (knownRequestIds.has(request.requestId)) {
      continue
    }
    knownRequestIds.add(request.requestId)
    queue.push(request)
  }

  if (current.activeOverlayPresentation) {
    return {
      activeOverlayPresentation: current.activeOverlayPresentation,
      pendingOverlayPresentations: queue,
    }
  }

  const [nextActive, ...rest] = queue
  return {
    activeOverlayPresentation: nextActive ?? null,
    pendingOverlayPresentations: rest,
  }
}

function dismissOverlayPresentation(
  current: MagnoliaAppState,
  requestId?: string,
): MagnoliaAppState {
  if (!current.activeOverlayPresentation) {
    return current
  }
  if (requestId && current.activeOverlayPresentation.requestId !== requestId) {
    return current
  }

  const [nextActive, ...rest] = current.pendingOverlayPresentations
  return {
    ...current,
    activeOverlayPresentation: nextActive ?? null,
    pendingOverlayPresentations: rest,
  }
}

function transitionRebootToSettle(
  current: MagnoliaAppState,
  rebootRequestId: string,
): MagnoliaAppState {
  const active = current.activeOverlayPresentation
  if (!active || active.requestId !== rebootRequestId) {
    return current
  }

  const settleRequest: OverlayPresentationRequest = {
    requestId: `${rebootRequestId}.settle`,
    cueId: REBOOT_SETTLE_CUE_ID,
    channel: "overlay",
    blocking: true,
  }

  return {
    ...current,
    activeOverlayPresentation: settleRequest,
    // pending は reboot 本編と同じ順序で維持。settle は本編の "延長" として active を差し替える扱い。
    pendingOverlayPresentations: current.pendingOverlayPresentations,
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

function buildCollectiblePopups(
  events: DomainEvent[],
  content: ContentBundle,
): { popups: ExploreItemPopup[]; equipmentModalNodeId: string | null } {
  if (events.length === 0) {
    return { popups: [], equipmentModalNodeId: null }
  }

  const now = Date.now()
  let equipmentModalNodeId: string | null = null
  const popups = events.flatMap((event) => {
    if (event.type !== "collectibleCollected") {
      return []
    }

    const node = findCollectibleNode(content, event.nodeId)
    if (!node) {
      return []
    }

    if (node.collectibleKind === "hiddenEquipment") {
      equipmentModalNodeId = node.nodeId
      return []
    }

    const popup = describeCollectiblePopup(node, content)
    return [
      {
        id: `${event.nodeId}:${now}`,
        title: popup.title,
        detail: popup.detail,
        expiresAt: now + ITEM_POPUP_DURATION_MS,
      },
    ]
  })

  return { popups, equipmentModalNodeId }
}

function findCollectibleNode(
  content: ContentBundle,
  nodeId: string,
): CollectibleMapNode | null {
  for (const mapLogic of Object.values(content.mapLogic)) {
    const node = mapLogic.collectibleNodes.find((candidate) => candidate.nodeId === nodeId)
    if (node) {
      return node
    }
  }
  return null
}

function describeCollectiblePopup(
  node: CollectibleMapNode,
  content: ContentBundle,
): { title: string; detail: string } {
  if (node.collectibleKind === "selfRepairPoints") {
    return {
      title: "自己修復ポイントを取得",
      detail: `+${node.selfRepairPointAmount ?? 0} pt`,
    }
  }

  const equipment = node.equipmentId ? content.equipment[node.equipmentId] : undefined
  return {
    title: equipment?.name ?? "装備を取得",
    detail: equipment ? `${readEquipmentSlotLabel(equipment.slot)}を取得` : "装備を取得",
  }
}

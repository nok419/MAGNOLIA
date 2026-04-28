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
  type BattleRenderState,
  type ExploreRenderState,
} from "@magnolia/game-session"
import type { SaveSlotSummary, SlotSelectMode } from "@/app/app-types"
import {
  readExplorePresentationState,
  readPresentationDurationMs,
  REBOOT_SEQUENCE_CUE_ID,
  shouldAutoDismissOverlayPresentation,
  type OverlayPresentationRequest,
} from "@/app/explore-presentation"
import {
  formatPlayTime,
  formatTimestamp,
} from "@/app/display-helpers"
import { createMagnoliaClient } from "@/app/magnolia-client"
import {
  dismissOverlayPresentation,
  filterOverlayPresentations,
  mergeOverlayPresentations,
  transitionRebootToSettle,
} from "@/app/presentation/overlay-queue"
import {
  buildCollectiblePopups,
  createExplorePopup,
  ITEM_POPUP_DURATION_MS,
  pushExplorePopup,
  type ExploreItemPopup,
} from "@/app/presentation/item-popups"
import {
  readSeenEquipmentFromStorage,
  writeSeenEquipmentToStorage,
} from "@/app/storage/seen-equipment-store"
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
const LOW_FRAME_INTERVAL_MS = 1000 / 30
const ZERO_VECTOR = { x: 0, y: 0 }
const MISSION_GOOD_MORNING_ID = "mission_good_morning"

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
        const { session } = await createMagnoliaClient()
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

      const settings = session.getSettings()
      const targetFrameIntervalMs = settings.lowFrameRateMode
        ? LOW_FRAME_INTERVAL_MS
        : FRAME_INTERVAL_MS
      if (
        lastFrameAtRef.current !== null &&
        now - lastFrameAtRef.current < targetFrameIntervalMs
      ) {
        return
      }
      const previousFrameAt = lastFrameAtRef.current ?? now
      lastFrameAtRef.current = now
      const dtMs = Math.max(8, Math.min(34, now - previousFrameAt || FRAME_INTERVAL_MS))
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
            : input.isInteractPressed(settings) || input.isPrimaryMouseJustPressed(),
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
  // MAGNOLIA OS を装備済みの場合は誘導済みとみなして非表示にする。
  const hasMagnoliaOs = state.profile?.profile.equipped.os === "eq_os_magnolia"
  const shouldShowEquipmentHint =
    (state.profile?.profile.clearedMissionIds.includes(MISSION_GOOD_MORNING_ID) ?? false) &&
    unseenEquipmentIds.length > 0 &&
    !hasMagnoliaOs

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
    // 現行の Web 実装では overlay channel だけを React で描画します。
    // それ以外の channel は将来の演出実装まで queue せず、state を軽く保ちます。
    const incomingOverlayRequests = filterOverlayPresentations(incomingPresentationRequests)
    const queuedOverlayRequests = filterOverlayPresentations(session.drainPresentationRequests())
    const queuedEvents = session.drainDomainEvents()

    const snapshot = session.getSnapshot()
    const content = session.getContentBundle()
    const profile = session.getProfileAggregate()
    const settings = session.getSettings()
    const exploreSnapshot = session.getExploreSnapshot()
    const exploreRenderState = session.getExploreRenderState()
    const battleRenderState = session.getBattleRenderState()
    const archiveSnapshot = session.getArchiveSnapshot()
    const parsedPopups = buildCollectiblePopups([...queuedEvents, ...incomingEvents], content)

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

import { useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import type {
  DomainEvent,
  PresentationRequest,
  RootSnapshot,
  SettingsRow,
} from "@magnolia/contracts"
import { MagnoliaGameSession } from "@magnolia/game-session"
import { readExplorePresentationState } from "@/app/explore-presentation"
import type { MagnoliaAppState } from "@/app/app-state"
import type { MagnoliaInputController } from "@/app/use-magnolia-input"

const FRAME_INTERVAL_MS = 1000 / 60
const LOW_FRAME_INTERVAL_MS = 1000 / 30
const ZERO_VECTOR = { x: 0, y: 0 }

export function useMagnoliaFrameLoop(input: {
  controls: MagnoliaInputController
  sessionRef: MutableRefObject<MagnoliaGameSession | null>
  stateRef: MutableRefObject<MagnoliaAppState>
  tryOpenMap: (session: MagnoliaGameSession) => boolean
  syncFromSession: (
    session: MagnoliaGameSession,
    incomingPresentationRequests?: PresentationRequest[],
    incomingEvents?: DomainEvent[],
  ) => void
}) {
  const lastFrameAtRef = useRef<number | null>(null)
  const frameHandleRef = useRef<number | null>(null)

  useEffect(() => {
    function stepFrame(now: number) {
      frameHandleRef.current = window.requestAnimationFrame(stepFrame)

      const session = input.sessionRef.current
      const appState = input.stateRef.current
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
        input.controls.syncButtonEdges(settings)
        return
      }

      if (shouldClosePanel(snapshot.screen, settings, input.controls)) {
        // 開閉に同じキーを使うため、画面を閉じる瞬間に押下状態を消費して再オープンを防ぎます。
        input.controls.syncButtonEdges(settings)
        void session.dispatch({ type: "closePanel" }).then(() => input.syncFromSession(session))
        return
      }

      // equipment modal が出ている間も explore をポーズします。
      if (snapshot.screen === "explore" && appState.equipmentModalNodeId) {
        return
      }

      if (snapshot.screen === "explore") {
        stepExploreFrame({
          session,
          appState,
          dtMs,
          controls: input.controls,
          tryOpenMap: input.tryOpenMap,
          syncFromSession: input.syncFromSession,
        })
        return
      }

      if (snapshot.screen === "map") {
        input.controls.syncButtonEdges(settings)
        return
      }

      if (snapshot.screen === "battle") {
        const mouseButtons = input.controls.mouseButtons
        const subJustPressed = input.controls.isSecondaryMouseJustPressed()
        const result = session.stepBattle({
          dtMs,
          move: input.controls.readMovementVector(settings),
          fireMain: mouseButtons.left,
          fireSub: mouseButtons.right || subJustPressed,
          focus: input.controls.isDashPressed(settings),
          pausePressed: false,
        })
        // 戦闘中の副ボタンは sub 用です。探索へ戻った直後の scan として再利用しません。
        input.controls.syncButtonEdges(settings)
        input.syncFromSession(session, result.presentationRequests, result.events)
        return
      }

      input.controls.syncButtonEdges(settings)
    }

    frameHandleRef.current = window.requestAnimationFrame(stepFrame)

    return () => {
      if (frameHandleRef.current !== null) {
        window.cancelAnimationFrame(frameHandleRef.current)
      }
    }
  }, [])
}

function shouldClosePanel(
  screen: RootSnapshot["screen"],
  settings: SettingsRow,
  controls: MagnoliaInputController,
): boolean {
  return (
    (screen === "archive" || screen === "equipment" || screen === "settings" || screen === "map") &&
    controls.isClosePanelPressed(screen, settings)
  )
}

function stepExploreFrame(input: {
  session: MagnoliaGameSession
  appState: MagnoliaAppState
  dtMs: number
  controls: MagnoliaInputController
  tryOpenMap: (session: MagnoliaGameSession) => boolean
  syncFromSession: (
    session: MagnoliaGameSession,
    incomingPresentationRequests?: PresentationRequest[],
    incomingEvents?: DomainEvent[],
  ) => void
}) {
  const settings = input.session.getSettings()
  const mapPressed = input.controls.isMapPressed(settings)
  const equipmentPressed = input.controls.isEquipmentPressed(settings)
  const explorePresentation = readExplorePresentationState(
    input.appState.activeOverlayPresentation,
    input.appState.content,
  )
  const inputsLocked = explorePresentation.blocksInput
  if (inputsLocked) {
    // 演出中の click / key edge を通常操作へ持ち越さないよう、この frame で消費します。
    input.controls.syncButtonEdges(settings)
  }

  if (mapPressed && !inputsLocked) {
    if (!input.tryOpenMap(input.session)) {
      input.controls.syncButtonEdges(settings)
      return
    }
    // M 押下をここで消費しないと、map 画面へ入った直後に閉じ判定へ流れます。
    input.controls.syncButtonEdges(settings)
    void input.session.dispatch({ type: "openMap" }).then(() => input.syncFromSession(input.session))
    return
  }

  if (equipmentPressed && !inputsLocked) {
    // E 押下を消費し、equipment 画面へ入った直後の即時 close を防ぎます。
    input.controls.syncButtonEdges(settings)
    void input.session.dispatch({ type: "openEquipment" }).then(() => input.syncFromSession(input.session))
    return
  }

  const result = input.session.stepExplore({
    dtMs: input.dtMs,
    move: inputsLocked
      ? ZERO_VECTOR
      : input.controls.readMovementVector(settings),
    dashPressed: inputsLocked
      ? false
      : input.controls.isDashPressed(settings),
    interactPressed: inputsLocked
      ? false
      : input.controls.isInteractPressed(settings) || input.controls.isPrimaryMouseJustPressed(),
    scanPressed: inputsLocked
      ? false
      : input.controls.isScanPressed(settings) || input.controls.isSecondaryMouseJustPressed(),
  })
  input.syncFromSession(input.session, result.presentationRequests, result.events)
}

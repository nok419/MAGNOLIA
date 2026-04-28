import { useEffect } from "react"
import type { MutableRefObject } from "react"
import type { DomainEvent, PresentationRequest } from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import {
  readExplorePresentationState,
} from "@/app/explore-presentation"
import type { useMagnoliaInput } from "@/app/use-magnolia-input"
import type { MagnoliaAppState } from "./magnolia-app-state"

type MagnoliaInput = ReturnType<typeof useMagnoliaInput>

const FRAME_INTERVAL_MS = 1000 / 60
const LOW_FRAME_INTERVAL_MS = 1000 / 30
const ZERO_VECTOR = { x: 0, y: 0 }

export function useMagnoliaFrameLoop({
  input,
  sessionRef,
  stateRef,
  lastFrameAtRef,
  frameHandleRef,
  tryOpenMap,
  syncFromSession,
}: {
  input: MagnoliaInput
  sessionRef: MutableRefObject<MagnoliaGameSession | null>
  stateRef: MutableRefObject<MagnoliaAppState>
  lastFrameAtRef: MutableRefObject<number | null>
  frameHandleRef: MutableRefObject<number | null>
  tryOpenMap: (session: MagnoliaGameSession) => boolean
  syncFromSession: (
    session: MagnoliaGameSession,
    incomingRequests?: PresentationRequest[],
    incomingEvents?: DomainEvent[],
  ) => void
}) {
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

      if (snapshot.screen === "explore" && stateRef.current.equipmentModalNodeId) {
        return
      }

      if (snapshot.screen === "explore") {
        runExploreFrame({
          dtMs,
          input,
          session,
          settings,
          explorePresentation,
          tryOpenMap,
          syncFromSession,
        })
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
        // 戦闘中の副ボタンは sub 用です。探索へ戻った直後の scan として再利用しません。
        input.syncButtonEdges(settings)
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
}

function runExploreFrame({
  dtMs,
  input,
  session,
  settings,
  explorePresentation,
  tryOpenMap,
  syncFromSession,
}: {
  dtMs: number
  input: MagnoliaInput
  session: MagnoliaGameSession
  settings: ReturnType<MagnoliaGameSession["getSettings"]>
  explorePresentation: ReturnType<typeof readExplorePresentationState>
  tryOpenMap: (session: MagnoliaGameSession) => boolean
  syncFromSession: (
    session: MagnoliaGameSession,
    incomingRequests?: PresentationRequest[],
    incomingEvents?: DomainEvent[],
  ) => void
}) {
  const mapPressed = input.isMapPressed(settings)
  const equipmentPressed = input.isEquipmentPressed(settings)
  // explore 専用の演出 state を正本にし、入力停止の条件をここ 1 か所へ寄せます。
  const inputsLocked = explorePresentation.blocksInput
  if (inputsLocked) {
    // 演出中の click / key edge を通常操作へ持ち越さないよう、この frame で消費します。
    input.syncButtonEdges(settings)
  }

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
    scanPressed: inputsLocked
      ? false
      : input.isScanPressed(settings) || input.isSecondaryMouseJustPressed(),
  })
  syncFromSession(session, result.presentationRequests, result.events)
}

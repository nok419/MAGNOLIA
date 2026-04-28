import { startTransition } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { DomainEvent, PresentationRequest } from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import { resolveDisplayOptions } from "@/app/display-options"
import { buildCollectiblePopups } from "@/app/internal/explore-popups"
import {
  filterOverlayPresentations,
  mergeOverlayPresentations,
} from "@/app/internal/overlay-presentations"
import { readSeenEquipmentFromStorage } from "@/app/internal/seen-equipment-storage"
import type { useMagnoliaInput } from "@/app/use-magnolia-input"
import type { MagnoliaAppState } from "./magnolia-app-state"

type MagnoliaInput = ReturnType<typeof useMagnoliaInput>

export function syncMagnoliaStateFromSession({
  session,
  input,
  setState,
  incomingPresentationRequests = [],
  incomingEvents = [],
}: {
  session: MagnoliaGameSession
  input: MagnoliaInput
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
  incomingPresentationRequests?: PresentationRequest[]
  incomingEvents?: DomainEvent[]
}) {
  // 現行の Web 実装では overlay channel だけを React で描画します。
  // それ以外の channel は将来の演出実装まで queue せず、state を軽く保ちます。
  const incomingOverlayRequests = filterOverlayPresentations(incomingPresentationRequests)
  const queuedOverlayRequests = filterOverlayPresentations(session.drainPresentationRequests())

  const snapshot = session.getSnapshot()
  const content = session.getContentBundle()
  const profile = session.getProfileAggregate()
  const settings = session.getSettings()
  const displayOptions = resolveDisplayOptions(settings)
  const exploreSnapshot = session.getExploreSnapshot()
  const exploreRenderState = session.getExploreRenderState()
  const mapViewModel = session.getMapViewModel({
    canvasPixelRatio: displayOptions.canvasPixelRatio,
    reduceMotion: displayOptions.reduceFlashing,
  })
  const battleRenderState = session.getBattleRenderState()
  const archiveSnapshot = session.getArchiveSnapshot()
  const parsedPopups = buildCollectiblePopups(incomingEvents, content)

  input.syncButtonEdges(settings)

  startTransition(() => {
    setState((current) => {
      // プロファイル切り替え時だけ localStorage から seen 一覧を取り直す。
      // 同一プロファイル内の呼び出しでは既存 state を維持し、書き込み直後の巻き戻しを防ぎます。
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
        mapViewModel,
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

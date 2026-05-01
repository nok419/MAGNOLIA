import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { ContentBundle } from "@magnolia/contracts"
import {
  readPresentationDurationMs,
  REBOOT_SEQUENCE_CUE_ID,
  shouldAutoDismissOverlayPresentation,
} from "@/app/explore-presentation"
import {
  dismissOverlayPresentation,
  transitionRebootToSettle,
} from "@/app/presentation/overlay-queue"
import { pruneExpiredPresentationEvents } from "@/app/presentation/presentation-reducer"
import type { WebPresentationState } from "@/app/presentation/presentation-state"
import type { ExploreItemPopup } from "@/app/popups/item-popups"
import type { MagnoliaAppState } from "@/app/use-magnolia-app"

type UsePresentationTimersParams = {
  activeOverlay: WebPresentationState["activeOverlay"]
  content: ContentBundle | null
  itemPopups: ExploreItemPopup[]
  presentationEvents: {
    battleEvents: WebPresentationState["battleEvents"]
    exploreEvents: WebPresentationState["exploreEvents"]
    transitionEvents: WebPresentationState["transitionEvents"]
  }
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
}

export function usePresentationTimers({
  activeOverlay,
  content,
  itemPopups,
  presentationEvents,
  setState,
}: UsePresentationTimersParams) {
  useEffect(() => {
    if (!activeOverlay || !shouldAutoDismissOverlayPresentation(activeOverlay)) {
      return
    }

    // 自動終了する overlay は、cue 定義の表示時間を正本として順に消します。
    const durationMs = readPresentationDurationMs(content, activeOverlay.cueId)

    const timeoutId = window.setTimeout(() => {
      setState((current) => {
        // reboot 本編が明けた瞬間に素の探索画面へ戻ると「機体登場 → 操作開始」が
        // 段差として見えるため、本編直後に settle 区間を挟みます。
        if (activeOverlay.cueId === REBOOT_SEQUENCE_CUE_ID) {
          return {
            ...current,
            presentation: transitionRebootToSettle(current.presentation, activeOverlay.requestId),
          }
        }
        return {
          ...current,
          presentation: dismissOverlayPresentation(current.presentation, activeOverlay.requestId),
        }
      })
    }, durationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeOverlay, content])

  useEffect(() => {
    if (itemPopups.length === 0) {
      return
    }

    const now = Date.now()
    const nextExpiryAt = Math.min(...itemPopups.map((popup) => popup.expiresAt))
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
  }, [itemPopups])

  useEffect(() => {
    const expiringEvents = [
      ...presentationEvents.battleEvents,
      ...presentationEvents.exploreEvents,
      ...presentationEvents.transitionEvents,
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
  }, [
    presentationEvents.battleEvents,
    presentationEvents.exploreEvents,
    presentationEvents.transitionEvents,
  ])
}

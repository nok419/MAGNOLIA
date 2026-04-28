import type { RebootSettlePresentationRequest } from "@magnolia/contracts"
import { REBOOT_SETTLE_CUE_ID } from "@/app/explore-presentation"
import type { OverlayPresentationRequest, WebPresentationState } from "@/app/presentation/presentation-state"

export function mergeOverlayPresentations(
  current: WebPresentationState,
  nextRequests: OverlayPresentationRequest[],
): Pick<WebPresentationState, "activeOverlay" | "pendingOverlay"> {
  if (nextRequests.length === 0) {
    return {
      activeOverlay: current.activeOverlay,
      pendingOverlay: current.pendingOverlay,
    }
  }

  const queue = [...current.pendingOverlay]
  const knownRequestIds = new Set<string>(
    [
      current.activeOverlay?.requestId,
      ...current.pendingOverlay.map((request) => request.requestId),
    ].filter((value): value is string => Boolean(value)),
  )

  for (const request of nextRequests) {
    if (knownRequestIds.has(request.requestId)) {
      continue
    }
    knownRequestIds.add(request.requestId)
    queue.push(request)
  }

  if (current.activeOverlay) {
    return {
      activeOverlay: current.activeOverlay,
      pendingOverlay: queue,
    }
  }

  const [nextActive, ...rest] = queue
  return {
    activeOverlay: nextActive ?? null,
    pendingOverlay: rest,
  }
}

export function dismissOverlayPresentation(
  current: WebPresentationState,
  requestId?: string,
): WebPresentationState {
  if (!current.activeOverlay) {
    return current
  }
  if (requestId && current.activeOverlay.requestId !== requestId) {
    return current
  }

  const [nextActive, ...rest] = current.pendingOverlay
  return {
    ...current,
    activeOverlay: nextActive ?? null,
    pendingOverlay: rest,
  }
}

export function transitionRebootToSettle(
  current: WebPresentationState,
  rebootRequestId: string,
): WebPresentationState {
  const active = current.activeOverlay
  if (!active || active.requestId !== rebootRequestId) {
    return current
  }

  const settleRequest: RebootSettlePresentationRequest & { channel: "overlay" } = {
    requestId: `${rebootRequestId}.settle`,
    cueId: REBOOT_SETTLE_CUE_ID,
    channel: "overlay",
    blocking: true,
  }

  return {
    ...current,
    activeOverlay: settleRequest,
    // settle は reboot 本編の延長なので、pending の順序を変えません。
    pendingOverlay: current.pendingOverlay,
  }
}

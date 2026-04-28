import type { PresentationRequest } from "@magnolia/contracts"
import {
  REBOOT_SETTLE_CUE_ID,
  type OverlayPresentationRequest,
} from "@/app/explore-presentation"

const OVERLAY_CHANNEL = "overlay"

export type OverlayQueueState = {
  activeOverlayPresentation: OverlayPresentationRequest | null
  pendingOverlayPresentations: OverlayPresentationRequest[]
}

export function filterOverlayPresentations(
  requests: PresentationRequest[],
): OverlayPresentationRequest[] {
  return requests.filter(
    (request): request is OverlayPresentationRequest => request.channel === OVERLAY_CHANNEL,
  )
}

export function mergeOverlayPresentations(
  current: OverlayQueueState,
  nextRequests: OverlayPresentationRequest[],
): OverlayQueueState {
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

export function dismissOverlayPresentation<T extends OverlayQueueState>(
  current: T,
  requestId?: string,
): T {
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

export function transitionRebootToSettle<T extends OverlayQueueState>(
  current: T,
  rebootRequestId: string,
): T {
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
    // settle は reboot 本編の延長なので、pending の順序は維持する。
    pendingOverlayPresentations: current.pendingOverlayPresentations,
  }
}

import type {
  ContentBundle,
  PresentationRequest,
} from "@magnolia/contracts"
import {
  readPresentationDurationMs,
  REBOOT_SEQUENCE_CUE_ID,
  REBOOT_SETTLE_CUE_ID,
  type OverlayPresentationRequest,
} from "@/app/explore-presentation"
import type {
  MagnoliaAppState,
  TimedPresentationRequest,
} from "@/app/app-state"

const OVERLAY_CHANNEL = "overlay"

export function mergePresentationRequests(
  current: MagnoliaAppState,
  nextRequests: PresentationRequest[],
  content: ContentBundle | null,
  nowMs = Date.now(),
): Pick<
  MagnoliaAppState,
  "activeOverlayPresentation" | "pendingOverlayPresentations" | "activeNonOverlayPresentations"
> {
  const overlayPatch = mergeOverlayPresentations(
    current,
    filterOverlayPresentations(nextRequests),
  )
  return {
    ...overlayPatch,
    activeNonOverlayPresentations: mergeNonOverlayPresentations({
      current: current.activeNonOverlayPresentations,
      nextRequests,
      content,
      nowMs,
    }),
  }
}

export function dismissOverlayPresentation(
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

export function transitionRebootToSettle(
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
    // settle は reboot 本編の延長なので、pending の順序は変えません。
    pendingOverlayPresentations: current.pendingOverlayPresentations,
  }
}

export function selectTimedPresentationRequests(
  requests: TimedPresentationRequest[],
  channel: PresentationRequest["channel"],
): TimedPresentationRequest[] {
  return requests.filter((request) => request.channel === channel)
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

function mergeNonOverlayPresentations(input: {
  current: TimedPresentationRequest[]
  nextRequests: PresentationRequest[]
  content: ContentBundle | null
  nowMs: number
}): TimedPresentationRequest[] {
  const activeRequests = input.current.filter((request) => request.expiresAtMs > input.nowMs)
  const knownRequestIds = new Set(activeRequests.map((request) => request.requestId))
  const nextTimedRequests = input.nextRequests
    .filter((request) => request.channel !== OVERLAY_CHANNEL)
    .filter((request) => {
      if (knownRequestIds.has(request.requestId)) {
        return false
      }
      knownRequestIds.add(request.requestId)
      return true
    })
    .map<TimedPresentationRequest>((request) => {
      const durationMs = readPresentationDurationMs(input.content, request.cueId)
      return {
        ...request,
        receivedAtMs: input.nowMs,
        expiresAtMs: input.nowMs + durationMs,
      }
    })

  return [...activeRequests, ...nextTimedRequests].slice(-16)
}

export function isRebootSequenceCue(cueId: string): boolean {
  return cueId === REBOOT_SEQUENCE_CUE_ID
}

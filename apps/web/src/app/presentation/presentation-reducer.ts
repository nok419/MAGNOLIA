import type { ContentBundle, PresentationRequest } from "@magnolia/contracts"
import { readPresentationEventDurationMs } from "@/app/presentation/event-lifetime"
import { mergeOverlayPresentations } from "@/app/presentation/overlay-queue"
import type {
  BattlePresentationRequest,
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
  TransitionPresentationRequest,
  WebPresentationState,
} from "@/app/presentation/presentation-state"
import {
  isBattlePresentationRequest,
  isExplorePresentationRequest,
  isOverlayPresentationRequest,
  isTransitionPresentationRequest,
} from "@/app/presentation/presentation-state"

export function mergePresentationRequests(input: {
  current: WebPresentationState
  requests: PresentationRequest[]
  content: ContentBundle | null
  now: number
  battleElapsedMs?: number
}): WebPresentationState {
  const pruned = pruneExpiredPresentationEvents(input.current, input.now)
  if (input.requests.length === 0) {
    return pruned
  }

  const knownRequestIds = collectKnownRequestIds(pruned)
  const overlayRequests = []
  const battleEvents = [...pruned.battleEvents]
  const exploreEvents = [...pruned.exploreEvents]
  const transitionEvents = [...pruned.transitionEvents]

  for (const request of input.requests) {
    if (knownRequestIds.has(request.requestId)) {
      continue
    }
    knownRequestIds.add(request.requestId)

    if (isOverlayPresentationRequest(request)) {
      overlayRequests.push(request)
      continue
    }

    if (isBattlePresentationRequest(request)) {
      const timed = createTimedPresentationRequest({
        request,
        content: input.content,
        now: input.now,
        startedAtMs: input.battleElapsedMs ?? 0,
      })
      battleEvents.push(timed as TimedPresentationRequest<BattlePresentationRequest>)
    } else if (isExplorePresentationRequest(request)) {
      const timed = createTimedPresentationRequest({
        request,
        content: input.content,
        now: input.now,
        startedAtMs: input.now,
      })
      exploreEvents.push(timed as TimedPresentationRequest<ExploreChannelPresentationRequest>)
    } else if (isTransitionPresentationRequest(request)) {
      const timed = createTimedPresentationRequest({
        request,
        content: input.content,
        now: input.now,
        startedAtMs: input.now,
      })
      transitionEvents.push(timed as TimedPresentationRequest<TransitionPresentationRequest>)
    }
  }

  return {
    ...pruned,
    ...mergeOverlayPresentations(pruned, overlayRequests),
    battleEvents,
    exploreEvents,
    transitionEvents,
  }
}

export function pruneExpiredPresentationEvents(
  current: WebPresentationState,
  now: number,
): WebPresentationState {
  return {
    ...current,
    battleEvents: current.battleEvents.filter((event) => event.expiresAt > now),
    exploreEvents: current.exploreEvents.filter((event) => event.expiresAt > now),
    transitionEvents: current.transitionEvents.filter((event) => event.expiresAt > now),
  }
}

function createTimedPresentationRequest(input: {
  request: PresentationRequest
  content: ContentBundle | null
  now: number
  startedAtMs: number
}): TimedPresentationRequest {
  const durationMs = readPresentationEventDurationMs(input.request, input.content)
  return {
    ...input.request,
    request: input.request,
    startedAt: input.now,
    expiresAt: input.now + durationMs,
    startedAtMs: input.startedAtMs,
    expiresAtMs: input.startedAtMs + durationMs,
    durationMs,
  }
}

function collectKnownRequestIds(state: WebPresentationState): Set<string> {
  return new Set(
    [
      state.activeOverlay?.requestId,
      ...state.pendingOverlay.map((request) => request.requestId),
      ...state.battleEvents.map((event) => event.request.requestId),
      ...state.exploreEvents.map((event) => event.request.requestId),
      ...state.transitionEvents.map((event) => event.request.requestId),
    ].filter((value): value is string => Boolean(value)),
  )
}

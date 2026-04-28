import type {
  PresentationChannel,
  PresentationRequest,
} from "@magnolia/contracts"

type PresentationRequestForChannel<TChannel extends PresentationChannel> =
  PresentationRequest extends infer TRequest
    ? TRequest extends PresentationRequest
      ? TChannel extends TRequest["channel"]
        ? TRequest & { channel: TChannel }
        : never
      : never
    : never

export type OverlayPresentationRequest = PresentationRequestForChannel<"overlay">

export type BattlePresentationRequest = PresentationRequestForChannel<"battle">

export type ExploreChannelPresentationRequest = PresentationRequestForChannel<"explore">

export type TransitionPresentationRequest = PresentationRequestForChannel<"transition">

export type TimedPresentationRequest<TRequest extends PresentationRequest = PresentationRequest> = TRequest & {
  request: TRequest
  startedAt: number
  expiresAt: number
  startedAtMs: number
  expiresAtMs: number
  durationMs: number
}

export type WebPresentationState = {
  activeOverlay: OverlayPresentationRequest | null
  pendingOverlay: OverlayPresentationRequest[]
  battleEvents: TimedPresentationRequest<BattlePresentationRequest>[]
  exploreEvents: TimedPresentationRequest<ExploreChannelPresentationRequest>[]
  transitionEvents: TimedPresentationRequest<TransitionPresentationRequest>[]
}

export function createEmptyPresentationState(): WebPresentationState {
  return {
    activeOverlay: null,
    pendingOverlay: [],
    battleEvents: [],
    exploreEvents: [],
    transitionEvents: [],
  }
}

export function isOverlayPresentationRequest(
  request: PresentationRequest,
): request is OverlayPresentationRequest {
  return request.channel === "overlay"
}

export function isBattlePresentationRequest(
  request: PresentationRequest,
): request is BattlePresentationRequest {
  return request.channel === "battle"
}

export function isExplorePresentationRequest(
  request: PresentationRequest,
): request is ExploreChannelPresentationRequest {
  return request.channel === "explore"
}

export function isTransitionPresentationRequest(
  request: PresentationRequest,
): request is TransitionPresentationRequest {
  return request.channel === "transition"
}

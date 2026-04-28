import type {
  BattlePresentationRequest,
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
  TransitionPresentationRequest,
  WebPresentationState,
} from "@/app/presentation/presentation-state"

export function selectBattlePresentationEvents(
  presentation: WebPresentationState,
): TimedPresentationRequest<BattlePresentationRequest>[] {
  return presentation.battleEvents
}

export function selectExplorePresentationEvents(
  presentation: WebPresentationState,
): TimedPresentationRequest<ExploreChannelPresentationRequest>[] {
  return presentation.exploreEvents
}

export function selectTransitionPresentationEvents(
  presentation: WebPresentationState,
): TimedPresentationRequest<TransitionPresentationRequest>[] {
  return presentation.transitionEvents
}

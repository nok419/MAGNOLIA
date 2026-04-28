import type { ContentBundle, PresentationRequest } from "@magnolia/contracts"
import { readPresentationDurationMs } from "@/app/explore-presentation"

const DEFAULT_NON_BLOCKING_EVENT_DURATION_MS = 900
const DEFAULT_BLOCKING_EVENT_DURATION_MS = 1100

type RequestWithDuration = PresentationRequest & {
  durationMs?: number
  lifetimeMs?: number
}

export function readPresentationEventDurationMs(
  request: PresentationRequest,
  content: ContentBundle | null,
): number {
  const requestWithDuration = request as RequestWithDuration

  // request 固有の寿命がある event は、それを cue 定義より優先します。
  if (typeof requestWithDuration.durationMs === "number" && requestWithDuration.durationMs > 0) {
    return requestWithDuration.durationMs
  }
  if (typeof requestWithDuration.lifetimeMs === "number" && requestWithDuration.lifetimeMs > 0) {
    return requestWithDuration.lifetimeMs
  }

  const cueDurationMs = readPresentationDurationMs(content, request.cueId)
  if (cueDurationMs > 0) {
    return cueDurationMs
  }

  return request.blocking ? DEFAULT_BLOCKING_EVENT_DURATION_MS : DEFAULT_NON_BLOCKING_EVENT_DURATION_MS
}

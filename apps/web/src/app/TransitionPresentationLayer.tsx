import type { CSSProperties } from "react"
import type { TransitionPresentationRequest } from "@magnolia/contracts"
import type { TimedPresentationRequest } from "@/app/app-state"
import type { DisplayOptions } from "@/app/display-options"

type TransitionPresentationEvent = TimedPresentationRequest & TransitionPresentationRequest

type TransitionPresentationLayerProps = {
  requests: TimedPresentationRequest[]
  displayOptions: DisplayOptions
}

export function TransitionPresentationLayer({
  requests,
  displayOptions,
}: TransitionPresentationLayerProps) {
  const request = readActiveTransitionRequest(requests)
  if (!request) {
    return null
  }

  const durationMs = Math.max(1, request.expiresAtMs - request.receivedAtMs)
  const className = [
    "transition-presentation",
    `transition-presentation--${request.destination}`,
    request.cueId === "transmission.connect.sequence"
      ? "transition-presentation--connect"
      : "transition-presentation--warp",
    displayOptions.reduceFlashing ? "transition-presentation--reduced" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className={className}
      style={{
        ["--transition-duration-ms" as keyof CSSProperties]: `${durationMs}ms`,
      }}
      aria-hidden="true"
    >
      <div className="transition-presentation__shade" />
      <div className="transition-presentation__grid" />
      <div className="transition-presentation__stage">
        <div className="transition-presentation__gate transition-presentation__gate--outer" />
        <div className="transition-presentation__gate transition-presentation__gate--middle" />
        <div className="transition-presentation__gate transition-presentation__gate--inner" />
        <div className="transition-presentation__aperture" />
        <div className="transition-presentation__ship">
          <span className="transition-presentation__ship-core" />
        </div>
      </div>
    </div>
  )
}

function readActiveTransitionRequest(
  requests: TimedPresentationRequest[],
): TransitionPresentationEvent | null {
  // transition channel には接続と area warp の両方が入るため、最後の有効な request だけ描画します。
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    const request = requests[index]
    if (isTransitionPresentationRequest(request)) {
      return request
    }
  }
  return null
}

function isTransitionPresentationRequest(
  request: TimedPresentationRequest,
): request is TransitionPresentationEvent {
  return (
    request.channel === "transition" &&
    (request.cueId === "transmission.connect.sequence" ||
      request.cueId === "warp.transition.sequence")
  )
}

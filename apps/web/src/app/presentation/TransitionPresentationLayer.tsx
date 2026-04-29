import type { TimedPresentationRequest, TransitionPresentationRequest } from "@/app/presentation/presentation-state"
import type { DisplayOptions } from "@/app/display-options"
import type { CSSProperties } from "react"

type TransitionPresentationLayerProps = {
  events: TimedPresentationRequest<TransitionPresentationRequest>[]
  displayOptions: DisplayOptions
}

export function TransitionPresentationLayer({
  events,
  displayOptions,
}: TransitionPresentationLayerProps) {
  const activeEvent = events[events.length - 1]
  if (!activeEvent) {
    return null
  }

  const cueId = activeEvent.request.cueId
  const label =
    cueId === "transmission.connect.sequence"
      ? "CONNECTING"
      : "TRANSITION"
  const sourceFrame = activeEvent.request.sourceFrame
  const transitionDurationMs = Math.max(240, activeEvent.durationMs)
  const sourceStyle: CSSProperties = {
    ["--transition-duration-ms" as keyof CSSProperties]: `${transitionDurationMs}ms`,
    ["--transition-sweep-duration-ms" as keyof CSSProperties]: `${Math.round(transitionDurationMs * 0.74)}ms`,
    ["--transition-line-duration-ms" as keyof CSSProperties]: `${Math.round(transitionDurationMs * 0.52)}ms`,
    ["--transition-source-duration-ms" as keyof CSSProperties]: `${Math.round(transitionDurationMs * 0.5)}ms`,
    ...(sourceFrame
      ? {
          ["--transition-source-x" as keyof CSSProperties]: `${sourceFrame.screenAnchor.x}px`,
          ["--transition-source-y" as keyof CSSProperties]: `${sourceFrame.screenAnchor.y}px`,
        }
      : {}),
  }

  return (
    <div
      className={`transition-presentation ${displayOptions.reduceFlashing ? "transition-presentation--reduced" : ""}`}
      style={sourceStyle}
      aria-live="polite"
      aria-label={label.toLowerCase()}
    >
      {sourceFrame ? <span className="transition-presentation__source" aria-hidden="true" /> : null}
      <div className="transition-presentation__field" />
      <div className="transition-presentation__panel">
        <span className="transition-presentation__label">{label}</span>
        <span className="transition-presentation__line" />
      </div>
    </div>
  )
}

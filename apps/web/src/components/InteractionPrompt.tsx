import type { CSSProperties, ReactNode } from "react"
import { useId } from "react"

export type InteractionPromptTone = "warm" | "cyan" | "green" | "red"
export type InteractionPromptPlacement = "right-up" | "left-up" | "right-down" | "left-down"
export type InteractionPromptAnchorPlacement =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "inline-end"

type PromptColorOverrides = {
  accentColor?: string
  accentRgb?: string
  keyTextColor?: string
}

const CALLOUT_WIDTH = 220
const CALLOUT_HEIGHT = 120

const CALLOUT_GEOMETRY: Record<
  InteractionPromptPlacement,
  {
    anchor: { x: number; y: number }
    elbow: { x: number; y: number }
    end: { x: number; y: number }
    label: { x: number; y: number }
    labelSide: "above" | "below"
  }
> = {
  "right-up": {
    anchor: { x: 24, y: 96 },
    elbow: { x: 72, y: 56 },
    end: { x: 168, y: 56 },
    label: { x: 120, y: 56 },
    labelSide: "above",
  },
  "left-up": {
    anchor: { x: 196, y: 96 },
    elbow: { x: 148, y: 56 },
    end: { x: 52, y: 56 },
    label: { x: 100, y: 56 },
    labelSide: "above",
  },
  "right-down": {
    anchor: { x: 24, y: 24 },
    elbow: { x: 72, y: 64 },
    end: { x: 168, y: 64 },
    label: { x: 120, y: 64 },
    labelSide: "below",
  },
  "left-down": {
    anchor: { x: 196, y: 24 },
    elbow: { x: 148, y: 64 },
    end: { x: 52, y: 64 },
    label: { x: 100, y: 64 },
    labelSide: "below",
  },
}

export function InteractionPromptCallout({
  anchor,
  keyLabel,
  label,
  ariaLabel,
  placement = "right-up",
  tone = "warm",
  visible = true,
  color,
}: {
  anchor: { x: number; y: number }
  keyLabel: PromptKeyLabel
  label: string
  ariaLabel: string
  placement?: InteractionPromptPlacement
  tone?: InteractionPromptTone
  visible?: boolean
  color?: PromptColorOverrides
}) {
  const glowId = useId()
  const geometry = CALLOUT_GEOMETRY[placement]
  if (!visible) {
    return null
  }

  const style: CSSProperties = {
    ...buildPromptColorStyle(color),
    left: `${anchor.x}px`,
    top: `${anchor.y}px`,
    ["--interaction-prompt-transform" as keyof CSSProperties]:
      `translate(${-geometry.anchor.x}px, ${-geometry.anchor.y}px)`,
  }

  return (
    <div
      className={`interaction-prompt interaction-prompt--callout interaction-prompt--${tone}`}
      style={style}
      role="note"
      aria-label={ariaLabel}
    >
      <svg
        className="interaction-prompt__svg"
        viewBox={`0 0 ${CALLOUT_WIDTH} ${CALLOUT_HEIGHT}`}
        aria-hidden="true"
      >
        <defs>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="interaction-prompt__anchor-dot"
          cx={geometry.anchor.x}
          cy={geometry.anchor.y}
          r="3"
        />
        <circle
          className="interaction-prompt__anchor-ring"
          cx={geometry.anchor.x}
          cy={geometry.anchor.y}
          r="8"
        />
        <polyline
          className="interaction-prompt__line"
          points={`${geometry.anchor.x},${geometry.anchor.y} ${geometry.elbow.x},${geometry.elbow.y} ${geometry.end.x},${geometry.end.y}`}
          fill="none"
          filter={`url(#${glowId})`}
        />
        <circle
          className="interaction-prompt__node"
          cx={geometry.elbow.x}
          cy={geometry.elbow.y}
          r="2"
        />
        <circle
          className="interaction-prompt__terminator"
          cx={geometry.end.x}
          cy={geometry.end.y}
          r="3"
        />
      </svg>
      <PromptFace
        className={`interaction-prompt__label interaction-prompt__label--${geometry.labelSide}`}
        keyLabel={keyLabel}
        label={label}
        style={{
          left: `${geometry.label.x}px`,
          top: `${geometry.label.y}px`,
        }}
      />
    </div>
  )
}

export function InteractionPromptAnchor({
  children,
  show,
  keyLabel,
  label,
  ariaLabel,
  placement = "top-right",
  tone = "warm",
  color,
  block = false,
}: {
  children: ReactNode
  show: boolean
  keyLabel: PromptKeyLabel
  label: string
  ariaLabel: string
  placement?: InteractionPromptAnchorPlacement
  tone?: InteractionPromptTone
  color?: PromptColorOverrides
  block?: boolean
}) {
  return (
    <span
      className={`interaction-prompt-anchor interaction-prompt-anchor--${placement}${
        block ? " interaction-prompt-anchor--block" : ""
      } interaction-prompt--${tone}`}
      style={buildPromptColorStyle(color)}
    >
      {children}
      {show ? (
        <PromptFace
          className="interaction-prompt-anchor__badge"
          keyLabel={keyLabel}
          label={label}
          role="note"
          aria-label={ariaLabel}
        />
      ) : null}
    </span>
  )
}

function PromptFace({
  className,
  keyLabel,
  label,
  style,
  role,
  "aria-label": ariaLabel,
}: {
  className: string
  keyLabel: PromptKeyLabel
  label: string
  style?: CSSProperties
  role?: "note"
  "aria-label"?: string
}) {
  const keyLabels = readPromptKeyLabels(keyLabel)

  return (
    <span className={className} style={style} role={role} aria-label={ariaLabel}>
      <span className="interaction-prompt__keys">
        {keyLabels.map((nextKeyLabel) => (
          <kbd key={nextKeyLabel} className="interaction-prompt__key">
            {nextKeyLabel}
          </kbd>
        ))}
      </span>
      <span className="interaction-prompt__text">{label}</span>
    </span>
  )
}

type PromptKeyLabel = string | readonly string[]

function readPromptKeyLabels(keyLabel: PromptKeyLabel): readonly string[] {
  // 同時に複数の入力を案内する場合も、単一の長いキーではなく同じキー表示を並べます。
  return typeof keyLabel === "string" ? [keyLabel] : keyLabel
}

function buildPromptColorStyle(color?: PromptColorOverrides): CSSProperties | undefined {
  if (!color) {
    return undefined
  }

  return {
    ["--interaction-prompt-accent" as keyof CSSProperties]: color.accentColor,
    ["--interaction-prompt-rgb" as keyof CSSProperties]: color.accentRgb,
    ["--interaction-prompt-key-text" as keyof CSSProperties]: color.keyTextColor,
  }
}

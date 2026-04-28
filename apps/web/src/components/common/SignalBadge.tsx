import type { ReactNode } from "react"

type SignalBadgeProps = {
  tone?: "signal" | "warm" | "danger" | "muted"
  children: ReactNode
}

export function SignalBadge({ tone = "signal", children }: SignalBadgeProps) {
  return <span className={`common-signal-badge common-signal-badge--${tone}`}>{children}</span>
}

import type { ReactNode } from "react"

type StatusChipProps = {
  tone?: "signal" | "warm" | "danger" | "muted"
  children: ReactNode
}

export function StatusChip({ tone = "signal", children }: StatusChipProps) {
  return <span className={`common-status-chip common-status-chip--${tone}`}>{children}</span>
}

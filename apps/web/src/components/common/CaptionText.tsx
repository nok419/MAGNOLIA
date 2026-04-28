import type { ReactNode } from "react"

type CaptionTextProps = {
  children: ReactNode
  tone?: "default" | "muted" | "danger"
}

export function CaptionText({ children, tone = "default" }: CaptionTextProps) {
  return <p className={`common-caption common-caption--${tone}`}>{children}</p>
}

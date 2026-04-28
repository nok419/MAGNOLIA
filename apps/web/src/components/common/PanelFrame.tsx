import type { ReactNode } from "react"

type PanelFrameProps = {
  title?: string
  tone?: "default" | "warm" | "danger"
  children: ReactNode
}

export function PanelFrame({ title, tone = "default", children }: PanelFrameProps) {
  return (
    <section className={`common-panel common-panel--${tone}`}>
      {title ? <h2 className="common-panel__title">{title}</h2> : null}
      <div className="common-panel__body">{children}</div>
    </section>
  )
}

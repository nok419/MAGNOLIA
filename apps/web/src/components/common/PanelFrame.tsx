import type { ReactNode } from "react"

type PanelFrameProps = {
  title?: string
  tone?: "default" | "warm" | "danger"
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function PanelFrame({ title, tone = "default", className, bodyClassName, children }: PanelFrameProps) {
  const frameClassName = ["common-panel", `common-panel--${tone}`, className].filter(Boolean).join(" ")
  const contentClassName = ["common-panel__body", bodyClassName].filter(Boolean).join(" ")
  return (
    <section className={frameClassName}>
      {title ? <h2 className="common-panel__title">{title}</h2> : null}
      <div className={contentClassName}>{children}</div>
    </section>
  )
}

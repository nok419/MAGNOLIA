import type { PropsWithChildren, ReactNode } from "react"

type ScreenShellProps = PropsWithChildren<{
  eyebrow: string
  title: string
  subtitle?: string
  sidebar?: ReactNode
}>

export function ScreenShell({
  eyebrow,
  title,
  subtitle,
  sidebar,
  children,
}: ScreenShellProps) {
  return (
    <main className="screen-shell">
      <section className="screen-shell__main">
        <header className="screen-shell__header">
          {eyebrow ? <p className="screen-shell__eyebrow">{eyebrow}</p> : null}
          <h1 className="screen-shell__title">{title}</h1>
          {subtitle ? <p className="screen-shell__subtitle">{subtitle}</p> : null}
        </header>
        <div className="screen-shell__content">{children}</div>
      </section>
      {sidebar ? <aside className="screen-shell__sidebar">{sidebar}</aside> : null}
    </main>
  )
}

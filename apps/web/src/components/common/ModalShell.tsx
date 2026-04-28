import type { ReactNode } from "react"

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

export function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="common-modal" role="dialog" aria-modal="true" aria-labelledby="common-modal-title">
      <div className="common-modal__panel">
        <header className="common-modal__header">
          <h2 id="common-modal-title">{title}</h2>
          <button type="button" className="common-modal__close" onClick={onClose} aria-label="閉じる">
            x
          </button>
        </header>
        <div className="common-modal__body">{children}</div>
      </div>
    </div>
  )
}

import type { IdleAutoSaveViewModel } from "@/app/app-types"

type IdleAutoSaveOverlayProps = {
  state: IdleAutoSaveViewModel
}

export function IdleAutoSaveOverlay({ state }: IdleAutoSaveOverlayProps) {
  const isSaving = state.status === "saving"

  return (
    <div className="idle-auto-save" role="alert" aria-live="assertive">
      <section className="idle-auto-save__panel">
        <p className="idle-auto-save__eyebrow">
          auto save standby
        </p>
        <div className="idle-auto-save__body">
          <strong className="idle-auto-save__count">
            {isSaving ? "SAVE" : state.remainingSeconds}
          </strong>
          <div>
            <p className="idle-auto-save__title">
              {isSaving ? "セーブ中です" : "無操作が続いています"}
            </p>
            <p className="idle-auto-save__text">
              {isSaving
                ? `SLOT ${state.targetSlotId} に保存してタイトルへ戻ります。`
                : `操作がなければ SLOT ${state.targetSlotId} に保存してタイトルへ戻ります。`}
            </p>
            {!isSaving ? (
              <p className="idle-auto-save__hint">
                キー入力またはクリックでキャンセル
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

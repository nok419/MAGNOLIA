export function ProcurementPanel({
  mode,
  cost,
  balance,
  onAction,
  levelInfo,
}: {
  mode: "purchase" | "upgrade"
  cost: number
  balance: number
  onAction: () => void
  levelInfo?: { current: number; next: number; max: number }
}) {
  const affordable = balance >= cost
  const shortage = Math.max(0, cost - balance)
  // コスト 0 の装備も同じ見た目で扱えるよう、進捗は完了扱いにします。
  const progress = cost > 0 ? Math.min(1, balance / cost) : 1

  const eyebrow = mode === "purchase" ? "ACQUIRE" : "UPGRADE"
  const ctaReady = mode === "purchase" ? "取得する" : "アップグレード実行"
  const ctaShort = `−${shortage} pts 不足`

  return (
    <section
      className={`procurement procurement--${mode} ${
        affordable ? "procurement--ready" : "procurement--short"
      }`}
      aria-label={mode === "purchase" ? "装備の取得" : "装備のアップグレード"}
    >
      <header className="procurement__header">
        <span className="procurement__eyebrow">
          <span className="procurement__diamond">◇</span>
          {eyebrow}
        </span>
        {mode === "upgrade" && levelInfo ? (
          <span className="procurement__level-track">
            <span className="procurement__level-current">LV.{levelInfo.current}</span>
            <span className="procurement__level-arrow">▸</span>
            <span className="procurement__level-next">LV.{levelInfo.next}</span>
            <span className="procurement__level-max">/ {levelInfo.max}</span>
          </span>
        ) : null}
      </header>

      <div className="procurement__rows">
        <div className="procurement__row">
          <span className="procurement__key">cost</span>
          <span className="procurement__value procurement__value--cost">
            <span className="procurement__num">{cost.toLocaleString()}</span>
            <span className="procurement__unit">pts</span>
          </span>
        </div>
        <div className="procurement__row">
          <span className="procurement__key">balance</span>
          <span
            className={`procurement__value ${
              affordable ? "procurement__value--ok" : "procurement__value--short"
            }`}
          >
            <span className="procurement__num">{balance.toLocaleString()}</span>
            <span className="procurement__unit">pts</span>
          </span>
        </div>
      </div>

      <div
        className="procurement__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cost}
        aria-valuenow={Math.min(balance, cost)}
        aria-label="balance vs cost"
      >
        <div
          className="procurement__bar-fill"
          style={{ width: `${(progress * 100).toFixed(1)}%` }}
        />
        <div className="procurement__bar-cap" aria-hidden="true" />
      </div>

      {!affordable ? (
        <p className="procurement__shortage-note">
          あと <strong>{shortage.toLocaleString()}</strong> pts で取得可能です
        </p>
      ) : null}

      <button
        type="button"
        className={`procurement__cta ${
          affordable ? "procurement__cta--ready" : "procurement__cta--locked"
        }`}
        disabled={!affordable}
        onClick={() => {
          if (affordable) onAction()
        }}
      >
        <span className="procurement__cta-label">
          {affordable ? ctaReady : ctaShort}
        </span>
        {affordable ? (
          <span className="procurement__cta-cost">−{cost.toLocaleString()} pts</span>
        ) : null}
      </button>
    </section>
  )
}

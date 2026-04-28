type MeterProps = {
  label: string
  value: number
  max?: number
  tone?: "signal" | "warm" | "danger"
}

export function Meter({ label, value, max = 1, tone = "signal" }: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className={`common-meter common-meter--${tone}`} aria-label={label}>
      <div className="common-meter__label">
        <span>{label}</span>
        <span>{Math.round(ratio * 100)}%</span>
      </div>
      <div className="common-meter__track">
        <div className="common-meter__fill" style={{ inlineSize: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

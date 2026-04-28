import type { ContentBundle, ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { readEquipmentSlotLabel } from "@/app/display-helpers"
import type { DisplayOptions } from "@/app/display-options"
import { BattleCanvas } from "@/components/BattleCanvas"
import { ActionButton } from "@/components/ActionButton"

type BattleScreenProps = {
  content: ContentBundle
  renderState: BattleRenderState
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
  onReturnToExplore: () => void
}

export function BattleScreen({ content, renderState, shipVariant, displayOptions, onReturnToExplore }: BattleScreenProps) {
  const progress = renderState.missionDurationMs > 0
    ? Math.max(0, Math.min(1, renderState.elapsedMs / renderState.missionDurationMs))
    : 0
  const progressPercent = Math.round(progress * 100)
  const remainingSeconds = Math.ceil(Math.max(0, renderState.missionDurationMs - renderState.elapsedMs) / 1000)
  const grantedEquipment = (renderState.pendingResult?.grantedEquipmentIds ?? []).flatMap((equipmentId) => {
    const equipment = content.equipment[equipmentId]
    return equipment ? [equipment] : []
  })

  return (
    <main className="battle-screen">
      <div className="battle-screen__playfield">
        <BattleCanvas renderState={renderState} shipVariant={shipVariant} displayOptions={displayOptions} />
      </div>

      <div className="battle-screen__sidebar">
        {/* 進行度はキャンバス外へ置き、表示幅が狭い環境でも見切れないようにする。 */}
        <section className="battle-mission-panel" aria-label="mission progress">
          <div className="battle-mission-panel__header">
            <span>mission</span>
            <span>{progressPercent}%</span>
          </div>
          <div
            className="battle-mission-panel__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <span
              className="battle-mission-panel__fill"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <div className="battle-mission-panel__meta">
            <span>remain</span>
            <span>{formatMissionTime(remainingSeconds)}</span>
          </div>
        </section>

        {renderState.activeSubtitle ? (
          <div className="battle-subtitle-panel">
            {renderState.activeSubtitle.speakerLabel ? (
              <p className="battle-subtitle-panel__speaker">
                {renderState.activeSubtitle.speakerLabel}
              </p>
            ) : null}
            <p
              className={`battle-subtitle-panel__text ${
                renderState.activeSubtitle.audible ? "" : "subtitle-muted"
              }`}
            >
              {renderState.activeSubtitle.text}
            </p>
          </div>
        ) : (
          <div className="battle-subtitle-panel">
            <p className="battle-subtitle-panel__speaker">standby</p>
            <p className="battle-subtitle-panel__text muted-text">
              waiting for signal...
            </p>
          </div>
        )}

        {renderState.pendingResult ? null : (
          <div className="battle-help-panel">
            <p>move — wasd</p>
            <p>main — left click</p>
            <p>sub — right click</p>
            <p>focus — shift</p>
            <ActionButton tone="ghost" onClick={onReturnToExplore}>
              return to explore
            </ActionButton>
          </div>
        )}
      </div>

      {renderState.pendingResult ? (
        <div className="battle-result-overlay">
          <div className="battle-result-overlay__backdrop" />
          <section className="battle-result-overlay__panel">
            <p className="battle-result-overlay__eyebrow">mission complete</p>
            <div className="battle-result-overlay__stats">
              <ResultMetric
                label="解析率"
                value={`${Math.round(renderState.pendingResult.analysisRate * 100)}%`}
              />
              <ResultMetric
                label="復元率"
                value={`${Math.round(renderState.pendingResult.restorationRate * 100)}%`}
              />
              <ResultMetric
                label="自己修復ポイント"
                value={`+${renderState.pendingResult.selfRepairPointsEarned}`}
              />
              <ResultMetric
                label="新規聴取"
                value={`+${Math.round(renderState.pendingResult.newHeardRangeMs / 100) / 10}s`}
              />
            </div>

            {grantedEquipment.length > 0 ? (
              <div className="battle-result-overlay__rewards battle-result-overlay__rewards--highlight">
                <div className="battle-result-rewards__banner" aria-hidden="true">
                  <span className="battle-result-rewards__diamond">◆</span>
                  <span className="battle-result-rewards__banner-label">NEW EQUIPMENT ACQUIRED</span>
                  <span className="battle-result-rewards__diamond">◆</span>
                </div>
                <ul className="battle-result-overlay__reward-list battle-result-overlay__reward-list--highlight">
                  {grantedEquipment.map((equipment) => (
                    <li key={equipment.equipmentId}>
                      <span className="battle-result-reward__mark" aria-hidden="true">▸</span>
                      <span className="battle-result-reward__name">{equipment.name}</span>
                      <span className="battle-result-reward__slot">
                        {readEquipmentSlotLabel(equipment.slot, "short")}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="battle-result-rewards__hint">
                  <kbd className="battle-result-rewards__hint-key">E</kbd>
                  を押して装備画面から装着してください
                </p>
              </div>
            ) : null}
            <ActionButton onClick={onReturnToExplore}>
              return to explore
            </ActionButton>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function formatMissionTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function ResultMetric(input: { label: string; value: string }) {
  return (
    <div className="battle-result-overlay__metric">
      <p>{input.label}</p>
      <strong>{input.value}</strong>
    </div>
  )
}

import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState, BattleResultViewModel } from "@magnolia/game-session"
import type { ReactNode } from "react"
import type { TimedPresentationRequest } from "@/app/app-state"
import type { DisplayOptions } from "@/app/display-options"
import { BattleCanvas } from "@/components/BattleCanvas"
import { ActionButton } from "@/components/ActionButton"

type BattleScreenProps = {
  renderState: BattleRenderState
  resultViewModel: BattleResultViewModel
  presentationRequests: TimedPresentationRequest[]
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
  onReturnToExplore: () => void
}

export function BattleScreen({
  renderState,
  resultViewModel,
  presentationRequests,
  shipVariant,
  displayOptions,
  onReturnToExplore,
}: BattleScreenProps) {
  return (
    <main className="battle-screen">
      <div className="battle-screen__playfield">
        <BattleCanvas
          renderState={renderState}
          presentationRequests={presentationRequests}
          shipVariant={shipVariant}
          displayOptions={displayOptions}
        />
      </div>

      <div className="battle-screen__sidebar">
        {/* 進行度はキャンバス外へ置き、表示幅が狭い環境でも見切れないようにする。 */}
        <section className="battle-mission-panel" aria-label="mission progress">
          <div className="battle-mission-panel__header">
            <span>mission</span>
            <span>{resultViewModel.progressPercent}%</span>
          </div>
          <div
            className="battle-mission-panel__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={resultViewModel.progressPercent}
          >
            <span
              className="battle-mission-panel__fill"
              style={{ transform: `scaleX(${resultViewModel.progress})` }}
            />
          </div>
          <div className="battle-mission-panel__meta">
            <span>remain</span>
            <span>{formatMissionTime(resultViewModel.remainingSeconds)}</span>
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
              aria-label={
                renderState.activeSubtitle.audible
                  ? renderState.activeSubtitle.text
                  : "通信ノイズにより字幕が欠損しています。"
              }
            >
              {renderSubtitleText({
                subtitle: renderState.activeSubtitle,
                elapsedMs: renderState.elapsedMs,
                reduceFlashing: displayOptions.reduceFlashing,
              })}
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
            <p>sub — click 2</p>
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
            <p className="battle-result-overlay__eyebrow">通信復元結果</p>
            {resultViewModel.transcriptPreview.length > 0 ? (
              <div className="battle-result-transcript" aria-label="restored transcript preview">
                {resultViewModel.transcriptPreview.map((chunk) => (
                  <p
                    key={chunk.chunkId}
                    className={[
                      chunk.audible ? "" : "battle-result-transcript__damaged",
                      chunk.importance && chunk.importance !== "normal"
                        ? "battle-result-transcript__important"
                        : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {chunk.text}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="battle-result-overlay__stats">
              <ResultMetric
                label="ノイズ源解析"
                value={`${Math.round(renderState.pendingResult.analysisRate * 100)}%`}
              />
              <ResultMetric
                label="本文復元"
                value={`${Math.round(renderState.pendingResult.restorationRate * 100)}%`}
              />
              <ResultMetric
                label="自己修復ポイント"
                value={`+${renderState.pendingResult.selfRepairPointsEarned}`}
              />
              <ResultMetric
                label="新たに守れた音声"
                value={`+${Math.round(renderState.pendingResult.newHeardRangeMs / 100) / 10}s`}
              />
              <ResultMetric
                label="回収した断片"
                value={`+${renderState.pendingResult.recoveredFragmentCount}`}
              />
              <ResultMetric
                label="重要フレーズ"
                value={`${renderState.pendingResult.importantPhraseRestored}/${renderState.pendingResult.importantPhraseTotal}`}
              />
              <ResultMetric
                label="初開示メタ"
                value={formatMetadataUnlocked(renderState.pendingResult.newMetadataUnlocked)}
              />
            </div>

            {resultViewModel.grantedEquipment.length > 0 ? (
              <div className="battle-result-overlay__rewards battle-result-overlay__rewards--highlight">
                <div className="battle-result-rewards__banner" aria-hidden="true">
                  <span className="battle-result-rewards__diamond">◆</span>
                  <span className="battle-result-rewards__banner-label">新しい装備を取得</span>
                  <span className="battle-result-rewards__diamond">◆</span>
                </div>
                <ul className="battle-result-overlay__reward-list battle-result-overlay__reward-list--highlight">
                  {resultViewModel.grantedEquipment.map((equipment) => (
                    <li key={equipment.equipmentId}>
                      <span className="battle-result-reward__mark" aria-hidden="true">▸</span>
                      <span className="battle-result-reward__name">{equipment.name}</span>
                      <span className="battle-result-reward__slot">
                        {equipment.slotLabel}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="battle-result-rewards__hint">
                  <kbd className="battle-result-rewards__hint-key">E</kbd>
                  で装備画面を開いて装着できます
                </p>
              </div>
            ) : null}
            <ActionButton onClick={onReturnToExplore}>
              探索へ戻る
            </ActionButton>
          </section>
        </div>
      ) : null}
    </main>
  )
}

type MetadataResultKey = "title" | "sender" | "recipient" | "sentAt"

function formatMetadataUnlocked(keys: MetadataResultKey[]): string {
  if (keys.length === 0) {
    return "なし"
  }
  const labels = {
    title: "件名",
    sender: "発信者",
    recipient: "宛先",
    sentAt: "送信時刻",
  } satisfies Record<MetadataResultKey, string>
  return keys.map((key) => labels[key]).join(" / ")
}

function renderSubtitleText(input: {
  subtitle: BattleRenderState["activeSubtitle"]
  elapsedMs: number
  reduceFlashing: boolean
}): ReactNode {
  const subtitle = input.subtitle
  if (!subtitle) {
    return null
  }
  if (subtitle.audible) {
    return subtitle.text
  }

  const severity = readSubtitleCorruptionSeverity(subtitle.noiseLevel, subtitle.hearingThreshold)
  const frame = input.reduceFlashing ? 0 : Math.floor(input.elapsedMs / 140)
  const glyphs = splitGraphemes(subtitle.text)
  const seed = `${subtitle.transmissionId}:${subtitle.chunkId}:${frame}`

  return glyphs.map((glyph, index) => {
    if (/\s/u.test(glyph)) {
      return glyph
    }
    const roll = seededUnit(`${seed}:${index}`)
    const threshold = 0.12 + severity * 0.74
    if (roll > threshold) {
      return glyph
    }

    const hardMask = input.reduceFlashing || roll < severity * 0.5
    const replacement = hardMask
      ? "█"
      : roll < severity * 0.74
        ? "░"
        : GLITCH_GLYPHS[Math.floor(seededUnit(`${seed}:g:${index}`) * GLITCH_GLYPHS.length)] ?? "…"

    return (
      <span
        key={`${index}:${glyph}`}
        className={hardMask ? "subtitle-corrupt subtitle-corrupt--mask" : "subtitle-corrupt"}
        aria-hidden="true"
      >
        {replacement}
      </span>
    )
  })
}

const GLITCH_GLYPHS = ["…", "▧", "░", "ノ", "ヰ", "�"]

function readSubtitleCorruptionSeverity(noiseLevel: number, hearingThreshold: number): number {
  const overThreshold = noiseLevel / Math.max(0.01, hearingThreshold) - 1
  return Math.max(0.32, Math.min(1, 0.36 + overThreshold * 0.72))
}

function splitGraphemes(text: string): string[] {
  const segmenter = readIntlSegmenter()
  if (!segmenter) {
    return Array.from(text)
  }
  return Array.from(segmenter.segment(text), (entry) => entry.segment)
}

function readIntlSegmenter(): { segment(text: string): Iterable<{ segment: string }> } | null {
  const maybeIntl = Intl as typeof Intl & {
    Segmenter?: new (locale: string, options: { granularity: "grapheme" }) => {
      segment(text: string): Iterable<{ segment: string }>
    }
  }
  return maybeIntl.Segmenter
    ? new maybeIntl.Segmenter("ja", { granularity: "grapheme" })
    : null
}

function seededUnit(seed: string): number {
  const hash = hashString(seed)
  return (hash % 10000) / 10000
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
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

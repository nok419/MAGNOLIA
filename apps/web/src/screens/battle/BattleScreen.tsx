import type { ShipVariant, TranscriptSpan } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import type { ReactNode } from "react"
import type { DisplayOptions } from "@/app/display-options"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import { BattleCanvas } from "@/render/battle/BattleCanvas"
import { ActionButton } from "@/components/ActionButton"
import { Meter, PanelFrame } from "@/components/common"

type BattleScreenProps = {
  renderState: BattleRenderState
  battleEvents: TimedPresentationRequest<BattlePresentationRequest>[]
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
  onReturnToExplore: () => void
}

export function BattleScreen({ renderState, battleEvents, shipVariant, displayOptions, onReturnToExplore }: BattleScreenProps) {
  const progress =
    renderState.missionDurationMs > 0
      ? Math.max(0, Math.min(1, renderState.elapsedMs / renderState.missionDurationMs))
      : 0
  const progressPercent = Math.round(progress * 100)
  const remainingSeconds = Math.ceil(Math.max(0, renderState.missionDurationMs - renderState.elapsedMs) / 1000)
  const resultViewModel = renderState.resultViewModel
  const grantedEquipment = resultViewModel?.grantedEquipment ?? []
  const resultTranscriptPreview = resultViewModel?.transcriptPreview ?? []
  const subtitleEventTone = readSubtitleEventTone(battleEvents, renderState.elapsedMs)
  const resultRestored = hasActiveBattleEvent(battleEvents, renderState.elapsedMs, "battle.fragment.recovered")
  const listeningStability = computeListeningStability(renderState.noiseLevel, renderState.hearingThreshold)
  const protectedRatio = clamp01(renderState.currentChunkProtectedRatio)
  const recentlyLost = renderState.newlyLostRange != null
  const recentlyRecovered = renderState.newlyRecoveredRange != null

  return (
    <main className="battle-screen">
      <div className="battle-screen__playfield">
        <BattleCanvas
          renderState={renderState}
          battleEvents={battleEvents}
          shipVariant={shipVariant}
          displayOptions={displayOptions}
        />
      </div>

      <div className="battle-screen__sidebar">
        <PanelFrame title="mission" className="battle-mission-panel" bodyClassName="battle-mission-panel__body">
          <div className="battle-mission-panel__content" aria-label="mission progress">
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
            <div className="battle-mission-panel__meters">
              <Meter
                label="聴取安定"
                value={listeningStability}
                tone={listeningStability < 0.34 ? "danger" : "signal"}
              />
              <Meter
                label="解析進行"
                value={renderState.analysisRate}
                tone="warm"
              />
            </div>
          </div>
        </PanelFrame>

        {renderState.activeSubtitle ? (
          <PanelFrame
            title="protected words"
            className={`battle-subtitle-panel ${subtitleEventTone ? `battle-subtitle-panel--${subtitleEventTone}` : ""} ${
              recentlyLost ? "battle-subtitle-panel--lost" : ""
            } ${recentlyRecovered ? "battle-subtitle-panel--recovered" : ""}`}
            bodyClassName="battle-subtitle-panel__body"
          >
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
            {/* 守れた割合は下線の連続度で示す。点滅ではなく長さで読み取れるようにする。 */}
            <div
              className="battle-subtitle-panel__underline"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(protectedRatio * 100)}
              aria-label="守れた割合"
            >
              {renderSubtitleProtectionSegments(renderState.activeSubtitle.protectedSpans)}
              {renderSubtitleDamageSegments(renderState.activeSubtitle.damagedSpans)}
            </div>
          </PanelFrame>
        ) : (
          <PanelFrame
            title="protected words"
            className={`battle-subtitle-panel ${subtitleEventTone ? `battle-subtitle-panel--${subtitleEventTone}` : ""}`}
            bodyClassName="battle-subtitle-panel__body"
          >
            <p className="battle-subtitle-panel__speaker">standby</p>
            <p className="battle-subtitle-panel__text muted-text">
              waiting for signal...
            </p>
          </PanelFrame>
        )}

        {resultViewModel ? null : (
          <PanelFrame title="control hint">
            <div className="battle-help-panel">
              <p>move — wasd</p>
              <p>main — left click</p>
              <p>sub — click 2</p>
              <p>focus — shift</p>
              <ActionButton tone="ghost" onClick={onReturnToExplore}>
                return to explore
              </ActionButton>
            </div>
          </PanelFrame>
        )}
      </div>

      {resultViewModel ? (
        <div className="battle-result-overlay">
          <div className="battle-result-overlay__backdrop" />
          <div className="battle-result-overlay__panel">
            <PanelFrame tone="warm" title="mission complete">
              {resultTranscriptPreview.length > 0 ? (
                <div
                  className={`battle-result-transcript ${resultRestored ? "battle-result-transcript--restored" : ""}`}
                  aria-label="restored transcript preview"
                >
                  {resultTranscriptPreview.map((chunk) => (
                    <p key={chunk.chunkId} className={chunk.audible ? "" : "battle-result-transcript__damaged"}>
                      {chunk.text}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="battle-result-overlay__stats">
                <Meter label="解析率" value={resultViewModel.analysisRate} tone="warm" />
                <Meter label="復元率" value={resultViewModel.restorationRate} tone="signal" />
                <ResultMetric
                  label="自己修復ポイント"
                  value={`+${resultViewModel.selfRepairPointsEarned}`}
                />
                <ResultMetric
                  label="新規聴取"
                  value={`+${Math.round(resultViewModel.newHeardRangeMs / 100) / 10}s`}
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
                          {equipment.slotLabel}
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
            </PanelFrame>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function readSubtitleEventTone(
  events: TimedPresentationRequest<BattlePresentationRequest>[],
  elapsedMs: number,
): "hit" | "noise" | "clear" | "recovered" | "protect" | "tutorial" | null {
  const active = events
    .filter((event) => event.expiresAtMs > elapsedMs)
    .sort((a, b) => b.startedAtMs - a.startedAtMs)[0]
  switch (active?.cueId) {
    case "battle.player.hit":
    case "battle.subtitle.damage":
      return "hit"
    case "battle.noise.peak":
      return "noise"
    case "battle.noise.clear":
    case "battle.noiseSource.clear":
      return "clear"
    case "battle.fragment.recovered":
      return "recovered"
    case "battle.mission.beat":
      return readMissionBeatSubtitleTone(active.intentTag)
    default:
      return null
  }
}

function readMissionBeatSubtitleTone(intentTag: string): "protect" | "tutorial" | "clear" | null {
  if (intentTag.includes("protect") || intentTag.includes("fragment")) {
    return "protect"
  }
  if (intentTag.startsWith("tutorial") || intentTag.includes("confirmation")) {
    return "tutorial"
  }
  if (intentTag.includes("answer") || intentTag.includes("route")) {
    return "clear"
  }
  return null
}

function hasActiveBattleEvent(
  events: TimedPresentationRequest<BattlePresentationRequest>[],
  elapsedMs: number,
  cueId: BattlePresentationRequest["cueId"],
): boolean {
  return events.some((event) => event.cueId === cueId && event.expiresAtMs > elapsedMs)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function computeListeningStability(noiseLevel: number, hearingThreshold: number): number {
  // 聴取安定 = 1 - (noiseLevel / hearingThreshold)。閾値を超えるほど 0 に近づき、字幕欠損が起きやすい状態を表します。
  const ratio = noiseLevel / Math.max(0.001, hearingThreshold)
  return clamp01(1 - ratio)
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
    return renderSubtitleGraphemes({
      text: subtitle.text,
      protectedSpans: subtitle.protectedSpans,
      damagedSpans: subtitle.damagedSpans,
      severity: 0,
      seed: `${subtitle.transmissionId}:${subtitle.chunkId}:audible`,
      reduceFlashing: input.reduceFlashing,
    })
  }

  const severity = readSubtitleCorruptionSeverity(subtitle.noiseLevel, subtitle.hearingThreshold)
  // reduceFlashing 時は frame を固定し、欠損 mask を点滅させない。
  const frame = input.reduceFlashing ? 0 : Math.floor(input.elapsedMs / 140)
  const seed = `${subtitle.transmissionId}:${subtitle.chunkId}:${frame}`

  return renderSubtitleGraphemes({
    text: subtitle.text,
    protectedSpans: subtitle.protectedSpans,
    damagedSpans: subtitle.damagedSpans,
    severity,
    seed,
    reduceFlashing: input.reduceFlashing,
  })
}

function renderSubtitleGraphemes(input: {
  text: string
  protectedSpans: TranscriptSpan[]
  damagedSpans: TranscriptSpan[]
  severity: number
  seed: string
  reduceFlashing: boolean
}): ReactNode {
  const glyphs = splitGraphemes(input.text)
  const total = Math.max(1, glyphs.length)
  return glyphs.map((glyph, index) => {
    if (/\s/u.test(glyph)) {
      return glyph
    }
    const positionRatio = (index + 0.5) / total
    const protectedHere = isRatioInsideAnySpan(positionRatio, input.protectedSpans)
    const damagedHere = isRatioInsideAnySpan(positionRatio, input.damagedSpans)
    if (!damagedHere) {
      return (
        <span
          key={`${index}:${glyph}`}
          className={protectedHere ? "subtitle-safe" : undefined}
        >
          {glyph}
        </span>
      )
    }

    const roll = seededUnit(`${input.seed}:${index}`)
    // damagedSpans は session が確定した欠損範囲です。UI 側では範囲だけを見て mask 種別を決めます。
    const hardMask = input.reduceFlashing || roll < Math.max(0.42, input.severity * 0.5)
    const replacement = hardMask
      ? "█"
      : roll < Math.max(0.64, input.severity * 0.74)
        ? "░"
        : GLITCH_GLYPHS[Math.floor(seededUnit(`${input.seed}:g:${index}`) * GLITCH_GLYPHS.length)] ?? "…"

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

function renderSubtitleProtectionSegments(spans: TranscriptSpan[]): ReactNode {
  return spans.map((span, index) => (
    <span
      key={`safe:${index}:${span.startRatio}:${span.endRatio}`}
      className="battle-subtitle-panel__underline-segment battle-subtitle-panel__underline-segment--safe"
      style={{
        left: `${clamp01(span.startRatio) * 100}%`,
        width: `${Math.max(0, clamp01(span.endRatio) - clamp01(span.startRatio)) * 100}%`,
      }}
    />
  ))
}

function renderSubtitleDamageSegments(spans: TranscriptSpan[]): ReactNode {
  return spans.map((span, index) => (
    <span
      key={`damage:${index}:${span.startRatio}:${span.endRatio}`}
      className="battle-subtitle-panel__underline-segment battle-subtitle-panel__underline-segment--damage"
      style={{
        left: `${clamp01(span.startRatio) * 100}%`,
        width: `${Math.max(0, clamp01(span.endRatio) - clamp01(span.startRatio)) * 100}%`,
      }}
    />
  ))
}

function isRatioInsideAnySpan(ratio: number, spans: TranscriptSpan[]): boolean {
  return spans.some((span) => ratio >= span.startRatio && ratio <= span.endRatio)
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

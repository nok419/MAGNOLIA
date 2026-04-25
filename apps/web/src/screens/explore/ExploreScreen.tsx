import { useMemo } from "react"
import type { CSSProperties } from "react"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState } from "@magnolia/game-session"
import { classifySignalStrength } from "@/app/display-helpers"
import {
  REBOOT_SETTLE_BLACKOUT_RATIO,
  type ExplorePresentationState,
} from "@/app/explore-presentation"
import { ExploreCanvas } from "@/components/ExploreCanvas"
import { MiniMap } from "@/components/MiniMap"

type ExploreScreenProps = {
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  itemPopups?: Array<{ id: string; title: string; detail: string }>
  shipVariant: ShipVariant
  showEquipmentHint?: boolean
}

const SIGNAL_SEGMENTS = 12

export function ExploreScreen({
  snapshot,
  renderState,
  presentation,
  itemPopups = [],
  shipVariant,
  showEquipmentHint = false,
}: ExploreScreenProps) {
  const strength = renderState.nearestTransmissionStrength
  const signal = useMemo(() => classifySignalStrength(strength), [strength])
  const completionPct = Math.round(snapshot.hud.currentAreaCompletionRate * 100)
  const strengthPct = Math.round(strength * 100)
  // featureAccess に応じた "本来見せるべき" パネルの条件。
  // リブート中はこれらに `ehud--booting` クラスを付けて CSS transition で
  // 透明化 → 段階的に浮上させる。表示/非表示の binary 切替ではなく
  // 継続レンダリングで CSS 補間させる設計。
  const canShowInfoPanel =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.infoPanelEnabled
  const canShowStrengthMeter =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.strengthMeterEnabled
  const canShowMiniMap =
    snapshot.featureAccess.hudEnabled && snapshot.featureAccess.minimapEnabled
  const hudTransitionClass = presentation.hidesHud
    ? " ehud--booting"
    : presentation.kind === "reboot-settle"
      ? " ehud--settling"
      : ""
  const hudTransitionStyle: CSSProperties | undefined =
    presentation.kind === "reboot-settle"
      ? {
          ["--ehud-settle-ms" as keyof CSSProperties]: `${presentation.durationMs}ms`,
          ["--ehud-blackout-ms" as keyof CSSProperties]:
            `${Math.round(presentation.durationMs * REBOOT_SETTLE_BLACKOUT_RATIO)}ms`,
        }
      : undefined

  // 通信強度バーは段階表示にし、わずかな変化でも読み取りやすくします。
  const segments = useMemo(() => {
    const filled = Math.round(strength * SIGNAL_SEGMENTS)
    return Array.from({ length: SIGNAL_SEGMENTS }, (_, i) => i < filled)
  }, [strength])

  return (
    <main className="explore-fullscreen">
      <ExploreCanvas
        snapshot={snapshot}
        renderState={renderState}
        presentation={presentation}
        shipVariant={shipVariant}
      />

      {/* HUD overlays — OS スロットの有無ではなく、MAGNOLIA が解放した表示機能だけを出します。
           リブート演出中は `ehud--booting` で透明化し、完了後に CSS transition で段階フェードイン。 */}
      {canShowInfoPanel ? (
        <section
          className={`ehud ehud--status${hudTransitionClass}`}
          style={hudTransitionStyle}
          aria-label="status"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />
          <div className="ehud__scanline" />

          <header className="ehud__header">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">STATUS</span>
          </header>

          <h2 className="ehud-status__area">{renderState.currentAreaName}</h2>

          <div className="ehud-status__row">
            <span className="ehud-status__key">completion</span>
            <div className="ehud-status__bar-wrap">
              <div className="ehud-status__bar">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`ehud-status__seg ${i < Math.round(completionPct / 10) ? "ehud-status__seg--on" : ""}`}
                  />
                ))}
              </div>
              <span className="ehud-status__val">{completionPct}%</span>
            </div>
          </div>

          <div className="ehud-status__divider" />

          <div className="ehud-status__equip">
            <EquipSlotRow label="MAIN" value={snapshot.hud.equipped.main ?? "—"} />
            <EquipSlotRow label="SUB" value={snapshot.hud.equipped.sub ?? "—"} />
          </div>

          <div className="ehud-status__divider" />

          <div className="ehud-status__row">
            <span className="ehud-status__key">self-repair</span>
            <span className="ehud-status__val ehud-status__val--accent">
              {snapshot.hud.selfRepairPoints} pt
            </span>
          </div>
        </section>
      ) : null}

      {canShowStrengthMeter ? (
        <section
          className={`ehud ehud--signal${hudTransitionClass}`}
          style={hudTransitionStyle}
          aria-label="signal strength"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />

          <header className="ehud__header">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">SIGNAL</span>
            <span className={`ehud-signal__class ehud-signal__class--${signal.tone}`}>
              {signal.label}
            </span>
          </header>

          <div className="ehud-signal__meter">
            {segments.map((on, i) => (
              <div
                key={i}
                className={`ehud-signal__seg ${on ? "ehud-signal__seg--on" : ""}`}
                style={{
                  // 右へ行くほど少し高くし、弱い通信でも変化が読み取りやすい形にします。
                  height: `${40 + (i / (SIGNAL_SEGMENTS - 1)) * 60}%`,
                }}
              />
            ))}
          </div>

          <div className="ehud-signal__readout">
            <span className="ehud-signal__pct">{strengthPct}</span>
            <span className="ehud-signal__unit">%</span>
          </div>
        </section>
      ) : null}

      {canShowMiniMap ? (
        <section
          className={`ehud ehud--radar${hudTransitionClass}`}
          style={hudTransitionStyle}
          aria-label="radar"
        >
          <div className="ehud__bracket ehud__bracket--tl" />
          <div className="ehud__bracket ehud__bracket--tr" />
          <div className="ehud__bracket ehud__bracket--bl" />
          <div className="ehud__bracket ehud__bracket--br" />

          <header className="ehud__header ehud__header--center">
            <span className="ehud__diamond">◇</span>
            <span className="ehud__label">RADAR</span>
          </header>

          <MiniMap snapshot={snapshot} renderState={renderState} />
        </section>
      ) : null}

      <section className={`ehud ehud--help${hudTransitionClass}`} style={hudTransitionStyle}>
        <p>move — wasd</p>
        <p>connect — enter</p>
        <p>equipment — e</p>
        <p>map — m</p>
      </section>

      {showEquipmentHint && presentation.kind === "none" ? <EquipmentHintCallout /> : null}

      {!presentation.hidesItemPopups && itemPopups.length > 0 ? (
        <div className="explore-item-popup-stack" aria-live="polite">
          {itemPopups.map((popup) => (
            <section key={popup.id} className="explore-item-popup">
              <p className="explore-item-popup__title">{popup.title}</p>
              <p className="explore-item-popup__detail">{popup.detail}</p>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  )
}

/**
 * ミッション 01 をクリアして未確認装備がある間だけ、
 * 探索画面の自機のそばに「E で装備画面」の誘導を出す。
 *
 * 機体の概ね中央からの相対位置を基準に、SVG で
 *   1. 起点ドット  (機体横のアンカー)
 *   2. 右斜め上へ短い線
 *   3. 真横へ短い線
 *   4. 横線の上に乗せた「E」キーキャップ + "equipment" ラベル
 * を描画する。
 * 画面の左右どちらかへ寄り過ぎないよう、viewport 中央から
 * わずかに右上へオフセットした位置に配置する。
 */
function EquipmentHintCallout() {
  return (
    <div
      className="explore-equip-hint"
      role="note"
      aria-label="press E to open equipment"
    >
      <svg
        className="explore-equip-hint__svg"
        viewBox="0 0 220 120"
        aria-hidden="true"
      >
        <defs>
          <filter id="equipHintGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* 起点ドット: 機体の脇に置くアンカー */}
        <circle
          className="explore-equip-hint__anchor"
          cx="24"
          cy="96"
          r="3"
        />
        <circle
          className="explore-equip-hint__anchor-ring"
          cx="24"
          cy="96"
          r="8"
        />
        {/* 線: 斜め上 → 真横 */}
        <polyline
          className="explore-equip-hint__line"
          points="24,96 72,56 168,56"
          fill="none"
          filter="url(#equipHintGlow)"
        />
        {/* 折れ点の小さなノード */}
        <circle
          className="explore-equip-hint__node"
          cx="72"
          cy="56"
          r="2"
        />
        {/* ライン末端のターミネータ */}
        <circle
          className="explore-equip-hint__terminator"
          cx="168"
          cy="56"
          r="3"
        />
      </svg>
      <div className="explore-equip-hint__label">
        <kbd className="explore-equip-hint__key">E</kbd>
        <span className="explore-equip-hint__text">equipment</span>
      </div>
    </div>
  )
}

function EquipSlotRow({ label, value }: { label: string; value: string }) {
  const isEmpty = value === "—"
  return (
    <div className="ehud-status__equip-row">
      <span className="ehud-status__slot-label">{label}</span>
      <span className={`ehud-status__slot-value ${isEmpty ? "ehud-status__slot-value--empty" : ""}`}>
        {value}
      </span>
    </div>
  )
}

import { useRef } from "react"
import type { SaveSlotId, SaveSlotRow, SettingsRow } from "@magnolia/contracts"
import { SETTINGS_VOLUME_STEPS } from "@magnolia/contracts"
import { formatTimestamp } from "@/app/display-helpers"
import { listProgressSaveSlots } from "@/app/save-slot-selectors"
import { ActionButton } from "@/components/ActionButton"

type VolumeChannel = keyof SettingsRow["volumes"]

type SettingsPanelProps = {
  settings: SettingsRow
  saveSlots: SaveSlotRow[]
  canSave: boolean
  onOpenKeyVisual: (variant: "fullscreen" | "windowed") => void
  onSetVolume: (channel: keyof SettingsRow["volumes"], value: SettingsRow["volumes"][keyof SettingsRow["volumes"]]) => void
  onSetDifficulty: (difficulty: SettingsRow["difficulty"]) => void
  onToggleSwitch: (path: "reduceFlashing" | "lowFrameRateMode", value: boolean) => void
  onSaveCurrent: () => void
  onSaveToSlot: (slotId: SaveSlotId) => void
  onReturnToTitle: () => void
}

export function SettingsPanel({
  settings,
  saveSlots,
  canSave,
  onOpenKeyVisual,
  onSetVolume,
  onSetDifficulty,
  onToggleSwitch,
  onSaveCurrent,
  onSaveToSlot,
  onReturnToTitle,
}: SettingsPanelProps) {
  const activeVolumePointerIdRef = useRef<number | null>(null)
  const progressSaveSlots = listProgressSaveSlots(saveSlots)

  function clampVolumeStep(step: number): SettingsRow["volumes"][VolumeChannel] {
    return Math.min(SETTINGS_VOLUME_STEPS, Math.max(1, step)) as SettingsRow["volumes"][VolumeChannel]
  }

  function readVolumeStepFromPointer(
    container: HTMLDivElement,
    clientX: number,
  ): SettingsRow["volumes"][VolumeChannel] {
    const rect = container.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const ratio = rect.width <= 0 ? 0 : relativeX / rect.width
    const step = Math.floor(ratio * SETTINGS_VOLUME_STEPS) + 1
    return clampVolumeStep(step)
  }

  function renderVolumeBar(label: string, current: number, channel: VolumeChannel) {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">{label}</p>
          <p className="settings-row__desc">
            {channel === "master" && "全体の音量を調整します。"}
            {channel === "bgm" && "BGM の音量を調整します。"}
            {channel === "se" && "環境音や効果音の音量を調整します。"}
            {channel === "voice" && "通信音声や読み上げの音量を調整します。"}
          </p>
        </div>
        <div
          className="volume-segments"
          onPointerDown={(event) => {
            const container = event.currentTarget
            // 分割表示は残したまま、外側コンテナで pointer を捕まえて
            // 左右スライドでも値を更新できるようにします。
            activeVolumePointerIdRef.current = event.pointerId
            container.setPointerCapture(event.pointerId)
            onSetVolume(channel, readVolumeStepFromPointer(container, event.clientX))
          }}
          onPointerMove={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            onSetVolume(
              channel,
              readVolumeStepFromPointer(event.currentTarget, event.clientX),
            )
          }}
          onPointerUp={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            activeVolumePointerIdRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            activeVolumePointerIdRef.current = null
          }}
        >
          {Array.from({ length: SETTINGS_VOLUME_STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`volume-segment ${i < current ? "volume-segment--active" : ""}`}
              onClick={() => onSetVolume(channel, (i + 1) as SettingsRow["volumes"][keyof SettingsRow["volumes"]])}
              aria-label={`set ${label} to ${i + 1}`}
            />
          ))}
        </div>
      </div>
    )
  }

  function renderDifficulty() {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">DIFFICULTY</p>
          <p className="settings-row__desc">新規開始と現在のゲーム進行に使う難易度です。</p>
        </div>
        <div className="toggle-pill-group" role="group" aria-label="difficulty">
          {(["calm", "terminal"] as const).map((difficulty) => {
            const active = settings.difficulty === difficulty
            const label = difficulty === "calm" ? "CALM" : "TERMINAL"
            return (
              <button
                key={difficulty}
                type="button"
                className={`toggle-pill ${active ? "toggle-pill--active" : ""}`}
                onClick={() => onSetDifficulty(difficulty)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderToggle(label: string, desc: string, value: boolean, path: "reduceFlashing" | "lowFrameRateMode") {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">{label}</p>
          <p className="settings-row__desc">{desc}</p>
        </div>
        <button
          type="button"
          className={`toggle-switch ${value ? "toggle-switch--on" : ""}`}
          onClick={() => onToggleSwitch(path, !value)}
          aria-label={`toggle ${label}`}
        >
          <div className="toggle-switch__knob" />
        </button>
      </div>
    )
  }

  return (
    <div className="settings-dashboard">
      <div className="settings-dashboard-col">
        <section className="settings-section">
          <h3 className="settings-section__title">audio setup</h3>
          <div className="settings-section__content">
            {renderVolumeBar("MASTER VOLUME", settings.volumes.master, "master")}
            {renderVolumeBar("BACKGROUND", settings.volumes.bgm, "bgm")}
            {renderVolumeBar("SOUND EFFECTS", settings.volumes.se, "se")}
            {renderVolumeBar("VOICE", settings.volumes.voice, "voice")}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section__title">display options</h3>
          <div className="settings-section__content">
            {renderDifficulty()}
            {renderToggle("REDUCE FLASHING", "強い光の点滅表現や画面揺れを軽減します。", settings.reduceFlashing, "reduceFlashing")}
            {renderToggle("LOW FRAME RATE", "描画負荷を下げ、バッテリー消費を抑えます。", settings.lowFrameRateMode, "lowFrameRateMode")}
          </div>
        </section>
      </div>

      <div className="settings-dashboard-col">
        <section className="settings-section">
          <h3 className="settings-section__title">key visual</h3>
          <div className="settings-section__content settings-section__content--compact">
            <div className="kv-launcher-group">
              <button
                type="button"
                className="kv-launcher"
                onClick={() => onOpenKeyVisual("fullscreen")}
              >
                <div className="kv-launcher__content">
                  <span className="kv-launcher__icon">◇</span>
                  <span className="kv-launcher__text">FULLSCREEN</span>
                  <span className="kv-launcher__sub">immersive</span>
                </div>
              </button>
              <button
                type="button"
                className="kv-launcher"
                onClick={() => onOpenKeyVisual("windowed")}
              >
                <div className="kv-launcher__content">
                  <span className="kv-launcher__icon">◇</span>
                  <span className="kv-launcher__text">500 × 500</span>
                  <span className="kv-launcher__sub">windowed</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section settings-section--danger">
          <h3 className="settings-section__title">system operation</h3>
          <div className="settings-section__content settings-section__content--compact">
            <div className="settings-row">
              <div className="settings-row__info">
                <p className="settings-row__label">QUICK SAVE</p>
              </div>
              {canSave ? (
                <ActionButton tone="primary" onClick={onSaveCurrent}>
                  quick save
                </ActionButton>
              ) : (
                <p className="muted-text" style={{ fontSize: 13, alignSelf: "center", margin: 0 }}>
                  ゲーム開始後に保存できます。
                </p>
              )}
            </div>

            <div className="settings-save-slots settings-save-slots--compact">
              <p className="muted-text" style={{ margin: "0 0 8px", fontSize: 12 }}>
                保存先は SLOT 02 / SLOT 03 のみです。
              </p>
              <div className="save-slots-grid">
                {progressSaveSlots.map((slot) => (
                  <div key={slot.slotId} className="save-slot-card">
                    <div className="save-slot-card__info">
                      <p className="save-slot-card__id">SLOT {String(slot.slotId).padStart(2, "0")}</p>
                      <p className="save-slot-card__meta">
                        {formatTimestamp(slot.updatedAt) ?? "NO DATA"}
                      </p>
                    </div>
                    <ActionButton
                      tone={slot.updatedAt ? "danger" : "ghost"}
                      disabled={!canSave}
                      onClick={() => onSaveToSlot(slot.slotId)}
                    >
                      {slot.updatedAt ? "overwrite" : "save"}
                    </ActionButton>
                  </div>
                ))}
              </div>
            </div>

            <div className="button-row">
              <ActionButton tone="ghost" onClick={onReturnToTitle}>
                back title
              </ActionButton>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ContentBundle } from "@magnolia/contracts"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import type { DisplayOptions } from "@/app/display-options"
import { KeyVisualBattleCanvas } from "@/render/key-visual/KeyVisualBattleCanvas"
import { exportKeyVisualPng } from "@/render/key-visual/export-key-visual-png"
import { buildKeyVisualRenderState } from "@/render/key-visual/key-visual-render-state"
import type { KeyVisualVariant } from "@/render/key-visual/key-visual-types"

type KeyVisualModalProps = {
  variant: KeyVisualVariant
  onClose: () => void
  displayOptions: DisplayOptions
  content: ContentBundle
}

export function KeyVisualModal({ variant, onClose, displayOptions, content }: KeyVisualModalProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Escape" || event.code === "Enter") {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let animationFrameId = 0
    const startedAt = performance.now()
    let lastDrawAt = 0
    function step(now: number) {
      if (
        displayOptions.lowFrameRateMode &&
        now - lastDrawAt < displayOptions.targetFrameIntervalMs
      ) {
        animationFrameId = window.requestAnimationFrame(step)
        return
      }
      lastDrawAt = now
      setElapsedMs(now - startedAt)
      animationFrameId = window.requestAnimationFrame(step)
    }
    animationFrameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [displayOptions])

  const renderState = useMemo(
    () => buildKeyVisualRenderState(content, elapsedMs, variant),
    [content, elapsedMs, variant],
  )

  const handleDownloadPng = useCallback(() => {
    const modal = document.querySelector(".key-visual-modal") as HTMLElement | null
    if (!modal) return
    const backdropCanvas = modal.querySelector(".key-visual-modal__particles") as HTMLCanvasElement | null
    const battleCanvas = modal.querySelector(".play-canvas--battle") as HTMLCanvasElement | null
    if (!backdropCanvas || !battleCanvas) return
    exportKeyVisualPng({ modal, backdropCanvas, battleCanvas }, variant)
  }, [variant])

  return (
    <div className="key-visual-modal-backdrop" onClick={onClose} role="presentation">
      <section
        className={`key-visual-modal key-visual-modal--${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Layer 1 — タイトル画面背景 (Signal/Particle backdrop) */}
        <SignalBackdropCanvas className="key-visual-modal__particles" displayOptions={displayOptions} />

        {/* Layer 3 — ゲーム描画 (透過背景で下レイヤーを活かす) */}
        <div className="key-visual-modal__battle-frame">
          {/* 主題の美観を最大化したいので、ユーザ設定に関わらず art バリアントで固定表示する。 */}
          <KeyVisualBattleCanvas renderState={renderState} displayOptions={displayOptions} />
        </div>

        {/* Layer 4 — ロゴオーバーレイ (グリッチ+グロー付き MAGNOLIA) */}
        <div className="key-visual-modal__overlay">
          <MagnoliaLogo as="div" className="key-visual-modal__logo" />
          <div className="key-visual-modal__logo-accent" />
          <div className="key-visual-modal__tagline">signal in the haze</div>
        </div>
      </section>

      {/* アクションボタン — 右上に縦並び */}
      <div className="key-visual-modal__actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="key-visual-modal__close" onClick={handleDownloadPng}>
          download png
        </button>
        <button type="button" className="key-visual-modal__close" onClick={onClose}>
          close key visual
        </button>
      </div>
    </div>
  )
}

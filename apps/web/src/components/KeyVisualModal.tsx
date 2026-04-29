import { useCallback, useEffect, useMemo, useState } from "react"
import type { ContentBundle } from "@magnolia/contracts"
import { BattleCanvas } from "@/render/battle/BattleCanvas"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import type { DisplayOptions } from "@/app/display-options"
import { buildKeyVisualRenderState } from "@/render/battle/fixtures/key-visual-render-state"

type KeyVisualModalProps = {
  variant: "fullscreen" | "windowed"
  onClose: () => void
  displayOptions: DisplayOptions
  content: ContentBundle
}

const TAU = Math.PI * 2

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

  /* ── PNG ダウンロード ──
     DOM 上の 2 つの canvas (backdrop + battle) を合成し、
     CSS overlay (ビネット・グラデーション・ロゴ・タグライン) を
     Canvas2D で再現して書き出す。 */
  const handleDownloadPng = useCallback(() => {
    const modal = document.querySelector(".key-visual-modal") as HTMLElement | null
    if (!modal) return
    const backdropCanvas = modal.querySelector(".key-visual-modal__particles") as HTMLCanvasElement | null
    const battleCanvas = modal.querySelector(".play-canvas--battle") as HTMLCanvasElement | null
    if (!backdropCanvas || !battleCanvas) return

    // windowed = 500×500, fullscreen = 1440×1560 (480:520 ×3)
    const isWindowed = variant === "windowed"
    const W = isWindowed ? 500 : 1440
    const H = isWindowed ? 500 : 1560
    const out = document.createElement("canvas")
    out.width = W
    out.height = H
    const ctx = out.getContext("2d")
    if (!ctx) return

    /* 1. 黒背景 */
    ctx.fillStyle = "#000508"
    ctx.fillRect(0, 0, W, H)

    /* 2. Backdrop (SignalBackdropCanvas) */
    ctx.drawImage(backdropCanvas, 0, 0, W, H)

    /* 3. スキャンライン */
    ctx.fillStyle = "rgba(93, 164, 209, 0.03)"
    const scanGap = isWindowed ? 4 : 6
    for (let y = 0; y < H; y += scanGap) ctx.fillRect(0, y + Math.floor(scanGap / 2), W, Math.floor(scanGap / 2))

    /* 4. Battle canvas (透過) */
    ctx.drawImage(battleCanvas, 0, 0, W, H)

    /* 4b. バリア直前弾 — ボス方向からバリア境界に到達した1発を描画
       ゲーム座標: player=(240, playerY), barrier≈30px, 弾は r≈33 の位置 */
    {
      const gamePlayerY = isWindowed ? 345 : 295
      const sx = W / 480
      const sy = H / 520
      // バリア境界のすぐ外側、やや左上からの軌道 (ボス方向)
      const bulletAngle = -Math.PI / 2 + 0.35 // ≈-55° (ボス方向から少しずれた自然な角度)
      const bulletDist = 33 // バリア半径(30)のすぐ外 → 消される直前
      const bx = (240 + Math.cos(bulletAngle) * bulletDist) * sx
      const by = (gamePlayerY + Math.sin(bulletAngle) * bulletDist) * sy
      const br = 7 * Math.min(sx, sy)
      // ハロー
      ctx.globalAlpha = 0.12
      ctx.fillStyle = "hsl(32, 78%, 68%)"
      ctx.beginPath()
      ctx.arc(bx, by, br * 2.2, 0, TAU)
      ctx.fill()
      // 軌道アーク
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = "hsl(32, 65%, 78%)"
      ctx.lineWidth = Math.max(0.7, br * 0.1)
      ctx.beginPath()
      ctx.arc(bx, by, br * 1.2, 0, Math.PI * 1.3)
      ctx.stroke()
      // コア
      ctx.globalAlpha = 0.5
      ctx.fillStyle = "hsl(32, 82%, 76%)"
      ctx.beginPath()
      ctx.arc(bx, by, br * 0.6, 0, TAU)
      ctx.fill()
      // 白熱中心
      ctx.globalAlpha = 0.9
      ctx.fillStyle = "hsl(40, 40%, 96%)"
      ctx.beginPath()
      ctx.arc(bx, by, br * 0.2, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    /* 5. ビネット */
    const vigCY = H * (isWindowed ? 0.40 : 0.38)
    const vig = ctx.createRadialGradient(W * 0.5, vigCY, W * 0.22, W * 0.5, vigCY, W * 0.65)
    vig.addColorStop(0, "rgba(0,0,0,0)")
    vig.addColorStop(1, "rgba(0,0,0,0.5)")
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    /* 6. 下部オーバーレイグラデーション */
    const overlayTop = H * (isWindowed ? 0.50 : 0.52)
    const grad = ctx.createLinearGradient(0, overlayTop, 0, H)
    grad.addColorStop(0, "rgba(0,5,12,0)")
    grad.addColorStop(0.25, "rgba(0,5,12,0.08)")
    grad.addColorStop(0.67, "rgba(0,5,12,0.35)")
    grad.addColorStop(1, "rgba(0,5,12,0.82)")
    ctx.fillStyle = grad
    ctx.fillRect(0, overlayTop, W, H - overlayTop)

    /* 7. ロゴ "MAGNOLIA" + グリッチ */
    const logoSize = isWindowed ? 38 : Math.round(W * 0.083)
    const logoY = Math.round(H * (isWindowed ? 0.90 : 0.915))
    const logoFont = `600 ${logoSize}px "IBM Plex Sans JP", sans-serif`
    const logoSpacing = `${logoSize * 0.12}px`
    const setLogoFont = (c: CanvasRenderingContext2D) => {
      c.textAlign = "center"
      c.textBaseline = "alphabetic"
      c.font = logoFont
      if ("letterSpacing" in c) {
        ;(c as unknown as Record<string, string>).letterSpacing = logoSpacing
      }
    }

    // 7a. メインロゴ (グロー付き)
    ctx.save()
    setLogoFont(ctx)
    const glowBlurA = isWindowed ? 16 : 40
    const glowBlurB = isWindowed ? 32 : 80
    ctx.shadowColor = "rgba(93, 164, 209, 0.7)"
    ctx.shadowBlur = glowBlurA
    ctx.fillStyle = "#e8f4ff"
    ctx.fillText("MAGNOLIA", W / 2, logoY)
    ctx.shadowColor = "rgba(93, 164, 209, 0.4)"
    ctx.shadowBlur = glowBlurB
    ctx.fillText("MAGNOLIA", W / 2, logoY)
    ctx.shadowBlur = 0
    ctx.shadowColor = "transparent"
    ctx.fillText("MAGNOLIA", W / 2, logoY)
    ctx.restore()

    // 7b. グリッチバンド (赤チャネル + シアンチャネル)
    //     CSS の clip-path + transform + 色収差を Canvas2D で再現
    const glitchShift = isWindowed ? 3 : 7
    const glitchSkew = 2 // degrees

    // Red (R) band — ロゴ上部 22〜42% をクリップ、右にシフト
    ctx.save()
    setLogoFont(ctx)
    const rBandTop = logoY - logoSize * 0.78 + logoSize * 0.22
    const rBandH = logoSize * 0.20
    ctx.beginPath()
    ctx.rect(0, rBandTop, W, rBandH)
    ctx.clip()
    ctx.globalAlpha = 0.8
    ctx.fillStyle = "rgba(255, 100, 140, 0.85)"
    ctx.shadowColor = "rgba(255, 0, 80, 0.6)"
    ctx.shadowBlur = isWindowed ? 4 : 8
    ctx.setTransform(1, 0, Math.tan(glitchSkew * Math.PI / 180), 1, glitchShift, 0)
    ctx.fillText("MAGNOLIA", W / 2, logoY)
    ctx.restore()

    // Cyan (C) band — ロゴ下部 58〜78% をクリップ、左にシフト
    ctx.save()
    setLogoFont(ctx)
    const cBandTop = logoY - logoSize * 0.78 + logoSize * 0.58
    const cBandH = logoSize * 0.20
    ctx.beginPath()
    ctx.rect(0, cBandTop, W, cBandH)
    ctx.clip()
    ctx.globalAlpha = 0.8
    ctx.fillStyle = "rgba(80, 210, 255, 0.85)"
    ctx.shadowColor = "rgba(0, 255, 255, 0.6)"
    ctx.shadowBlur = isWindowed ? 4 : 8
    ctx.setTransform(1, 0, Math.tan(-glitchSkew * Math.PI / 180), 1, -glitchShift, 0)
    ctx.fillText("MAGNOLIA", W / 2, logoY)
    ctx.restore()

    /* 8. アクセントライン */
    const lineY = logoY + Math.round(logoSize * 0.22)
    const lineW = isWindowed ? 198 : W * 0.36
    const lineX = (W - lineW) / 2
    const lineGrad = ctx.createLinearGradient(lineX, 0, lineX + lineW, 0)
    lineGrad.addColorStop(0, "transparent")
    lineGrad.addColorStop(0.12, "rgba(93,164,209,0.18)")
    lineGrad.addColorStop(0.5, "rgba(200,235,255,0.6)")
    lineGrad.addColorStop(0.88, "rgba(93,164,209,0.18)")
    lineGrad.addColorStop(1, "transparent")
    ctx.fillStyle = lineGrad
    ctx.fillRect(lineX, lineY, lineW, isWindowed ? 1 : 2)

    /* 9. タグライン */
    const tagSize = isWindowed ? 10 : Math.max(10, Math.round(W * 0.009))
    const tagY = lineY + Math.round(tagSize * (isWindowed ? 2.5 : 3))
    ctx.save()
    ctx.textAlign = "center"
    ctx.font = `300 ${tagSize}px "IBM Plex Mono", monospace`
    if ("letterSpacing" in ctx) {
      ;(ctx as unknown as Record<string, string>).letterSpacing = `${tagSize * 0.38}px`
    }
    ctx.shadowColor = "rgba(93, 164, 209, 0.35)"
    ctx.shadowBlur = isWindowed ? 4 : 8
    ctx.fillStyle = "rgba(160, 210, 240, 0.55)"
    ctx.fillText("SIGNAL IN THE HAZE", W / 2, tagY)
    ctx.restore()

    /* ダウンロード */
    const filename = isWindowed ? "magnolia-key-visual-500.png" : "magnolia-key-visual.png"
    out.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, "image/png")
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
          <BattleCanvas
            renderState={renderState}
            transparentBg
            shipVariant="art"
            displayOptions={displayOptions}
          />
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

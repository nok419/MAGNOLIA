import type { HazardRenderState } from "@magnolia/game-session"
import { TAU, easeOutCubic, hashString, seededRandom } from "@/render/battle/battle-renderer-utils"
import type { CanvasPaletteRole } from "@/render/shared/canvas-palette"
import { gradientStop, resolveCanvasPaletteRole, rgba } from "@/render/shared/canvas-palette"
import { drawThreatNoiseField } from "@/render/shared/effects/threat-noise-field"

export type MagneticDisasterHazardPreset = "magneticDisaster"

export function drawHazard(
  ctx: CanvasRenderingContext2D,
  hazard: HazardRenderState,
  t: number,
  options: { reduceFlashing: boolean; lowFrameRateMode: boolean },
) {
  const { x, y } = hazard.position
  const { width: w, height: h } = hazard.size
  const growth = easeOutCubic(hazard.phaseProgress)
  const role = readHazardPaletteRole(hazard.visual.paletteRole)
  const visualGlow = Math.max(0.1, Math.min(1, hazard.visual.glowIntensity ?? 0.5))
  // motionProfile は予兆/active の動きの早さを preset 側で切り替えるために使います。
  const visualMotionScale = hazard.visual.motionProfile === "slowWarning" ? 0.72 : 1
  // accessibilityVariant が "noFlash" の場合は reduceFlashing と同等に扱い、点滅を抑制します。
  const reduceFlash = options.reduceFlashing || hazard.visual.accessibilityVariant === "noFlash"
  ctx.save()
  const isTelegraph = hazard.phase === "telegraph"
  const isFading = hazard.phase === "fading"

  if (isTelegraph) {
    /* ── 予告フェーズ: ダッシュ枠 + グリッチ予兆 ── */
    // reduceFlashing or accessibilityVariant=noFlash では振幅を落とした"alpha変動"へ寄せ、点滅を線幅・形状差で示します。
    const pulse = reduceFlash
      ? 0.54 + 0.1 * Math.sin(t * 0.006 * visualMotionScale)
      : 0.45 + 0.35 * Math.sin(t * 0.016 * visualMotionScale)

    ctx.fillStyle = rgba(role, 0.08 + pulse * 0.1)
    ctx.fillRect(x, y, w, h)

    // 動くダッシュ枠
    ctx.strokeStyle = rgba(role, 0.32 + pulse * 0.38)
    ctx.lineWidth = reduceFlash ? 3 : 2
    ctx.setLineDash(reduceFlash ? [14, 10] : [8, 8])
    ctx.lineDashOffset = Math.floor(t * 0.02) % 16
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])

    // グリッチ予兆 — 散発的に薄い水平バーが走る
    const gf = Math.floor(t * 0.008)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(gf + i * 37) > 0.6) {
        const gy = y + seededRandom(gf + i * 71) * h
        const gh = 1 + seededRandom(gf + i * 13) * 3
        const gxOff = (seededRandom(gf + i * 53) - 0.5) * 6
        ctx.globalAlpha = 0.15 * pulse
        ctx.fillStyle = rgba(role, 0.8)
        ctx.fillRect(x + gxOff, gy, w, gh)
      }
    }
    ctx.globalAlpha = 1
  } else {
    /* ── アクティブ / フェードフェーズ ── */
    const phaseAlpha = isFading ? 1 - growth : growth
    // accessibilityVariant=noFlash の hazard preset では turbulence の上振れを抑え、
    // gentle/standard 差分は preset の glowIntensity だけで制御します。
    const turbulenceScale = (reduceFlash ? 0.08 + growth * 0.32 : 0.12 + growth * 0.88) * visualGlow
    const glitchIntensity = phaseAlpha * turbulenceScale

    /* ── 0. 暗域フォグ: 影響範囲を示す、境界線がぼやけた暗い面 ──
       正確な矩形ではなく、各辺にグラデーションのフェザーを持たせて
       「磁気災害が空間を侵食している」雰囲気を出す。
       角はあえてカバーしないことで有機的な曖昧さを残す。 */
    const fogAlpha = phaseAlpha * 0.22
    const fogFeather = 32

    // コア (フェザー分だけ内側のベタ塗り)
    ctx.globalAlpha = fogAlpha
    ctx.fillStyle = rgba("voidBase", 1)
    ctx.fillRect(x + fogFeather * 0.25, y + fogFeather * 0.25,
      w - fogFeather * 0.5, h - fogFeather * 0.5)

    // 右辺フェザー
    ctx.globalAlpha = 1
    const fogR = ctx.createLinearGradient(x + w - fogFeather, 0, x + w + fogFeather, 0)
    fogR.addColorStop(0, gradientStop("voidBase", fogAlpha))
    fogR.addColorStop(1, gradientStop("voidBase", 0))
    ctx.fillStyle = fogR
    ctx.fillRect(x + w - fogFeather, y + fogFeather * 0.25,
      fogFeather * 2, h - fogFeather * 0.5)

    // 下辺フェザー
    const fogB = ctx.createLinearGradient(0, y + h - fogFeather, 0, y + h + fogFeather)
    fogB.addColorStop(0, gradientStop("voidBase", fogAlpha))
    fogB.addColorStop(1, gradientStop("voidBase", 0))
    ctx.fillStyle = fogB
    ctx.fillRect(x + fogFeather * 0.25, y + h - fogFeather,
      w - fogFeather * 0.5, fogFeather * 2)

    // 左辺フェザー
    const fogL = ctx.createLinearGradient(x + fogFeather, 0, x - fogFeather, 0)
    fogL.addColorStop(0, gradientStop("voidBase", fogAlpha))
    fogL.addColorStop(1, gradientStop("voidBase", 0))
    ctx.fillStyle = fogL
    ctx.fillRect(x - fogFeather, y + fogFeather * 0.25,
      fogFeather * 2, h - fogFeather * 0.5)

    // 上辺フェザー
    const fogT = ctx.createLinearGradient(0, y + fogFeather, 0, y - fogFeather)
    fogT.addColorStop(0, gradientStop("voidBase", fogAlpha))
    fogT.addColorStop(1, gradientStop("voidBase", 0))
    ctx.fillStyle = fogT
    ctx.fillRect(x + fogFeather * 0.25, y - fogFeather,
      w - fogFeather * 0.5, fogFeather * 2)

    // 暗い下地 (既存 — コア内のみ)
    ctx.globalAlpha = 1
    ctx.fillStyle = rgba(role, 0.08 + phaseAlpha * 0.14)
    ctx.fillRect(x, y, w, h)

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    ctx.save()
    ctx.translate(x, y)
    drawThreatNoiseField(ctx, {
      paletteRole: role,
      reduceFlashing: reduceFlash,
      lowFrameRateMode: options.lowFrameRateMode,
      nowMs: t,
      intensity: phaseAlpha * visualGlow,
      semantic: "hazard",
      width: w,
      height: h,
      phase: (t * 0.0001 * visualMotionScale) % 1,
    })
    ctx.restore()

    drawMagneticStormNoise(ctx, {
      x,
      y,
      width: w,
      height: h,
      timeMs: t,
      phaseAlpha,
      glitchIntensity,
      role,
      lowFrameRateMode: options.lowFrameRateMode,
    })

    /* ── 1. グリッチ変位バー: 水平帯が不規則にズレる ── */
    const glitchFrame = Math.floor(t * 0.012)
    for (let i = 0; i < 5; i++) {
      if (seededRandom(glitchFrame * 3 + i * 41 + 7) > 0.35) {
        const barY = y + seededRandom(glitchFrame + i * 97) * h
        const barH = 1 + seededRandom(glitchFrame + i * 23) * 4 * glitchIntensity
        const shift = (seededRandom(glitchFrame + i * 59) - 0.5) * 16 * glitchIntensity
        ctx.globalAlpha = 0.12 + 0.1 * glitchIntensity
        ctx.fillStyle = rgba(role, 0.7)
        ctx.fillRect(x + shift, barY, w, barH)
      }
    }

    /* ── 1b. スクリーンティア: 画面が水平に引き裂かれる破壊的グリッチ ── */
    const tearFrame = Math.floor(t * 0.003)
    const tearActive = seededRandom(tearFrame * 13 + 71) > 0.55
    if (tearActive && glitchIntensity > 0.2) {
      const tearCount = 1 + Math.floor(seededRandom(tearFrame * 7 + 3) * 3)
      for (let i = 0; i < tearCount; i++) {
        const tearY = y + seededRandom(tearFrame + i * 89) * h
        const tearH = 2 + seededRandom(tearFrame + i * 31) * 12 * glitchIntensity
        const tearShift = (seededRandom(tearFrame + i * 47) - 0.5) * 40 * glitchIntensity
        // 引き裂かれた帯は赤い警告域の範囲内に抑え、白黒の閃きを強くしすぎない。
        ctx.globalAlpha = 0.05 + 0.08 * glitchIntensity
        ctx.fillStyle = seededRandom(tearFrame + i * 61) > 0.5
          ? rgba("signalReadable", 0.8)
          : rgba("voidBase", 0.8)
        ctx.fillRect(x + tearShift, tearY, w, tearH)
        // ティアの境界線は警告色に寄せ、ノイズの層として見せる。
        ctx.globalAlpha = 0.18 * glitchIntensity
        ctx.fillStyle = rgba(role, 0.9)
        ctx.fillRect(x + tearShift, tearY, w, 1)
      }
    }

    /* ── 2. 色収差ストリップ: R/Cyan チャネル分離 ── */
    const chromaFrame = Math.floor(t * 0.006)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(chromaFrame + i * 131) > 0.5) {
        const cy2 = y + seededRandom(chromaFrame + i * 67) * h
        const ch = 2 + seededRandom(chromaFrame + i * 29) * 6
        const offset = (seededRandom(chromaFrame + i * 83) - 0.5) * 8 * glitchIntensity
        ctx.globalAlpha = 0.06 * glitchIntensity
        ctx.fillStyle = rgba(role, 0.8)
        ctx.fillRect(x + offset, cy2, w, ch)
        ctx.fillStyle = rgba("signalPrimary", 0.5)
        ctx.fillRect(x - offset * 0.5, cy2 + 1, w, ch * 0.6)
      }
    }

    /* ── 3. 乱流グローバンド (速度・位置を不揃いに) ── */
    ctx.globalAlpha = 1
    for (let band = 0; band < 6; band += 1) {
      const bandSeed = hashString(`${hazard.position.x}:${hazard.position.y}:${band}`)
      const bandSpeed = 0.0018 + seededRandom(bandSeed) * 0.0024
      const bandProgress =
        ((t * bandSpeed) + band * 0.17 + seededRandom(bandSeed + 5) * 0.3) % 1
      const centerX = x + w * bandProgress
      const centerY =
        y +
        h * (0.12 + seededRandom(bandSeed + 3) * 0.76) +
        Math.sin(t * (0.002 + seededRandom(bandSeed + 1) * 0.003) + bandSeed) * h * 0.08
      const radiusX =
        (w * (0.06 + seededRandom(bandSeed + 7) * 0.1)) * turbulenceScale
      const radiusY =
        (h * (0.1 + seededRandom(bandSeed + 9) * 0.12)) * turbulenceScale

      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusX)
      glow.addColorStop(0, gradientStop(role, 0.18 + phaseAlpha * 0.16))
      glow.addColorStop(0.55, gradientStop(role, 0.1 + phaseAlpha * 0.1))
      glow.addColorStop(1, gradientStop(role, 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.ellipse(
        centerX, centerY, radiusX, radiusY,
        Math.sin(t * 0.0015 + band), 0, TAU,
      )
      ctx.fill()
    }

    /* ── 4. ノイズピクセル散乱: 細かい矩形が明滅 ── */
    ctx.globalAlpha = 0.2 * glitchIntensity
    ctx.fillStyle = rgba(role, 0.6)
    const pixFrame = Math.floor(t * 0.015)
    for (let i = 0; i < 12; i++) {
      if (seededRandom(pixFrame + i * 43) > 0.4) {
        const px2 = x + seededRandom(pixFrame + i * 17) * w
        const py2 = y + seededRandom(pixFrame + i * 31) * h
        const pw = 1 + seededRandom(pixFrame + i * 7) * 4
        const ph = 1 + seededRandom(pixFrame + i * 11) * 2
        ctx.fillRect(px2, py2, pw, ph)
      }
    }

    /* ── 4b. TVスタティック: 急激に切り替わる白黒ノイズの塊 ── */
    const staticBurst = Math.floor(t * 0.004)
    const burstActive = seededRandom(staticBurst * 17 + 53) > 0.6
    if (burstActive && glitchIntensity > 0.15) {
      // 不規則な矩形領域にスタティックを集中させる
      const regionX = x + seededRandom(staticBurst * 23) * w * 0.5
      const regionY = y + seededRandom(staticBurst * 31) * h * 0.4
      const regionW = w * (0.2 + seededRandom(staticBurst * 43) * 0.5)
      const regionH = h * (0.15 + seededRandom(staticBurst * 59) * 0.4)
      // 塊ごとに白黒ピクセルを高密度に撒く
      const density = 20 + Math.floor(glitchIntensity * 30)
      for (let i = 0; i < density; i++) {
        const spx = regionX + seededRandom(staticBurst * 100 + i * 7) * regionW
        const spy = regionY + seededRandom(staticBurst * 100 + i * 13) * regionH
        const spw = 1 + seededRandom(staticBurst * 100 + i * 3) * 3
        const sph = 1 + seededRandom(staticBurst * 100 + i * 17) * 2
        ctx.globalAlpha = 0.07 + seededRandom(staticBurst * 100 + i * 29) * 0.16
        ctx.fillStyle = seededRandom(staticBurst * 100 + i * 41) > 0.5
          ? rgba("signalReadable", 0.85)
          : rgba("voidBase", 0.8)
        ctx.fillRect(spx, spy, spw, sph)
      }
    }

    /* ── 4c. 縦グリッチライン: 赤系にはない縦方向の信号断裂 ── */
    const vFrame = Math.floor(t * 0.007)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(vFrame * 11 + i * 83 + 29) > 0.65) {
        const vx = x + seededRandom(vFrame + i * 67) * w
        const vw = 1 + seededRandom(vFrame + i * 23) * 3
        const vy = y + seededRandom(vFrame + i * 97) * h * 0.3
        const vh = h * (0.3 + seededRandom(vFrame + i * 41) * 0.7)
        ctx.globalAlpha = 0.06 + 0.12 * glitchIntensity
        ctx.fillStyle = seededRandom(vFrame + i * 53) > 0.3
          ? rgba(role, 0.65)
          : rgba("voidBase", 0.72)
        ctx.fillRect(vx, vy, vw, vh)
      }
    }

    /* ── 5. スキャンライン (不均一間隔 + ジッター) ── */
    ctx.globalCompositeOperation = "lighter"
    ctx.lineWidth = 1
    for (let i = 0; i < 7; i += 1) {
      const lineSpeed = 0.07 + seededRandom(i * 19) * 0.06
      const lineGap = 14 + seededRandom(i * 23) * 12
      const sy = y + ((t * lineSpeed + i * lineGap) % (h + 18))
      const jitter = Math.sin(t * 0.01 + i * 4.7) * 4
      const lineAlpha = 0.1 + phaseAlpha * 0.16 * seededRandom(i * 37 + 1)
      ctx.strokeStyle = rgba(role, lineAlpha)
      ctx.beginPath()
      ctx.moveTo(x, sy + jitter)
      ctx.lineTo(x + w, sy - 10 + jitter * 0.7)
      ctx.stroke()
    }

    /* ── 5b. インターレース崩壊: 偶数/奇数ラインが分離してチラつく ── */
    const ilaceFrame = Math.floor(t * 0.006)
    if (seededRandom(ilaceFrame * 19 + 7) > 0.5 && glitchIntensity > 0.25) {
      const ilaceY = y + seededRandom(ilaceFrame * 37) * h * 0.6
      const ilaceH = 6 + seededRandom(ilaceFrame * 43) * 20
      ctx.globalAlpha = 0.08 + 0.12 * glitchIntensity
      for (let scanY = ilaceY; scanY < ilaceY + ilaceH && scanY < y + h; scanY += 2) {
      ctx.fillStyle = rgba("signalReadable", 1)
        ctx.fillRect(x, scanY, w, 1)
      }
    }

    /* ── 6. ストロボフラッシュ (稀に全面が白く閃く) ── */
    ctx.globalCompositeOperation = "source-over"
    const strobeChance = seededRandom(Math.floor(t * 0.004) * 7 + 31)
    if (strobeChance > 0.92 && phaseAlpha > 0.3) {
      ctx.globalAlpha = 0.06 * phaseAlpha
      ctx.fillStyle = rgba("signalReadable", 1)
      ctx.fillRect(x, y, w, h)
    }

    /* ── 7. ブロック破損: JPEGアーティファクト風の大きな矩形が瞬間的に出現 ── */
    const corruptFrame = Math.floor(t * 0.003)
    if (seededRandom(corruptFrame * 31 + 41) > 0.72 && glitchIntensity > 0.3) {
      const cx2 = x + seededRandom(corruptFrame * 101) * w * 0.6
      const cy2 = y + seededRandom(corruptFrame * 113) * h * 0.5
      const cw = 20 + seededRandom(corruptFrame * 47) * 50
      const ch2 = 8 + seededRandom(corruptFrame * 59) * 20
      // 黒い欠損ブロックは赤い嵐の影として薄く残す。
      ctx.globalAlpha = 0.12 + 0.12 * glitchIntensity
      ctx.fillStyle = rgba("voidBase", 0.95)
      ctx.fillRect(cx2, cy2, cw, ch2)
      // ブロック内に赤いノイズ線
      ctx.globalAlpha = 0.22 * glitchIntensity
      ctx.fillStyle = rgba(role, 0.9)
      for (let ln = 0; ln < 3; ln++) {
        const lny = cy2 + seededRandom(corruptFrame + ln * 71) * ch2
        ctx.fillRect(cx2, lny, cw, 1)
      }
    }

    /* ── 7b. 信号消失パッチ: 一瞬だけ領域が真黒に抜ける ── */
    const dropFrame = Math.floor(t * 0.002)
    if (seededRandom(dropFrame * 43 + 17) > 0.85 && phaseAlpha > 0.4) {
      const dx = x + seededRandom(dropFrame * 67) * w * 0.4
      const dy = y + seededRandom(dropFrame * 79) * h * 0.3
      const dw = 30 + seededRandom(dropFrame * 53) * 60
      const dh = 4 + seededRandom(dropFrame * 89) * 14
      ctx.globalAlpha = 0.3 + 0.15 * phaseAlpha
      ctx.fillStyle = rgba("voidBase", 1)
      ctx.fillRect(dx, dy, dw, dh)
    }

    ctx.restore()
    drawMagneticWarningRim(ctx, {
      x,
      y,
      width: w,
      height: h,
      timeMs: t,
      phaseAlpha,
      role,
    })
  }

  ctx.restore()
}

function drawMagneticStormNoise(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    timeMs: number
    phaseAlpha: number
    glitchIntensity: number
    role: CanvasPaletteRole
    lowFrameRateMode: boolean
  },
) {
  const { x, y, width, height, timeMs, phaseAlpha, glitchIntensity, role, lowFrameRateMode } = input
  const frameRateScale = lowFrameRateMode ? 0.48 : 1
  const frame = Math.floor(timeMs * 0.018 * (lowFrameRateMode ? 0.55 : 1))

  ctx.save()
  ctx.globalCompositeOperation = "lighter"

  // 粒状ノイズは矩形の一様塗りを避けるため、座標 seed で位置を固定しつつ明滅だけ動かす。
  const particleCount = Math.max(18, Math.floor(Math.max(44, Math.floor((width * height) / 900)) * frameRateScale))
  for (let i = 0; i < particleCount; i += 1) {
    const seed = hashString(`${Math.round(x)}:${Math.round(y)}:${i}`)
    const drift = (timeMs * (0.00005 + seededRandom(seed + 3) * 0.00008) + seededRandom(seed + 7)) % 1
    const baseX = x + ((seededRandom(seed + 11) + drift * 0.12) % 1) * width
    const baseY =
      y +
      ((seededRandom(seed + 13) +
        Math.sin(timeMs * 0.0012 + seed) * 0.025 +
        drift * 0.04) % 1) *
        height
    const radius = 0.7 + seededRandom(seed + 17) * 2.6
    const flicker = 0.38 + 0.62 * seededRandom(frame + seed * 5)
    const alpha = (0.025 + seededRandom(seed + 19) * 0.07) * phaseAlpha * flicker
    const dot = ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, radius * 5)
    dot.addColorStop(0, gradientStop("signalReadable", alpha * 1.25))
    dot.addColorStop(0.42, gradientStop(role, alpha * 0.68))
    dot.addColorStop(1, gradientStop(role, 0))
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(baseX, baseY, radius * 5, 0, TAU)
    ctx.fill()
  }

  // 斜めの流線で「嵐」の向きを作る。線は短く、警告域の赤を保つ。
  ctx.lineCap = "round"
  ctx.lineWidth = 0.8
  const streamlineCount = lowFrameRateMode ? 8 : 18
  for (let i = 0; i < streamlineCount; i += 1) {
    const seed = hashString(`storm:${Math.round(x)}:${Math.round(y)}:${i}`)
    const progress = (timeMs * (0.00018 + seededRandom(seed + 1) * 0.00018) + seededRandom(seed + 2)) % 1
    const sx = x + progress * width
    const sy = y + (seededRandom(seed + 3) * 0.9 + 0.05) * height
    const sway = Math.sin(timeMs * 0.0018 + seed) * height * 0.035
    const length = 22 + seededRandom(seed + 4) * 54
    const alpha = (0.055 + seededRandom(seed + 5) * 0.08) * phaseAlpha * (0.55 + glitchIntensity * 0.45)
    const line = ctx.createLinearGradient(sx - length, sy + sway + length * 0.25, sx + length, sy + sway - length * 0.25)
    line.addColorStop(0, gradientStop(role, 0))
    line.addColorStop(0.5, gradientStop(role, alpha))
    line.addColorStop(1, gradientStop(role, 0))
    ctx.strokeStyle = line
    ctx.beginPath()
    ctx.moveTo(sx - length, sy + sway + length * 0.25)
    ctx.quadraticCurveTo(sx, sy + sway - length * 0.08, sx + length, sy + sway - length * 0.25)
    ctx.stroke()
  }

  ctx.restore()
}

function drawMagneticWarningRim(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; timeMs: number; phaseAlpha: number; role: CanvasPaletteRole },
) {
  const pulse = 0.65 + 0.35 * Math.sin(input.timeMs * 0.004)

  ctx.save()
  ctx.strokeStyle = rgba(input.role, (0.2 + pulse * 0.18) * input.phaseAlpha)
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.lineDashOffset = -(input.timeMs * 0.035)
  ctx.shadowColor = rgba(input.role, 0.2 * input.phaseAlpha)
  ctx.shadowBlur = 12
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.setLineDash([])

  ctx.strokeStyle = rgba("signalReadable", (0.08 + pulse * 0.08) * input.phaseAlpha)
  ctx.lineWidth = 7
  ctx.shadowBlur = 18
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.restore()
}

function readHazardPaletteRole(value: string): CanvasPaletteRole {
  return resolveCanvasPaletteRole(value, "threatNoise")
}

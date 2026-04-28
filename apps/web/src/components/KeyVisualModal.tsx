import { useCallback, useEffect, useMemo, useState } from "react"
import type { BattleRenderState } from "@magnolia/game-session"
import { BattleCanvas } from "@/components/BattleCanvas"
import { MagnoliaLogo } from "@/components/title/MagnoliaLogo"
import { SignalBackdropCanvas } from "@/components/title/SignalBackdropCanvas"
import type { DisplayOptions } from "@/app/display-options"

type KeyVisualModalProps = {
  variant: "fullscreen" | "windowed"
  onClose: () => void
  displayOptions: DisplayOptions
}

/* 黄金角 (137.508°) — フィボナッチ弾幕用 */
const TAU = Math.PI * 2
const GOLDEN_ANGLE = TAU * (1 - 1 / 1.618033988749895) // ≈ 2.3999…
const PROJECTILE_VISUAL_PRESET_BY_ID: Record<string, string> = {
  proj_enemy_basic: "vis_bullet_enemy_basic",
  proj_enemy_core: "vis_bullet_enemy_core",
  proj_enemy_geo: "vis_bullet_enemy_geo",
  proj_enemy_lance: "vis_bullet_enemy_lance",
  proj_enemy_petal: "vis_bullet_enemy_petal",
  proj_player_carrier: "vis_bullet_player_carrier",
  proj_player_carrier_blast: "vis_bullet_player_carrier_blast",
  proj_player_pulse: "vis_bullet_player_pulse",
  proj_player_pulse_melee: "vis_bullet_player_melee",
}

function readKeyVisualProjectilePresetId(projectileId: string): string {
  // Key Visual は runtime の content loader を通らないため、ここだけ明示対応で preset 契約を満たします。
  return PROJECTILE_VISUAL_PRESET_BY_ID[projectileId] ?? projectileId
}

export function KeyVisualModal({ variant, onClose, displayOptions }: KeyVisualModalProps) {
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

  const renderState = useMemo(() => buildKeyVisualRenderState(elapsedMs, variant), [elapsedMs, variant])

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

/* ==================================================================
   KEY VISUAL RENDER STATE

   design_sample.png のコンポジションを再現:
     上部: 磁気災害ゾーン
     上段: 敵 (遠距離 — ボス中央 + 左右)
     中段: 弾幕リング + 敵弾ファン
     中央: 自機 (ショット + バリア展開)
     下部: MAGNOLIA ロゴ (CSS overlay)

   BattleCanvas 座標系 (480 × 520) 内に全要素を配置。
   ================================================================== */

function buildKeyVisualRenderState(
  elapsedMs: number,
  variant: "fullscreen" | "windowed" = "fullscreen",
): BattleRenderState {
  const cx = 240
  const isW = variant === "windowed"

  /* ── 自機配置 ──
     windowed (500×500): コンパクトな正方形構図、下寄り
     fullscreen: 縦長ビューポートを活かし、やや上めに配置（ロゴ領域を広く確保） */
  const basePlayerY = isW ? 345 : 295
  const playerY = basePlayerY + Math.cos(elapsedMs * 0.0016) * 3

  /* ── 敵の配置 ──
     windowed:    コンパクト — ボスと自機の距離が近く緊張感
     fullscreen:  展開 — ボスを高く、左右を広く、弾幕が画面いっぱいに広がる */
  const bossY = (isW ? 105 : 80) + Math.sin(elapsedMs * 0.0008) * 4
  const stdLX = isW ? 72 : 56
  const stdRX = isW ? 408 : 424
  const stdY = (isW ? 200 : 175) + Math.cos(elapsedMs * 0.0012) * 5

  const enemies: BattleRenderState["enemies"] = [
    // 重装型 (ボス) — 大型、弾幕の焦点
    {
      enemyInstanceId: "kv_heavy", enemyId: "enemy_heavy",
      visualPresetId: "vis_enemy_heavy",
      position: { x: cx, y: bossY },
      radius: 34, hp: 999, maxHp: 999, burning: false,
    },
    // 通常型 ×2 — 左右の端寄り
    {
      enemyInstanceId: "kv_std_l", enemyId: "enemy_standard",
      visualPresetId: "vis_enemy_standard",
      position: { x: stdLX, y: stdY },
      radius: 20, hp: 50, maxHp: 56, burning: false,
    },
    {
      enemyInstanceId: "kv_std_r", enemyId: "enemy_standard",
      visualPresetId: "vis_enemy_standard",
      position: { x: stdRX, y: stdY },
      radius: 20, hp: 50, maxHp: 56, burning: false,
    },
  ]

  /* ── 自機の射撃: メインレベル1 — 単発パルスショット1列のみ ── */
  const playerProjectiles: BattleRenderState["projectiles"] = [
    ...kvShotColumn(cx, playerY - 36, elapsedMs),
  ]

  /* ── 弾幕コンポジション ──
     デザイン原則:
       無差別感 — 全方位放射、特定方向への「狙い」を排除
       非エイム — 幾何学パターンのみ、プレイヤー方向を参照しない
       黄金比   — 黄金角スパイラル (フィボナッチ分布)
       回転     — 各レイヤーが異なる速度・方向で回転
       左右対称 — リング・六角形による対称構造
       アシンメ — 異速逆回転で対称が崩れる瞬間の美
       三角形   — 3弾リングが重なりダビデの星を形成

     バリア可視化: ボスの遠方放射 (L6) が自機付近まで到達。
     360°乱射の中の1発がたまたま自機を掠める軌道にあり、
     バリアが遮断する (r<34 フィルタ)。 */
  const bRot = elapsedMs * 0.0003

  // フルスクリーン: 弾幕を大きく広げ、レイヤーを増やして壮大に
  // windowed:       コンパクトに密集させ、正方形の画面密度を上げる
  const enemyProjectiles: BattleRenderState["projectiles"] = [
    // ══════ Boss: 大型ノイズ源 ══════
    // L1: 内核スパイラル (黄金比 + 回転)
    ...kvGoldenSpiral(cx, bossY, 42, isW ? 82 : 95, isW ? 14 : 18, bRot * 1.2, "proj_enemy_basic", "kv_b1"),
    // L2: 三角リング (三角形 + 逆回転)
    ...kvRing(cx, bossY, isW ? 110 : 125, 3, -bRot * 2.0, "proj_enemy_geo", "kv_b2"),
    // L3: 外周スパイラル (黄金比 + 逆回転 → アシンメトリー)
    ...kvGoldenSpiral(cx, bossY, isW ? 130 : 148, isW ? 200 : 240, isW ? 16 : 22, -bRot * 0.8, "proj_enemy_basic", "kv_b3"),
    // L4: 逆位相三角リング (L2と60°ずれ → 重なるとダビデの星)
    ...kvRing(cx, bossY, isW ? 160 : 190, 3, bRot * 1.4, "proj_enemy_basic", "kv_b4"),
    // L5: 六角リング (左右対称系)
    ...kvRing(cx, bossY, isW ? 210 : 250, 6, bRot * 0.4, "proj_enemy_geo", "kv_b5"),
    // L6: 遠方放射 (全方位に飛散し一部が自機付近を通過)
    ...kvGoldenSpiral(cx, bossY, isW ? 215 : 260, isW ? 300 : 380, isW ? 10 : 14, -bRot * 0.6, "proj_enemy_basic", "kv_b6"),

    // ══════ Standard 左: 小型ノイズ源 ══════
    ...kvGoldenSpiral(stdLX, stdY, isW ? 28 : 28, isW ? 65 : 80, isW ? 10 : 12, bRot * 0.7, "proj_enemy_basic", "kv_sl_sp"),
    ...kvRing(stdLX, stdY, isW ? 48 : 58, 3, -bRot * 1.5, "proj_enemy_geo", "kv_sl_tri"),

    // ══════ Standard 右: 小型ノイズ源 (対称配置・逆回転) ══════
    ...kvGoldenSpiral(stdRX, stdY, isW ? 28 : 28, isW ? 65 : 80, isW ? 10 : 12, -bRot * 0.7, "proj_enemy_basic", "kv_sr_sp"),
    ...kvRing(stdRX, stdY, isW ? 48 : 58, 3, bRot * 1.5, "proj_enemy_geo", "kv_sr_tri"),

  ]

  return {
    missionId: "mission_key_visual_poster",
    missionDurationMs: 120000,
    elapsedMs,
    player: {
      position: { x: cx, y: playerY },
      radius: 10,
      invincible: false,
      noiseLevel: 0.18,
      barrierRadius: 30,
      // バリア展開中 — drawBarrierGauge が実際のゲームと同じ描画をする
      barrierState: { remainingMs: 2400, maxMs: 2600, active: true },
      subCooldownMs: 340,
      subMaxCooldownMs: 1000,
    },
    enemies,
    projectiles: [
      // 磁気災害ゾーン + バリア圏内の敵弾は消滅する
      ...enemyProjectiles.filter((p) => {
        if (p.side !== "enemy") return true
        // 磁気災害ゾーン
        const hx0 = -16, hy0 = -10, hx1 = -16 + 480 * 0.72, hy1 = -10 + 115
        if (p.position.x >= hx0 && p.position.x <= hx1 && p.position.y >= hy0 && p.position.y <= hy1) return false
        // バリア遮断: 乱射のうち自機を掠める弾を吸収
        const dx = p.position.x - cx
        const dy = p.position.y - playerY
        if (dx * dx + dy * dy < 34 * 34) return false
        return true
      }),
      ...playerProjectiles,
    ],
    // supportField は別メカニクスなので KV では省略。
    // バリアは barrierState.active で描画される (drawBarrierGauge)。
    supportFields: [],
    pickups: [],
    hazards: [
      {
        // 磁気災害 — 左端から画面の7割幅、上部から下方まで広がる
        // 「画面外から襲いくる広範囲の災害」を表現: 左端に接し、右端には届かない
        // phaseProgress を高く維持し、強烈な描画にする
        hazardId: "hazard_key_visual_top",
        visualPresetId: "hazard_magnetic_disaster_standard",
        phase: "active",
        phaseProgress: 0.7 + 0.2 * Math.sin(elapsedMs * 0.0006),
        position: { x: -16, y: -10 },
        size: { width: 480 * 0.72, height: 115 },
      },
    ],
    equippedMainId: "eq_main_pulse",
    equippedSubId: "eq_sub_noise_canceller",
  }
}

/* ==================================================================
   Helper: パルスショットの弾柱
   ================================================================== */
function kvShotColumn(
  baseX: number,
  baseY: number,
  t: number,
): BattleRenderState["projectiles"] {
  return Array.from({ length: 5 }, (_, i) => ({
    projectileInstanceId: `kv_ps_${baseX}_${i}`,
    projectileId: "proj_player_pulse",
    visualPresetId: readKeyVisualProjectilePresetId("proj_player_pulse"),
    side: "player" as const,
    position: { x: baseX, y: baseY - i * 42 + (t * 0.12) % 42 },
    velocity: { x: 0, y: -400 },
    radius: 6,
  }))
}

/* ==================================================================
   Helper: 黄金角スパイラル (Fibonacci 腕の弾幕リング)
   ================================================================== */
function kvGoldenSpiral(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  count: number,
  rotOffset: number,
  projId: string,
  prefix: string,
): BattleRenderState["projectiles"] {
  const rRange = outerR - innerR
  return Array.from({ length: count }, (_, i) => {
    const angle = rotOffset + i * GOLDEN_ANGLE
    const r = innerR + (i / Math.max(1, count - 1)) * rRange
    return {
      projectileInstanceId: `${prefix}_${i}`,
      projectileId: projId,
      visualPresetId: readKeyVisualProjectilePresetId(projId),
      side: "enemy" as const,
      position: {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      },
      velocity: {
        x: Math.cos(angle) * 30,
        y: Math.sin(angle) * 30,
      },
      radius: 7,
    }
  })
}

/* ==================================================================
   Helper: 等間隔リング (均等配置の弾幕輪)
   ================================================================== */
function kvRing(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  rotOffset: number,
  projId: string,
  prefix: string,
): BattleRenderState["projectiles"] {
  return Array.from({ length: count }, (_, i) => {
    const angle = rotOffset + (TAU / count) * i
    return {
      projectileInstanceId: `${prefix}_${i}`,
      projectileId: projId,
      visualPresetId: readKeyVisualProjectilePresetId(projId),
      side: "enemy" as const,
      position: {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      },
      velocity: {
        x: Math.cos(angle) * 25,
        y: Math.sin(angle) * 25,
      },
      radius: 7,
    }
  })
}

/* ==================================================================
   Helper: 扇形バースト (中心角から spread 分だけ広がる)
   ================================================================== */
function kvFan(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  centerAngle: number,
  spreadAngle: number,
  projId: string,
  prefix: string,
): BattleRenderState["projectiles"] {
  return Array.from({ length: count }, (_, i) => {
    const angle =
      centerAngle - spreadAngle / 2 + (spreadAngle / Math.max(1, count - 1)) * i
    return {
      projectileInstanceId: `${prefix}_${i}`,
      projectileId: projId,
      visualPresetId: readKeyVisualProjectilePresetId(projId),
      side: "enemy" as const,
      position: {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      },
      velocity: {
        x: Math.cos(angle) * 30,
        y: Math.sin(angle) * 30,
      },
      radius: 7,
    }
  })
}

/* ==================================================================
   Helper: 弧状ストリーム (中心から放射状に距離を変えながらカーブ)
   東方・スクエニ参考画像の流れるような弾幕ストリームを再現。
   ================================================================== */
function kvArcStream(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  count: number,
  baseAngle: number,
  curvature: number,
  projId: string,
  prefix: string,
): BattleRenderState["projectiles"] {
  const rRange = outerR - innerR
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1)
    const r = innerR + t * rRange
    const angle = baseAngle + t * curvature
    return {
      projectileInstanceId: `${prefix}_${i}`,
      projectileId: projId,
      visualPresetId: readKeyVisualProjectilePresetId(projId),
      side: "enemy" as const,
      position: {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      },
      velocity: {
        x: Math.cos(angle) * 22,
        y: Math.sin(angle) * 22,
      },
      radius: 7,
    }
  })
}

/* ==================================================================
   Helper: 残余ノイズ散布 (自機付近に黄金角で散らばるノイズ粒子)
   バリア圏内の弾がフィルタで消え、円形の遮断域を可視化する。
   ================================================================== */
function kvNoiseScatter(
  cx: number, cy: number,
  innerR: number, outerR: number,
  count: number,
  t: number,
  projId: string,
  prefix: string,
): BattleRenderState["projectiles"] {
  const rRange = outerR - innerR
  return Array.from({ length: count }, (_, i) => {
    const angle = i * GOLDEN_ANGLE + t * 0.0004
    const r = innerR + (i / Math.max(1, count - 1)) * rRange
    return {
      projectileInstanceId: `${prefix}_${i}`,
      projectileId: projId,
      visualPresetId: readKeyVisualProjectilePresetId(projId),
      side: "enemy" as const,
      position: { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r },
      velocity: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 },
      radius: 7,
    }
  })
}

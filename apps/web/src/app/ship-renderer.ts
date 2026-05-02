/**
 * MAGNOLIA 自機描画の共通モジュール。
 *
 * BattleCanvas / ExploreCanvas / MenuScreen (UNIT STATUS パネル) で
 * 使用される自機描画をここに一本化する。これにより見た目を変更する際の
 * 修正点が複数ファイルに散らばることを防ぐ。
 *
 * ── バックエンドチームへの通達 ────────────────────────────────
 *   - SettingsRow に `shipVariant: "solid" | "art"` が追加された。
 *     サーバ側でバリデーションを行う場合は `SHIP_VARIANTS` を参照。
 *   - 既存セーブは `normalizeSettings` で自動的に "solid" (現行見た目) として
 *     読み込まれる。マイグレーションは不要。
 *   - バリアントはビジュアル層のみを切り替える。当たり判定・機体サイズ・
 *     角度等のゲーム挙動には一切影響を与えない。
 *   - solid / art は見た目の責務を分ける。solid は三角形を基調にした高速機体、
 *     art は多層の面と内部導線を持つ別設計の機体として描画する。
 *   - 将来バリアントを追加する際は contracts の `ShipVariant` と
 *     本モジュールの `drawShip*` 関数群を同時に拡張すること。
 *     片方のみの追加は既存セーブの描画で未定義挙動を招く。
 * ──────────────────────────────────────────────────────────
 */

import type { ShipVariant } from "@magnolia/contracts"

/** 黄金比。機体の縦横比・各部の相対比は全てこの値と PHI_INV から導出する。 */
export const SHIP_PHI = 1.618033988749895
export const SHIP_PHI_INV = 1 / SHIP_PHI
const TAU = Math.PI * 2

/**
 * 基準サイズ。
 * bodyH = 16 * PHI, bodyW = 16 を基準とし、各呼び出しは `scale` で拡縮する。
 * この基準は全描画コンテキストで共通 (= バリアント変更で silhouette が変わらない)。
 */
export const SHIP_BASE_BODY_W = 16
export const SHIP_BASE_BODY_H = SHIP_BASE_BODY_W * SHIP_PHI

export type Vec2 = { x: number; y: number }

/**
 * 自機描画の呼び出しパラメータ。
 *
 * 呼び出し側 (BattleCanvas / ExploreCanvas / ステータスパネル) は、
 * 各々のコンテキストに合わせた色・glow・reveal を組み立ててこの関数に渡す。
 * 色そのものを renderer 側に押し込まないのは、
 * 無敵演出の黄色や release-sequence の白系など、
 * コンテキスト固有のトーンを renderer に持ち込むと結合が高まるため。
 */
export type ShipDrawParams = {
  /** 見た目バリアント。 */
  variant: ShipVariant
  /** 機体中心 (キャンバス座標)。 */
  center: Vec2
  /** 拡縮。1.0 で基準サイズ (bodyW=16)。 */
  scale: number
  /** 回転 (radians)。0 で上向き (y- 方向)。省略時 0。 */
  rotation?: number
  /** 輪郭線の色。 */
  stroke: string
  /** 胴体・翼の塗りつぶし色 (半透明推奨)。未指定の場合は塗りを省略する。 */
  fill?: string
  /** 輪郭線の太さ。省略時 1.5。 */
  lineWidth?: number
  /** 機体全体の shadow (glow)。null/undefined で無効。 */
  glow?: { color: string; blur: number } | null
  /**
   * 中心コア発光。null でコア自体を非表示にできる。
   * `pulse` に時間依存の値 (0..1) を渡すと、drawShip 側で
   * shadowBlur と alpha に反映される。
   */
  core?: {
    color: string
    glowColor?: string
    glowBlur?: number
    radius?: number
    pulse?: number
  } | null
  /** 排気プルーム。ステータスパネル等の静止表示用。省略時は描画しない。 */
  engineExhaust?: {
    color: string
    blur?: number
    jitter?: number
  } | null
  /**
   * Release-sequence のアンベール用 (0..1)。
   * 未指定または 1 で通常描画。< 1 のとき頂点が根元から伸びるアニメーションになる。
   * reveal 完了前は art バリアントでも solid 形状で描画し、
   * 完了時点で art 形状へスイッチする (途中切替による見た目のジャンプを避けるため)。
   */
  reveal?: number
  /** release-sequence の塗り reveal。未指定時は `reveal` を流用。 */
  revealFill?: number
  /** art バリアントの時間依存アニメーション (コア回転等) に使う現在時刻 (ms)。 */
  timeMs?: number
  /**
   * art バリアントの装飾強度 (0..1)。
   * 戦闘時の視認性を優先したい場合に 0.5〜0.7 に絞る運用を想定。
   * 低い値のとき内部導線や細部が省略され、外側シルエットだけが残る。省略時 1。
   */
  artDetailStrength?: number
}

/**
 * 機体形状を描くための派生メトリクス。
 * release-sequence など drawShip を通さない特殊アニメでも、
 * `computeHullMetrics` を呼んでこの値を使うことで silhouette を共有できる。
 */
export type HullMetrics = {
  bodyH: number
  bodyW: number
  wingH: number
  wingW: number
  wingGap: number
  baseY: number
  tipY: number
  bodyNotchY: number
}

export function computeHullMetrics(scale: number): HullMetrics {
  const bodyH = SHIP_BASE_BODY_H * scale
  const bodyW = SHIP_BASE_BODY_W * scale
  const wingH = bodyH * SHIP_PHI_INV * 0.7
  const wingW = bodyW * SHIP_PHI_INV * 0.8
  const wingGap = bodyW * 0.08
  const baseY = bodyH * 0.3
  const tipY = -bodyH * 0.7
  const bodyNotchY = baseY - bodyH * 0.15
  return { bodyH, bodyW, wingH, wingW, wingGap, baseY, tipY, bodyNotchY }
}

/**
 * 自機を描画する (エントリポイント)。
 *
 * ctx 状態の save/restore はこの関数内で完結する。
 * translate / rotate も内部で行うため、呼び出し側は機体中心を `params.center` で
 * 指定するだけでよい。
 */
export function drawShip(ctx: CanvasRenderingContext2D, params: ShipDrawParams): void {
  const m = computeHullMetrics(params.scale)
  const reveal = clampVisualRatio(params.reveal ?? 1)
  const revealFill = clampVisualRatio(params.revealFill ?? reveal)
  const rotation = params.rotation ?? 0
  const lineWidth = params.lineWidth ?? 1.5
  const timeMs = params.timeMs ?? 0

  // reveal 完了前 (release-sequence 中) は常に solid 形状で描画する。
  // 完了時点でスナップ的に art 形状へ切り替える設計。
  const effectiveVariant: ShipVariant = reveal < 0.98 ? "solid" : params.variant

  ctx.save()
  ctx.translate(params.center.x, params.center.y)
  if (rotation !== 0) ctx.rotate(rotation)

  if (params.glow) {
    ctx.shadowColor = params.glow.color
    ctx.shadowBlur = params.glow.blur
  }
  ctx.strokeStyle = params.stroke
  ctx.lineWidth = lineWidth

  if (effectiveVariant === "art") {
    drawShipArtBody(ctx, m, {
      stroke: params.stroke,
      fill: params.fill,
      lineWidth,
      timeMs,
      strength: clampVisualRatio(params.artDetailStrength ?? 1),
      glow: params.glow ?? null,
    })
  } else {
    drawShipSolidHull(ctx, m, {
      fill: params.fill,
      reveal,
      revealFill,
    })
  }

  if (params.core) {
    if (effectiveVariant === "art") {
      drawShipArtCore(ctx, m, params.core, timeMs)
    } else {
      drawShipSolidCore(ctx, m, params.core)
    }
  }

  if (params.engineExhaust) {
    drawShipExhaust(ctx, m, params.engineExhaust, timeMs)
  }

  ctx.restore()
}

/* ============================================================
   SOLID VARIANT
   三角形を基調にした高速機体。小さい表示でも前進方向が読める設計。
   ============================================================ */

/** solid: 主三角、左右デルタ翼、後端フィンで構成したシルエット。 */
function drawShipSolidHull(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  opts: { fill?: string; reveal: number; revealFill: number },
): void {
  const r = opts.reveal

  traceSolidDeltaHull(ctx, m, r)
  ctx.stroke()

  if (opts.fill && opts.revealFill > 0.001) {
    const rf = opts.revealFill
    ctx.save()
    ctx.fillStyle = opts.fill
    traceSolidDeltaHull(ctx, m, rf)
    ctx.fill()
    ctx.restore()
  }

  for (const side of [-1, 1] as const) {
    traceSolidDeltaWing(ctx, m, side, r)
    if (opts.fill) {
      ctx.fillStyle = opts.fill
      ctx.fill()
    }
    ctx.stroke()
  }

  for (const side of [-1, 1] as const) {
    traceSolidRearFin(ctx, m, side, r)
    if (opts.fill) {
      ctx.fillStyle = opts.fill
      ctx.fill()
    }
    ctx.stroke()
  }

  // 主三角の稜線と翼の折り目だけを足し、三角形ベースの形状を読みやすくします。
  ctx.save()
  ctx.globalAlpha = 0.72 * r
  ctx.lineWidth = Math.max(0.45, ctx.lineWidth * 0.58)
  ctx.beginPath()
  ctx.moveTo(0, m.tipY + m.bodyH * 0.1)
  ctx.lineTo(0, m.baseY * 0.5 * r)
  ctx.moveTo(-m.bodyW * 0.18 * r, -m.bodyH * 0.02 * r)
  ctx.lineTo(-m.bodyW * 0.56 * r, (m.baseY - m.wingH * 0.1) * r)
  ctx.moveTo(m.bodyW * 0.18 * r, -m.bodyH * 0.02 * r)
  ctx.lineTo(m.bodyW * 0.56 * r, (m.baseY - m.wingH * 0.1) * r)
  ctx.stroke()
  ctx.restore()
}

function traceSolidDeltaHull(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  reveal: number,
): void {
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.lineTo(-m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(0, m.bodyNotchY * reveal)
  ctx.lineTo(m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.closePath()
}

function traceSolidDeltaWing(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  side: -1 | 1,
  reveal: number,
): void {
  const rootX = side * m.bodyW * 0.22
  const rootY = m.baseY * 0.42
  const outerX = side * (m.bodyW * 0.5 + m.wingGap + m.wingW * 1.08)
  const outerY = m.baseY * 0.46
  const innerX = side * m.bodyW * 0.36
  const innerY = -m.bodyH * 0.2

  ctx.beginPath()
  ctx.moveTo(rootX, rootY)
  ctx.lineTo(outerX * reveal, outerY * reveal)
  ctx.lineTo(innerX * reveal, innerY * reveal)
  ctx.closePath()
}

function traceSolidRearFin(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  side: -1 | 1,
  reveal: number,
): void {
  ctx.beginPath()
  ctx.moveTo(side * m.bodyW * 0.1, m.baseY * 0.82)
  ctx.lineTo(side * m.bodyW * 0.26 * reveal, m.baseY * 1.1 * reveal)
  ctx.lineTo(side * m.bodyW * 0.02 * reveal, m.baseY * 0.98 * reveal)
  ctx.closePath()
}

/** solid: 中心コアの菱形発光点。 */
function drawShipSolidCore(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  core: NonNullable<ShipDrawParams["core"]>,
): void {
  const pulse = clampVisualRatio(core.pulse ?? 1)
  const radius = core.radius ?? 2
  const coreY = -m.bodyH * 0.12
  ctx.save()
  if (core.glowColor) {
    ctx.shadowColor = core.glowColor
    ctx.shadowBlur = (core.glowBlur ?? 10) * (0.6 + 0.4 * pulse)
  } else {
    ctx.shadowBlur = 0
  }
  ctx.fillStyle = core.color
  ctx.globalAlpha = 0.7 + 0.3 * pulse
  traceSolidCoreKite(ctx, 0, coreY, radius * 0.86, radius * 1.22)
  ctx.fill()
  ctx.globalAlpha = 0.42 + 0.2 * pulse
  ctx.shadowBlur = 0
  traceSolidCoreKite(ctx, 0, coreY, radius * 1.58, radius * 2.05)
  ctx.stroke()
  ctx.globalAlpha = 0.78 + 0.22 * pulse
  ctx.beginPath()
  ctx.arc(0, coreY, radius * 0.32, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function traceSolidCoreKite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - halfHeight)
  ctx.lineTo(cx + halfWidth, cy)
  ctx.lineTo(cx, cy + halfHeight)
  ctx.lineTo(cx - halfWidth, cy)
  ctx.closePath()
}

/* ============================================================
   ART VARIANT
   solid 用のパネル関数を使わず、多層面と内部導線で別設計として描く。
   当たり判定ボックスは共有できるが、見た目の部品は共有しない。
   ============================================================ */

/** art: 機体本体 (主翼 + 副翼 + スパイン + 内部導線)。 */
function drawShipArtBody(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  opts: {
    stroke: string
    fill?: string
    lineWidth: number
    timeMs: number
    strength: number
    glow: { color: string; blur: number } | null
  },
): void {
  const s = opts.strength
  const lw = opts.lineWidth

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  drawArtPrimaryWingPanels(ctx, m, opts.fill)
  drawArtSecondaryWingPanels(ctx, m, opts.fill, s)
  drawArtSpine(ctx, m, opts.fill)

  if (s > 0.3) {
    ctx.save()
    ctx.lineWidth = Math.max(0.5, lw * 0.5)
    ctx.globalAlpha = 0.7 * s
    drawArtInternalRails(ctx, m, opts.timeMs)
    ctx.restore()
  }

  if (s > 0.3) {
    ctx.save()
    ctx.lineWidth = Math.max(0.55, lw * 0.66)
    ctx.globalAlpha = 0.72 * s
    drawArtTailStabilizers(ctx, m, opts.fill, s)
    ctx.restore()
  }

  if (s > 0.4) {
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = opts.stroke
    ctx.lineWidth = Math.max(0.55, lw * 0.5)
    ctx.globalAlpha = 0.68 * s
    drawArtTipAntenna(ctx, m)
    ctx.restore()
  }

  ctx.restore()
}

/** 主翼パネル: art 専用の多角形翼。三角翼とは別の面構成にする。 */
function drawArtPrimaryWingPanels(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill?: string,
): void {
  for (const sx of [-1, 1] as const) {
    const rootX = sx * m.bodyW * 0.12
    const rootY = m.baseY * 0.74
    const outerX = sx * (m.bodyW * 0.5 + m.wingGap + m.wingW * 0.9)
    const outerY = m.baseY * 0.72
    const shoulderX = sx * (m.bodyW * 0.5 + m.wingGap + m.wingW * 0.24)
    const shoulderY = m.baseY - m.wingH * 0.86
    const innerX = sx * m.bodyW * 0.2
    const innerY = -m.bodyH * 0.18

    ctx.beginPath()
    ctx.moveTo(rootX, rootY)
    ctx.lineTo(outerX, outerY)
    ctx.lineTo(shoulderX, shoulderY)
    ctx.lineTo(innerX, innerY)
    ctx.closePath()
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    ctx.stroke()
  }
}

/** 副翼パネル: 主翼の内側に置く薄い面。 */
function drawArtSecondaryWingPanels(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill: string | undefined,
  strength: number,
): void {
  for (const sx of [-1, 1] as const) {
    const rootX = sx * m.bodyW * 0.14
    const rootY = m.baseY * 0.42
    const outerX = sx * (m.bodyW / 2 + m.wingGap + m.wingW * 0.58)
    const outerY = m.baseY * 0.12
    const innerX = sx * m.bodyW * 0.28
    const innerY = -m.bodyH * 0.22
    ctx.beginPath()
    ctx.moveTo(rootX, rootY)
    ctx.lineTo(outerX, outerY)
    ctx.lineTo(innerX, innerY)
    ctx.closePath()
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      // 副翼は薄めに重ねる。strength が低いときはさらに抑える。
      ctx.globalAlpha = 0.55 + 0.25 * strength
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 0.55 + 0.35 * strength
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/** 中央スパイン: tip から後端まで通る細い菱形。 */
function drawArtSpine(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill?: string,
): void {
  const spineHalf = m.bodyW * 0.2
  const shoulderHalf = m.bodyW * 0.34
  const shoulderY = -m.bodyH * 0.06
  const waistY = m.baseY * 0.5
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-shoulderHalf, shoulderY)
  ctx.lineTo(-spineHalf, waistY)
  ctx.lineTo(0, m.bodyNotchY)
  ctx.lineTo(spineHalf, waistY)
  ctx.lineTo(shoulderHalf, shoulderY)
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  ctx.stroke()
}

/** 内部導線: 副翼とスパインをつなぐ細い線。 */
function drawArtInternalRails(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  timeMs: number,
): void {
  const pulse = 0.72 + Math.sin(timeMs * 0.0032) * 0.18
  ctx.globalAlpha *= pulse

  traceArtFacetDiamond(ctx, 0, -m.bodyH * 0.32, m.bodyW * 0.09, m.bodyH * 0.105)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(0, m.tipY + m.bodyH * 0.16)
  ctx.lineTo(0, m.bodyNotchY)
  ctx.moveTo(-m.bodyW * 0.08, -m.bodyH * 0.08)
  ctx.lineTo(-m.bodyW * 0.28, -m.bodyH * 0.24)
  ctx.moveTo(m.bodyW * 0.08, -m.bodyH * 0.08)
  ctx.lineTo(m.bodyW * 0.28, -m.bodyH * 0.24)
  ctx.moveTo(-m.bodyW * 0.14, m.baseY * 0.38)
  ctx.lineTo(-m.bodyW * 0.38, m.baseY * 0.1)
  ctx.moveTo(m.bodyW * 0.14, m.baseY * 0.38)
  ctx.lineTo(m.bodyW * 0.38, m.baseY * 0.1)
  ctx.stroke()
}

/** 後端スタビライザー: 機体の重心を後方に置く小さな面。 */
function drawArtTailStabilizers(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill: string | undefined,
  strength: number,
): void {
  for (const sx of [-1, 1] as const) {
    const x0 = sx * m.bodyW * 0.1
    const x1 = sx * m.bodyW * 0.27
    const tipX = sx * m.bodyW * 0.2
    const tipY = m.baseY + m.bodyH * 0.1
    ctx.beginPath()
    ctx.moveTo(x0, m.baseY)
    ctx.lineTo(x1, m.baseY)
    ctx.lineTo(tipX, tipY)
    ctx.closePath()
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      ctx.globalAlpha = 0.55 * strength
      ctx.fill()
      ctx.restore()
    }
    ctx.stroke()
  }
}

function drawArtTipAntenna(ctx: CanvasRenderingContext2D, m: HullMetrics): void {
  ctx.beginPath()
  ctx.moveTo(0, m.tipY - m.bodyH * 0.06)
  ctx.lineTo(0, m.tipY + m.bodyH * 0.1)
  ctx.moveTo(-m.bodyW * 0.09, m.tipY + m.bodyH * 0.02)
  ctx.lineTo(m.bodyW * 0.09, m.tipY + m.bodyH * 0.02)
  ctx.stroke()
}

/**
 * art: ファセットコア。
 * art 専用の菱形面を基準に、薄い外枠と回転する内部線を重ねる。
 */
function drawShipArtCore(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  core: NonNullable<ShipDrawParams["core"]>,
  timeMs: number,
): void {
  const pulse = clampVisualRatio(core.pulse ?? 1)
  const baseR = (core.radius ?? 2) * 1.45
  const cx = 0
  const cy = -m.bodyH * 0.12
  const spin = timeMs * 0.00055

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(spin)

  if (core.glowColor) {
    ctx.shadowColor = core.glowColor
    ctx.shadowBlur = (core.glowBlur ?? 10) * (0.6 + 0.4 * pulse)
  } else {
    ctx.shadowBlur = 0
  }

  ctx.fillStyle = core.color
  ctx.globalAlpha = (0.7 + 0.3 * pulse) * 0.95

  traceArtFacetDiamond(ctx, 0, 0, baseR * 0.72, baseR * 1.05)
  ctx.fill()

  ctx.globalAlpha = (0.35 + 0.18 * pulse) * 0.95
  ctx.shadowBlur = 0
  traceArtFacetDiamond(ctx, 0, 0, baseR * 1.36, baseR * 1.78)
  ctx.stroke()

  ctx.rotate(-spin * 1.8)
  ctx.globalAlpha = (0.42 + 0.22 * pulse) * 0.95
  traceArtFacetDiamond(ctx, 0, 0, baseR * 0.42, baseR * 1.52)
  ctx.stroke()

  ctx.globalAlpha = (0.86 + 0.14 * pulse) * 0.95
  ctx.beginPath()
  ctx.arc(0, 0, baseR * 0.26, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function traceArtFacetDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - halfHeight)
  ctx.lineTo(cx + halfWidth, cy)
  ctx.lineTo(cx, cy + halfHeight)
  ctx.lineTo(cx - halfWidth, cy)
  ctx.closePath()
}

/* ============================================================
   共通: 排気プルーム (ステータスパネル用)
   ============================================================ */
function drawShipExhaust(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  exhaust: NonNullable<ShipDrawParams["engineExhaust"]>,
  timeMs: number,
): void {
  ctx.save()
  ctx.fillStyle = exhaust.color
  ctx.shadowBlur = exhaust.blur ?? 10
  ctx.shadowColor = exhaust.color
  const jitter = exhaust.jitter ?? 3
  ctx.beginPath()
  ctx.moveTo(-m.bodyW * 0.18, m.baseY)
  ctx.lineTo(0, m.baseY + 8 + jitter * Math.sin(timeMs * 0.005))
  ctx.lineTo(m.bodyW * 0.18, m.baseY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function clampVisualRatio(v: number): number {
  if (!Number.isFinite(v)) return 1
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

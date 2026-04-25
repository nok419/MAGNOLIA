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
 *   - solid / art は描画上「別機体に見える」ことを意図した構成になっている。
 *     solid は 3 ピース (本体 + 両翼 + コア点)、art は多段花弁翼 + 槍状スパイン
 *     + 尾翼フィンレット + ヘキサグラムコアで構成される。
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
   * 低い値のとき内側の花弁や細部が省略され、外側シルエットだけが残る。省略時 1。
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
  const reveal = clamp01(params.reveal ?? 1)
  const revealFill = clamp01(params.revealFill ?? reveal)
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
      strength: clamp01(params.artDetailStrength ?? 1),
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
   初期からある 3 ピース機体。視認性を最優先する設計。
   ============================================================ */

/** solid: 両翼 + 本体の 3 ピースシルエット。 */
function drawShipSolidHull(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  opts: { fill?: string; reveal: number; revealFill: number },
): void {
  const r = opts.reveal

  // ── 左翼 ──
  ctx.beginPath()
  ctx.moveTo(-m.bodyW / 2 - m.wingGap, m.baseY)
  ctx.lineTo((-m.bodyW / 2 - m.wingGap - m.wingW) * r, m.baseY * r)
  ctx.lineTo((-m.bodyW / 2 - m.wingGap - m.wingW * 0.3) * r, (m.baseY - m.wingH) * r)
  ctx.closePath()
  if (opts.fill) {
    ctx.fillStyle = opts.fill
    ctx.fill()
  }
  ctx.stroke()

  // ── 右翼 ──
  ctx.beginPath()
  ctx.moveTo(m.bodyW / 2 + m.wingGap, m.baseY)
  ctx.lineTo((m.bodyW / 2 + m.wingGap + m.wingW) * r, m.baseY * r)
  ctx.lineTo((m.bodyW / 2 + m.wingGap + m.wingW * 0.3) * r, (m.baseY - m.wingH) * r)
  ctx.closePath()
  if (opts.fill) {
    ctx.fillStyle = opts.fill
    ctx.fill()
  }
  ctx.stroke()

  // ── 本体 (頂点 + 両底角 + 中央ノッチ) ──
  // 塗りだけは revealFill を使い、輪郭より少し遅れて埋める演出に対応する。
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-m.bodyW / 2 * r, m.baseY * r)
  ctx.lineTo(0, m.bodyNotchY * r)
  ctx.lineTo(m.bodyW / 2 * r, m.baseY * r)
  ctx.closePath()
  ctx.stroke()

  if (opts.fill && opts.revealFill > 0.001) {
    const rf = opts.revealFill
    ctx.save()
    ctx.fillStyle = opts.fill
    ctx.beginPath()
    ctx.moveTo(0, m.tipY)
    ctx.lineTo(-m.bodyW / 2 * rf, m.baseY * rf)
    ctx.lineTo(0, m.bodyNotchY * rf)
    ctx.lineTo(m.bodyW / 2 * rf, m.baseY * rf)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

/** solid: 中心コアの丸い発光点。 */
function drawShipSolidCore(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  core: NonNullable<ShipDrawParams["core"]>,
): void {
  const pulse = clamp01(core.pulse ?? 1)
  const radius = core.radius ?? 2
  ctx.save()
  if (core.glowColor) {
    ctx.shadowColor = core.glowColor
    ctx.shadowBlur = (core.glowBlur ?? 10) * (0.6 + 0.4 * pulse)
  } else {
    ctx.shadowBlur = 0
  }
  ctx.fillStyle = core.color
  ctx.globalAlpha = 0.7 + 0.3 * pulse
  ctx.beginPath()
  ctx.arc(0, -m.bodyH * 0.1, radius, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/* ============================================================
   ART VARIANT — "blooming magnolia frame"
   solid とは構成が根本から異なる。3 段の花弁状翼 + 槍状スパイン
   + 尾翼フィンレット + ヘキサグラムコアで構成される。
   silhouette の外縁 (外花弁の最外頂点) は solid と一致するため、
   当たり判定ボックスは共有できる。
   ============================================================ */

/** art: 機体本体 (翼 3 段 + スパイン + 尾翼 + アペックスマーカー)。 */
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

  // ── 外花弁 (pair) ──
  //   silhouette の外縁を担う。solid の翼頂点と同じ外側端を持ち、
  //   根本は本体寄りに配置することで「磁極から展開する花弁」の印象にする。
  drawArtPetalOuter(ctx, m, opts.fill)

  // ── 中花弁 (pair) ──
  //   外花弁より一段内側、かつ角度をずらして重ねる。花の二重花弁感を作る。
  drawArtPetalMiddle(ctx, m, opts.fill, s)

  // ── 内花弁 (pair) ──
  //   アクセント。strength が低い (戦闘時) ときは省略し、可読性を保つ。
  if (s > 0.4) {
    ctx.save()
    ctx.lineWidth = Math.max(0.6, lw * 0.6)
    ctx.globalAlpha = 0.75 * s
    drawArtPetalInner(ctx, m)
    ctx.restore()
  }

  // ── 槍状スパイン ──
  //   solid の本体三角より 1/3 ほど細身のスレンダー菱形。
  //   通信ユニットらしい「送信針」の印象を狙う。
  drawArtSpine(ctx, m, opts.fill)

  // ── スパイン内ジュエル (上部に小菱形) ──
  if (s > 0.3) {
    ctx.save()
    ctx.lineWidth = Math.max(0.5, lw * 0.5)
    ctx.globalAlpha = 0.65 * s
    drawArtSpineJewel(ctx, m)
    ctx.restore()
  }

  // ── 尾翼フィンレット (pair, 底部の逆三角) ──
  //   crown 状に下方に広がる。solid にはない「下方アクセント」で
  //   重心感を付ける。
  if (s > 0.3) {
    ctx.save()
    ctx.lineWidth = Math.max(0.6, lw * 0.75)
    ctx.globalAlpha = 0.8 * s
    drawArtTailFinlets(ctx, m, opts.fill, s)
    ctx.restore()
  }

  // ── アペックスマーカー (頂点の小三角) ──
  //   頂点を「点」として視覚的に締める。strength が高いときのみ。
  if (s > 0.4) {
    ctx.save()
    ctx.shadowBlur = 0
    ctx.fillStyle = opts.stroke
    ctx.globalAlpha = 0.9 * s
    const aSize = Math.max(1.2, m.bodyW * 0.095)
    ctx.beginPath()
    ctx.moveTo(0, m.tipY - aSize * 0.45)
    ctx.lineTo(-aSize * 0.42, m.tipY + aSize * 0.48)
    ctx.lineTo(aSize * 0.42, m.tipY + aSize * 0.48)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

/** 外花弁ペア: silhouette の外縁を定義する。 */
function drawArtPetalOuter(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill?: string,
): void {
  for (const sx of [-1, 1] as const) {
    const rootX = sx * m.bodyW * 0.18
    const rootY = m.baseY * 0.78
    const outerX = sx * (m.bodyW / 2 + m.wingGap + m.wingW)
    const outerY = m.baseY
    const upperX = sx * (m.bodyW / 2 + m.wingGap + m.wingW * 0.3)
    const upperY = m.baseY - m.wingH
    ctx.beginPath()
    ctx.moveTo(rootX, rootY)
    ctx.lineTo(outerX, outerY)
    ctx.lineTo(upperX, upperY)
    ctx.closePath()
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    ctx.stroke()
  }
}

/** 中花弁ペア: 外花弁内側、角度をずらして重ねる二重花弁。 */
function drawArtPetalMiddle(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill: string | undefined,
  strength: number,
): void {
  for (const sx of [-1, 1] as const) {
    const rootX = sx * m.bodyW * 0.11
    const rootY = m.baseY * 0.48
    const outerX = sx * (m.bodyW / 2 + m.wingGap + m.wingW * 0.56)
    const outerY = m.baseY * 0.2
    const innerX = sx * m.bodyW * 0.3
    const innerY = -m.bodyH * 0.16
    ctx.beginPath()
    ctx.moveTo(rootX, rootY)
    ctx.lineTo(outerX, outerY)
    ctx.lineTo(innerX, innerY)
    ctx.closePath()
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      // 中花弁は薄めに重ねる。strength が低いときはさらに抑える。
      ctx.globalAlpha = 0.55 + 0.25 * strength
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 0.55 + 0.35 * strength
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/** 内花弁ペア: アクセント用の細身三角。outline のみ。 */
function drawArtPetalInner(ctx: CanvasRenderingContext2D, m: HullMetrics): void {
  for (const sx of [-1, 1] as const) {
    const rootX = sx * m.bodyW * 0.06
    const rootY = m.baseY * 0.22
    const innerX = sx * m.bodyW * 0.22
    const innerY = -m.bodyH * 0.3
    const closeX = sx * m.bodyW * 0.04
    const closeY = -m.bodyH * 0.05
    ctx.beginPath()
    ctx.moveTo(rootX, rootY)
    ctx.lineTo(innerX, innerY)
    ctx.lineTo(closeX, closeY)
    ctx.closePath()
    ctx.stroke()
  }
}

/** 槍状スパイン: tip → 腰 → notch のスレンダー菱形。 */
function drawArtSpine(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill?: string,
): void {
  const spineHalf = m.bodyW * 0.17
  const waistY = m.baseY * 0.35
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-spineHalf, waistY)
  ctx.lineTo(0, m.bodyNotchY)
  ctx.lineTo(spineHalf, waistY)
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  ctx.stroke()
}

/** スパイン上部の小菱形ジュエル。 */
function drawArtSpineJewel(ctx: CanvasRenderingContext2D, m: HullMetrics): void {
  const jewelTop = -m.bodyH * 0.42
  const jewelBot = -m.bodyH * 0.2
  const jewelMidY = (jewelTop + jewelBot) / 2
  const jewelHalfW = m.bodyW * 0.09
  ctx.beginPath()
  ctx.moveTo(0, jewelTop)
  ctx.lineTo(-jewelHalfW, jewelMidY)
  ctx.lineTo(0, jewelBot)
  ctx.lineTo(jewelHalfW, jewelMidY)
  ctx.closePath()
  ctx.stroke()
}

/** 尾翼フィンレット (pair): 底部の逆三角対。 */
function drawArtTailFinlets(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  fill: string | undefined,
  strength: number,
): void {
  for (const sx of [-1, 1] as const) {
    const x0 = sx * m.bodyW * 0.13
    const x1 = sx * m.bodyW * 0.3
    const tipX = sx * m.bodyW * 0.22
    const tipY = m.baseY + m.bodyH * 0.14
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

/**
 * art: ヘキサグラムコア。
 * 2 枚の正三角形 (上向き + 下向き) を重ねた 6 芒星を、ゆっくり回転させる。
 * solid の単純な丸ドットに対し、花の開き / 結晶の成長を想起させる。
 */
function drawShipArtCore(
  ctx: CanvasRenderingContext2D,
  m: HullMetrics,
  core: NonNullable<ShipDrawParams["core"]>,
  timeMs: number,
): void {
  const pulse = clamp01(core.pulse ?? 1)
  // 結晶っぽさを出すためベースを solid より少し大きめに。
  const baseR = (core.radius ?? 2) * 1.35
  const cx = 0
  const cy = -m.bodyH * 0.1
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

  // 上向き三角
  traceEquilateral(ctx, baseR, 0)
  ctx.fill()

  // 下向き三角 (逆位相)
  traceEquilateral(ctx, baseR, Math.PI)
  ctx.fill()

  // 中央の小さな輝点 (コアの奥行き演出)
  ctx.globalAlpha = (0.9 + 0.1 * pulse) * 0.95
  ctx.beginPath()
  ctx.arc(0, 0, baseR * 0.26, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/**
 * 原点中心の正三角形パスを作成する (ctx.closePath 済み)。
 * rotation=0 で 上頂点が上。
 */
function traceEquilateral(
  ctx: CanvasRenderingContext2D,
  radius: number,
  rotation: number,
): void {
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const angle = rotation + (i / 3) * TAU - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
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

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}


import type { CollectibleMarkerKind } from "@/app/canvas-markers"

type NavCueKind = "equipment" | "item" | "mission" | "warp"

export type NavCueTarget = {
  kind: NavCueKind
  point: { x: number; y: number }
}

export function resolveCollectibleNavKind(
  markerKind: CollectibleMarkerKind | undefined,
): NavCueKind {
  // 装備系は青、それ以外 (resource / investigation / selfRepairPoints) は白。
  if (markerKind === "equipment" || markerKind === "hiddenEquipment") {
    return "equipment"
  }
  return "item"
}

const NAV_CUE_COLORS: Record<NavCueKind, { rgb: string }> = {
  equipment: { rgb: "158, 212, 255" }, // 柔らかい青
  item:      { rgb: "220, 230, 245" }, // ほんのり青白い白
  mission:   { rgb: "255, 90, 110" }, // scan後のミッション方向と同じ赤
  warp:      { rgb: "240, 198, 116" }, // タン寄りの橙
}

export function drawNavCueLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    playerPoint: { x: number; y: number }
    visionPx: number
    targets: NavCueTarget[]
    timeMs: number
  },
) {
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // C: pinpoint を先に敷く (rim arc の方が上、目立たせる優先順)。
  for (const t of input.targets) {
    drawNavCuePinpoint(ctx, t, input.timeMs)
  }

  // A: rim arc。探索円周上にターゲット方向を示す短い弧を各ターゲットぶん。
  for (const t of input.targets) {
    drawNavCueRimArc(ctx, input.playerPoint, input.visionPx, t, input.timeMs)
  }

  ctx.restore()
}

/** C: 種別色の「星」ピンポイント。探索範囲外のターゲット位置に描画。
 *
 *  宇宙の星を想起させる控えめな美術効果 (十字スパイクは使わず、光の階調で表現):
 *    - Layer 1: 遠いぼかし外周 (= シャドウ層)。広く・淡く・ほぼ動かない。
 *    - Layer 2: 中間ハロー。twinkle で明滅。
 *    - Layer 3: 中央コア + shadowBlur の柔らかな芯光。
 *    - Layer 4: 2〜3 粒の微小パーティクル (地味)。周回ではなくごく弱い線的ドリフトで、
 *      時間と共に alpha が膨らむ / 消える。出現位置は星ごとの seed で分散。
 *  alpha 上限は全層で 0.35 以下に抑え、画面に並んでも喧しくない強度とする。 */
function drawNavCuePinpoint(
  ctx: CanvasRenderingContext2D,
  target: NavCueTarget,
  timeMs: number,
) {
  const color = NAV_CUE_COLORS[target.kind]

  // 座標由来の決定的な seed (0..1)。個体差 (スケール / パーティクル位置) 用。
  const seedRaw = Math.sin(target.point.x * 12.9898 + target.point.y * 78.233) * 43758.5453
  const seed = seedRaw - Math.floor(seedRaw)
  const seed2Raw = seed * 7.13
  const seed2 = seed2Raw - Math.floor(seed2Raw)
  const scale = 0.85 + seed * 0.4

  // 複合 twinkle: 3 系統の正弦を合成。低速 2 + 高速 1 で単純な呼吸を避ける。
  const phaseA = target.point.x * 0.013 + target.point.y * 0.011
  const phaseB = target.point.x * 0.019 - target.point.y * 0.007
  const phaseC = target.point.x * 0.031 + target.point.y * 0.029
  const t = timeMs * 0.001
  const slow = 0.55 * Math.sin(t * 1.4 + phaseA) + 0.45 * Math.sin(t * 0.83 + phaseB)
  const fast = 0.25 * Math.sin(t * 3.7 + phaseC)
  const wave = slow * 0.85 + fast * 0.15
  const twinkle01 = Math.max(0, Math.min(1, 0.5 + 0.5 * wave))
  const brightness = 0.55 + 0.45 * Math.pow(twinkle01, 1.4)

  ctx.save()

  // Layer 1: 遠いぼかし外周 (シャドウ)。広く淡く、twinkle にはほぼ反応させない。
  const shadowR = 16 * scale
  const shadow = ctx.createRadialGradient(
    target.point.x, target.point.y, 0,
    target.point.x, target.point.y, shadowR,
  )
  shadow.addColorStop(0, `rgba(${color.rgb}, ${(0.09 * (0.85 + 0.15 * twinkle01)).toFixed(3)})`)
  shadow.addColorStop(0.55, `rgba(${color.rgb}, 0.03)`)
  shadow.addColorStop(1, `rgba(${color.rgb}, 0)`)
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, shadowR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 2: 中間ハロー。twinkle に連動して明滅。
  const haloR = 7 * scale
  const halo = ctx.createRadialGradient(
    target.point.x, target.point.y, 0,
    target.point.x, target.point.y, haloR,
  )
  halo.addColorStop(0, `rgba(${color.rgb}, ${(0.3 * brightness).toFixed(3)})`)
  halo.addColorStop(0.45, `rgba(${color.rgb}, ${(0.1 * brightness).toFixed(3)})`)
  halo.addColorStop(1, `rgba(${color.rgb}, 0)`)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, haloR, 0, Math.PI * 2)
  ctx.fill()

  // Layer 3: 中央コア。shadowBlur でふわっとした芯光。
  ctx.shadowColor = `rgba(${color.rgb}, 0.55)`
  ctx.shadowBlur = 6
  ctx.fillStyle = `rgba(${color.rgb}, ${(0.65 + 0.25 * twinkle01).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(target.point.x, target.point.y, (1.4 + 0.35 * twinkle01) * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Layer 4: 地味なパーティクル。3 粒、それぞれ独立した位相で浮かび上がっては消える。
  // 周回せず、星から少し離れた位置にごく弱い光点として明滅させる。
  drawNavCueParticles(ctx, target.point, color.rgb, scale, seed, seed2, t)

  ctx.restore()
}

/** 星の周囲に浮かぶ地味な粒子。各粒子は独自位相で ease-in/out の明滅を繰り返す。 */
function drawNavCueParticles(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  colorRgb: string,
  scale: number,
  seed: number,
  seed2: number,
  t: number,
) {
  const count = 3
  for (let i = 0; i < count; i++) {
    // 粒子ごとの固有 seed (座標と index から決定)。
    const ps = ((seed * 13.37 + i * 2.71 + seed2 * 5.19) % 1 + 1) % 1
    const pa = ((seed2 * 19.73 + i * 3.14 + seed * 1.41) % 1 + 1) % 1
    // 周回ではなく、毎サイクルほぼ同じ位置に浮かび上がる (drift を最小限に)。
    const angle = ps * Math.PI * 2 + Math.sin(t * 0.2 + pa * 6) * 0.25
    const distance = (5 + ps * 4) * scale
    const px = center.x + Math.cos(angle) * distance
    const py = center.y + Math.sin(angle) * distance

    // 1 周期 ≈ 3.8 〜 5.2 秒で ease-in/out。粒子ごとに位相をずらして同期させない。
    const period = 3.8 + pa * 1.4
    const phase = (t / period + ps) % 1
    // phase 0 → 0.5 でふわっと上がり 0.5 → 1 で消える 0..1 のベル型。
    const envelope = phase < 0.5
      ? 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)
      : 0.5 + 0.5 * Math.cos((phase - 0.5) * 2 * Math.PI)
    const alpha = 0.18 * envelope

    if (alpha < 0.01) continue

    ctx.fillStyle = `rgba(${colorRgb}, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, (0.6 + 0.3 * envelope) * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A: 探索円周上に、ターゲット方向を示す短い色付きリム弧。 */
function drawNavCueRimArc(
  ctx: CanvasRenderingContext2D,
  playerPoint: { x: number; y: number },
  visionPx: number,
  target: NavCueTarget,
  timeMs: number,
) {
  const color = NAV_CUE_COLORS[target.kind]
  const dx = target.point.x - playerPoint.x
  const dy = target.point.y - playerPoint.y
  const angle = Math.atan2(dy, dx)
  // 弧は距離非依存。短く、方向のみ。
  const arcSpan = 0.09 // rad (≈5.15°)
  const rimRadius = visionPx * 1.0

  // 個別 phase で非同期パルス
  const phase = target.point.x * 0.02 - target.point.y * 0.015
  const breathe = 0.65 + 0.35 * Math.sin(timeMs * 0.0022 + phase)

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = `rgba(${color.rgb}, 0.45)`
  ctx.shadowBlur = 6

  // 幅広の光層 (低 alpha で柔らかい光)
  ctx.strokeStyle = `rgba(${color.rgb}, ${(0.18 * breathe).toFixed(3)})`
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.arc(playerPoint.x, playerPoint.y, rimRadius, angle - arcSpan, angle + arcSpan)
  ctx.stroke()

  // 芯線 (明るめ、細い)
  ctx.strokeStyle = `rgba(${color.rgb}, ${(0.5 * breathe).toFixed(3)})`
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.arc(playerPoint.x, playerPoint.y, rimRadius, angle - arcSpan * 0.78, angle + arcSpan * 0.78)
  ctx.stroke()

  ctx.restore()
}

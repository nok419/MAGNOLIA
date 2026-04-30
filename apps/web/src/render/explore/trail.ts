import type { Rect } from "@magnolia/game-session"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import { TAU, lerpScalar, seededUnit } from "@/render/shared/render-math"

export type ExploreTrailState = ReturnType<typeof createExploreTrailState>

/* ============================================================
   TRAIL PATH — 白い光の流体軌跡
   ワールド座標で記録し、描画時にキャンバス座標へ変換する。
   カメラ追従でプレイヤーが画面中央に固定されても正しく伸びる。
   ============================================================ */
type TrailNode = { wx: number; wy: number; time: number }
// 伸びやかさ優先で最大寿命を延長。停止時の消散も長めにとって「儚く消える」印象に。
const TRAIL_MAX_MS = 4200
const TRAIL_DISSOLVE_MS = 800
const TRAIL_SAMPLE_WORLD_STEP = 1.6
const TRAIL_MAX_SAMPLES_PER_FRAME = 4
const TRAIL_MAX_NODE_COUNT = 420
const TRAIL_RESET_DISTANCE = 48
const TRAIL_SMOOTHING = 0.42
const TRAIL_ROUNDING_RATIO = 0.32
const TRAIL_ROUNDING_PASSES = 2

// 霧散パーティクル — 帯から接線垂直方向にドリフトする微光
type LightMote = {
  wx: number; wy: number
  vx: number; vy: number
  born: number; life: number
  r: number; phase: number
}
const MAX_MOTES = 28

export function createExploreTrailState() {
  return {
    prevPlayerX: 0,
    prevPlayerY: 0,
    initialized: false,
    smoothTrailX: 0,
    smoothTrailY: 0,
    lastMoteEmissionMs: 0,
    stoppedAt: 0,
    nodes: [] as TrailNode[],
    lightMotes: [] as LightMote[],
  }
}

export function updateTrail(
  state: ExploreTrailState,
  wx: number,
  wy: number,
  now: number,
  lowFrameRateMode = false,
) {
  if (!state.initialized) {
    // 初回描画では前フレームとの差分が存在しないため、過去の原点から線を引かない。
    resetTrailState(state, wx, wy)
    return
  }

  const dx = wx - state.prevPlayerX
  const dy = wy - state.prevPlayerY
  const speed = Math.hypot(dx, dy)
  const isMoving = speed > 0.01

  if (speed > TRAIL_RESET_DISTANCE) {
    // ワープやタブ復帰直後の大きな座標差では、遠距離を結ぶ長い軌跡を作らない。
    resetTrailState(state, wx, wy)
    return
  }

  if (isMoving) {
    state.stoppedAt = 0

    // フレーム間の移動量が大きいと点列が折れるため、区間上を一定間隔で補間して記録する。
    // ただし描画は node 数に比例して重くなるため、補間数は上限を持たせる。
    const sampleCount = Math.min(
      lowFrameRateMode ? 2 : TRAIL_MAX_SAMPLES_PER_FRAME,
      Math.max(1, Math.ceil(speed / TRAIL_SAMPLE_WORLD_STEP)),
    )
    for (let step = 1; step <= sampleCount; step += 1) {
      const amount = step / sampleCount
      const targetX = lerpScalar(state.prevPlayerX, wx, amount)
      const targetY = lerpScalar(state.prevPlayerY, wy, amount)
      state.smoothTrailX = lerpScalar(state.smoothTrailX, targetX, TRAIL_SMOOTHING)
      state.smoothTrailY = lerpScalar(state.smoothTrailY, targetY, TRAIL_SMOOTHING)
      const sampleTime = now - (sampleCount - step) * 16
      pushTrailNode(state, state.smoothTrailX, state.smoothTrailY, sampleTime)
    }

    emitTrailMote(state, now, lowFrameRateMode)
  } else if (state.stoppedAt === 0 && state.nodes.length > 0) {
    state.stoppedAt = now
  }

  // ── 古い node 除去 (shift() のループを避け splice 1 回に) ──
  const cutoff = state.stoppedAt > 0
    ? state.stoppedAt - TRAIL_DISSOLVE_MS
    : now - TRAIL_MAX_MS
  let dropCount = 0
  while (dropCount < state.nodes.length && state.nodes[dropCount].time < cutoff) {
    dropCount++
  }
  if (dropCount > 0) state.nodes.splice(0, dropCount)
  if (state.stoppedAt > 0 && now - state.stoppedAt > TRAIL_DISSOLVE_MS) {
    state.nodes.length = 0
  }
  trimTrailNodeBudget(state, lowFrameRateMode)
  state.prevPlayerX = wx
  state.prevPlayerY = wy
}

function pushTrailNode(state: ExploreTrailState, wx: number, wy: number, time: number) {
  const lastNode = state.nodes[state.nodes.length - 1]
  if (!lastNode || Math.hypot(wx - lastNode.wx, wy - lastNode.wy) > 0.18) {
    state.nodes.push({ wx, wy, time })
  }
}

function resetTrailState(state: ExploreTrailState, wx: number, wy: number) {
  state.initialized = true
  state.prevPlayerX = wx
  state.prevPlayerY = wy
  state.smoothTrailX = wx
  state.smoothTrailY = wy
  state.stoppedAt = 0
  state.nodes.length = 0
  state.lightMotes.length = 0
}

function trimTrailNodeBudget(state: ExploreTrailState, lowFrameRateMode: boolean) {
  const maxNodeCount = lowFrameRateMode ? 180 : TRAIL_MAX_NODE_COUNT
  if (state.nodes.length <= maxNodeCount) {
    return
  }

  // 継続移動時の描画上限を固定し、古い尾だけを落として先端側の滑らかさを残す。
  state.nodes.splice(0, state.nodes.length - maxNodeCount)
}

function emitTrailMote(state: ExploreTrailState, now: number, lowFrameRateMode: boolean) {
  const maxMotes = lowFrameRateMode ? 10 : MAX_MOTES
  const emitIntervalMs = lowFrameRateMode ? 120 : 54
  if (
    state.lightMotes.length >= maxMotes ||
    state.nodes.length <= 8 ||
    now - state.lastMoteEmissionMs < emitIntervalMs
  ) {
    return
  }

  state.lastMoteEmissionMs = now
  const seed = Math.floor(now * 0.024) + state.nodes.length * 17
  const pickRatio = 0.18 + seededUnit(seed + 11) * 0.46
  const pickIdx = Math.max(1, Math.min(state.nodes.length - 2, Math.floor(state.nodes.length * pickRatio)))
  const curNode = state.nodes[pickIdx]
  const prev = state.nodes[pickIdx - 1]
  const next = state.nodes[pickIdx + 1]
  const tx = next.wx - prev.wx
  const ty = next.wy - prev.wy
  const tlen = Math.hypot(tx, ty) || 1
  const ntx = tx / tlen
  const nty = ty / tlen
  // 接線から横へこぼれる粒だけを出し、進行方向と無関係な放射を避ける。
  const perpX = -nty
  const perpY = ntx
  const side = seededUnit(seed + 23) < 0.5 ? -1 : 1
  const driftSpeed = 0.004 + seededUnit(seed + 31) * 0.006
  const backBias = -0.24 - seededUnit(seed + 41) * 0.18
  state.lightMotes.push({
    wx: curNode.wx + perpX * side * (0.08 + seededUnit(seed + 53) * 0.18),
    wy: curNode.wy + perpY * side * (0.08 + seededUnit(seed + 61) * 0.18),
    vx: perpX * side * driftSpeed + ntx * driftSpeed * backBias,
    vy: perpY * side * driftSpeed + nty * driftSpeed * backBias,
    born: now,
    life: 420 + seededUnit(seed + 71) * 360,
    r: 0.34 + seededUnit(seed + 83) * 0.54,
    phase: seededUnit(seed + 97) * TAU,
  })
}

function trailOpacity(state: ExploreTrailState, nodeIndex: number, nodeCount: number, now: number): number {
  const ratio = nodeCount > 1 ? nodeIndex / (nodeCount - 1) : 1
  const positionFade = ratio * ratio
  if (state.stoppedAt > 0) {
    const d = Math.min(1, (now - state.stoppedAt) / TRAIL_DISSOLVE_MS)
    return positionFade * (1 - d * d)
  }
  return positionFade
}

// Catmull-Rom → Cubic Bezier 制御点変換 (キャンバス座標に変換済みの点で使用)
function catmullRomCP(
  p0x: number, p0y: number, p1x: number, p1y: number,
  p2x: number, p2y: number, p3x: number, p3y: number,
) {
  return {
    cp1x: p1x + (p2x - p0x) / 6,
    cp1y: p1y + (p2y - p0y) / 6,
    cp2x: p2x - (p3x - p1x) / 6,
    cp2y: p2y - (p3y - p1y) / 6,
  }
}

type RoundedTrailPoint = { x: number; y: number; nodeIndex: number }

function buildRoundedTrailPath(cx: number[], cy: number[], lowFrameRateMode: boolean): RoundedTrailPoint[] {
  let points = cx.map((x, index) => ({ x, y: cy[index], nodeIndex: index }))
  if (points.length < 3) {
    return points
  }

  const passCount = lowFrameRateMode ? 1 : points.length > 220 ? 1 : TRAIL_ROUNDING_PASSES
  for (let pass = 0; pass < passCount; pass += 1) {
    const nextPoints: RoundedTrailPoint[] = [points[0]]
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index]
      const next = points[index + 1]
      nextPoints.push(interpolateTrailPoint(current, next, TRAIL_ROUNDING_RATIO))
      nextPoints.push(interpolateTrailPoint(current, next, 1 - TRAIL_ROUNDING_RATIO))
    }
    nextPoints.push(points[points.length - 1])
    points = nextPoints
  }

  return points
}

function interpolateTrailPoint(
  from: RoundedTrailPoint,
  to: RoundedTrailPoint,
  amount: number,
): RoundedTrailPoint {
  return {
    x: lerpScalar(from.x, to.x, amount),
    y: lerpScalar(from.y, to.y, amount),
    nodeIndex: lerpScalar(from.nodeIndex, to.nodeIndex, amount),
  }
}

/**
 * 色グラデーション: 頭 (新しい端) は温かみのある白真珠、
 * 尾 (古い端) は冷たいシアン寄りのブルー。
 * ratio=0 → tail、ratio=1 → head。
 *
 * 3 つのレイヤ (外オーラ / 中間バンド / 中心芯線) ごとに色を持ち、
 * 同じ ratio でも芯線は白く、外層はやや青寄りに振って奥行きを出す。
 */
function trailColorAt(ratio: number): { outer: string; mid: string; spine: string } {
  const t = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  return {
    outer: `${lerp(120, 195)}, ${lerp(180, 218)}, ${lerp(235, 250)}`,
    mid:   `${lerp(170, 232)}, ${lerp(214, 245)}, 255`,
    spine: `${lerp(210, 252)}, ${lerp(235, 253)}, 255`,
  }
}

export function drawTrail(
  ctx: CanvasRenderingContext2D, state: ExploreTrailState, now: number,
  viewport: Rect, W: number, H: number, pad: number,
  lowFrameRateMode = false,
) {
  const N = state.nodes.length
  if (N < 2) {
    drawLightMotes(ctx, state, now, viewport, W, H, pad, lowFrameRateMode)
    return
  }

  // ワールド→キャンバス変換済みの配列を作る
  const cx: number[] = new Array(N)
  const cy: number[] = new Array(N)
  for (let i = 0; i < N; i++) {
    const p = toCanvasPoint(viewport, W, H, pad, state.nodes[i].wx, state.nodes[i].wy)
    cx[i] = p.x
    cy[i] = p.y
  }

  // ── 停止時の儚い横揺らぎ ──
  // 消散が始まっているとき、接線垂直方向に微小なサイン波オフセットを加える。
  // 帯が息を引き取る直前の揺らぎを演出する。振幅は消散進度で増える。
  const dissolveProg = state.stoppedAt > 0
    ? Math.min(1, (now - state.stoppedAt) / TRAIL_DISSOLVE_MS)
    : 0
  if (dissolveProg > 0 && N >= 3) {
    const ampBase = dissolveProg * 2.6
    for (let i = 1; i < N - 1; i++) {
      const tx = cx[i + 1] - cx[i - 1]
      const ty = cy[i + 1] - cy[i - 1]
      const tlen = Math.hypot(tx, ty) || 1
      const perpX = -ty / tlen
      const perpY = tx / tlen
      const amp = ampBase * Math.sin(now * 0.003 + i * 0.35)
      cx[i] += perpX * amp
      cy[i] += perpY * amp
    }
  }

  const pathPoints = buildRoundedTrailPath(cx, cy, lowFrameRateMode)
  const pathPointCount = pathPoints.length
  if (pathPointCount < 2) {
    drawLightMotes(ctx, state, now, viewport, W, H, pad, lowFrameRateMode)
    return
  }

  // 制御点 / fade / ratio / 色 を事前計算 (4 パスで使い回す)
  const segCP: Array<{ cp1x: number; cp1y: number; cp2x: number; cp2y: number }> =
    new Array(pathPointCount - 1)
  const segFade = new Float64Array(pathPointCount - 1)
  const segRatio = new Float64Array(pathPointCount - 1)
  const segColors: Array<{ outer: string; mid: string; spine: string }> = new Array(pathPointCount - 1)
  for (let i = 0; i < pathPointCount - 1; i++) {
    const point = pathPoints[i]
    const nextPoint = pathPoints[i + 1]
    segFade[i] = trailOpacity(state, point.nodeIndex, N, now)
    const ratio = N > 1 ? point.nodeIndex / (N - 1) : 1
    segRatio[i] = ratio
    segColors[i] = trailColorAt(ratio)
    const i0 = Math.max(0, i - 1)
    const i3 = Math.min(pathPointCount - 1, i + 2)
    const prev = pathPoints[i0]
    const afterNext = pathPoints[i3]
    segCP[i] = catmullRomCP(
      prev.x, prev.y, point.x, point.y,
      nextPoint.x, nextPoint.y, afterNext.x, afterNext.y,
    )
  }

  // ── ハートビートパルス ──
  // 2.5 秒周期で頭 → 尾へ移動する明滅点。印象深さの主役。
  const pulsePeriodMs = 2500
  const pulsePhase = (now % pulsePeriodMs) / pulsePeriodMs
  const pulsePos = 1 - pulsePhase // 1 = head, 0 = tail
  const pulseWidth = 0.12 // ratio 幅 (トレイル全長に対して)

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // 4 パス:
  //   0: 外側オーラ (幅広・低不透明)         → 帯の外縁の柔らかな光
  //   1: 中間バンド (中幅・中不透明)         → 帯の実体
  //   2: 中心芯線   (細幅・高不透明・白)     → 明瞭な芯
  //   3: ハートビート (狭帯域に強い明滅)     → 伝播する鼓動
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < pathPointCount - 1; i++) {
      const fade = segFade[i]
      if (fade < 0.005) continue
      const cp = segCP[i]
      const color = segColors[i]
      const point = pathPoints[i]
      const nextPoint = pathPoints[i + 1]

      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      ctx.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, nextPoint.x, nextPoint.y)

      if (pass === 0) {
        ctx.strokeStyle = `rgba(${color.outer}, ${(0.026 * fade).toFixed(3)})`
        ctx.lineWidth = 1.35 + 5.6 * fade
      } else if (pass === 1) {
        ctx.strokeStyle = `rgba(${color.mid}, ${(0.14 * fade).toFixed(3)})`
        ctx.lineWidth = 0.55 + 2.2 * fade
      } else if (pass === 2) {
        ctx.strokeStyle = `rgba(${color.spine}, ${(0.55 * fade).toFixed(3)})`
        ctx.lineWidth = 0.18 + 0.62 * fade
      } else {
        // pass 3: ハートビート — segment 中心の ratio が pulsePos に近いほど強く、
        // 2 乗で falloff させて狭く鋭いピークを作る。
        const ratio = segRatio[i]
        const dist = Math.abs(ratio - pulsePos)
        if (dist >= pulseWidth) continue
        const rel = 1 - dist / pulseWidth
        const intensity = rel * rel
        if (intensity < 0.02) continue
        ctx.strokeStyle = `rgba(255, 253, 246, ${(0.62 * fade * intensity).toFixed(3)})`
        ctx.lineWidth = 0.28 + 0.95 * fade * intensity
      }
      ctx.stroke()
    }
  }

  if (!lowFrameRateMode) {
    drawTrailOrnaments(ctx, pathPoints, segFade, now)
  }

  ctx.restore()
  drawLightMotes(ctx, state, now, viewport, W, H, pad, lowFrameRateMode)
}

function drawTrailOrnaments(
  ctx: CanvasRenderingContext2D,
  points: RoundedTrailPoint[],
  fadeBySegment: Float64Array,
  now: number,
) {
  if (points.length < 8) {
    return
  }

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = "rgba(140, 210, 255, 0.46)"
  ctx.shadowBlur = 7

  for (let i = 3; i < points.length - 4; i += 6) {
    const fade = fadeBySegment[i] ?? 0
    if (fade < 0.032) {
      continue
    }

    const prev = points[i - 2]
    const current = points[i]
    const next = points[i + 2]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const tangentX = tx / len
    const tangentY = ty / len
    const perpX = -tangentY
    const perpY = tangentX
    const cadence = Math.floor(i / 6)
    const side = cadence % 2 === 0 ? -1 : 1
    const pulse = 0.58 + 0.42 * Math.sin(now * 0.004 + i * 0.37)
    const alpha = 0.16 * fade * pulse
    const offset = 2.2 + 1.8 * fade
    const filamentLength = 6.2 + 6.8 * fade

    // 曲線の接線に沿って細い側枝を置き、太い帯に戻さず通信記録のような装飾を足します。
    ctx.strokeStyle = `rgba(214, 244, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = 0.28 + 0.18 * fade
    ctx.beginPath()
    ctx.moveTo(
      current.x + perpX * side * offset - tangentX * filamentLength * 0.35,
      current.y + perpY * side * offset - tangentY * filamentLength * 0.35,
    )
    ctx.quadraticCurveTo(
      current.x + perpX * side * (offset + 1.8),
      current.y + perpY * side * (offset + 1.8),
      current.x + perpX * side * (offset + 4.2) + tangentX * filamentLength * 0.65,
      current.y + perpY * side * (offset + 4.2) + tangentY * filamentLength * 0.65,
    )
    ctx.stroke()

    if (cadence % 3 === 0) {
      ctx.strokeStyle = `rgba(244, 252, 255, ${(0.2 * fade * pulse).toFixed(3)})`
      ctx.lineWidth = 0.3 + 0.14 * fade
      ctx.beginPath()
      ctx.moveTo(
        current.x - tangentX * 2.6,
        current.y - tangentY * 2.6,
      )
      ctx.lineTo(
        current.x + tangentX * 3.4,
        current.y + tangentY * 3.4,
      )
      ctx.stroke()
    }

    if (cadence % 4 === 1) {
      ctx.fillStyle = `rgba(235, 250, 255, ${(0.24 * fade).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(
        current.x + perpX * side * (offset + 4.7),
        current.y + perpY * side * (offset + 4.7),
        0.55 + fade * 0.44,
        0,
        TAU,
      )
      ctx.fill()
    }
  }

  ctx.restore()
}

function drawLightMotes(
  ctx: CanvasRenderingContext2D, state: ExploreTrailState, now: number,
  viewport: Rect, W: number, H: number, pad: number,
  lowFrameRateMode: boolean,
) {
  if (state.lightMotes.length === 0) return

  let dissolveMul = 1
  if (state.stoppedAt > 0) {
    const d = Math.min(1, (now - state.stoppedAt) / TRAIL_DISSOLVE_MS)
    dissolveMul = 1 - d * d
  }
  if (dissolveMul < 0.01) {
    state.lightMotes.length = 0
    return
  }

  ctx.save()
  for (let i = state.lightMotes.length - 1; i >= 0; i--) {
    const m = state.lightMotes[i]
    const age = now - m.born
    if (age > m.life) {
      state.lightMotes.splice(i, 1)
      continue
    }
    m.wx += m.vx
    m.wy += m.vy
    m.vx *= 0.98
    m.vy *= 0.98

    const t = 1 - age / m.life
    const fadeIn = Math.min(1, age / 60)
    const fadeOut = t * t * t  // cubic falloff → すっと消える
    const opacity = fadeIn * fadeOut * dissolveMul
    if (opacity < 0.01) continue
    if (lowFrameRateMode && i % 2 === 1) continue

    const shimmer = 0.7 + 0.3 * Math.sin(age * 0.012 + m.phase)
    const radius = m.r * (0.3 + 0.7 * fadeOut)

    const sp = toCanvasPoint(viewport, W, H, pad, m.wx, m.wy)

    // ぼんやりしたハロー (控えめ)
    ctx.globalAlpha = opacity * 0.12 * shimmer
    ctx.fillStyle = "#d0e4ff"
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, radius * 2, 0, TAU)
    ctx.fill()

    // 小さな白い芯
    ctx.globalAlpha = opacity * 0.55 * shimmer
    ctx.fillStyle = "#f0f6ff"
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, radius * 0.7, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}


function toCanvasPoint(bounds: Rect, W: number, H: number, pad: number, wx: number, wy: number) {
  return worldToCanvasPoint({
    bounds,
    size: { width: W, height: H },
    padding: pad,
    worldPosition: { x: wx, y: wy },
  })
}

import type { ShipVariant } from "@magnolia/contracts"
import { REBOOT_SETTLE_BLACKOUT_RATIO } from "@/app/explore-presentation"
import { computeHullMetrics } from "@/app/ship-renderer"
import { tokenRgba, visualToken } from "@/app/visual-tokens"
import { drawExplorePlayer } from "./player"
import { clampScalar, easeInOutSine, easeOutCubic, lerpScalar, seededUnit, TAU } from "./math"
import { drawRebootConstruction } from "./reboot-construction"
import {
  REBOOT_CONSTRUCT_DURATION,
  REBOOT_CONSTRUCT_START,
  REBOOT_CORE_START,
  REBOOT_GATHER_DURATION,
  REBOOT_GATHER_START,
  REBOOT_IGNITION_DURATION,
  REBOOT_IGNITION_START,
  REBOOT_REVEAL_START,
} from "./timeline"

/**
 * リブート演出のタイムライン:
 *   0.00 - 0.03  silent prep        (何もなかった空間)
 *   0.03 - 0.16  core seed          中央に起動核だけが発生する
 *   0.08 - 0.36  gather phase       周辺から粒子とリングが収束する
 *   0.18 - 0.76  construct phase    機体の線、面、コアが段階的に復元される
 *   0.76 - 0.86  ignition pulse     機体が点火して安定化する
 *   0.86 - 0.88  final hold         完成した機体を暗い画面内で見せる
 *   0.88 - 1.00  reveal phase       通常探索への受け渡し直前に視界を開く
 *
 * フェーズ境界で短い "phase transition pulse" を挿入することで、
 * 「システムが段階的に立ち上がる」テンポを明示する。
 */
export function drawRebootSequence(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    playerPoint: { x: number; y: number }
    playerAngle: number
    visionPx: number
    timeMs: number
    progress: number
    shipVariant: ShipVariant
  },
) {
  const gatherProgress = clampScalar(
    (input.progress - REBOOT_GATHER_START) / REBOOT_GATHER_DURATION,
    0,
    1,
  )
  const constructProgress = clampScalar(
    (input.progress - REBOOT_CONSTRUCT_START) / REBOOT_CONSTRUCT_DURATION,
    0,
    1,
  )
  const ignitionProgress = clampScalar(
    (input.progress - REBOOT_IGNITION_START) / REBOOT_IGNITION_DURATION,
    0,
    1,
  )
  const revealProgress = clampScalar(
    (input.progress - REBOOT_REVEAL_START) / Math.max(0.001, 1 - REBOOT_REVEAL_START),
    0,
    1,
  )
  const coreProgress = clampScalar((input.progress - REBOOT_CORE_START) / 0.13, 0, 1)

  // 背景のアンビエント深化: reboot 中は画面全体にごく淡い青のラジアルグロー
  drawRebootAmbient(ctx, input.width, input.height, input.playerPoint, input.progress)
  drawRebootCoreSeed(ctx, input.playerPoint, input.timeMs, coreProgress)

  // フェーズ境界のパルス。開始、構築、点火、探索受け渡しの節目を短く光らせます。
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_GATHER_START, 0.06, 34, 0.46)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_CONSTRUCT_START, 0.07, 66, 0.68)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_IGNITION_START, 0.08, 120, 0.74)
  drawRebootPhasePulse(ctx, input.playerPoint, input.progress, REBOOT_REVEAL_START, 0.08, 180, 0.46)

  if (gatherProgress > 0.001) {
    drawRebootAssemblyAperture(ctx, input.playerPoint, input.timeMs, gatherProgress, constructProgress)
    drawRebootField(ctx, input.playerPoint, input.timeMs, gatherProgress)
  }

  if (constructProgress > 0.001) {
    // サイズの「settle (着地)」: 演出用の K=2.6 から探索時の K=1.0 まで
    // ignition 開始 (0.84) → reveal 開始 (0.94) の 10% 窓で滑らかに縮めます。
    // reveal に入る瞬間には構築 wireframe が drawExplorePlayer (scale=0.7) と
    // 同サイズで重なっているため、その後の重ね合わせでサイズ段差なしに繋がります。
    const settleProgress = clampScalar(
      (input.progress - REBOOT_IGNITION_START) /
        Math.max(0.001, REBOOT_REVEAL_START - REBOOT_IGNITION_START),
      0,
      1,
    )
    const constructScale = lerpScalar(2.6, 1.0, easeInOutSine(settleProgress))

    // reveal に入ったら完全にフェードアウト (窓幅 0.06 = reveal 全域で ゼロまで)。
    // これがないと、wireframe と本体 ship が重なったまま残る。
    const constructFadeOut =
      input.progress < REBOOT_REVEAL_START
        ? 1
        : Math.max(0, 1 - (input.progress - REBOOT_REVEAL_START) / 0.06)
    if (constructFadeOut > 0.005) {
      ctx.save()
      ctx.globalAlpha = constructFadeOut
      drawRebootConstruction(ctx, {
        center: input.playerPoint,
        angle: input.playerAngle,
        timeMs: input.timeMs,
        progress: constructProgress,
        scale: constructScale,
        shipVariant: input.shipVariant,
      })
      ctx.restore()
    }
  }

  // ── 点火パルス: 構築完了から final hold / reveal への橋渡し ──
  //   中央から外へ広がる強いショックウェーブ。画面全体が一瞬明るくなる。
  if (ignitionProgress > 0.001) {
    drawRebootIgnition(ctx, input.playerPoint, ignitionProgress)
  }

  if (constructProgress > 0.001) {
    drawRebootFinalHold(ctx, {
      width: input.width,
      height: input.height,
      center: input.playerPoint,
      progress: input.progress,
    })
  }

  if (revealProgress > 0.001) {
    // 構築 wireframe は reveal 開始時点で既に K=1.0 (探索と同サイズ) に settle 済み。
    // ここから探索用の機体を重ねるだけで「機体がそのままの形で安定する」印象になります。
    ctx.save()
    ctx.globalAlpha = easeOutCubic(revealProgress)
    drawExplorePlayer(
      ctx,
      input.playerPoint.x,
      input.playerPoint.y,
      input.playerAngle,
      input.timeMs,
      input.shipVariant,
    )
    ctx.restore()

    drawRebootCompletionHalo(ctx, {
      width: input.width,
      height: input.height,
      center: input.playerPoint,
      angle: input.playerAngle,
      progress: revealProgress,
      timeMs: input.timeMs,
    })
  }
}

export function drawRebootBlackoutBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  center: { x: number; y: number },
) {
  ctx.save()
  ctx.fillStyle = visualToken.color.void
  ctx.fillRect(0, 0, width, height)

  const pulse = 0.04 + (0.5 + 0.5 * Math.sin(timeMs * 0.00042)) * 0.03
  const grad = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    Math.max(width, height) * 0.42,
  )
  grad.addColorStop(0, tokenRgba("line", pulse))
  grad.addColorStop(0.32, tokenRgba("deep", pulse * 0.46))
  grad.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

export function drawRebootSettleBridge(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  const early = 1 - easeOutCubic(clampScalar(progress / REBOOT_SETTLE_BLACKOUT_RATIO, 0, 1))
  const reveal = easeOutCubic(
    clampScalar(
      (progress - REBOOT_SETTLE_BLACKOUT_RATIO) /
        Math.max(0.001, 1 - REBOOT_SETTLE_BLACKOUT_RATIO),
      0,
      1,
    ),
  )
  const bridgeAlpha = clampScalar(early * 0.8 + (1 - reveal) * 0.22, 0, 1)
  if (bridgeAlpha <= 0.01) {
    return
  }

  ctx.save()
  ctx.globalAlpha = bridgeAlpha
  ctx.strokeStyle = tokenRgba("line", 0.38)
  ctx.lineWidth = 1.1
  ctx.shadowColor = tokenRgba("signal", 0.42)
  ctx.shadowBlur = 16
  const baseRadius = 22 + Math.sin(timeMs * 0.002) * 1.4
  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const radius = baseRadius + ringIndex * 16 + reveal * 52
    const start = timeMs * 0.0007 * (ringIndex % 2 === 0 ? 1 : -1) + ringIndex * 0.7
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start, start + TAU * (0.34 + ringIndex * 0.08))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start + Math.PI, start + Math.PI + TAU * 0.18)
    ctx.stroke()
  }

  ctx.shadowBlur = 0
  ctx.strokeStyle = tokenRgba("signalBright", 0.22 * bridgeAlpha)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(center.x - 44, center.y)
  ctx.lineTo(center.x - 18, center.y)
  ctx.moveTo(center.x + 18, center.y)
  ctx.lineTo(center.x + 44, center.y)
  ctx.moveTo(center.x, center.y - 44)
  ctx.lineTo(center.x, center.y - 18)
  ctx.moveTo(center.x, center.y + 18)
  ctx.lineTo(center.x, center.y + 44)
  ctx.stroke()

  const activationProgress = clampScalar((progress - 0.78) / 0.18, 0, 1)
  if (activationProgress > 0.001) {
    const wave = easeOutCubic(activationProgress)
    ctx.save()
    ctx.globalAlpha = (1 - wave) * 0.62
    ctx.strokeStyle = tokenRgba("signalBright", 0.58)
    ctx.lineWidth = 1.4
    ctx.shadowColor = tokenRgba("line", 0.62)
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(center.x, center.y, 28 + wave * 260, 0, TAU)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = Math.sin(Math.PI * activationProgress) * 0.45
    const shipGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 92)
    shipGlow.addColorStop(0, tokenRgba("signalBright", 0.32))
    shipGlow.addColorStop(0.35, tokenRgba("signal", 0.12))
    shipGlow.addColorStop(1, tokenRgba("signal", 0))
    ctx.fillStyle = shipGlow
    ctx.beginPath()
    ctx.arc(center.x, center.y, 92, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

export function drawRebootBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  center: { x: number; y: number },
  progress: number,
  opacity: number = 1,
) {
  const breathe = 0.5 + 0.5 * Math.sin(timeMs * 0.00024)
  const awake = easeOutCubic(clampScalar((progress - REBOOT_CORE_START) / 0.18, 0, 1))
  const radialAlpha = (0.1 + progress * 0.07 + breathe * 0.02) * awake
  if (opacity <= 0.001) {
    return
  }
  ctx.save()
  ctx.globalAlpha = opacity
  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, visualToken.color.abyss)
  base.addColorStop(0.58, visualToken.color.void)
  base.addColorStop(1, visualToken.color.void)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  const radial = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    Math.max(width, height) * 0.72,
  )
  radial.addColorStop(0, tokenRgba("signal", radialAlpha))
  radial.addColorStop(0.4, tokenRgba("deep", radialAlpha * 0.45))
  radial.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = tokenRgba("signal", (0.024 + progress * 0.018) * awake)
  ctx.lineWidth = 1
  const ringCount = 4
  for (let index = 0; index < ringCount; index += 1) {
    const ringProgress = (index + 1) / ringCount
    const radius = 90 + ringProgress * Math.max(width, height) * 0.22 + Math.sin(timeMs * 0.00035 + index) * 6
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

/** 全体を覆う淡い青のラジアルグロー。reboot 中の「空間の息遣い」を背景に足す。 */
function drawRebootAmbient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  overallProgress: number,
) {
  // construct 末期まで徐々に明るくなり、reveal 開始直前から退いていきます。
  const intensity = overallProgress < REBOOT_IGNITION_START
    ? overallProgress / REBOOT_IGNITION_START
    : 1 - (overallProgress - REBOOT_IGNITION_START) / Math.max(0.001, 1 - REBOOT_IGNITION_START)
  const alpha = 0.08 * clampScalar(intensity, 0, 1)
  if (alpha < 0.004) return

  ctx.save()
  const maxR = Math.max(width, height) * 0.8
  const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, maxR)
  grad.addColorStop(0, tokenRgba("line", alpha * 1.4))
  grad.addColorStop(0.35, tokenRgba("signal", alpha))
  grad.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawRebootCoreSeed(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  if (progress <= 0.001) {
    return
  }

  const eased = easeOutCubic(progress)
  const breath = 0.72 + Math.sin(timeMs * 0.006) * 0.18
  const coreRadius = lerpScalar(1.8, 8.5, eased)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  const halo = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 96)
  halo.addColorStop(0, tokenRgba("text", 0.28 * eased * breath))
  halo.addColorStop(0.34, tokenRgba("signal", 0.18 * eased))
  halo.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = halo
  ctx.fillRect(center.x - 100, center.y - 100, 200, 200)

  ctx.fillStyle = tokenRgba("text", 0.72 * eased)
  ctx.shadowColor = tokenRgba("line", 0.9)
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(center.x, center.y, coreRadius, 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 12
  ctx.strokeStyle = tokenRgba("line", 0.36 * eased)
  ctx.lineWidth = 1
  for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
    const radius = coreRadius + 14 + ringIndex * 13 + Math.sin(timeMs * 0.002 + ringIndex) * 1.2
    const start = timeMs * 0.0011 * (ringIndex % 2 === 0 ? 1 : -1)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start, start + TAU * (0.24 + ringIndex * 0.12))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, start + Math.PI, start + Math.PI + TAU * 0.16)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootAssemblyAperture(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  gatherProgress: number,
  constructProgress: number,
) {
  const gather = easeOutCubic(gatherProgress)
  const construct = easeOutCubic(constructProgress)
  const alpha = clampScalar(gather * (1 - construct * 0.38), 0, 1)
  if (alpha <= 0.01) {
    return
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = tokenRgba("line", 0.36)
  ctx.lineWidth = 1
  ctx.shadowColor = tokenRgba("signal", 0.42)
  ctx.shadowBlur = 12

  for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
    const radius = lerpScalar(172 - ringIndex * 12, 42 + ringIndex * 8, gather)
    const spin = timeMs * (0.00036 + ringIndex * 0.00008) * (ringIndex % 2 === 0 ? 1 : -1)
    const arcLength = TAU * (0.12 + ringIndex * 0.025)
    for (let segment = 0; segment < 3; segment += 1) {
      const start = spin + segment * (TAU / 3) + ringIndex * 0.28
      ctx.beginPath()
      ctx.arc(center.x, center.y, radius, start, start + arcLength)
      ctx.stroke()
    }
  }

  ctx.shadowBlur = 0
  ctx.strokeStyle = tokenRgba("signalBright", 0.18 * alpha)
  ctx.lineWidth = 0.8
  for (let axis = 0; axis < 4; axis += 1) {
    const angle = axis * (Math.PI / 2) + timeMs * 0.00018
    const inner = lerpScalar(86, 22, gather)
    const outer = lerpScalar(210, 56, gather)
    ctx.beginPath()
    ctx.moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner)
    ctx.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootFinalHold(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    center: { x: number; y: number }
    progress: number
  },
) {
  const holdStart = 0.9
  const holdEnd = REBOOT_REVEAL_START
  const holdProgress = clampScalar(
    (input.progress - holdStart) / Math.max(0.001, holdEnd - holdStart),
    0,
    1,
  )
  if (holdProgress <= 0.001) {
    return
  }

  const alpha = 0.12 * (1 - holdProgress)
  ctx.save()
  const grad = ctx.createRadialGradient(
    input.center.x,
    input.center.y,
    20,
    input.center.x,
    input.center.y,
    Math.max(input.width, input.height) * 0.44,
  )
  grad.addColorStop(0, tokenRgba("signalBright", alpha * 0.8))
  grad.addColorStop(0.42, tokenRgba("signal", alpha))
  grad.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, input.width, input.height)
  ctx.restore()
}

function drawRebootCompletionHalo(
  ctx: CanvasRenderingContext2D,
  input: {
    width: number
    height: number
    center: { x: number; y: number }
    angle: number
    progress: number
    timeMs: number
  },
) {
  const reveal = easeOutCubic(input.progress)
  const radius = lerpScalar(22, 58, reveal)
  const pulse = 0.86 + Math.sin(input.timeMs * 0.0022) * 0.14

  ctx.save()
  const hull = computeHullMetrics(0.72)
  ctx.translate(input.center.x, input.center.y)
  ctx.rotate(input.angle)
  ctx.strokeStyle = tokenRgba("text", 0.34 + reveal * 0.2)
  ctx.lineWidth = 1.2
  ctx.shadowColor = tokenRgba("signalBright", 0.24 + reveal * 0.18)
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.moveTo(0, hull.tipY * 0.92)
  ctx.lineTo(hull.bodyW * 0.66, hull.baseY * 0.24)
  ctx.lineTo(0, hull.baseY * 0.7)
  ctx.lineTo(-hull.bodyW * 0.66, hull.baseY * 0.24)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  ctx.save()
  const grad = ctx.createRadialGradient(
    input.center.x,
    input.center.y,
    radius * 0.22,
    input.center.x,
    input.center.y,
    radius * 1.38,
  )
  grad.addColorStop(0, tokenRgba("text", 0.14 * input.progress * pulse))
  grad.addColorStop(0.42, tokenRgba("signal", 0.12 * input.progress))
  grad.addColorStop(1, tokenRgba("void", 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, input.width, input.height)

  ctx.strokeStyle = tokenRgba("signalBright", 0.34 * input.progress)
  ctx.lineWidth = 1.6
  ctx.shadowColor = tokenRgba("signalBright", 0.24 * input.progress)
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, radius, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = tokenRgba("text", 0.18 * reveal)
  ctx.lineWidth = 1
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, radius * 0.7, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** フェーズ境界パルス: 指定 threshold の直後に短い拡散リングが一度走る。 */
function drawRebootPhasePulse(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  progress: number,
  threshold: number,
  window: number,
  maxRadius: number,
  strength: number,
) {
  const localProgress = (progress - threshold) / window
  if (localProgress < 0 || localProgress > 1) return
  // 前半で拡散・減衰
  const ease = 1 - Math.pow(1 - localProgress, 2.5)
  const radius = maxRadius * ease
  const alpha = (1 - localProgress) * strength * 0.6

  ctx.save()
  ctx.strokeStyle = tokenRgba("line", alpha)
  ctx.lineWidth = 1 + (1 - localProgress) * 1.2
  ctx.shadowColor = tokenRgba("line", 0.6)
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** 点火パルス (ignition): 構築完了から reveal へ橋渡しする強い拡散ショックウェーブ。 */
function drawRebootIgnition(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  progress: number,
) {
  // 3 枚のリングを phase-offset でずらす
  const rings = [
    { offset: 0,    maxR: 280, width: 3.5, alphaBase: 0.45 },
    { offset: 0.15, maxR: 210, width: 2.0, alphaBase: 0.35 },
    { offset: 0.3,  maxR: 140, width: 1.2, alphaBase: 0.28 },
  ]
  ctx.save()
  for (const ring of rings) {
    const local = clampScalar(progress - ring.offset, 0, 1)
    if (local <= 0) continue
    const ease = 1 - Math.pow(1 - local, 2.6)
    const r = ring.maxR * ease
    const alpha = (1 - local) * ring.alphaBase
    if (alpha < 0.01) continue
    ctx.strokeStyle = tokenRgba("signalBright", alpha)
    ctx.lineWidth = ring.width * (1 - local * 0.5)
    ctx.shadowColor = tokenRgba("line", 0.8)
    ctx.shadowBlur = 24
    ctx.beginPath()
    ctx.arc(center.x, center.y, r, 0, TAU)
    ctx.stroke()
  }
  // 中央の強い輝点 (短時間)
  const coreAlpha = Math.max(0, 1 - progress * 1.3) * 0.8
  if (coreAlpha > 0.01) {
    const coreR = 14 * (1 + progress * 2)
    const coreGrad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreR)
    coreGrad.addColorStop(0, tokenRgba("text", coreAlpha))
    coreGrad.addColorStop(0.3, tokenRgba("signalBright", coreAlpha * 0.6))
    coreGrad.addColorStop(1, tokenRgba("signal", 0))
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(center.x, center.y, coreR, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

function drawRebootField(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  timeMs: number,
  progress: number,
) {
  ctx.save()

  // ── 1. 外周の収縮グリッド (3 重リング) ──
  //   広い空間から演算格子が折り畳まれてくる印象。半径は progress に応じて内側へ。
  const ringCount = 3
  for (let r = 0; r < ringCount; r++) {
    const baseR = 280 - r * 45
    const collapseR = lerpScalar(baseR, 72 + r * 8, easeOutCubic(progress))
    const ringAlpha = (0.18 - r * 0.04) * (0.4 + 0.6 * progress)
    ctx.strokeStyle = tokenRgba("line", ringAlpha)
    ctx.lineWidth = 0.9
    ctx.setLineDash([6 + r * 2, 8 + r * 3])
    ctx.lineDashOffset = -timeMs * 0.018 * (r % 2 === 0 ? 1 : -1)
    ctx.beginPath()
    ctx.arc(center.x, center.y, collapseR, 0, TAU)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // ── 2. 放射ライン (元のロジックを洗練) ──
  const lineCount = 18
  for (let index = 0; index < lineCount; index += 1) {
    const angle = (TAU / lineCount) * index + timeMs * 0.00012
    const sourceRadius = lerpScalar(220, 40, easeOutCubic(progress))
    const sourceX = center.x + Math.cos(angle) * sourceRadius
    const sourceY = center.y + Math.sin(angle) * sourceRadius
    const lineGradient = ctx.createLinearGradient(sourceX, sourceY, center.x, center.y)
    lineGradient.addColorStop(0, tokenRgba("signal", 0))
    lineGradient.addColorStop(0.58, tokenRgba("signal", 0.18))
    lineGradient.addColorStop(1, tokenRgba("signalBright", 0.55))
    ctx.strokeStyle = lineGradient
    ctx.lineWidth = 1 + (index % 3) * 0.6
    ctx.beginPath()
    ctx.moveTo(sourceX, sourceY)
    ctx.lineTo(center.x, center.y)
    ctx.stroke()
  }

  // ── 3. データストリーム (内向きの流れるトレイル) ──
  //   外周から中心へ向かう elongated trail。1 つ 1 つが「取り込まれるデータパケット」の印象。
  const streamCount = 12
  for (let s = 0; s < streamCount; s++) {
    const angle = (TAU / streamCount) * s + s * 1.7
    const cycleT = ((timeMs * 0.0008 + s * 0.17) % 1)
    const startR = lerpScalar(260, 30, easeOutCubic(progress)) * (1 - cycleT)
    const endR = startR * 0.6
    const sx = center.x + Math.cos(angle) * startR
    const sy = center.y + Math.sin(angle) * startR
    const ex = center.x + Math.cos(angle) * endR
    const ey = center.y + Math.sin(angle) * endR
    const streamAlpha = (1 - cycleT) * 0.45 * progress
    if (streamAlpha < 0.02) continue
    const streamGrad = ctx.createLinearGradient(sx, sy, ex, ey)
    streamGrad.addColorStop(0, tokenRgba("signal", 0))
    streamGrad.addColorStop(1, tokenRgba("signalBright", streamAlpha))
    ctx.strokeStyle = streamGrad
    ctx.lineWidth = 1.6
    ctx.lineCap = "round"
    ctx.shadowColor = tokenRgba("line", 0.5)
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // ── 4. 周回モート (元のロジック) ──
  for (let moteIndex = 0; moteIndex < 40; moteIndex += 1) {
    const angle = (TAU / 40) * moteIndex + timeMs * 0.0004
    const orbit = lerpScalar(180, 8, easeOutCubic(progress))
    const x = center.x + Math.cos(angle * 1.2 + moteIndex) * orbit
    const y = center.y + Math.sin(angle * 0.9 + moteIndex * 0.5) * orbit
    const radius = 0.8 + (moteIndex % 4) * 0.35
    ctx.globalAlpha = 0.08 + progress * 0.18
    ctx.fillStyle = moteIndex % 5 === 0 ? tokenRgba("text", 1) : tokenRgba("line", 1)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

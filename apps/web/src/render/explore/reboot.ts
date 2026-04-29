import { REBOOT_SETTLE_BLACKOUT_RATIO } from "@/app/explore-presentation"
import type { ShipVariant } from "@magnolia/contracts"
import { computeHullMetrics, drawShip } from "@/app/ship-renderer"
import { TAU, clampScalar, easeInOutSine, easeOutCubic, lerpScalar, seededUnit } from "@/render/shared/canvas-math"
import { drawExplorePlayer } from "./player"
import type { FrameRef, RebootSequenceState, RebootSettleState } from "./types"

const REBOOT_CORE_START = 0.03
const REBOOT_GATHER_START = 0.08
const REBOOT_GATHER_DURATION = 0.28
const REBOOT_CONSTRUCT_START = 0.18
const REBOOT_CONSTRUCT_DURATION = 0.58
const REBOOT_IGNITION_START = 0.76
const REBOOT_IGNITION_DURATION = 0.1
const REBOOT_REVEAL_START = 0.88

export function readRebootSequence(input: {
  rebootSequenceRef: FrameRef<RebootSequenceState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSequenceRef.current = null
    return null
  }

  if (input.rebootSequenceRef.current?.requestId !== input.requestId) {
    input.rebootSequenceRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSequenceRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(
        1,
        // reboot movie の進行は cue 全体の duration と一致させます。
        // 途中で通常画面に見えてしまう問題を避けるため、視覚演出だけを前倒しで
        // 完了させる処理は入れません。
        (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs),
      ),
    ),
  }
}

export function readRebootSettle(input: {
  rebootSettleRef: FrameRef<RebootSettleState | null>
  requestId: string | undefined
  durationMs: number
  now: number
}): { progress: number } | null {
  if (!input.requestId) {
    input.rebootSettleRef.current = null
    return null
  }

  if (input.rebootSettleRef.current?.requestId !== input.requestId) {
    input.rebootSettleRef.current = {
      requestId: input.requestId,
      startedAtMs: input.now,
    }
  }

  const sequence = input.rebootSettleRef.current
  if (!sequence) {
    return null
  }

  return {
    progress: Math.max(
      0,
      Math.min(1, (input.now - sequence.startedAtMs) / Math.max(1, input.durationMs)),
    ),
  }
}

export function readRebootViewportHeight(baseViewportHeight: number, progress: number): number {
  // ZOOM_IN_HEIGHT: 構築フェーズで近接する目標。数値が小さいほど機体が画面を占める。
  //   以前は 112。新規ゲーム導入では、機体が組み上がる瞬間をより劇的に
  //   見せるため 96 (約 3.3x 相対ズーム) に変更している。
  const ZOOM_IN_HEIGHT = 96
  const zoomInStart = REBOOT_GATHER_START
  const zoomInEnd = 0.34
  const zoomOutStart = REBOOT_REVEAL_START

  if (progress < zoomInStart) {
    return baseViewportHeight
  }
  // ズームイン: 導入後半からゆっくり寄り、構築フェーズでは近接視点を長めに維持します。
  if (progress < zoomInEnd) {
    return lerpScalar(
      baseViewportHeight,
      ZOOM_IN_HEIGHT,
      easeInOutSine((progress - zoomInStart) / Math.max(0.001, zoomInEnd - zoomInStart)),
    )
  }
  // 構築フェーズ中は絞ったまま維持し、通常視点への復帰を遅らせます。
  if (progress < zoomOutStart) {
    return ZOOM_IN_HEIGHT
  }
  // ズームアウトは終盤だけに寄せ、通常視点が早く出過ぎないようにします。
  return lerpScalar(
    ZOOM_IN_HEIGHT,
    baseViewportHeight,
    easeInOutSine((progress - zoomOutStart) / Math.max(0.001, 1 - zoomOutStart)),
  )
}

export function readRebootSettlePhase(progress: number) {
  if (progress <= REBOOT_SETTLE_BLACKOUT_RATIO) {
    return {
      worldRevealProgress: 0,
      bridgeShipAlpha: 1,
    }
  }

  const revealProgress = easeInOutSine(
    (progress - REBOOT_SETTLE_BLACKOUT_RATIO) /
      Math.max(0.001, 1 - REBOOT_SETTLE_BLACKOUT_RATIO),
  )

  return {
    worldRevealProgress: revealProgress,
    bridgeShipAlpha: 1 - easeInOutSine(revealProgress),
  }
}

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
  ctx.fillStyle = "#010204"
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
  grad.addColorStop(0, `rgba(150, 220, 255, ${pulse.toFixed(3)})`)
  grad.addColorStop(0.32, `rgba(36, 76, 124, ${(pulse * 0.46).toFixed(3)})`)
  grad.addColorStop(1, "rgba(1, 2, 4, 0)")
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
  ctx.strokeStyle = "rgba(150, 220, 255, 0.38)"
  ctx.lineWidth = 1.1
  ctx.shadowColor = "rgba(93, 164, 209, 0.42)"
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
  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.22 * bridgeAlpha).toFixed(3)})`
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
    ctx.strokeStyle = "rgba(190, 238, 255, 0.58)"
    ctx.lineWidth = 1.4
    ctx.shadowColor = "rgba(120, 210, 255, 0.62)"
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(center.x, center.y, 28 + wave * 260, 0, TAU)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = Math.sin(Math.PI * activationProgress) * 0.45
    const shipGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 92)
    shipGlow.addColorStop(0, "rgba(220, 248, 255, 0.32)")
    shipGlow.addColorStop(0.35, "rgba(93, 164, 209, 0.12)")
    shipGlow.addColorStop(1, "rgba(93, 164, 209, 0)")
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
  base.addColorStop(0, "#050912")
  base.addColorStop(0.58, "#03060d")
  base.addColorStop(1, "#010204")
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
  radial.addColorStop(0, `rgba(93, 164, 209, ${radialAlpha.toFixed(3)})`)
  radial.addColorStop(0.4, `rgba(36, 76, 124, ${(radialAlpha * 0.45).toFixed(3)})`)
  radial.addColorStop(1, "rgba(1, 2, 4, 0)")
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = `rgba(93, 164, 209, ${((0.024 + progress * 0.018) * awake).toFixed(3)})`
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
  grad.addColorStop(0, `rgba(120, 190, 255, ${(alpha * 1.4).toFixed(3)})`)
  grad.addColorStop(0.35, `rgba(93, 164, 209, ${alpha.toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
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
  halo.addColorStop(0, `rgba(232, 247, 255, ${(0.28 * eased * breath).toFixed(3)})`)
  halo.addColorStop(0.34, `rgba(93, 164, 209, ${(0.18 * eased).toFixed(3)})`)
  halo.addColorStop(1, "rgba(1, 2, 4, 0)")
  ctx.fillStyle = halo
  ctx.fillRect(center.x - 100, center.y - 100, 200, 200)

  ctx.fillStyle = `rgba(238, 249, 255, ${(0.72 * eased).toFixed(3)})`
  ctx.shadowColor = "rgba(150, 220, 255, 0.9)"
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(center.x, center.y, coreRadius, 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 12
  ctx.strokeStyle = `rgba(150, 220, 255, ${(0.36 * eased).toFixed(3)})`
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
  ctx.strokeStyle = "rgba(120, 200, 255, 0.36)"
  ctx.lineWidth = 1
  ctx.shadowColor = "rgba(93, 164, 209, 0.42)"
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
  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.18 * alpha).toFixed(3)})`
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
  grad.addColorStop(0, `rgba(220, 238, 255, ${(alpha * 0.8).toFixed(3)})`)
  grad.addColorStop(0.42, `rgba(93, 164, 209, ${alpha.toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
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
  ctx.strokeStyle = `rgba(228, 241, 255, ${(0.34 + reveal * 0.2).toFixed(3)})`
  ctx.lineWidth = 1.2
  ctx.shadowColor = `rgba(214, 236, 255, ${(0.24 + reveal * 0.18).toFixed(3)})`
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
  grad.addColorStop(0, `rgba(240, 248, 255, ${(0.14 * input.progress * pulse).toFixed(3)})`)
  grad.addColorStop(0.42, `rgba(93, 164, 209, ${(0.12 * input.progress).toFixed(3)})`)
  grad.addColorStop(1, "rgba(4, 10, 22, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, input.width, input.height)

  ctx.strokeStyle = `rgba(214, 236, 255, ${(0.34 * input.progress).toFixed(3)})`
  ctx.lineWidth = 1.6
  ctx.shadowColor = `rgba(214, 236, 255, ${(0.24 * input.progress).toFixed(3)})`
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, radius, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 * reveal).toFixed(3)})`
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
  ctx.strokeStyle = `rgba(140, 210, 255, ${alpha.toFixed(3)})`
  ctx.lineWidth = 1 + (1 - localProgress) * 1.2
  ctx.shadowColor = "rgba(140, 210, 255, 0.6)"
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
    ctx.strokeStyle = `rgba(200, 230, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = ring.width * (1 - local * 0.5)
    ctx.shadowColor = "rgba(140, 210, 255, 0.8)"
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
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha.toFixed(3)})`)
    coreGrad.addColorStop(0.3, `rgba(200, 230, 255, ${(coreAlpha * 0.6).toFixed(3)})`)
    coreGrad.addColorStop(1, "rgba(93, 164, 209, 0)")
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
    ctx.strokeStyle = `rgba(140, 210, 255, ${ringAlpha.toFixed(3)})`
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
    lineGradient.addColorStop(0, "rgba(93, 164, 209, 0)")
    lineGradient.addColorStop(0.58, "rgba(93, 164, 209, 0.18)")
    lineGradient.addColorStop(1, "rgba(214, 236, 255, 0.55)")
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
    streamGrad.addColorStop(0, "rgba(93, 164, 209, 0)")
    streamGrad.addColorStop(1, `rgba(220, 240, 255, ${streamAlpha.toFixed(3)})`)
    ctx.strokeStyle = streamGrad
    ctx.lineWidth = 1.6
    ctx.lineCap = "round"
    ctx.shadowColor = "rgba(140, 210, 255, 0.5)"
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
    ctx.fillStyle = moteIndex % 5 === 0 ? "#eaf7ff" : "#8ccfff"
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

function drawRebootConstruction(
  ctx: CanvasRenderingContext2D,
  input: {
    center: { x: number; y: number }
    angle: number
    timeMs: number
    progress: number
    scale: number
    shipVariant: ShipVariant
  },
) {
  const shellAlpha = 0.2 + input.progress * 0.5
  const ringRadius = lerpScalar(42, 16, easeOutCubic(input.progress))
  // 構築フェーズ全体の描画スケール。演出で見せる間は caller から K=2.6 が
  // 渡され、ignition → reveal の settle 窓で K=1.0 (= drawExplorePlayer のサイズ) まで
  // 縮小されます。これにより reveal 時点で wireframe と本体 ship がぴったり重なり、
  // 重ね合わせに段差が出ない仕組みです。
  const K = input.scale

  // まず座標系を機体中心へ移し、全体を K 倍に拡大。以降の描画は中心相対 (0, 0) 基準。
  ctx.save()
  ctx.translate(input.center.x, input.center.y)
  ctx.scale(K, K)
  drawRebootConstructionRings(ctx, input.timeMs, input.progress, K)

  // ── 1. wireframe + fill (回転は機体角度に沿わせる) ──
  ctx.save()
  ctx.rotate(input.angle)
  drawRebootHullFragments(ctx, computeHullMetrics(0.72), input.timeMs, input.progress, K)

  ctx.strokeStyle = `rgba(214, 236, 255, ${shellAlpha.toFixed(3)})`
  ctx.lineWidth = 1.2 / K // ctx.scale で太線にならないよう逆補正
  ctx.shadowColor = "rgba(140, 210, 255, 0.85)"
  ctx.shadowBlur = 22 / K
  drawPlayerWireframe(ctx, input.progress)
  drawRebootInternalCircuit(ctx, computeHullMetrics(0.72), input.progress, K)

  ctx.globalAlpha = 0.24 + input.progress * 0.24
  ctx.fillStyle = "rgba(180, 228, 255, 1)"
  drawPlayerHullFill(ctx, input.progress)

  const resolvedProgress = clampScalar((input.progress - 0.58) / 0.42, 0, 1)
  if (resolvedProgress > 0.001) {
    ctx.save()
    ctx.globalAlpha = 0.14 + resolvedProgress * 0.2
    drawShip(ctx, {
      variant: input.shipVariant,
      center: { x: 0, y: 0 },
      scale: 0.72,
      stroke: "rgba(238, 249, 255, 0.9)",
      fill: "rgba(190, 228, 255, 0.08)",
      lineWidth: 0.9 / K,
      glow: { color: "rgba(140, 210, 255, 0.8)", blur: 10 / K },
      core: {
        color: "rgba(226, 248, 255, 0.9)",
        glowColor: "rgba(120, 210, 255, 0.95)",
        glowBlur: 8 / K,
        radius: 1.8 / K,
        pulse: resolvedProgress,
      },
      reveal: resolvedProgress,
      revealFill: clampScalar((resolvedProgress - 0.16) / 0.84, 0, 1),
      timeMs: input.timeMs,
      artDetailStrength: 0.85,
    })
    ctx.restore()
  }

  // ── 2. 縦方向スキャンバー ──
  //   機体を「下→上」に走査する白い帯。進捗と sin 変動で周期的に位置が揺れる。
  ctx.shadowBlur = 0
  const hull = computeHullMetrics(0.72)
  const scanY = hull.tipY + ((input.progress * 1.5 + Math.sin(input.timeMs * 0.004) * 0.08) % 1) *
    (hull.baseY - hull.tipY + 16)
  const scanWidth = (hull.bodyW / 2 + hull.wingGap + hull.wingW) * 2.4
  const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6)
  scanGrad.addColorStop(0, "rgba(140, 210, 255, 0)")
  scanGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.6 * input.progress).toFixed(3)})`)
  scanGrad.addColorStop(1, "rgba(140, 210, 255, 0)")
  ctx.globalAlpha = 1
  ctx.fillStyle = scanGrad
  ctx.fillRect(-scanWidth / 2, scanY - 6, scanWidth, 12)

  ctx.restore()

  // ── 3. 外周リング 2 重 ──
  ctx.strokeStyle = `rgba(140, 210, 255, ${(0.18 + input.progress * 0.22).toFixed(3)})`
  ctx.lineWidth = 1.2 / K
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, ringRadius * 1.45, 0, TAU)
  ctx.stroke()

  // ── 4. schematic ticks (12 分割) ──
  const tickCount = 12
  const tickOuterR = ringRadius * 1.62
  const tickInnerR = ringRadius * 1.5
  ctx.strokeStyle = `rgba(140, 210, 255, ${(0.35 + input.progress * 0.28).toFixed(3)})`
  ctx.lineWidth = 1 / K
  for (let t = 0; t < tickCount; t++) {
    const a = (TAU / tickCount) * t + input.timeMs * 0.0004
    const isMajor = t % 3 === 0
    const outerR = isMajor ? tickOuterR + 4 : tickOuterR
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * tickInnerR, Math.sin(a) * tickInnerR)
    ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR)
    ctx.stroke()
  }

  // ── 5. 構築バースト点 ──
  for (let index = 0; index < 6; index += 1) {
    const burstAngle = (TAU / 6) * index + input.timeMs * 0.0015
    const burstRadius = ringRadius * (0.7 + (index % 3) * 0.16)
    const burstX = Math.cos(burstAngle) * burstRadius
    const burstY = Math.sin(burstAngle) * burstRadius
    ctx.globalAlpha = 0.18 + input.progress * 0.22
    ctx.fillStyle = index % 2 === 0 ? "#f4fbff" : "#8dd3ff"
    ctx.beginPath()
    ctx.arc(burstX, burstY, 1.6 + (index % 2) * 0.5, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

function drawRebootConstructionRings(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  progress: number,
  scale: number,
) {
  const resolved = easeOutCubic(progress)
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineCap = "round"
  for (let ringIndex = 0; ringIndex < 4; ringIndex += 1) {
    const radius = lerpScalar(58 - ringIndex * 5, 24 + ringIndex * 5, resolved)
    const alpha = (0.22 - ringIndex * 0.035) * (0.5 + resolved * 0.5)
    const spin = timeMs * (0.0009 + ringIndex * 0.00018) * (ringIndex % 2 === 0 ? 1 : -1)
    ctx.strokeStyle = `rgba(140, 210, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = (1.2 - ringIndex * 0.12) / scale
    ctx.shadowColor = "rgba(93, 164, 209, 0.55)"
    ctx.shadowBlur = 10 / scale
    for (let segment = 0; segment < 2; segment += 1) {
      const start = spin + segment * Math.PI + ringIndex * 0.36
      ctx.beginPath()
      ctx.arc(0, 0, radius, start, start + TAU * (0.22 + ringIndex * 0.035))
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawRebootHullFragments(
  ctx: CanvasRenderingContext2D,
  hull: ReturnType<typeof computeHullMetrics>,
  timeMs: number,
  progress: number,
  scale: number,
) {
  const targets = [
    { x: 0, y: hull.tipY },
    { x: -hull.bodyW * 0.5, y: hull.baseY },
    { x: hull.bodyW * 0.5, y: hull.baseY },
    { x: 0, y: hull.bodyNotchY },
    { x: -hull.bodyW * 0.95, y: hull.baseY - hull.wingH * 0.45 },
    { x: hull.bodyW * 0.95, y: hull.baseY - hull.wingH * 0.45 },
  ]

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineCap = "round"
  for (let index = 0; index < 34; index += 1) {
    const target = targets[index % targets.length]
    const delay = (index % 9) * 0.035
    const local = clampScalar((progress - delay) / 0.46, 0, 1)
    if (local <= 0.001) {
      continue
    }
    const eased = easeOutCubic(local)
    const angle = seededUnit(index * 11 + 3) * TAU + timeMs * 0.00022
    const distance = lerpScalar(62 + seededUnit(index * 17) * 42, 0, eased)
    const jitterX = (seededUnit(index * 23) - 0.5) * hull.bodyW * 0.28
    const jitterY = (seededUnit(index * 29) - 0.5) * hull.bodyH * 0.22
    const x = target.x + jitterX * (1 - eased) + Math.cos(angle) * distance
    const y = target.y + jitterY * (1 - eased) + Math.sin(angle) * distance
    const alpha = Math.sin(local * Math.PI) * (0.18 + progress * 0.42)
    if (alpha <= 0.01) {
      continue
    }

    ctx.strokeStyle = `rgba(218, 242, 255, ${alpha.toFixed(3)})`
    ctx.lineWidth = (0.7 + seededUnit(index * 31) * 0.7) / scale
    ctx.shadowColor = "rgba(140, 210, 255, 0.75)"
    ctx.shadowBlur = 7 / scale
    const len = 2.4 + seededUnit(index * 37) * 4.8
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRebootInternalCircuit(
  ctx: CanvasRenderingContext2D,
  hull: ReturnType<typeof computeHullMetrics>,
  progress: number,
  scale: number,
) {
  const circuitProgress = clampScalar((progress - 0.22) / 0.58, 0, 1)
  if (circuitProgress <= 0.001) {
    return
  }

  ctx.save()
  ctx.globalAlpha = 0.22 + circuitProgress * 0.34
  ctx.strokeStyle = "rgba(180, 230, 255, 0.72)"
  ctx.lineWidth = 0.55 / scale
  ctx.shadowColor = "rgba(93, 164, 209, 0.5)"
  ctx.shadowBlur = 5 / scale
  const revealY = lerpScalar(hull.baseY + 4, hull.tipY - 4, easeOutCubic(circuitProgress))

  const paths = [
    [
      { x: 0, y: hull.baseY },
      { x: 0, y: hull.bodyNotchY },
      { x: 0, y: hull.tipY * 0.72 },
    ],
    [
      { x: -hull.bodyW * 0.24, y: hull.baseY * 0.54 },
      { x: -hull.bodyW * 0.1, y: hull.bodyNotchY },
      { x: -hull.bodyW * 0.18, y: hull.tipY * 0.32 },
    ],
    [
      { x: hull.bodyW * 0.24, y: hull.baseY * 0.54 },
      { x: hull.bodyW * 0.1, y: hull.bodyNotchY },
      { x: hull.bodyW * 0.18, y: hull.tipY * 0.32 },
    ],
  ]

  for (const path of paths) {
    ctx.beginPath()
    let started = false
    for (const point of path) {
      if (point.y < revealY) {
        continue
      }
      if (!started) {
        ctx.moveTo(point.x, point.y)
        started = true
      } else {
        ctx.lineTo(point.x, point.y)
      }
    }
    if (started) {
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawPlayerWireframe(ctx: CanvasRenderingContext2D, progress: number) {
  const m = computeHullMetrics(0.72)
  const reveal = easeOutCubic(progress)

  traceRebootSolidBody(ctx, m, reveal)
  ctx.stroke()

  for (const side of [-1, 1] as const) {
    traceRebootSolidWing(ctx, m, side, reveal)
    ctx.stroke()
    traceRebootSolidRearFin(ctx, m, side, reveal)
    ctx.stroke()
  }

  // 起動演出では、三角形ベースの完成形に近い稜線を先に見せます。
  ctx.save()
  ctx.globalAlpha *= 0.72 * reveal
  ctx.lineWidth = Math.max(0.45, ctx.lineWidth * 0.58)
  ctx.beginPath()
  ctx.moveTo(0, m.tipY + m.bodyH * 0.1)
  ctx.lineTo(0, m.baseY * 0.5 * reveal)
  ctx.moveTo(-m.bodyW * 0.18 * reveal, -m.bodyH * 0.02 * reveal)
  ctx.lineTo(-m.bodyW * 0.56 * reveal, (m.baseY - m.wingH * 0.1) * reveal)
  ctx.moveTo(m.bodyW * 0.18 * reveal, -m.bodyH * 0.02 * reveal)
  ctx.lineTo(m.bodyW * 0.56 * reveal, (m.baseY - m.wingH * 0.1) * reveal)
  ctx.stroke()
  ctx.restore()
}

function drawPlayerHullFill(ctx: CanvasRenderingContext2D, progress: number) {
  const m = computeHullMetrics(0.72)
  const reveal = easeOutCubic(Math.max(0, (progress - 0.16) / 0.84))

  traceRebootSolidBody(ctx, m, reveal)
  ctx.fill()
}

function traceRebootSolidWing(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
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

function traceRebootSolidRearFin(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  side: -1 | 1,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(side * m.bodyW * 0.1, m.baseY * 0.82)
  ctx.lineTo(side * m.bodyW * 0.26 * reveal, m.baseY * 1.1 * reveal)
  ctx.lineTo(side * m.bodyW * 0.02 * reveal, m.baseY * 0.98 * reveal)
  ctx.closePath()
}

function traceRebootSolidBody(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof computeHullMetrics>,
  reveal: number,
) {
  ctx.beginPath()
  ctx.moveTo(0, m.tipY)
  ctx.lineTo(-m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.lineTo(-m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(0, m.bodyNotchY * reveal)
  ctx.lineTo(m.bodyW * 0.16 * reveal, m.baseY * reveal)
  ctx.lineTo(m.bodyW * 0.48 * reveal, m.baseY * 0.58 * reveal)
  ctx.closePath()
}

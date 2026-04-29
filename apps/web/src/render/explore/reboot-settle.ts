import { hex, rgba } from "@/render/shared/canvas-palette"

import type { MutableRefObject } from "react"
import { REBOOT_SETTLE_BLACKOUT_RATIO } from "@/app/explore-presentation"
import { TAU, clampScalar, easeInOutSine, easeOutCubic } from "@/render/explore/explore-render-utils"

export type RebootSettleState = {
  requestId: string
  startedAtMs: number
}

export function readRebootSettle(input: {
  rebootSettleRef: MutableRefObject<RebootSettleState | null>
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

export function drawRebootBlackoutBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  center: { x: number; y: number },
) {
  ctx.save()
  ctx.fillStyle = hex("voidBase")
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
  grad.addColorStop(0, rgba("lineStrong", pulse))
  grad.addColorStop(0.32, rgba("voidDepth", (pulse * 0.46)))
  grad.addColorStop(1, rgba("voidBase", 0))
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
  ctx.strokeStyle = rgba("lineStrong", 0.38)
  ctx.lineWidth = 1.1
  ctx.shadowColor = rgba("signalPrimary", 0.42)
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
  ctx.strokeStyle = rgba("signalReadable", (0.22 * bridgeAlpha))
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
    ctx.strokeStyle = rgba("lineStrong", 0.58)
    ctx.lineWidth = 1.4
    ctx.shadowColor = rgba("lineStrong", 0.62)
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(center.x, center.y, 28 + wave * 260, 0, TAU)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = Math.sin(Math.PI * activationProgress) * 0.45
    const shipGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 92)
    shipGlow.addColorStop(0, rgba("signalReadable", 0.32))
    shipGlow.addColorStop(0.35, rgba("signalPrimary", 0.12))
    shipGlow.addColorStop(1, rgba("signalPrimary", 0))
    ctx.fillStyle = shipGlow
    ctx.beginPath()
    ctx.arc(center.x, center.y, 92, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

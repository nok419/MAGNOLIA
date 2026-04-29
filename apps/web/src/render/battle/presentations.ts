import type { BattleRenderState } from "@magnolia/game-session"
import type { TimedPresentationRequest } from "@/app/app-state"
import { HEIGHT, WIDTH } from "./dimensions"
import { TAU, clamp01, easeOutCubic } from "./math"

export function drawBattlePresentationLayer(
  ctx: CanvasRenderingContext2D,
  input: {
    renderState: BattleRenderState
    presentationRequests: TimedPresentationRequest[]
    reduceFlashing: boolean
  },
): void {
  const nowMs = Date.now()
  for (const request of input.presentationRequests) {
    const strength = readPresentationStrength(request, nowMs)
    if (strength <= 0) {
      continue
    }

    switch (request.cueId) {
      case "battle.player.hit":
        drawPlayerHitPresentation(ctx, {
          x: request.worldPosition.x,
          y: request.worldPosition.y,
          noiseLevel: request.noiseLevel,
          strength,
          reduceFlashing: input.reduceFlashing,
        })
        break
      case "battle.noise.peak":
        drawNoisePeakPresentation(ctx, strength, input.reduceFlashing)
        break
      case "battle.noise.clear":
        drawNoiseClearPresentation(ctx, strength, input.reduceFlashing)
        break
      case "battle.invincible.start":
        drawInvincibleStartPresentation(ctx, {
          x: input.renderState.player.position.x,
          y: input.renderState.player.position.y,
          strength,
          reduceFlashing: input.reduceFlashing,
        })
        break
    }
  }
}

function readPresentationStrength(request: TimedPresentationRequest, nowMs: number): number {
  const durationMs = Math.max(1, request.expiresAtMs - request.receivedAtMs)
  const progress = Math.max(0, Math.min(1, (nowMs - request.receivedAtMs) / durationMs))
  return 1 - progress
}

function drawPlayerHitPresentation(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    noiseLevel: number
    strength: number
    reduceFlashing: boolean
  },
): void {
  const radius = 18 + (1 - input.strength) * 42
  const alpha = input.reduceFlashing ? 0.22 * input.strength : 0.36 * input.strength
  ctx.save()
  ctx.strokeStyle = `rgba(255, 156, 156, ${alpha.toFixed(3)})`
  ctx.lineWidth = input.reduceFlashing ? 2 : 3
  ctx.beginPath()
  ctx.arc(input.x, input.y, radius, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = `rgba(255, 230, 210, ${(alpha * Math.max(0.35, input.noiseLevel)).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(input.x, input.y, Math.max(8, radius * 0.45), 0, TAU)
  ctx.stroke()
  if (!input.reduceFlashing) {
    ctx.fillStyle = `rgba(120, 18, 28, ${(0.05 * input.strength).toFixed(3)})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
  ctx.restore()
}

function drawNoisePeakPresentation(
  ctx: CanvasRenderingContext2D,
  strength: number,
  reduceFlashing: boolean,
): void {
  ctx.save()
  const alpha = reduceFlashing ? 0.12 * strength : 0.24 * strength
  ctx.strokeStyle = `rgba(255, 210, 145, ${alpha.toFixed(3)})`
  ctx.lineWidth = reduceFlashing ? 2 : 3
  ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16)
  for (let index = 0; index < 5; index += 1) {
    const y = 44 + index * 78 + (reduceFlashing ? 0 : Math.sin(Date.now() * 0.012 + index) * 4)
    ctx.strokeStyle = `rgba(255, 210, 145, ${(alpha * (1 - index * 0.12)).toFixed(3)})`
    ctx.beginPath()
    ctx.moveTo(24, y)
    ctx.lineTo(WIDTH - 24, y + Math.sin(index * 1.7) * 8)
    ctx.stroke()
  }
  ctx.restore()
}

function drawNoiseClearPresentation(
  ctx: CanvasRenderingContext2D,
  strength: number,
  reduceFlashing: boolean,
): void {
  ctx.save()
  const alpha = reduceFlashing ? 0.14 * strength : 0.24 * strength
  const radius = 80 + (1 - strength) * 180
  const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, radius * 0.4, WIDTH / 2, HEIGHT / 2, radius)
  gradient.addColorStop(0, `rgba(145, 230, 255, ${alpha.toFixed(3)})`)
  gradient.addColorStop(1, "rgba(145, 230, 255, 0)")
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, radius, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = `rgba(190, 245, 255, ${(alpha * 0.8).toFixed(3)})`
  ctx.lineWidth = reduceFlashing ? 1.4 : 2
  ctx.beginPath()
  ctx.arc(WIDTH / 2, HEIGHT / 2, radius * 0.72, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function drawInvincibleStartPresentation(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    strength: number
    reduceFlashing: boolean
  },
): void {
  ctx.save()
  const radius = 24 + (1 - input.strength) * 18
  const alpha = input.reduceFlashing ? 0.18 * input.strength : 0.3 * input.strength
  ctx.strokeStyle = `rgba(155, 225, 255, ${alpha.toFixed(3)})`
  ctx.lineWidth = input.reduceFlashing ? 1.6 : 2.4
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.arc(input.x, input.y, radius, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

import type { BattleRenderState } from "@magnolia/game-session"
import {
  drawCarrierLineField,
  drawPeripheralVignette,
  drawSignalParticleField,
  drawVoidGradient,
} from "@/app/effect-primitives"
import { resolveMissionVisualProfile } from "@/app/mission-visual-profiles"
import { clamp01, tokenRgba, type VisualRgbRole } from "@/app/visual-tokens"
import { hashString, seededUnit as seededRandom } from "@/app/visual-seed"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH, TAU } from "./battle-canvas"

const WIDTH = BATTLE_CANVAS_WIDTH
const HEIGHT = BATTLE_CANVAS_HEIGHT

export function drawSignalSpaceBackground(
  ctx: CanvasRenderingContext2D,
  t: number,
  renderState: BattleRenderState,
) {
  const profile = resolveMissionVisualProfile(
    renderState.missionVisualProfile,
    renderState.visualProfileId ?? renderState.missionId,
  )
  const projectilePressure = clamp01(renderState.projectiles.filter((projectile) => projectile.side === "enemy").length / 140)
  const backgroundAlpha = profile.backgroundSink * (1 - projectilePressure * 0.42)
  const seed = hashString(`battle:${renderState.missionId}`)

  drawVoidGradient(ctx, WIDTH, HEIGHT)

  // 弾道帯を読みやすくするため、carrier line は中央から少し逃がします。
  drawCarrierLineField(ctx, {
    seed: seed + 11,
    width: WIDTH,
    height: HEIGHT,
    timeMs: t,
    orientation: "vertical",
    density: profile.carrierDensity,
    curvature: profile.motif === "interrupted-arc" ? 0.22 : 0.12,
    alpha: 0.08 * backgroundAlpha,
    focus: { x: WIDTH * 0.5, y: HEIGHT * 0.5 },
    centerQuietRatio: 0.34,
  })

  if (profile.motif === "compression-band") {
    drawCarrierLineField(ctx, {
      seed: seed + 23,
      width: WIDTH,
      height: HEIGHT,
      timeMs: t,
      orientation: "horizontal",
      density: 4,
      curvature: 0.04,
      alpha: 0.055 * backgroundAlpha,
      focus: { x: WIDTH * 0.5, y: HEIGHT * 0.56 },
    })
  } else if (profile.motif === "interrupted-arc") {
    drawCarrierLineField(ctx, {
      seed: seed + 37,
      width: WIDTH,
      height: HEIGHT,
      timeMs: t,
      orientation: "radial",
      density: 6,
      curvature: 0.18,
      alpha: 0.052 * backgroundAlpha,
      focus: { x: WIDTH * 0.5, y: HEIGHT * 0.32 },
      centerQuietRatio: 0.42,
    })
  }

  drawSignalParticleField(ctx, {
    seed: seed + 51,
    width: WIDTH,
    height: HEIGHT,
    timeMs: t,
    density: profile.particleDensity,
    depth: "far",
    drift: "current",
    colorRole: "line",
    reduceMotion: false,
    alpha: backgroundAlpha,
  })

  if (profile.memoryTone > 0.1) {
    drawSignalParticleField(ctx, {
      seed: seed + 73,
      width: WIDTH,
      height: HEIGHT,
      timeMs: t,
      density: "sparse",
      depth: "far",
      drift: "still",
      colorRole: "memory",
      reduceMotion: true,
      alpha: profile.memoryTone * backgroundAlpha,
    })
  }

  drawPeripheralVignette(ctx, { width: WIDTH, height: HEIGHT, strength: 0.72 + projectilePressure * 0.18 })
}

export function drawTransparentAtmosphere(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save()

  const bands = [
    { period: 14000, phase: 0, yBase: 0.25, tilt: -0.12, thickness: 50 },
    { period: 19000, phase: 5200, yBase: 0.55, tilt: 0.08, thickness: 65 },
    { period: 24000, phase: 11000, yBase: 0.78, tilt: -0.04, thickness: 40 },
  ] as const

  for (const band of bands) {
    const progress = ((t + band.phase) % band.period) / band.period
    const centerX = (-0.3 + progress * 1.6) * WIDTH
    const centerY = HEIGHT * band.yBase + Math.sin((t + band.phase) * 0.00025) * HEIGHT * 0.04

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(band.tilt)

    const bw = WIDTH * 0.8
    const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0)
    grad.addColorStop(0, tokenRgba("signal", 0))
    grad.addColorStop(0.2, tokenRgba("signal", 0.012))
    grad.addColorStop(0.5, tokenRgba("line", 0.035))
    grad.addColorStop(0.8, tokenRgba("signal", 0.012))
    grad.addColorStop(1, tokenRgba("signal", 0))
    ctx.fillStyle = grad
    ctx.fillRect(-bw / 2, -band.thickness / 2, bw, band.thickness)

    // 細線は背景と key visual の境界を見せないため、同じ token の極低 alpha にします。
    ctx.strokeStyle = tokenRgba("signalBright", 0.025)
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const ly = -band.thickness / 2 + (band.thickness / 4) * i + Math.sin(t * 0.002 + i) * 1.5
      ctx.beginPath()
      ctx.moveTo(-bw * 0.4, ly)
      ctx.lineTo(bw * 0.4, ly - 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  const rippleSources: Array<{
    sx: number
    sy: number
    interval: number
    maxR: number
    tintRole: VisualRgbRole
  }> = [
    { sx: -0.05, sy: 0.35, interval: 11000, maxR: 0.55, tintRole: "signal" },
    { sx: 1.08, sy: 0.62, interval: 14000, maxR: 0.48, tintRole: "line" },
  ]

  for (const src of rippleSources) {
    for (let ring = 0; ring < 3; ring++) {
      const progress = ((t + ring * (src.interval / 3)) % src.interval) / src.interval
      const radius = 30 + progress * WIDTH * src.maxR
      const alpha = (1 - progress) * 0.06
      ctx.strokeStyle = tokenRgba(src.tintRole, alpha)
      ctx.lineWidth = 1.0 + (1 - progress) * 0.8
      ctx.beginPath()
      ctx.arc(
        src.sx * WIDTH, src.sy * HEIGHT, radius,
        Math.PI * (0.15 + ring * 0.1), Math.PI * (1.55 + ring * 0.1),
      )
      ctx.stroke()
    }
  }

  ctx.fillStyle = tokenRgba("line", 0.08)
  for (let i = 0; i < 12; i++) {
    const px = seededRandom(i * 7 + 3) * WIDTH
    const py = (seededRandom(i * 13 + 1) * HEIGHT + t * 0.015 * (1 + seededRandom(i * 5) * 0.4)) % HEIGHT
    const pr = 0.5 + seededRandom(i * 3 + 2) * 0.6
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

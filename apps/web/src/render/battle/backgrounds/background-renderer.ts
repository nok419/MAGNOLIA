import {
  BATTLE_CANVAS_HEIGHT,
  BATTLE_CANVAS_WIDTH,
  TAU,
  seededRandom,
} from "@/render/battle/battle-renderer-utils"

const WIDTH = BATTLE_CANVAS_WIDTH
const HEIGHT = BATTLE_CANVAS_HEIGHT

export function drawBattleBackgroundPreset(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; timeMs: number; backgroundPresetId?: string },
): void {
  switch (input.backgroundPresetId) {
    case "bg_central_tower":
      drawCentralTowerBackground(ctx, input)
      break
    case "bg_broadcast_facility":
      drawBroadcastFacilityBackground(ctx, input)
      break
    default:
      drawBroadcastFacilityBackground(ctx, input)
      break
  }
}

function drawCentralTowerBackground(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; timeMs: number },
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, input.height)
  gradient.addColorStop(0, "#080711")
  gradient.addColorStop(0.48, "#08131b")
  gradient.addColorStop(1, "#040810")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, input.width, input.height)

  ctx.strokeStyle = "rgba(174, 236, 255, 0.055)"
  ctx.lineWidth = 1
  for (let x = input.width * 0.5 - 120; x <= input.width * 0.5 + 120; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(input.width * 0.5 + (x - input.width * 0.5) * 0.36, input.height)
    ctx.stroke()
  }

  drawBackgroundParticles(ctx, input, "140, 210, 250")
}

function drawBroadcastFacilityBackground(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; timeMs: number },
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, input.height)
  gradient.addColorStop(0, "#0a0510")
  gradient.addColorStop(0.4, "#060d1a")
  gradient.addColorStop(1, "#040810")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, input.width, input.height)

  ctx.strokeStyle = "rgba(93, 164, 209, 0.05)"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x < input.width; x += 40) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, input.height)
  }
  ctx.stroke()

  ctx.strokeStyle = "rgba(140, 195, 255, 0.06)"
  ctx.beginPath()
  for (let index = 0; index < 8; index += 1) {
    const offset = (input.timeMs * 0.06 + index * 60) % (input.height + 60)
    ctx.moveTo(0, offset - 30)
    ctx.lineTo(input.width, offset)
  }
  ctx.stroke()

  drawBackgroundParticles(ctx, input, "140, 195, 255")
}

function drawBackgroundParticles(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; timeMs: number },
  tint: string,
) {
  ctx.fillStyle = `rgba(${tint}, 0.15)`
  for (let index = 0; index < 20; index += 1) {
    const px = seededRandom(index * 7 + 1) * input.width
    const py = (
      seededRandom(index * 13 + 3) * input.height +
      input.timeMs * 0.02 * (1 + seededRandom(index * 5) * 0.5)
    ) % input.height
    const pr = 0.4 + seededRandom(index * 3) * 0.8
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawTransparentAtmosphere(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save()

  // ── 干渉帯: 斜めに横切る薄い光の帯 (SignalBackdropCanvas と同系色) ──
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
    grad.addColorStop(0, "rgba(93, 164, 209, 0)")
    grad.addColorStop(0.2, "rgba(93, 164, 209, 0.012)")
    grad.addColorStop(0.5, "rgba(140, 210, 250, 0.035)")
    grad.addColorStop(0.8, "rgba(93, 164, 209, 0.012)")
    grad.addColorStop(1, "rgba(93, 164, 209, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(-bw / 2, -band.thickness / 2, bw, band.thickness)

    // 帯内の細い干渉ライン
    ctx.strokeStyle = "rgba(180, 230, 255, 0.025)"
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

  // ── 波紋: 画面端から広がる同心弧 (ソナーリング風) ──
  const rippleSources = [
    { sx: -0.05, sy: 0.35, interval: 11000, maxR: 0.55, tint: "93, 164, 209" },
    { sx: 1.08, sy: 0.62, interval: 14000, maxR: 0.48, tint: "140, 200, 240" },
  ] as const

  for (const src of rippleSources) {
    for (let ring = 0; ring < 3; ring++) {
      const progress = ((t + ring * (src.interval / 3)) % src.interval) / src.interval
      const radius = 30 + progress * WIDTH * src.maxR
      const alpha = (1 - progress) * 0.06
      ctx.strokeStyle = `rgba(${src.tint}, ${alpha.toFixed(3)})`
      ctx.lineWidth = 1.0 + (1 - progress) * 0.8
      ctx.beginPath()
      ctx.arc(
        src.sx * WIDTH, src.sy * HEIGHT, radius,
        Math.PI * (0.15 + ring * 0.1), Math.PI * (1.55 + ring * 0.1),
      )
      ctx.stroke()
    }
  }

  // ── 微粒子: 漂う光点 ──
  ctx.fillStyle = "rgba(140, 200, 255, 0.08)"
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

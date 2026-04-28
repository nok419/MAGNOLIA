import { PHI_INV, TAU } from "@/render/battle/battle-renderer-utils"

export type BattleSupportFieldVisualKind = "barrier" | "silentWave"

export function drawSupportField(
  ctx: CanvasRenderingContext2D,
  field: {
    fieldId: string
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  if (field.fieldId === "field.silent_wave") {
    drawSilentWaveField(ctx, field, t)
    return
  }

  const { x, y } = field.position
  const r = field.radius
  const color = field.blocksMagneticDisaster ? "#74f0ff" : "#9ce06f"

  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 8

  // outer ring
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // inner spinning arc
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  const spin = t * 0.002
  ctx.beginPath()
  ctx.arc(x, y, r * PHI_INV, spin, spin + Math.PI * 1.2)
  ctx.stroke()

  ctx.restore()
}

function drawSilentWaveField(
  ctx: CanvasRenderingContext2D,
  field: {
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  const { x, y } = field.position
  const r = field.radius
  const pulse = 0.9 + Math.sin(t * 0.003) * 0.06

  ctx.save()
  ctx.shadowColor = "rgba(116, 240, 255, 0.9)"
  ctx.shadowBlur = 18

  ctx.globalAlpha = 0.11
  ctx.fillStyle = "rgba(116, 240, 255, 1)"
  ctx.beginPath()
  ctx.arc(x, y, r * 1.08 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.48
  ctx.strokeStyle = "rgba(196, 249, 255, 0.88)"
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.28
  ctx.lineWidth = 1
  const spin = t * 0.0014
  ctx.beginPath()
  ctx.arc(x, y, r * 0.58, spin, spin + Math.PI * 1.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.82, -spin * 1.2, -spin * 1.2 + Math.PI * 0.9)
  ctx.stroke()

  ctx.globalAlpha = 0.2
  ctx.strokeStyle = field.blocksMagneticDisaster
    ? "rgba(116, 240, 255, 0.62)"
    : "rgba(156, 224, 111, 0.62)"
  ctx.lineWidth = 0.9
  for (let band = 0; band < 4; band += 1) {
    const offset = ((t * 0.08 + band * r * 0.55) % (r * 2)) - r
    ctx.beginPath()
    ctx.moveTo(x - r * 0.72, y + offset)
    ctx.quadraticCurveTo(x, y + offset - 8, x + r * 0.72, y + offset)
    ctx.stroke()
  }

  ctx.restore()
}

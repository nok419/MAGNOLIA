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
  const pulse = 1 + Math.sin(t * 0.0024) * 0.035
  const spin = t * 0.0012
  const counterSpin = -t * 0.0009

  ctx.save()
  ctx.shadowColor = "rgba(116, 240, 255, 0.82)"
  ctx.shadowBlur = 14

  ctx.globalAlpha = 0.08
  ctx.fillStyle = "rgba(116, 240, 255, 1)"
  ctx.beginPath()
  ctx.arc(x, y, r * 1.08, 0, TAU)
  ctx.fill()

  // 円形の効果範囲を保ちつつ、正多角形で囲むことで室の輪郭を持たせます。
  ctx.globalAlpha = 0.58
  ctx.strokeStyle = "rgba(205, 252, 255, 0.92)"
  ctx.lineWidth = 1.6
  drawRegularPolygon(ctx, x, y, r * 1.02 * pulse, 6, spin)
  ctx.stroke()

  ctx.globalAlpha = 0.36
  ctx.lineWidth = 1
  drawRegularPolygon(ctx, x, y, r * 0.76, 4, counterSpin + Math.PI / 4)
  ctx.stroke()

  ctx.globalAlpha = 0.24
  drawRegularPolygon(ctx, x, y, r * PHI_INV, 8, spin * 0.5)
  ctx.stroke()

  ctx.globalAlpha = 0.22
  ctx.strokeStyle = field.blocksMagneticDisaster
    ? "rgba(116, 240, 255, 0.66)"
    : "rgba(156, 224, 111, 0.62)"
  ctx.lineWidth = 0.8
  drawRadialSpokes(ctx, x, y, r * 0.94, 6, spin)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(counterSpin * 0.65)
  ctx.translate(-x, -y)
  drawChamberLattice(ctx, x, y, r)
  ctx.restore()

  ctx.globalAlpha = 0.44
  ctx.strokeStyle = "rgba(196, 249, 255, 0.76)"
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x, y, r * 0.42, 0, TAU)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, r * 0.28, counterSpin, counterSpin + Math.PI * 1.35)
  ctx.stroke()

  ctx.restore()
}

function drawRegularPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  rotation: number,
) {
  ctx.beginPath()
  for (let index = 0; index <= sides; index += 1) {
    const angle = rotation + (index / sides) * TAU - Math.PI / 2
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (index === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
}

function drawRadialSpokes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  spokes: number,
  rotation: number,
) {
  for (let index = 0; index < spokes; index += 1) {
    const angle = rotation + (index / spokes) * TAU - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(angle) * radius * 0.42, y + Math.sin(angle) * radius * 0.42)
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
    ctx.stroke()
  }
}

function drawChamberLattice(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  // 弦の長さを円内に収め、効果範囲の外へ線が出ないようにします。
  for (let index = -2; index <= 2; index += 1) {
    const offset = index * radius * 0.2
    const chord = Math.sqrt(Math.max(0, radius * radius * 0.72 - offset * offset))
    ctx.beginPath()
    ctx.moveTo(x - chord, y + offset)
    ctx.lineTo(x + chord, y + offset)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + offset, y - chord)
    ctx.lineTo(x + offset, y + chord)
    ctx.stroke()
  }
}

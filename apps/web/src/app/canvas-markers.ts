const PHI_INV = 1 / 1.618033988749895
const TAU = Math.PI * 2

export type CanvasMarkerVariant = "explore" | "map" | "mini"
export type TransmissionMarkerState = "locked" | "available" | "partial" | "complete"
export type CollectibleMarkerKind =
  | "equipment"
  | "resource"
  | "investigation"
  | "selfRepairPoints"
  | "hiddenEquipment"

type MarkerVariantSpec = {
  haloScale: number
  shadowScale: number
  lineScale: number
  orbitScale: number
}

type TransmissionMarkerTheme = {
  accent: string
  haloRgb: string
  core: string
  fillAlpha: number
  orbitAlpha: number
}

type CollectibleMarkerTheme = {
  accent: string
  haloRgb: string
  core: string
  shellAlpha: number
  glyph: "equipment" | "resource" | "investigation"
}

const MARKER_VARIANTS: Record<CanvasMarkerVariant, MarkerVariantSpec> = {
  explore: {
    haloScale: 1,
    shadowScale: 1,
    lineScale: 1,
    orbitScale: 1,
  },
  map: {
    haloScale: 0.92,
    shadowScale: 0.88,
    lineScale: 0.94,
    orbitScale: 0.94,
  },
  mini: {
    haloScale: 0.54,
    shadowScale: 0.32,
    lineScale: 0.72,
    orbitScale: 0.7,
  },
}

// ここはデザインチームが調整する前提の見た目定義です。
// state と kind の対応だけを置き、表示条件やゲームルールは他レイヤへ持ち込みません。
const TRANSMISSION_MARKER_THEMES: Record<TransmissionMarkerState, TransmissionMarkerTheme> = {
  locked: {
    accent: "#7f96af",
    haloRgb: "127, 150, 175",
    core: "#d8e0eb",
    fillAlpha: 0.08,
    orbitAlpha: 0.18,
  },
  available: {
    accent: "#8fdcff",
    haloRgb: "143, 220, 255",
    core: "#f4fbff",
    fillAlpha: 0.12,
    orbitAlpha: 0.24,
  },
  partial: {
    accent: "#d8e7f6",
    haloRgb: "216, 231, 246",
    core: "#ffffff",
    fillAlpha: 0.15,
    orbitAlpha: 0.28,
  },
  complete: {
    accent: "#69d3ff",
    haloRgb: "105, 211, 255",
    core: "#ffffff",
    fillAlpha: 0.18,
    orbitAlpha: 0.34,
  },
}

const COLLECTIBLE_MARKER_THEMES: Record<
  "equipment" | "resource" | "investigation",
  CollectibleMarkerTheme
> = {
  equipment: {
    accent: "#f0c674",
    haloRgb: "240, 198, 116",
    core: "#fff2cc",
    shellAlpha: 0.18,
    glyph: "equipment",
  },
  resource: {
    accent: "#8bf0c0",
    haloRgb: "139, 240, 192",
    core: "#f4fff9",
    shellAlpha: 0.18,
    glyph: "resource",
  },
  investigation: {
    accent: "#b7ecff",
    haloRgb: "183, 236, 255",
    core: "#f7fbff",
    shellAlpha: 0.16,
    glyph: "investigation",
  },
}

export function drawTransmissionMarker(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    size: number
    state: TransmissionMarkerState
    timeMs: number
    variant?: CanvasMarkerVariant
    selected?: boolean
  },
) {
  const variant = MARKER_VARIANTS[input.variant ?? "explore"]
  const theme = TRANSMISSION_MARKER_THEMES[input.state]
  const baseAlpha = ctx.globalAlpha
  const pulse = 0.76 + Math.sin(input.timeMs * 0.004 + input.x * 0.03 + input.y * 0.02) * 0.24
  const orbitRadius = input.size * (1.3 * variant.orbitScale)
  const rotation = input.timeMs * 0.00075
  const satelliteAngle = -rotation * 0.72 + input.x * 0.011
  const satelliteRadius = orbitRadius * 1.34

  ctx.save()

  const haloGradient = ctx.createRadialGradient(
    input.x,
    input.y,
    0,
    input.x,
    input.y,
    input.size * 2.2 * variant.haloScale,
  )
  haloGradient.addColorStop(0, `rgba(${theme.haloRgb}, ${(0.2 * pulse).toFixed(3)})`)
  haloGradient.addColorStop(0.45, `rgba(${theme.haloRgb}, ${(0.08 * pulse).toFixed(3)})`)
  haloGradient.addColorStop(1, `rgba(${theme.haloRgb}, 0)`)
  ctx.globalAlpha = baseAlpha
  ctx.fillStyle = haloGradient
  ctx.beginPath()
  ctx.arc(input.x, input.y, input.size * 2.2 * variant.haloScale, 0, TAU)
  ctx.fill()

  // ── 残響リング (通信マーカーの「電波」感) ──
  // 2 本のリングを 0.5 周期ずらし、常に 1 本は広がりつつあり、
  // もう 1 本は消えゆく形にする。mini では省略。
  if (variant.shadowScale > 0.4) {
    const echoPeriodMs = 2800
    const echoSeed = ((input.x * 0.013 + input.y * 0.011) % 1 + 1) % 1
    for (let e = 0; e < 2; e++) {
      const phase = ((input.timeMs / echoPeriodMs) + echoSeed + e * 0.5) % 1
      const echoR = input.size * (0.9 + phase * 2.1)
      const echoAlpha = (1 - phase) * (1 - phase) * 0.14
      if (echoAlpha < 0.005) continue
      ctx.strokeStyle = `rgba(${theme.haloRgb}, ${echoAlpha.toFixed(3)})`
      ctx.lineWidth = Math.max(0.55, 0.75 * variant.lineScale)
      ctx.beginPath()
      ctx.arc(input.x, input.y, echoR, 0, TAU)
      ctx.stroke()
    }
  }

  ctx.strokeStyle = `rgba(${theme.haloRgb}, ${(theme.orbitAlpha * pulse).toFixed(3)})`
  ctx.lineWidth = Math.max(0.7, 1.05 * variant.lineScale)
  ctx.beginPath()
  ctx.arc(input.x, input.y, orbitRadius, rotation, rotation + Math.PI * 0.62)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(input.x, input.y, orbitRadius, rotation + Math.PI, rotation + Math.PI + Math.PI * 0.48)
  ctx.stroke()

  ctx.strokeStyle = `rgba(${theme.haloRgb}, ${(theme.orbitAlpha * 0.8).toFixed(3)})`
  ctx.lineWidth = Math.max(0.55, 0.8 * variant.lineScale)
  ctx.beginPath()
  ctx.arc(input.x, input.y, orbitRadius * 0.76, -rotation * 0.85, -rotation * 0.85 + Math.PI * 0.44)
  ctx.stroke()

  if (variant.shadowScale > 0.4) {
    const sx = input.x + Math.cos(satelliteAngle) * satelliteRadius
    const sy = input.y + Math.sin(satelliteAngle) * satelliteRadius
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(satelliteAngle + Math.PI / 2)
    ctx.strokeStyle = `rgba(${theme.haloRgb}, ${(0.34 * pulse).toFixed(3)})`
    ctx.fillStyle = `rgba(${theme.haloRgb}, ${(0.12 * pulse).toFixed(3)})`
    ctx.lineWidth = Math.max(0.55, 0.72 * variant.lineScale)
    ctx.beginPath()
    ctx.moveTo(0, -input.size * 0.28)
    ctx.lineTo(input.size * 0.22, 0)
    ctx.lineTo(0, input.size * 0.28)
    ctx.lineTo(-input.size * 0.22, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-input.size * 0.45, 0)
    ctx.lineTo(-input.size * 0.24, 0)
    ctx.moveTo(input.size * 0.24, 0)
    ctx.lineTo(input.size * 0.45, 0)
    ctx.stroke()
    ctx.restore()
  }

  if (variant.shadowScale > 0.01) {
    ctx.shadowColor = `rgba(${theme.haloRgb}, ${(0.7 * variant.shadowScale).toFixed(3)})`
    ctx.shadowBlur = 14 * variant.shadowScale
  }

  ctx.globalAlpha = baseAlpha
  ctx.fillStyle = `rgba(247, 251, 255, ${theme.fillAlpha.toFixed(3)})`
  drawDiamondPath(ctx, input.x, input.y, input.size)
  ctx.fill()

  ctx.strokeStyle = theme.accent
  ctx.lineWidth = Math.max(0.9, 1.35 * variant.lineScale)
  drawDiamondPath(ctx, input.x, input.y, input.size)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = "rgba(247, 251, 255, 0.82)"
  ctx.lineWidth = Math.max(0.7, 0.9 * variant.lineScale)
  drawDiamondPath(ctx, input.x, input.y, input.size * 0.56)
  ctx.stroke()

  ctx.fillStyle = theme.core
  ctx.globalAlpha = baseAlpha * pulse
  ctx.beginPath()
  ctx.arc(input.x, input.y, Math.max(1.3, input.size * 0.18), 0, TAU)
  ctx.fill()

  if (input.selected) {
    ctx.globalAlpha = baseAlpha
    ctx.strokeStyle = "rgba(247, 251, 255, 0.72)"
    ctx.lineWidth = Math.max(0.9, 1.25 * variant.lineScale)
    ctx.beginPath()
    ctx.arc(input.x, input.y, input.size * 1.75, 0, TAU)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawCollectibleMarker(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    size: number
    kind: CollectibleMarkerKind
    timeMs: number
    variant?: CanvasMarkerVariant
    selected?: boolean
  },
) {
  const variant = MARKER_VARIANTS[input.variant ?? "explore"]
  const canonicalKind = resolveCollectibleMarkerKind(input.kind)
  const theme = COLLECTIBLE_MARKER_THEMES[canonicalKind]
  const baseAlpha = ctx.globalAlpha
  const pulse = 0.78 + Math.sin(input.timeMs * 0.0036 + input.x * 0.015 + input.y * 0.025) * 0.22
  const orbitAngle = input.timeMs * 0.001

  ctx.save()
  const haloGradient = ctx.createRadialGradient(
    input.x,
    input.y,
    0,
    input.x,
    input.y,
    input.size * 2.35 * variant.haloScale,
  )
  haloGradient.addColorStop(0, `rgba(${theme.haloRgb}, ${(0.18 * pulse).toFixed(3)})`)
  haloGradient.addColorStop(0.52, `rgba(${theme.haloRgb}, ${(0.06 * pulse).toFixed(3)})`)
  haloGradient.addColorStop(1, `rgba(${theme.haloRgb}, 0)`)
  ctx.fillStyle = haloGradient
  ctx.beginPath()
  ctx.arc(input.x, input.y, input.size * 2.35 * variant.haloScale, 0, TAU)
  ctx.fill()

  ctx.strokeStyle = `rgba(${theme.haloRgb}, ${(0.28 * pulse).toFixed(3)})`
  ctx.lineWidth = Math.max(0.65, 0.95 * variant.lineScale)
  ctx.beginPath()
  ctx.arc(input.x, input.y, input.size * 1.35 * variant.orbitScale, orbitAngle, orbitAngle + Math.PI * 0.58)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(
    input.x,
    input.y,
    input.size * 1.35 * variant.orbitScale,
    orbitAngle + Math.PI,
    orbitAngle + Math.PI + Math.PI * 0.42,
  )
  ctx.stroke()

  // ── 漂うモート (崩壊都市の塵・信号ノイズの可視化) ──
  // 位置座標ハッシュをシードに、周回する 3 粒の微光。マーカーごとに
  // 位相がずれるため密集しても整列しない。mini では省略。
  if (variant.shadowScale > 0.4) {
    for (let i = 0; i < 3; i++) {
      const seed = input.x * 0.031 + input.y * 0.027 + i * 2.1
      const orbitDir = i % 2 === 0 ? 1 : -1
      const baseR = input.size * (1.45 + Math.sin(input.timeMs * 0.0008 + seed * 3.1) * 0.3)
      const angle = input.timeMs * 0.00038 * orbitDir + seed
      const mx = input.x + Math.cos(angle) * baseR
      const my = input.y + Math.sin(angle) * baseR
      const life = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(input.timeMs * 0.0016 + seed * 5.2))
      ctx.fillStyle = `rgba(${theme.haloRgb}, ${(0.3 * life * pulse).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(mx, my, 0.75, 0, TAU)
      ctx.fill()
    }
  }

  if (variant.shadowScale > 0.01) {
    ctx.shadowColor = `rgba(${theme.haloRgb}, ${(0.7 * variant.shadowScale).toFixed(3)})`
    ctx.shadowBlur = 12 * variant.shadowScale
  }

  ctx.fillStyle = `rgba(${theme.haloRgb}, ${(theme.shellAlpha * pulse).toFixed(3)})`
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = Math.max(0.85, 1.25 * variant.lineScale)
  drawCollectibleShell(ctx, theme.glyph, input.x, input.y, input.size)
  ctx.fill()
  drawCollectibleShell(ctx, theme.glyph, input.x, input.y, input.size)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = "rgba(247, 251, 255, 0.9)"
  ctx.fillStyle = theme.core
  drawCollectibleGlyph(ctx, theme.glyph, input.x, input.y, input.size, variant.lineScale)

  if (input.selected) {
    ctx.strokeStyle = "rgba(247, 251, 255, 0.68)"
    ctx.lineWidth = Math.max(0.9, 1.15 * variant.lineScale)
    ctx.beginPath()
    ctx.arc(input.x, input.y, input.size * 1.85, 0, TAU)
    ctx.stroke()
  }

  ctx.restore()
  ctx.globalAlpha = baseAlpha
}

function resolveCollectibleMarkerKind(
  kind: CollectibleMarkerKind,
): "equipment" | "resource" | "investigation" {
  if (kind === "hiddenEquipment") {
    return "equipment"
  }
  if (kind === "selfRepairPoints") {
    return "resource"
  }
  return kind
}

function drawCollectibleShell(
  ctx: CanvasRenderingContext2D,
  glyph: CollectibleMarkerTheme["glyph"],
  x: number,
  y: number,
  size: number,
) {
  switch (glyph) {
    case "equipment":
      ctx.beginPath()
      ctx.moveTo(x, y - size)
      ctx.lineTo(x + size * 0.82, y - size * 0.18)
      ctx.lineTo(x + size * 0.62, y + size * 0.92)
      ctx.lineTo(x - size * 0.62, y + size * 0.92)
      ctx.lineTo(x - size * 0.82, y - size * 0.18)
      ctx.closePath()
      return
    case "resource":
      ctx.beginPath()
      ctx.arc(x, y, size * 0.9, 0, TAU)
      return
    case "investigation":
      ctx.beginPath()
      ctx.moveTo(x - size * 0.68, y - size * 0.9)
      ctx.lineTo(x + size * 0.48, y - size * 0.9)
      ctx.lineTo(x + size * 0.92, y - size * 0.48)
      ctx.lineTo(x + size * 0.92, y + size * 0.9)
      ctx.lineTo(x - size * 0.68, y + size * 0.9)
      ctx.closePath()
      return
  }
}

function drawCollectibleGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: CollectibleMarkerTheme["glyph"],
  x: number,
  y: number,
  size: number,
  lineScale: number,
) {
  switch (glyph) {
    case "equipment": {
      ctx.beginPath()
      ctx.moveTo(x - size * 0.38, y - size * 0.1)
      ctx.lineTo(x + size * 0.38, y - size * 0.1)
      ctx.lineTo(x + size * 0.22, y + size * 0.38)
      ctx.lineTo(x - size * 0.22, y + size * 0.38)
      ctx.closePath()
      ctx.fill()

      ctx.lineWidth = Math.max(0.7, 0.95 * lineScale)
      ctx.beginPath()
      ctx.moveTo(x - size * 0.18, y - size * 0.52)
      ctx.lineTo(x + size * 0.18, y - size * 0.52)
      ctx.stroke()
      return
    }
    case "resource": {
      const innerRadius = size * 0.2
      ctx.beginPath()
      ctx.arc(x, y, innerRadius, 0, TAU)
      ctx.fill()

      ctx.lineWidth = Math.max(0.7, 0.95 * lineScale)
      ctx.beginPath()
      ctx.arc(x, y, size * 0.46, -Math.PI * 0.18, Math.PI * 1.18)
      ctx.moveTo(x + size * 0.52, y)
      ctx.lineTo(x + size * 0.72, y)
      ctx.moveTo(x - size * 0.52, y)
      ctx.lineTo(x - size * 0.72, y)
      ctx.stroke()
      return
    }
    case "investigation": {
      ctx.lineWidth = Math.max(0.7, 0.95 * lineScale)
      ctx.beginPath()
      ctx.moveTo(x - size * 0.2, y - size * 0.9)
      ctx.lineTo(x + size * 0.48, y - size * 0.9)
      ctx.lineTo(x + size * 0.48, y - size * 0.2)
      ctx.stroke()

      for (let index = 0; index < 3; index += 1) {
        const lineY = y - size * 0.3 + index * size * 0.35
        ctx.beginPath()
        ctx.moveTo(x - size * 0.28, lineY)
        ctx.lineTo(x + size * 0.36, lineY)
        ctx.stroke()
      }
      return
    }
  }
}

function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x, y - radius)
  ctx.lineTo(x + radius * PHI_INV, y)
  ctx.lineTo(x, y + radius)
  ctx.lineTo(x - radius * PHI_INV, y)
  ctx.closePath()
}

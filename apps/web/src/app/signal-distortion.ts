import { clamp01, tokenRgba, visualToken } from "@/app/visual-tokens"
import { hashString, seededUnit, timeBucket, type VisualSeedInput } from "@/app/visual-seed"

export type SignalDistortionDomain = "subtitle" | "hazard" | "transition" | "archive" | "title"
export type SignalDistortionMask = "line" | "block" | "slice" | "noise"
export type SignalDistortionSeverity = 0 | 1 | 2 | 3

export type SignalDistortionInput = {
  seed: VisualSeedInput
  rect: { x: number; y: number; width: number; height: number }
  timeMs: number
  severity: SignalDistortionSeverity
  domain: SignalDistortionDomain
  cadenceMs: number
  chroma: 0 | 1 | 2
  mask: SignalDistortionMask
  reduceFlashing: boolean
  phaseAlpha?: number
}

export type TextSignalDistortionInput = {
  seed: string
  index: number
  severity: number
  reduceFlashing: boolean
}

export type TextSignalDistortionResult = {
  visible: boolean
  replacement: string
  hardMask: boolean
}

export type TitleSignalGlitchChannel = "r" | "c"

export type TitleSignalDistortionFrame = {
  top: number
  bottom: number
  left: number
  right: number
  shift: number
  skew: number
  scale: number
  opacity: number
}

export type TitleSignalDistortionInput = {
  seed: VisualSeedInput
  severity: SignalDistortionSeverity
  reduceFlashing: boolean
}

export type TitleSignalDistortionResult = Record<TitleSignalGlitchChannel, TitleSignalDistortionFrame>

const SIGNAL_LOSS_GLYPHS = ["…", "▧", "░", "ノ", "ヰ", "�"] as const

export function drawSignalDistortion(
  ctx: CanvasRenderingContext2D,
  input: SignalDistortionInput,
): void {
  const { x, y, width, height } = input.rect
  const phaseAlpha = clamp01(input.phaseAlpha ?? 1)
  const severityFactor = input.severity / 3
  const frame = input.reduceFlashing ? 0 : timeBucket(input.timeMs, input.cadenceMs)
  const seedBase = typeof input.seed === "number" ? input.seed : hashString(input.seed)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()

  drawBaseNoiseFog(ctx, { x, y, width, height, phaseAlpha, severityFactor, domain: input.domain })
  drawDesyncSlices(ctx, {
    x,
    y,
    width,
    height,
    phaseAlpha,
    severityFactor,
    seedBase,
    frame,
    reduceFlashing: input.reduceFlashing,
    mask: input.mask,
  })
  drawSparsePacketNoise(ctx, {
    x,
    y,
    width,
    height,
    phaseAlpha,
    severityFactor,
    seedBase,
    frame,
    reduceFlashing: input.reduceFlashing,
  })

  ctx.restore()
  drawSignalWarningRim(ctx, {
    x,
    y,
    width,
    height,
    phaseAlpha,
    timeMs: input.timeMs,
    reduceFlashing: input.reduceFlashing,
    domain: input.domain,
  })
}

export function resolveTextSignalDistortion(input: TextSignalDistortionInput): TextSignalDistortionResult {
  const roll = seededUnit(`${input.seed}:${input.index}`)
  const threshold = 0.12 + clamp01(input.severity) * 0.74
  if (roll > threshold) {
    return { visible: false, replacement: "", hardMask: false }
  }

  const hardMask = input.reduceFlashing || roll < input.severity * 0.5
  const replacement = hardMask
    ? "█"
    : roll < input.severity * 0.74
      ? "░"
      : SIGNAL_LOSS_GLYPHS[
          Math.floor(seededUnit(`${input.seed}:glyph:${input.index}`) * SIGNAL_LOSS_GLYPHS.length) %
            SIGNAL_LOSS_GLYPHS.length
        ]

  return { visible: true, replacement, hardMask }
}

export function resolveTitleSignalDistortion(input: TitleSignalDistortionInput): TitleSignalDistortionResult {
  if (input.reduceFlashing || input.severity === 0) {
    return { r: hiddenTitleSignalFrame(), c: hiddenTitleSignalFrame() }
  }

  // タイトルも SignalDistortion の title domain と同じ seed 規則で解決し、CSS 側には結果だけ渡します。
  return {
    r: resolveTitleSignalFrame({ seed: `${input.seed}:r`, direction: 1, severity: input.severity }),
    c: resolveTitleSignalFrame({ seed: `${input.seed}:c`, direction: -1, severity: input.severity }),
  }
}

function hiddenTitleSignalFrame(): TitleSignalDistortionFrame {
  return {
    top: 100,
    bottom: 0,
    left: 0,
    right: 0,
    shift: 0,
    skew: 0,
    scale: 1,
    opacity: 0,
  }
}

function resolveTitleSignalFrame(input: {
  seed: VisualSeedInput
  direction: -1 | 1
  severity: SignalDistortionSeverity
}): TitleSignalDistortionFrame {
  const severityFactor = input.severity / 3
  const bandHeight = 8 + seededUnit(`${input.seed}:height`) * (8 + severityFactor * 8)
  const top = seededUnit(`${input.seed}:top`) * Math.max(1, 78 - bandHeight)
  const bottom = 100 - top - bandHeight
  const bandWidth = 10 + seededUnit(`${input.seed}:width`) * (10 + severityFactor * 6)
  const left = seededUnit(`${input.seed}:left`) * Math.max(1, 100 - bandWidth)
  const right = 100 - left - bandWidth
  const shiftBase = 6 + seededUnit(`${input.seed}:shift`) * (4 + severityFactor * 4)

  return {
    top,
    bottom,
    left,
    right,
    shift: input.direction * shiftBase * (0.75 + seededUnit(`${input.seed}:shiftGain`) * 0.5),
    skew: input.direction * (0.4 + seededUnit(`${input.seed}:skew`) * (0.8 + severityFactor * 0.6)),
    scale: 1 + seededUnit(`${input.seed}:scale`) * 0.02,
    opacity: 0.26 + seededUnit(`${input.seed}:opacity`) * (0.24 + severityFactor * 0.12),
  }
}

function drawBaseNoiseFog(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    phaseAlpha: number
    severityFactor: number
    domain: SignalDistortionDomain
  },
): void {
  const fogAlpha = (0.1 + input.severityFactor * 0.18) * input.phaseAlpha
  const feather = input.domain === "hazard" ? 30 : 14

  ctx.fillStyle = tokenRgba("void", fogAlpha)
  ctx.fillRect(input.x + feather * 0.2, input.y + feather * 0.2, input.width - feather * 0.4, input.height - feather * 0.4)

  const dangerWash = ctx.createLinearGradient(input.x, input.y, input.x + input.width, input.y + input.height)
  dangerWash.addColorStop(0, tokenRgba("danger", 0))
  dangerWash.addColorStop(0.5, tokenRgba("danger", fogAlpha * 0.42))
  dangerWash.addColorStop(1, tokenRgba("danger", 0))
  ctx.fillStyle = dangerWash
  ctx.fillRect(input.x, input.y, input.width, input.height)
}

function drawDesyncSlices(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    phaseAlpha: number
    severityFactor: number
    seedBase: number
    frame: number
    reduceFlashing: boolean
    mask: SignalDistortionMask
  },
): void {
  const sliceCount = input.mask === "block" ? 2 : 3 + Math.floor(input.severityFactor * 3)
  const alphaBase = input.reduceFlashing ? 0.08 : 0.1 + input.severityFactor * 0.12

  for (let index = 0; index < sliceCount; index += 1) {
    const seed = input.seedBase + input.frame * 97 + index * 41
    const sliceY = input.y + seededUnit(seed + 1) * input.height
    const sliceH = 1 + seededUnit(seed + 2) * (3 + input.severityFactor * 5)
    const shift = input.reduceFlashing ? 0 : (seededUnit(seed + 3) - 0.5) * 14 * input.severityFactor
    ctx.fillStyle = tokenRgba("danger", alphaBase * input.phaseAlpha)
    ctx.fillRect(input.x + shift, sliceY, input.width, sliceH)

    if (input.mask === "block" && index < 2) {
      const blockW = input.width * (0.12 + seededUnit(seed + 4) * 0.26)
      const blockX = input.x + seededUnit(seed + 5) * (input.width - blockW)
      ctx.fillStyle = tokenRgba("void", (0.18 + input.severityFactor * 0.18) * input.phaseAlpha)
      ctx.fillRect(blockX, sliceY + sliceH + 3, blockW, 4 + seededUnit(seed + 6) * 10)
    }
  }
}

function drawSparsePacketNoise(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    phaseAlpha: number
    severityFactor: number
    seedBase: number
    frame: number
    reduceFlashing: boolean
  },
): void {
  const count = Math.max(8, Math.floor((input.width * input.height) / 2400))
  ctx.fillStyle = tokenRgba("danger", (0.06 + input.severityFactor * 0.06) * input.phaseAlpha)
  for (let index = 0; index < count; index += 1) {
    const seed = input.seedBase + index * 59 + input.frame * (input.reduceFlashing ? 0 : 17)
    const px = input.x + seededUnit(seed + 1) * input.width
    const py = input.y + seededUnit(seed + 2) * input.height
    const width = 1 + seededUnit(seed + 3) * 4
    const height = 1 + seededUnit(seed + 4) * 2
    ctx.fillRect(px, py, width, height)
  }
}

function drawSignalWarningRim(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    phaseAlpha: number
    timeMs: number
    reduceFlashing: boolean
    domain: SignalDistortionDomain
  },
): void {
  const pulse = input.reduceFlashing ? 0.72 : 0.64 + 0.18 * Math.sin(input.timeMs * 0.003)
  const alpha = (input.domain === "hazard" ? 0.32 : 0.2) * input.phaseAlpha * pulse

  ctx.save()
  ctx.strokeStyle = tokenRgba("danger", alpha)
  ctx.lineWidth = visualToken.stroke.regular
  ctx.setLineDash([10, 8])
  ctx.lineDashOffset = input.reduceFlashing ? 0 : -input.timeMs * 0.026
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.setLineDash([])
  ctx.restore()
}

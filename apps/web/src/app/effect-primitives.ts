import { clamp01, tokenRgba, visualToken, type VisualRgbRole } from "@/app/visual-tokens"
import { hashString, seededRange, seededUnit, timeBucket, type VisualSeedInput } from "@/app/visual-seed"
import { drawSignalDistortion } from "@/app/signal-distortion"

const TAU = Math.PI * 2

export type SignalParticleFieldInput = {
  seed: VisualSeedInput
  width: number
  height: number
  timeMs: number
  density: "sparse" | "normal" | "dense"
  depth: "far" | "mid" | "near"
  drift: "still" | "up" | "toward-focus" | "current"
  colorRole: Extract<VisualRgbRole, "line" | "signal" | "memory">
  reduceMotion: boolean
  alpha?: number
  focus?: { x: number; y: number }
}

export type CarrierLineFieldInput = {
  seed: VisualSeedInput
  width: number
  height: number
  timeMs: number
  orientation: "vertical" | "horizontal" | "radial" | "diagonal"
  density: number
  curvature: number
  alpha: number
  focus?: { x: number; y: number }
  centerQuietRatio?: number
}

export type ScanPulseInput = {
  origin: { x: number; y: number }
  radius: number
  progress: number
  strength: number
  shape: "circle" | "arc" | "diamond" | "line"
  role: "discover" | "connect" | "confirm" | "analyze"
}

export type ScreenVeilTransitionInput = {
  seed: VisualSeedInput
  width: number
  height: number
  timeMs: number
  progress: number
  fromKey: string
  toKey: string
  reduceFlashing: boolean
}

export function drawVoidGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, visualToken.color.void)
  gradient.addColorStop(0.46, visualToken.color.abyss)
  gradient.addColorStop(1, visualToken.color.deep)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

export function drawPeripheralVignette(
  ctx: CanvasRenderingContext2D,
  input: { width: number; height: number; strength?: number },
): void {
  const strength = clamp01(input.strength ?? 0.72)
  const radius = Math.max(input.width, input.height) * 0.7
  const gradient = ctx.createRadialGradient(
    input.width * 0.5,
    input.height * 0.48,
    radius * 0.18,
    input.width * 0.5,
    input.height * 0.5,
    radius,
  )
  gradient.addColorStop(0, tokenRgba("void", 0))
  gradient.addColorStop(0.62, tokenRgba("void", 0.08 * strength))
  gradient.addColorStop(1, tokenRgba("void", 0.78 * strength))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, input.width, input.height)
}

export function drawSignalParticleField(
  ctx: CanvasRenderingContext2D,
  input: SignalParticleFieldInput,
): void {
  const areaScale = Math.max(0.6, Math.min(2.8, (input.width * input.height) / 250000))
  const densityBase = input.density === "dense" ? 54 : input.density === "normal" ? 34 : 18
  const count = Math.round(densityBase * areaScale)
  const depthScale = input.depth === "near" ? 1.4 : input.depth === "mid" ? 1 : 0.68
  const alphaBase = (input.alpha ?? 1) * (input.depth === "near" ? 0.12 : input.depth === "mid" ? 0.09 : 0.06)
  const seedBase = typeof input.seed === "number" ? input.seed : hashString(input.seed)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  for (let index = 0; index < count; index += 1) {
    const seed = seedBase + index * 101
    const speed = input.reduceMotion ? 0 : 0.000018 + seededUnit(seed + 1) * 0.00005
    const travel = (input.timeMs * speed + seededUnit(seed + 2)) % 1
    const xBase = seededUnit(seed + 3) * input.width
    const yBase = seededUnit(seed + 5) * input.height
    const x =
      input.drift === "toward-focus" && input.focus
        ? xBase + (input.focus.x - xBase) * travel * 0.12
        : input.drift === "current"
          ? (xBase + travel * input.width * 0.12) % input.width
          : xBase
    const y =
      input.drift === "up"
        ? (yBase - travel * input.height * 0.22 + input.height) % input.height
        : input.drift === "current"
          ? (yBase + Math.sin(input.timeMs * 0.0006 + seed) * input.height * 0.012) % input.height
          : yBase
    const radius = (0.45 + seededUnit(seed + 7) * 1.2) * depthScale
    const phase = input.reduceMotion ? 0.84 : 0.72 + Math.sin(input.timeMs * 0.001 + seed) * 0.22
    const alpha = alphaBase * (0.5 + seededUnit(seed + 9) * 0.7) * phase

    ctx.fillStyle = tokenRgba(input.colorRole, alpha)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

export function drawCarrierLineField(
  ctx: CanvasRenderingContext2D,
  input: CarrierLineFieldInput,
): void {
  const count = Math.max(2, Math.floor(input.density))
  const seedBase = typeof input.seed === "number" ? input.seed : hashString(input.seed)
  const quietRadius = Math.min(input.width, input.height) * (input.centerQuietRatio ?? 0.32)

  ctx.save()
  ctx.lineWidth = visualToken.stroke.hair
  ctx.lineCap = "round"
  for (let index = 0; index < count; index += 1) {
    const seed = seedBase + index * 73
    const drift = seededRange(seed + 1, -1, 1) * Math.sin(input.timeMs * 0.00018 + seed)
    const alpha = input.alpha * (0.5 + seededUnit(seed + 2) * 0.65)
    ctx.strokeStyle = tokenRgba("line", alpha)
    ctx.beginPath()

    if (input.orientation === "horizontal") {
      const y = seededUnit(seed + 3) * input.height
      const bend = input.curvature * (seededUnit(seed + 4) - 0.5) * input.height
      ctx.moveTo(input.width * 0.06, y + drift * 4)
      ctx.quadraticCurveTo(input.width * 0.5, y + bend, input.width * 0.94, y - drift * 4)
    } else if (input.orientation === "diagonal") {
      const y = seededUnit(seed + 5) * input.height
      const tilt = seededRange(seed + 6, -0.22, 0.22)
      ctx.moveTo(input.width * 0.02, y + drift * 6)
      ctx.lineTo(input.width * 0.98, y + tilt * input.width - drift * 6)
    } else if (input.orientation === "radial") {
      const focus = input.focus ?? { x: input.width * 0.5, y: input.height * 0.5 }
      const angle = seededUnit(seed + 7) * TAU
      const inner = quietRadius * (0.72 + seededUnit(seed + 8) * 0.42)
      const outer = Math.max(input.width, input.height) * (0.5 + seededUnit(seed + 9) * 0.35)
      ctx.moveTo(focus.x + Math.cos(angle) * inner, focus.y + Math.sin(angle) * inner)
      ctx.lineTo(focus.x + Math.cos(angle) * outer, focus.y + Math.sin(angle) * outer)
    } else {
      const x = seededUnit(seed + 10) * input.width
      const focus = input.focus ?? { x: input.width * 0.5, y: input.height * 0.5 }
      const distanceFromFocus = Math.abs(x - focus.x)
      if (distanceFromFocus < quietRadius && seededUnit(seed + 11) < 0.72) {
        continue
      }
      const bend = input.curvature * (seededUnit(seed + 12) - 0.5) * input.width
      ctx.moveTo(x + drift * 3, input.height * 0.04)
      ctx.quadraticCurveTo(x + bend, input.height * 0.5, x - drift * 3, input.height * 0.96)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export function drawSoftBloom(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; radius: number; role: Extract<VisualRgbRole, "signal" | "memory" | "danger">; alpha: number },
): void {
  const gradient = ctx.createRadialGradient(input.x, input.y, 0, input.x, input.y, input.radius)
  gradient.addColorStop(0, tokenRgba(input.role, input.alpha))
  gradient.addColorStop(0.48, tokenRgba(input.role, input.alpha * 0.28))
  gradient.addColorStop(1, tokenRgba(input.role, 0))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(input.x, input.y, input.radius, 0, TAU)
  ctx.fill()
}

export function drawScanPulse(ctx: CanvasRenderingContext2D, input: ScanPulseInput): void {
  const progress = clamp01(input.progress)
  const alpha = (1 - progress) * input.strength
  const lineWidth = visualToken.stroke.thin + (1 - progress) * visualToken.stroke.regular

  ctx.save()
  ctx.strokeStyle = tokenRgba(input.role === "confirm" ? "memory" : "signal", alpha)
  ctx.lineWidth = lineWidth
  ctx.lineCap = "round"
  if (input.shape === "diamond") {
    const r = input.radius
    ctx.beginPath()
    ctx.moveTo(input.origin.x, input.origin.y - r)
    ctx.lineTo(input.origin.x + r, input.origin.y)
    ctx.lineTo(input.origin.x, input.origin.y + r)
    ctx.lineTo(input.origin.x - r, input.origin.y)
    ctx.closePath()
    ctx.stroke()
  } else if (input.shape === "line") {
    ctx.beginPath()
    ctx.moveTo(input.origin.x - input.radius, input.origin.y)
    ctx.lineTo(input.origin.x + input.radius, input.origin.y)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(input.origin.x, input.origin.y, input.radius, Math.PI * 0.08, Math.PI * 1.84)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawScreenVeilTransition(
  ctx: CanvasRenderingContext2D,
  input: ScreenVeilTransitionInput,
): void {
  if (isExploreBattleScreenTransition(input.fromKey, input.toKey)) {
    drawExploreBattleSignalTransition(ctx, input)
    return
  }

  const progress = clamp01(input.progress)
  const seed = typeof input.seed === "number" ? input.seed : hashString(input.seed)
  const close = 1 - Math.abs(progress - 0.5) * 2
  const easedClose = close * close * (3 - 2 * close)
  const reveal = progress * progress * (3 - 2 * progress)
  const bandX = input.width * (0.08 + reveal * 0.84)
  const bandWidth = Math.max(72, input.width * (input.reduceFlashing ? 0.06 : 0.1))

  ctx.save()

  // 画面の切り替え理由を目立たせず、前後の画面を同じ信号面の上で接続します。
  ctx.fillStyle = tokenRgba("void", 0.62 * easedClose)
  ctx.fillRect(0, 0, input.width, input.height)

  const gradient = ctx.createLinearGradient(bandX - bandWidth, 0, bandX + bandWidth, 0)
  gradient.addColorStop(0, tokenRgba("signal", 0))
  gradient.addColorStop(0.48, tokenRgba("signal", input.reduceFlashing ? 0.12 : 0.2))
  gradient.addColorStop(1, tokenRgba("memory", 0))
  ctx.fillStyle = gradient
  ctx.fillRect(bandX - bandWidth, 0, bandWidth * 2, input.height)

  drawCarrierLineField(ctx, {
    seed: seed + hashString(input.fromKey) + hashString(input.toKey),
    width: input.width,
    height: input.height,
    timeMs: input.timeMs,
    orientation: "vertical",
    density: input.reduceFlashing ? 8 : 14,
    curvature: input.reduceFlashing ? 0.04 : 0.08,
    alpha: 0.06 + easedClose * 0.1,
    focus: { x: bandX, y: input.height * 0.5 },
    centerQuietRatio: 0.12,
  })

  drawSignalParticleField(ctx, {
    seed: seed + 271,
    width: input.width,
    height: input.height,
    timeMs: input.timeMs,
    density: input.reduceFlashing ? "sparse" : "normal",
    depth: "far",
    drift: "current",
    colorRole: "line",
    reduceMotion: input.reduceFlashing,
    alpha: 0.6 * easedClose,
    focus: { x: bandX, y: input.height * 0.5 },
  })

  // transition domain の歪みを重ね、hazard/title とは同じ系統だが弱い受信ずれとして扱います。
  drawSignalDistortion(ctx, {
    seed: `transition:${input.fromKey}:${input.toKey}`,
    rect: {
      x: Math.max(0, bandX - bandWidth * 1.2),
      y: 0,
      width: Math.min(input.width, bandWidth * 2.4),
      height: input.height,
    },
    timeMs: input.timeMs,
    severity: input.reduceFlashing ? 1 : 2,
    domain: "transition",
    cadenceMs: input.reduceFlashing ? 480 : 140,
    chroma: input.reduceFlashing ? 0 : 1,
    mask: "slice",
    reduceFlashing: input.reduceFlashing,
    phaseAlpha: easedClose * (input.reduceFlashing ? 0.28 : 0.46),
  })

  ctx.strokeStyle = tokenRgba("memory", 0.18 * easedClose)
  ctx.lineWidth = visualToken.stroke.thin
  ctx.beginPath()
  ctx.moveTo(bandX, input.height * 0.12)
  ctx.lineTo(bandX, input.height * 0.88)
  ctx.stroke()

  ctx.restore()
}

function drawExploreBattleSignalTransition(
  ctx: CanvasRenderingContext2D,
  input: ScreenVeilTransitionInput,
): void {
  const progress = clamp01(input.progress)
  const seed = typeof input.seed === "number" ? input.seed : hashString(input.seed)
  const center = { x: input.width * 0.5, y: input.height * 0.5 }
  const minSize = Math.max(1, Math.min(input.width, input.height))
  const travelToBattle = input.toKey === "battle" ? smoothstep(progress) : smoothstep(1 - progress)
  const coverRelease = smoothstep(clamp01((progress - 0.68) / 0.32))
  const focusStrength = smoothstep(clamp01((travelToBattle - 0.08) / 0.74))
  const scatterStrength = smoothstep(clamp01((travelToBattle - 0.34) / 0.54))
  const coverAlpha = (input.reduceFlashing ? 0.54 : 0.72) * (1 - coverRelease * 0.86)
  const scanRadius = minSize * (0.44 - focusStrength * 0.27)
  const missionRadius = minSize * (0.052 + focusStrength * 0.16)
  const shipStart = {
    x: center.x - minSize * 0.22,
    y: center.y + minSize * 0.18,
  }
  const shipPosition = {
    x: shipStart.x + (center.x - shipStart.x) * focusStrength,
    y: shipStart.y + (center.y - shipStart.y) * focusStrength,
  }

  ctx.save()

  // 画面本体の差し替えを一度暗い信号面で受け、探索と戦闘の断絶を目立たせない。
  ctx.fillStyle = tokenRgba("void", coverAlpha)
  ctx.fillRect(0, 0, input.width, input.height)

  drawCarrierLineField(ctx, {
    seed: seed + 331,
    width: input.width,
    height: input.height,
    timeMs: input.timeMs,
    orientation: "radial",
    density: input.reduceFlashing ? 9 : 18,
    curvature: input.reduceFlashing ? 0.02 : 0.05,
    alpha: 0.08 + focusStrength * 0.12,
    focus: center,
    centerQuietRatio: 0.1,
  })

  drawSignalParticleField(ctx, {
    seed: seed + 619,
    width: input.width,
    height: input.height,
    timeMs: input.timeMs,
    density: input.reduceFlashing ? "sparse" : "dense",
    depth: "mid",
    drift: "toward-focus",
    colorRole: "signal",
    reduceMotion: input.reduceFlashing,
    alpha: 0.56 + focusStrength * 0.26,
    focus: center,
  })

  drawMissionCaptureRings(ctx, {
    center,
    radius: scanRadius,
    minSize,
    progress: focusStrength,
    alpha: input.reduceFlashing ? 0.58 : 0.74,
  })
  drawTransitionPullLines(ctx, {
    center,
    shipPosition,
    radius: scanRadius,
    seed,
    alpha: input.reduceFlashing ? 0.34 : 0.54,
  })

  drawTransitionDiamond(ctx, {
    x: center.x,
    y: center.y,
    radius: missionRadius,
    strokeRole: "signalBright",
    fillRole: "signal",
    alpha: (1 - scatterStrength * 0.72) * 0.78,
    lineWidth: visualToken.stroke.strong,
  })
  drawMissionDiamondFragments(ctx, {
    center,
    radius: missionRadius,
    minSize,
    seed,
    scatterStrength,
    alpha: input.reduceFlashing ? 0.5 : 0.72,
  })
  drawTransitionShipGlyph(ctx, {
    x: shipPosition.x,
    y: shipPosition.y,
    size: minSize * (0.026 + focusStrength * 0.006),
    angle: Math.atan2(center.y - shipStart.y, center.x - shipStart.x),
    alpha: 0.72 + focusStrength * 0.2,
  })

  const bloomRadius = minSize * (0.16 + focusStrength * 0.08)
  const bloom = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, bloomRadius)
  bloom.addColorStop(0, tokenRgba("signalBright", (input.reduceFlashing ? 0.12 : 0.2) * focusStrength))
  bloom.addColorStop(0.62, tokenRgba("signal", 0.08 * focusStrength))
  bloom.addColorStop(1, tokenRgba("signal", 0))
  ctx.fillStyle = bloom
  ctx.beginPath()
  ctx.arc(center.x, center.y, bloomRadius, 0, TAU)
  ctx.fill()

  ctx.restore()
}

function isExploreBattleScreenTransition(fromKey: string, toKey: string): boolean {
  return (fromKey === "explore" && toKey === "battle") || (fromKey === "battle" && toKey === "explore")
}

// ロックリングは菱形アイコンと自機を同じ焦点へ寄せるための視線誘導として描きます。
function drawMissionCaptureRings(
  ctx: CanvasRenderingContext2D,
  input: { center: { x: number; y: number }; radius: number; minSize: number; progress: number; alpha: number },
): void {
  const ringAlpha = input.alpha * (0.42 + input.progress * 0.38)

  ctx.save()
  ctx.lineWidth = visualToken.stroke.thin
  ctx.strokeStyle = tokenRgba("line", ringAlpha)
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, input.radius, Math.PI * 0.12, Math.PI * 1.88)
  ctx.stroke()

  ctx.strokeStyle = tokenRgba("signal", ringAlpha * 0.76)
  ctx.lineWidth = visualToken.stroke.regular
  ctx.beginPath()
  ctx.arc(input.center.x, input.center.y, input.radius * 0.62, Math.PI * 0.7, Math.PI * 2.22)
  ctx.stroke()

  const bracketRadius = input.radius * (0.72 - input.progress * 0.26)
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI * 0.25 + index * (TAU / 4)
    const x = input.center.x + Math.cos(angle) * bracketRadius
    const y = input.center.y + Math.sin(angle) * bracketRadius
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle + Math.PI * 0.5)
    ctx.strokeStyle = tokenRgba("signalBright", ringAlpha * 0.72)
    ctx.lineWidth = visualToken.stroke.thin
    ctx.beginPath()
    ctx.moveTo(-input.minSize * 0.025, 0)
    ctx.lineTo(input.minSize * 0.025, 0)
    ctx.stroke()
    ctx.restore()
  }

  ctx.restore()
}

// 吸い込み方向を線で示し、画面差し替えではなくミッション接続に見えるようにします。
function drawTransitionPullLines(
  ctx: CanvasRenderingContext2D,
  input: {
    center: { x: number; y: number }
    shipPosition: { x: number; y: number }
    radius: number
    seed: number
    alpha: number
  },
): void {
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineWidth = visualToken.stroke.thin
  for (let index = 0; index < 7; index += 1) {
    const seed = input.seed + index * 47
    const angle = seededUnit(seed) * TAU
    const spread = input.radius * (0.74 + seededUnit(seed + 1) * 0.32)
    const x = input.center.x + Math.cos(angle) * spread
    const y = input.center.y + Math.sin(angle) * spread
    ctx.strokeStyle = tokenRgba(index % 2 === 0 ? "line" : "signal", input.alpha * (0.34 + seededUnit(seed + 2) * 0.5))
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      (x + input.shipPosition.x) * 0.5,
      (y + input.shipPosition.y) * 0.5,
      input.center.x,
      input.center.y,
    )
    ctx.stroke()
  }
  ctx.restore()
}

// 菱形アイコンの破片は deterministic seed で固定し、スクリーンショット比較で揺れないようにします。
function drawMissionDiamondFragments(
  ctx: CanvasRenderingContext2D,
  input: {
    center: { x: number; y: number }
    radius: number
    minSize: number
    seed: number
    scatterStrength: number
    alpha: number
  },
): void {
  for (let index = 0; index < 9; index += 1) {
    const seed = input.seed + index * 83
    const angle = index * (TAU / 9) + seededRange(seed, -0.18, 0.18)
    const distance = input.minSize * (0.035 + seededUnit(seed + 1) * 0.15) * input.scatterStrength
    const x = input.center.x + Math.cos(angle) * distance
    const y = input.center.y + Math.sin(angle) * distance
    const radius = input.radius * (0.12 + seededUnit(seed + 2) * 0.12)
    drawTransitionDiamond(ctx, {
      x,
      y,
      radius,
      strokeRole: "signalBright",
      fillRole: "signal",
      alpha: input.alpha * input.scatterStrength * (0.5 + seededUnit(seed + 3) * 0.38),
      lineWidth: visualToken.stroke.thin,
    })
  }
}

function drawTransitionDiamond(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    radius: number
    strokeRole: VisualRgbRole
    fillRole: VisualRgbRole
    alpha: number
    lineWidth: number
  },
): void {
  if (input.alpha <= 0.01 || input.radius <= 0) {
    return
  }

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = tokenRgba(input.strokeRole, input.alpha)
  ctx.fillStyle = tokenRgba(input.fillRole, input.alpha * 0.16)
  ctx.lineWidth = input.lineWidth
  ctx.beginPath()
  ctx.moveTo(input.x, input.y - input.radius)
  ctx.lineTo(input.x + input.radius * 0.72, input.y)
  ctx.lineTo(input.x, input.y + input.radius)
  ctx.lineTo(input.x - input.radius * 0.72, input.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawTransitionShipGlyph(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; size: number; angle: number; alpha: number },
): void {
  ctx.save()
  ctx.translate(input.x, input.y)
  ctx.rotate(input.angle + Math.PI * 0.5)
  ctx.globalCompositeOperation = "lighter"
  ctx.shadowColor = tokenRgba("signal", input.alpha * 0.8)
  ctx.shadowBlur = input.size * 1.3
  ctx.fillStyle = tokenRgba("signalBright", input.alpha)
  ctx.strokeStyle = tokenRgba("signal", input.alpha * 0.88)
  ctx.lineWidth = visualToken.stroke.thin
  ctx.beginPath()
  ctx.moveTo(0, -input.size * 1.25)
  ctx.lineTo(input.size * 0.72, input.size * 0.84)
  ctx.lineTo(0, input.size * 0.48)
  ctx.lineTo(-input.size * 0.72, input.size * 0.84)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function smoothstep(value: number): number {
  const clamped = clamp01(value)
  return clamped * clamped * (3 - 2 * clamped)
}

export function drawFocusBracket(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; progress?: number },
): void {
  const inset = 6
  const length = 14
  const alpha = 0.38 + clamp01(input.progress ?? 1) * 0.32

  ctx.save()
  ctx.strokeStyle = tokenRgba("signal", alpha)
  ctx.lineWidth = visualToken.stroke.thin
  ctx.beginPath()
  ctx.moveTo(input.x - inset, input.y + length)
  ctx.lineTo(input.x - inset, input.y - inset)
  ctx.lineTo(input.x + length, input.y - inset)
  ctx.moveTo(input.x + input.width - length, input.y + input.height + inset)
  ctx.lineTo(input.x + input.width + inset, input.y + input.height + inset)
  ctx.lineTo(input.x + input.width + inset, input.y + input.height - length)
  ctx.stroke()
  ctx.restore()
}

export function drawFragmentGlyph(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; size: number; timeMs: number; seed: VisualSeedInput; alpha?: number },
): void {
  const seed = typeof input.seed === "number" ? input.seed : hashString(input.seed)
  const spin = (seededUnit(seed) - 0.5) * 0.5 + input.timeMs * 0.00028
  const alpha = input.alpha ?? 0.78

  ctx.save()
  ctx.translate(input.x, input.y)
  ctx.rotate(spin)
  ctx.strokeStyle = tokenRgba("line", alpha * 0.72)
  ctx.fillStyle = tokenRgba("memory", alpha * 0.12)
  ctx.lineWidth = visualToken.stroke.thin
  ctx.beginPath()
  ctx.moveTo(0, -input.size)
  ctx.lineTo(input.size * 0.72, 0)
  ctx.lineTo(0, input.size)
  ctx.lineTo(-input.size * 0.72, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function drawMetricMeter(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; value: number; role?: "signal" | "memory" | "danger" },
): void {
  const value = clamp01(input.value)
  const role = input.role ?? "signal"
  const tickCount = 7
  const gap = 3
  const tickWidth = (input.width - gap * (tickCount - 1)) / tickCount

  ctx.save()
  for (let index = 0; index < tickCount; index += 1) {
    const filled = index / (tickCount - 1) <= value
    ctx.fillStyle = tokenRgba(filled ? role : "line", filled ? 0.52 : 0.12)
    ctx.fillRect(input.x + index * (tickWidth + gap), input.y, tickWidth, input.height)
  }
  ctx.restore()
}

export function drawResidualTrail(
  ctx: CanvasRenderingContext2D,
  input: {
    points: Array<{ x: number; y: number; ageRatio: number }>
    role: Extract<VisualRgbRole, "signal" | "memory" | "line">
    width: number
    alpha?: number
  },
): void {
  if (input.points.length < 2) {
    return
  }

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (let index = 0; index < input.points.length - 1; index += 1) {
    const point = input.points[index]
    const next = input.points[index + 1]
    const age = clamp01(point.ageRatio)
    const alpha = (input.alpha ?? 1) * (1 - age) * (1 - age)
    if (alpha <= 0.01) {
      continue
    }
    ctx.strokeStyle = tokenRgba(input.role, alpha * 0.42)
    ctx.lineWidth = input.width * (0.25 + (1 - age) * 0.75)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
  }
  ctx.restore()
}

export function quantizedVisualFrame(timeMs: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : timeBucket(timeMs, 180)
}

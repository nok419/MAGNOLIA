import { hex, rgba } from "@/render/shared/canvas-palette"
import type { KeyVisualExportElements, KeyVisualVariant } from "./key-visual-types"

const TAU = Math.PI * 2

type KeyVisualExportSize = {
  width: number
  height: number
}

export function exportKeyVisualPng(elements: KeyVisualExportElements, variant: KeyVisualVariant): void {
  const isWindowed = variant === "windowed"
  const { width, height } = getKeyVisualExportSize(variant)
  const outputCanvas = document.createElement("canvas")
  outputCanvas.width = width
  outputCanvas.height = height

  const context = outputCanvas.getContext("2d")
  if (!context) return

  drawKeyVisualPosterComposition(context, elements, { width, height }, isWindowed)
  downloadCanvasAsPng(outputCanvas, isWindowed ? "magnolia-key-visual-500.png" : "magnolia-key-visual.png")
}

export function getKeyVisualExportSize(variant: KeyVisualVariant): KeyVisualExportSize {
  return variant === "windowed"
    ? { width: 500, height: 500 }
    : { width: 1440, height: 1560 }
}

function drawKeyVisualPosterComposition(
  context: CanvasRenderingContext2D,
  elements: KeyVisualExportElements,
  size: KeyVisualExportSize,
  isWindowed: boolean,
): void {
  const { width, height } = size

  // DOM 表示と PNG 書き出しの構図をそろえるため、Modal の CSS overlay を Canvas2D で再現します。
  context.fillStyle = hex("voidBase")
  context.fillRect(0, 0, width, height)
  context.drawImage(elements.backdropCanvas, 0, 0, width, height)
  drawScanlines(context, width, height, isWindowed)
  context.drawImage(elements.battleCanvas, 0, 0, width, height)
  drawBarrierInterceptProjectile(context, width, height, isWindowed)
  drawVignette(context, width, height, isWindowed)
  drawLowerOverlay(context, width, height, isWindowed)
  drawLogo(context, width, height, isWindowed)
  drawLogoAccent(context, width, height, isWindowed)
  drawTagline(context, width, height, isWindowed)
}

function drawScanlines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  context.fillStyle = rgba("signalPrimary", 0.03)
  const scanGap = isWindowed ? 4 : 6
  for (let y = 0; y < height; y += scanGap) {
    context.fillRect(0, y + Math.floor(scanGap / 2), width, Math.floor(scanGap / 2))
  }
}

function drawBarrierInterceptProjectile(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const gamePlayerY = isWindowed ? 345 : 295
  const scaleX = width / 480
  const scaleY = height / 520
  const bulletAngle = -Math.PI / 2 + 0.35
  const bulletDistance = 33
  const bulletX = (240 + Math.cos(bulletAngle) * bulletDistance) * scaleX
  const bulletY = (gamePlayerY + Math.sin(bulletAngle) * bulletDistance) * scaleY
  const bulletRadius = 7 * Math.min(scaleX, scaleY)

  // バリアに消される直前の弾を PNG 側にも足し、表示 canvas と書き出しの印象を合わせます。
  context.globalAlpha = 0.12
  context.fillStyle = hslColor(32, 78, 68)
  context.beginPath()
  context.arc(bulletX, bulletY, bulletRadius * 2.2, 0, TAU)
  context.fill()

  context.globalAlpha = 0.3
  context.strokeStyle = hslColor(32, 65, 78)
  context.lineWidth = Math.max(0.7, bulletRadius * 0.1)
  context.beginPath()
  context.arc(bulletX, bulletY, bulletRadius * 1.2, 0, Math.PI * 1.3)
  context.stroke()

  context.globalAlpha = 0.5
  context.fillStyle = hslColor(32, 82, 76)
  context.beginPath()
  context.arc(bulletX, bulletY, bulletRadius * 0.6, 0, TAU)
  context.fill()

  context.globalAlpha = 0.9
  context.fillStyle = hslColor(40, 40, 96)
  context.beginPath()
  context.arc(bulletX, bulletY, bulletRadius * 0.2, 0, TAU)
  context.fill()
  context.globalAlpha = 1
}

function drawVignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const centerY = height * (isWindowed ? 0.4 : 0.38)
  const gradient = context.createRadialGradient(width * 0.5, centerY, width * 0.22, width * 0.5, centerY, width * 0.65)
  gradient.addColorStop(0, transparentBlack(0))
  gradient.addColorStop(1, transparentBlack(0.5))
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawLowerOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const overlayTop = height * (isWindowed ? 0.5 : 0.52)
  const gradient = context.createLinearGradient(0, overlayTop, 0, height)
  gradient.addColorStop(0, rgbaFromRgb([0, 5, 12], 0))
  gradient.addColorStop(0.25, rgbaFromRgb([0, 5, 12], 0.08))
  gradient.addColorStop(0.67, rgbaFromRgb([0, 5, 12], 0.35))
  gradient.addColorStop(1, rgbaFromRgb([0, 5, 12], 0.82))
  context.fillStyle = gradient
  context.fillRect(0, overlayTop, width, height - overlayTop)
}

function drawLogo(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const { logoSize, logoY } = getLogoMetrics(width, height, isWindowed)
  context.save()
  setLogoFont(context, logoSize)
  context.shadowColor = rgba("signalPrimary", 0.7)
  context.shadowBlur = isWindowed ? 16 : 40
  context.fillStyle = hex("signalReadable")
  context.fillText("MAGNOLIA", width / 2, logoY)
  context.shadowColor = rgba("signalPrimary", 0.4)
  context.shadowBlur = isWindowed ? 32 : 80
  context.fillText("MAGNOLIA", width / 2, logoY)
  context.shadowBlur = 0
  context.shadowColor = "transparent"
  context.fillText("MAGNOLIA", width / 2, logoY)
  context.restore()

  drawLogoGlitchBand(context, width, logoY, logoSize, isWindowed, "red")
  drawLogoGlitchBand(context, width, logoY, logoSize, isWindowed, "cyan")
}

function drawLogoGlitchBand(
  context: CanvasRenderingContext2D,
  width: number,
  logoY: number,
  logoSize: number,
  isWindowed: boolean,
  channel: "red" | "cyan",
): void {
  const glitchShift = isWindowed ? 3 : 7
  const glitchSkewDeg = channel === "red" ? 2 : -2
  const bandStartRatio = channel === "red" ? 0.22 : 0.58
  const shift = channel === "red" ? glitchShift : -glitchShift
  const fill = channel === "red" ? rgbaFromRgb([255, 100, 140], 0.85) : rgbaFromRgb([80, 210, 255], 0.85)
  const glow = channel === "red" ? rgbaFromRgb([255, 0, 80], 0.6) : rgbaFromRgb([0, 255, 255], 0.6)

  context.save()
  setLogoFont(context, logoSize)
  context.beginPath()
  context.rect(0, logoY - logoSize * 0.78 + logoSize * bandStartRatio, width, logoSize * 0.2)
  context.clip()
  context.globalAlpha = 0.8
  context.fillStyle = fill
  context.shadowColor = glow
  context.shadowBlur = isWindowed ? 4 : 8
  context.setTransform(1, 0, Math.tan(glitchSkewDeg * Math.PI / 180), 1, shift, 0)
  context.fillText("MAGNOLIA", width / 2, logoY)
  context.restore()
}

function drawLogoAccent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const { logoSize, logoY } = getLogoMetrics(width, height, isWindowed)
  const lineY = logoY + Math.round(logoSize * 0.22)
  const lineWidth = isWindowed ? 198 : width * 0.36
  const lineX = (width - lineWidth) / 2
  const gradient = context.createLinearGradient(lineX, 0, lineX + lineWidth, 0)
  gradient.addColorStop(0, "transparent")
  gradient.addColorStop(0.12, rgba("signalPrimary", 0.18))
  gradient.addColorStop(0.5, rgba("signalReadable", 0.6))
  gradient.addColorStop(0.88, rgba("signalPrimary", 0.18))
  gradient.addColorStop(1, "transparent")
  context.fillStyle = gradient
  context.fillRect(lineX, lineY, lineWidth, isWindowed ? 1 : 2)
}

function drawTagline(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  isWindowed: boolean,
): void {
  const { logoSize, logoY } = getLogoMetrics(width, height, isWindowed)
  const lineY = logoY + Math.round(logoSize * 0.22)
  const tagSize = isWindowed ? 10 : Math.max(10, Math.round(width * 0.009))
  const tagY = lineY + Math.round(tagSize * (isWindowed ? 2.5 : 3))

  context.save()
  context.textAlign = "center"
  context.font = `300 ${tagSize}px "IBM Plex Mono", monospace`
  if ("letterSpacing" in context) {
    ;(context as unknown as Record<string, string>).letterSpacing = `${tagSize * 0.38}px`
  }
  context.shadowColor = rgba("signalPrimary", 0.35)
  context.shadowBlur = isWindowed ? 4 : 8
  context.fillStyle = rgba("signalSecondary", 0.55)
  context.fillText("SIGNAL IN THE HAZE", width / 2, tagY)
  context.restore()
}

function setLogoFont(context: CanvasRenderingContext2D, logoSize: number): void {
  context.textAlign = "center"
  context.textBaseline = "alphabetic"
  context.font = `600 ${logoSize}px "IBM Plex Sans JP", sans-serif`
  if ("letterSpacing" in context) {
    ;(context as unknown as Record<string, string>).letterSpacing = `${logoSize * 0.12}px`
  }
}

function getLogoMetrics(width: number, height: number, isWindowed: boolean): { logoSize: number; logoY: number } {
  return {
    logoSize: isWindowed ? 38 : Math.round(width * 0.083),
    logoY: Math.round(height * (isWindowed ? 0.9 : 0.915)),
  }
}

function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, "image/png")
}

function rgbaFromRgb([red, green, blue]: readonly [number, number, number], alpha: number): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function transparentBlack(alpha: number): string {
  return rgbaFromRgb([0, 0, 0], alpha)
}

function hslColor(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export type CanvasPaletteRole =
  | "voidBase"
  | "voidRaised"
  | "voidDepth"
  | "panel"
  | "lineSubtle"
  | "lineStrong"
  | "signalPrimary"
  | "signalPrimaryDim"
  | "signalReadable"
  | "signalSecondary"
  | "signalMuted"
  | "residualWarmth"
  | "restoration"
  | "threatNoise"
  | "playerSignal"
  | "enemyNoise"
  | "enemyPrototype"

export type CanvasPaletteColor = {
  cssVar: string
  hex: string
  rgb: [number, number, number]
}

export const CANVAS_PALETTE: Record<CanvasPaletteRole, CanvasPaletteColor> = {
  voidBase: { cssVar: "--color-void-base", hex: "#040810", rgb: [4, 8, 16] },
  voidRaised: { cssVar: "--color-void-raised", hex: "#060d1a", rgb: [6, 13, 26] },
  voidDepth: { cssVar: "--color-void-depth", hex: "#0a1628", rgb: [10, 22, 40] },
  panel: { cssVar: "--color-void-panel-solid", hex: "#0b1424", rgb: [11, 20, 36] },
  lineSubtle: { cssVar: "--color-line-subtle", hex: "#8cc3ff", rgb: [140, 195, 255] },
  lineStrong: { cssVar: "--color-line-strong", hex: "#8cc3ff", rgb: [140, 195, 255] },
  signalPrimary: { cssVar: "--color-signal-primary", hex: "#5da4d1", rgb: [93, 164, 209] },
  signalPrimaryDim: { cssVar: "--color-signal-primary-dim", hex: "#5da4d1", rgb: [93, 164, 209] },
  signalReadable: { cssVar: "--color-signal-readable", hex: "#dce8f5", rgb: [220, 232, 245] },
  signalSecondary: { cssVar: "--color-signal-secondary", hex: "#8eabc8", rgb: [142, 171, 200] },
  signalMuted: { cssVar: "--color-signal-muted", hex: "#5a7a96", rgb: [90, 122, 150] },
  residualWarmth: { cssVar: "--color-residual-warmth", hex: "#f0c674", rgb: [240, 198, 116] },
  restoration: { cssVar: "--color-restoration", hex: "#84f0a3", rgb: [132, 240, 163] },
  threatNoise: { cssVar: "--color-threat-noise", hex: "#ff5a6e", rgb: [255, 90, 110] },
  playerSignal: { cssVar: "--color-signal-primary", hex: "#5da4d1", rgb: [93, 164, 209] },
  enemyNoise: { cssVar: "--color-residual-warmth", hex: "#f0c674", rgb: [240, 198, 116] },
  enemyPrototype: { cssVar: "--color-residual-warmth", hex: "#f0c674", rgb: [240, 198, 116] },
}

export type CanvasGlow = {
  color: string
  blur: number
}

export function hex(role: CanvasPaletteRole): string {
  return CANVAS_PALETTE[role].hex
}

export function rgba(role: CanvasPaletteRole, alpha: number): string {
  const [r, g, b] = CANVAS_PALETTE[role].rgb
  return `rgba(${r}, ${g}, ${b}, ${clampAlpha(alpha)})`
}

export function gradientStop(role: CanvasPaletteRole, alpha: number): string {
  return rgba(role, alpha)
}

export function resolveGlow(role: CanvasPaletteRole, intensity: number): CanvasGlow {
  const clampedIntensity = Math.max(0, Math.min(1, intensity))
  const baseBlur = role === "threatNoise" || role === "enemyNoise" ? 18 : 14

  // glow は発光量と色を同時に扱うため、caller 側で alpha と blur の対応が分裂しないようにします。
  return {
    color: rgba(role, 0.18 + clampedIntensity * 0.62),
    blur: baseBlur * clampedIntensity,
  }
}

function clampAlpha(alpha: number): number {
  return Math.max(0, Math.min(1, alpha))
}

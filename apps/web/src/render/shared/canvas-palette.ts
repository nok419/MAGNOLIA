export type CanvasPaletteRole =
  | "voidBase"
  | "voidRaised"
  | "panel"
  | "lineSubtle"
  | "lineStrong"
  | "signalPrimary"
  | "signalReadable"
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
  panel: { cssVar: "--color-void-panel-solid", hex: "#0b1424", rgb: [11, 20, 36] },
  lineSubtle: { cssVar: "--color-line-subtle", hex: "#8cc3ff", rgb: [140, 195, 255] },
  lineStrong: { cssVar: "--color-line-strong", hex: "#8cc3ff", rgb: [140, 195, 255] },
  signalPrimary: { cssVar: "--color-signal-primary", hex: "#5da4d1", rgb: [93, 164, 209] },
  signalReadable: { cssVar: "--color-signal-readable", hex: "#dce8f5", rgb: [220, 232, 245] },
  signalMuted: { cssVar: "--color-signal-muted", hex: "#5a7a96", rgb: [90, 122, 150] },
  residualWarmth: { cssVar: "--color-residual-warmth", hex: "#f0c674", rgb: [240, 198, 116] },
  restoration: { cssVar: "--color-restoration", hex: "#84f0a3", rgb: [132, 240, 163] },
  threatNoise: { cssVar: "--color-threat-noise", hex: "#ff5a6e", rgb: [255, 90, 110] },
  playerSignal: { cssVar: "--color-signal-primary", hex: "#5da4d1", rgb: [93, 164, 209] },
  enemyNoise: { cssVar: "--color-threat-noise", hex: "#ff5a6e", rgb: [255, 90, 110] },
  enemyPrototype: { cssVar: "--color-residual-warmth", hex: "#f0c674", rgb: [240, 198, 116] },
}

export function rgba(role: CanvasPaletteRole, alpha: number): string {
  const [r, g, b] = CANVAS_PALETTE[role].rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

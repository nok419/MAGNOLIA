export const visualToken = {
  color: {
    void: "#03070f",
    abyss: "#06101d",
    deep: "#0a1729",
    panel: "rgba(8, 18, 34, 0.82)",
    panelRaised: "rgba(13, 29, 52, 0.88)",
    signal: "#5da4d1",
    memory: "#f0c674",
    danger: "#ff5a6e",
    textPrimary: "rgba(232, 244, 255, 0.92)",
    textSecondary: "rgba(192, 215, 232, 0.68)",
    textMuted: "rgba(150, 178, 202, 0.42)",
  },
  rgb: {
    void: [3, 7, 15],
    abyss: [6, 16, 29],
    deep: [10, 23, 41],
    panel: [8, 18, 34],
    panelRaised: [13, 29, 52],
    line: [140, 195, 255],
    signal: [93, 164, 209],
    signalBright: [180, 226, 255],
    memory: [240, 198, 116],
    danger: [255, 90, 110],
    markerLocked: [127, 150, 175],
    markerResource: [139, 240, 192],
    markerInvestigation: [183, 236, 255],
    text: [232, 244, 255],
    textSecondary: [192, 215, 232],
  },
  alpha: {
    backgroundLine: 0.12,
    supportLine: 0.24,
    activeLine: 0.62,
    foreground: 0.92,
    quietSurface: 0.82,
    raisedSurface: 0.88,
  },
  stroke: {
    hair: 0.5,
    thin: 1,
    regular: 1.5,
    strong: 2,
    silhouette: 2.5,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
    field: 64,
  },
  duration: {
    productive: 110,
    communication: 240,
    expressive: 520,
    veil: 700,
    ambientSlow: 8000,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0.38, 0.9)",
    entrance: "cubic-bezier(0, 0, 0.38, 0.9)",
    exit: "cubic-bezier(0.2, 0, 1, 0.9)",
    expressive: "cubic-bezier(0.4, 0.14, 0.3, 1)",
  },
} as const

export type VisualRgbRole = keyof typeof visualToken.rgb

export function tokenRgba(role: VisualRgbRole, alpha: number): string {
  const [r, g, b] = visualToken.rgb[role]
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`
}

export function rgbTripletRgba(rgbTriplet: string, alpha: number): string {
  return `rgba(${rgbTriplet}, ${clamp01(alpha)})`
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

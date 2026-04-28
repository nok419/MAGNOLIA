import { drawSignalDistortion } from "@/app/signal-distortion"
import { hashString } from "@/app/visual-seed"
import { tokenRgba, visualToken } from "@/app/visual-tokens"
import { easeOutCubic } from "./battle-math"

/* ============================================================
   HAZARD — SignalDistortion による受信帯域の汚染表現
   ============================================================ */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  hazard: {
    phase: string
    phaseProgress: number
    position: { x: number; y: number }
    size: { width: number; height: number }
  },
  t: number,
  reduceFlashing: boolean,
) {
  const { x, y } = hazard.position
  const { width: w, height: h } = hazard.size
  const growth = easeOutCubic(hazard.phaseProgress)
  const isTelegraph = hazard.phase === "telegraph"
  const isFading = hazard.phase === "fading"
  const phaseAlpha = isTelegraph ? 0.32 + growth * 0.42 : isFading ? 1 - growth : growth
  const severity = isTelegraph ? 1 : reduceFlashing ? 1 : 2
  const seed = hashString(`hazard:${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`)

  ctx.save()
  // hazard は危険領域だが、画面全体を奪わないよう赤い面ではなく低い fog と sparse packet noise に制限します。
  drawSignalDistortion(ctx, {
    seed,
    rect: { x, y, width: w, height: h },
    timeMs: t,
    severity,
    domain: "hazard",
    cadenceMs: reduceFlashing ? 420 : 220,
    chroma: 0,
    mask: isTelegraph ? "line" : "slice",
    reduceFlashing,
    phaseAlpha,
  })

  if (isTelegraph) {
    ctx.strokeStyle = tokenRgba("danger", 0.18 + phaseAlpha * 0.26)
    ctx.lineWidth = visualToken.stroke.regular
    ctx.setLineDash([8, 10])
    ctx.lineDashOffset = reduceFlashing ? 0 : -t * 0.018
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
  }

  ctx.restore()
}

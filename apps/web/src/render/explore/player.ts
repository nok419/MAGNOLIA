import type { ShipVariant } from "@magnolia/contracts"
import { drawShip } from "@/app/ship-renderer"
import { tokenRgba } from "@/app/visual-tokens"

/* ============================================================
   PLAYER SHIP — direction-facing, bright, glowing
   ============================================================ */
export function drawExplorePlayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  now: number,
  variant: ShipVariant,
) {
  // 探索時の自機は「画面中央の静かな光」としての存在感を優先する。
  // 戦闘時より glow を強め、art 装飾は強度フルで使う。
  const pulse = 0.6 + 0.4 * Math.sin(now * 0.004)
  drawShip(ctx, {
    variant,
    center: { x: cx, y: cy },
    scale: 0.7,
    rotation: angle,
    stroke: tokenRgba("text", 1),
    fill: tokenRgba("signalBright", 0.12),
    lineWidth: 1.5,
    glow: { color: tokenRgba("line", 0.8), blur: 16 },
    core: {
      color: tokenRgba("line", 1),
      glowColor: tokenRgba("signal", 1),
      glowBlur: 10,
      radius: 2.2,
      pulse,
    },
    timeMs: now,
    artDetailStrength: 1,
  })
}

import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { drawShip } from "@/app/ship-renderer"

type PlayerShipRendererInput = {
  x: number
  y: number
  invincible: boolean
  renderState: BattleRenderState
  shipVariant: ShipVariant
}

const BATTLE_PLAYER_SHIP_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: PlayerShipRendererInput) => void
> = {
  default: (ctx, input) =>
    drawDefaultPlayerShip(ctx, input.x, input.y, input.invincible, input.shipVariant, input.renderState.elapsedMs),
}

export function drawPlayerShip(
  ctx: CanvasRenderingContext2D,
  renderState: BattleRenderState,
  shipVariant: ShipVariant,
) {
  const renderer = BATTLE_PLAYER_SHIP_RENDERERS.default
  renderer(ctx, {
    x: renderState.player.position.x,
    y: renderState.player.position.y,
    invincible: renderState.player.invincible,
    renderState,
    shipVariant,
  })
}

function drawDefaultPlayerShip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  invincible: boolean,
  variant: ShipVariant,
  timeMs: number,
) {
  // 戦闘中は可読性を最優先したいので、art バリアントの装飾強度は 0.55 に抑える。
  // これより高くすると弾との衝突判定を目で追いにくくなる。
  drawShip(ctx, {
    variant,
    center: { x: cx, y: cy },
    scale: 1,
    stroke: invincible ? "#fff4a7" : "#e8f4ff",
    fill: invincible ? "rgba(255, 244, 167, 0.12)" : "rgba(180, 220, 255, 0.06)",
    lineWidth: 1.5,
    glow: {
      color: invincible ? "rgba(255, 244, 167, 0.7)" : "rgba(93, 164, 209, 0.5)",
      blur: invincible ? 18 : 10,
    },
    core: {
      color: invincible ? "#fff4a7" : "#5da4d1",
      glowColor: invincible ? "rgba(255, 244, 167, 0.7)" : "rgba(93, 164, 209, 0.5)",
      glowBlur: invincible ? 18 : 10,
      radius: 2,
      pulse: 1,
    },
    timeMs,
    artDetailStrength: 0.55,
  })
}

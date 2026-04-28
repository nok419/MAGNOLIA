import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { drawShip } from "@/app/ship-renderer"
import { tokenRgba } from "@/app/visual-tokens"
import {
  buildShipRendererKeys,
  resolveBattleRenderer,
  type PlayerShipRendererInput,
} from "./renderer-registry"

// ここが見た目差し替えの入口です。装備や mission ごとの変更は registry に集約し、
// 戦闘ルール側へ個別の描画分岐を広げないようにします。
const BATTLE_PLAYER_SHIP_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: PlayerShipRendererInput) => void
> = {
  default: (ctx, input) =>
    drawDefaultPlayerShip(ctx, input.x, input.y, input.invincible, input.shipVariant, input.renderState.elapsedMs),
}

/* ============================================================
   PLAYER SHIP — 共通レンダラ (`ship-renderer.ts`) に委譲。
   装備・mission ごとの見た目差は BATTLE_PLAYER_SHIP_RENDERERS で上書きする。
   ============================================================ */
export function drawPlayerShip(
  ctx: CanvasRenderingContext2D,
  renderState: BattleRenderState,
  shipVariant: ShipVariant,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_SHIP_RENDERERS,
    buildShipRendererKeys(renderState),
  )
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
    stroke: invincible ? tokenRgba("memory", 0.94) : tokenRgba("text", 0.94),
    fill: invincible ? tokenRgba("memory", 0.12) : tokenRgba("signalBright", 0.06),
    lineWidth: 1.5,
    glow: {
      color: invincible ? tokenRgba("memory", 0.7) : tokenRgba("signal", 0.5),
      blur: invincible ? 18 : 10,
    },
    core: {
      color: invincible ? tokenRgba("memory", 0.94) : tokenRgba("signal", 1),
      glowColor: invincible ? tokenRgba("memory", 0.7) : tokenRgba("signal", 0.5),
      glowBlur: invincible ? 18 : 10,
      radius: 2,
      pulse: 1,
    },
    timeMs,
    artDetailStrength: 0.55,
  })
}

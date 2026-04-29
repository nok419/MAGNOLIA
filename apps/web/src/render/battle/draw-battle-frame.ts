import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import {
  BATTLE_CANVAS_HEIGHT,
  BATTLE_CANVAS_WIDTH,
} from "@/render/battle/battle-renderer-utils"
import {
  drawBattleBackgroundPreset,
  drawTransparentAtmosphere,
} from "@/render/battle/backgrounds/background-renderer"
import { drawBattlePresentationLayer } from "@/render/battle/presentation-layer"
import { drawPlayerShip } from "@/render/battle/player-ship"
import { drawEnemy } from "@/render/battle/enemies/enemy-renderer"
import {
  drawEnemyProjectile,
  drawPlayerProjectile,
} from "@/render/battle/projectiles/projectile-renderer"
import { drawBattlePickup } from "@/render/battle/pickups"
import { drawBattleFragment } from "@/render/battle/fragments"
import { drawBarrierGauge } from "@/render/battle/barrier"
import { drawSupportField } from "@/render/battle/support-fields"
import { drawHazard } from "@/render/battle/hazards/magnetic-disaster"

export { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH }

type BattleFrameDrawInput = {
  renderState: BattleRenderState
  battleEvents?: TimedPresentationRequest<BattlePresentationRequest>[]
  transparentBg?: boolean
  shipVariant: ShipVariant
  reduceFlashing?: boolean
  lowFrameRateMode?: boolean
}

export function drawBattleFrame(
  ctx: CanvasRenderingContext2D,
  input: BattleFrameDrawInput,
): void {
  const { renderState, transparentBg, shipVariant } = input
  const reduceFlashing = input.reduceFlashing ?? false
  const lowFrameRateMode = input.lowFrameRateMode ?? false
  ctx.clearRect(0, 0, BATTLE_CANVAS_WIDTH, BATTLE_CANVAS_HEIGHT)

  if (!transparentBg) {
    drawBattleBackgroundPreset(ctx, {
      width: BATTLE_CANVAS_WIDTH,
      height: BATTLE_CANVAS_HEIGHT,
      timeMs: renderState.elapsedMs,
      background: renderState.background,
      lowFrameRateMode,
    })
  } else {
    drawTransparentAtmosphere(ctx, renderState.elapsedMs)
  }

  // drawBattleFrame は描画順だけを持ち、各要素の見た目は専用 module に閉じ込めます。
  for (const hazard of renderState.hazards) {
    drawHazard(ctx, hazard, renderState.elapsedMs, {
      reduceFlashing,
      lowFrameRateMode,
    })
  }
  for (const field of renderState.supportFields) {
    drawSupportField(ctx, field, renderState.elapsedMs)
  }
  for (const projectile of renderState.projectiles) {
    if (projectile.side === "enemy") {
      drawEnemyProjectile(ctx, projectile, renderState.elapsedMs, renderState, {
        reduceFlashing,
        lowFrameRateMode,
      })
    }
  }
  for (const pickup of renderState.pickups) {
    drawBattlePickup(ctx, pickup, renderState.elapsedMs)
  }
  for (const fragment of renderState.fragments) {
    drawBattleFragment(ctx, fragment, renderState.elapsedMs, {
      reduceFlashing,
      lowFrameRateMode,
    })
  }
  for (const enemy of renderState.enemies) {
    drawEnemy(ctx, enemy, renderState.elapsedMs, renderState, {
      reduceFlashing,
      lowFrameRateMode,
    })
  }
  for (const projectile of renderState.projectiles) {
    if (projectile.side === "player") {
      drawPlayerProjectile(ctx, projectile, renderState.elapsedMs, renderState, {
        reduceFlashing,
        lowFrameRateMode,
      })
    }
  }

  drawBarrierGauge(ctx, renderState)
  drawPlayerShip(ctx, renderState, shipVariant)
  drawBattlePresentationLayer(ctx, {
    renderState,
    battleEvents: input.battleEvents ?? [],
    reduceFlashing,
  })
}

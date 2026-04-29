import { drawBattleBackground, drawTransparentAtmosphere } from "./background"
import { HEIGHT, WIDTH } from "./dimensions"
import { drawEnemy } from "./enemies"
import { drawHazard } from "./hazards"
import { drawBarrierGauge, drawBattleFragment, drawBattlePickup, drawSupportField } from "./objects"
import { drawPlayerShip } from "./player"
import { drawEnemyProjectile, drawPlayerProjectile } from "./projectiles"
import { drawBattlePresentationLayer } from "./presentations"
import type { BattleFrameDrawInput } from "./types"

export function drawBattleFrame(
  ctx: CanvasRenderingContext2D,
  input: BattleFrameDrawInput,
): void {
  const { renderState, transparentBg, shipVariant } = input
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (!transparentBg) {
    drawBattleBackground(ctx, renderState.elapsedMs)
  } else {
    // Key Visual 用の透過描画では、背景担当の canvas を隠さないように干渉帯だけを重ねます。
    drawTransparentAtmosphere(ctx, renderState.elapsedMs)
  }

  // 戦闘 Canvas は renderState の描画順だけを扱い、判定や字幕選択は session 側に留めます。
  for (const hazard of renderState.hazards) {
    drawHazard(ctx, hazard, renderState.elapsedMs, input.reduceFlashing ?? false)
  }

  for (const field of renderState.supportFields) {
    drawSupportField(ctx, field, renderState.elapsedMs)
  }

  for (const projectile of renderState.projectiles) {
    if (projectile.side === "enemy") {
      drawEnemyProjectile(ctx, projectile, renderState.elapsedMs, renderState)
    }
  }

  for (const pickup of renderState.pickups) {
    drawBattlePickup(ctx, pickup, renderState.elapsedMs)
  }

  for (const fragment of renderState.fragments) {
    drawBattleFragment(ctx, fragment, renderState.elapsedMs, input.reduceFlashing ?? false)
  }

  for (const enemy of renderState.enemies) {
    drawEnemy(ctx, enemy, renderState.elapsedMs, renderState)
  }

  for (const projectile of renderState.projectiles) {
    if (projectile.side === "player") {
      drawPlayerProjectile(ctx, projectile, renderState.elapsedMs, renderState)
    }
  }

  drawBarrierGauge(ctx, renderState)
  drawPlayerShip(ctx, renderState, shipVariant)
  drawBattlePresentationLayer(ctx, {
    renderState,
    presentationRequests: input.presentationRequests ?? [],
    reduceFlashing: input.reduceFlashing ?? false,
  })
}

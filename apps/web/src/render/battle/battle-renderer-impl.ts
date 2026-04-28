import { drawSignalSpaceBackground, drawTransparentAtmosphere } from "./background"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH } from "./battle-canvas"
import { drawEnemy } from "./enemy-renderers"
import { drawBarrierGauge, drawSupportField } from "./field-renderers"
import { drawBattleFragment, drawBattlePickup } from "./fragment-renderers"
import { drawHazard } from "./hazard-renderer"
import { drawPlayerShip } from "./player-renderers"
import { drawEnemyProjectile, drawPlayerProjectile } from "./projectile-renderers"
import type { BattleFrameDrawInput } from "./renderer-registry"

export { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH } from "./battle-canvas"

const WIDTH = BATTLE_CANVAS_WIDTH
const HEIGHT = BATTLE_CANVAS_HEIGHT

export function drawBattleFrame(
  ctx: CanvasRenderingContext2D,
  input: BattleFrameDrawInput,
): void {
  const { renderState, transparentBg, shipVariant } = input
  const reduceFlashing = input.reduceFlashing ?? false

  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (!transparentBg) {
    drawSignalSpaceBackground(ctx, renderState.elapsedMs, renderState)
  } else {
    // Key Visual 用の透過描画では、背景担当の canvas を隠さないように干渉帯だけを重ねます。
    drawTransparentAtmosphere(ctx, renderState.elapsedMs)
  }

  // 戦闘 Canvas は renderState の描画に専念し、当たり判定や字幕選択は session 側で完結させます。
  // UI 側で命中判定を持ち始めると、演出変更がルール破壊に直結するためです。
  for (const hazard of renderState.hazards) {
    drawHazard(ctx, hazard, renderState.elapsedMs, reduceFlashing)
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
    drawBattleFragment(ctx, fragment, renderState.elapsedMs, reduceFlashing)
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
}

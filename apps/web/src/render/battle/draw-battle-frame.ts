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

const BATTLE_RENDER_CULL_MARGIN = 8

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
  const visibleEntities = selectVisibleBattleEntities(renderState)
  const denseFrameMode = false
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
  // 画面外の弾は描かず、画面内の敵弾は元の見た目を維持します。
  for (const projectile of visibleEntities.enemyProjectiles) {
    drawEnemyProjectile(ctx, projectile, renderState.elapsedMs, renderState, {
      reduceFlashing,
      lowFrameRateMode,
      denseFrameMode,
    })
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
  for (const enemy of visibleEntities.enemies) {
    drawEnemy(ctx, enemy, renderState.elapsedMs, renderState, {
      reduceFlashing,
      lowFrameRateMode,
      denseFrameMode,
    })
  }
  for (const projectile of visibleEntities.playerProjectiles) {
    drawPlayerProjectile(ctx, projectile, renderState.elapsedMs, renderState, {
      reduceFlashing,
      lowFrameRateMode,
      denseFrameMode,
    })
  }

  drawBarrierGauge(ctx, renderState)
  drawPlayerShip(ctx, renderState, shipVariant)
  drawBattlePresentationLayer(ctx, {
    renderState,
    battleEvents: input.battleEvents ?? [],
    reduceFlashing,
  })
}

function selectVisibleBattleEntities(renderState: BattleRenderState): {
  enemies: BattleRenderState["enemies"]
  enemyProjectiles: BattleRenderState["projectiles"]
  playerProjectiles: BattleRenderState["projectiles"]
} {
  const enemies: BattleRenderState["enemies"] = []
  const enemyProjectiles: BattleRenderState["projectiles"] = []
  const playerProjectiles: BattleRenderState["projectiles"] = []

  // runtime の外周猶予内にある弾でも画面には見えないため、描画直前にも範囲で弾きます。
  for (const projectile of renderState.projectiles) {
    if (!isProjectileVisible(projectile)) {
      continue
    }
    if (projectile.side === "enemy") {
      enemyProjectiles.push(projectile)
    } else {
      playerProjectiles.push(projectile)
    }
  }

  for (const enemy of renderState.enemies) {
    if (isEnemyVisible(enemy)) {
      enemies.push(enemy)
    }
  }

  return {
    enemies,
    enemyProjectiles,
    playerProjectiles,
  }
}

function isProjectileVisible(projectile: BattleRenderState["projectiles"][number]): boolean {
  const radius = projectile.radius * Math.max(1, projectile.visual.radiusScale ?? 1)
  const margin = BATTLE_RENDER_CULL_MARGIN + radius
  return isPointInsideBattleRenderMargin(projectile.position, margin)
}

function isEnemyVisible(enemy: BattleRenderState["enemies"][number]): boolean {
  const orbitScale = Math.max(1, enemy.visual.orbitScale ?? 1)
  const margin = BATTLE_RENDER_CULL_MARGIN + enemy.radius * orbitScale * 3
  return isPointInsideBattleRenderMargin(enemy.position, margin)
}

function isPointInsideBattleRenderMargin(
  position: { x: number; y: number },
  margin: number,
): boolean {
  return (
    position.x >= -margin &&
    position.x <= BATTLE_CANVAS_WIDTH + margin &&
    position.y >= -margin &&
    position.y <= BATTLE_CANVAS_HEIGHT + margin
  )
}

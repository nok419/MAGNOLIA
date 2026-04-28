import type { BattleRenderState } from "@magnolia/game-session"
import type { BulletVisualRoleSpec } from "@magnolia/contracts"
import { tokenRgba, type VisualRgbRole } from "@/app/visual-tokens"
import {
  buildProjectileRendererKeys,
  resolveBattleRenderer,
  type ProjectileRendererInput,
} from "./renderer-registry"
import { drawBossCoreProjectile } from "./projectiles/enemy-core"
import { drawGeoDiamondProjectile } from "./projectiles/enemy-geometry"
import { drawEnemyLanceProjectile } from "./projectiles/enemy-lance"
import { drawNoiseOrbProjectile } from "./projectiles/enemy-noise"
import { drawSignalShardProjectile } from "./projectiles/enemy-shard"
import { drawCarrierBlast, drawCarrierProjectile } from "./projectiles/player-carrier"
import { drawInversePhaseProjectileAura } from "./projectiles/player-inverse-phase"
import { drawDefaultPlayerProjectile, drawPulseMelee } from "./projectiles/player-pulse"

type ProjectileRenderer = (
  ctx: CanvasRenderingContext2D,
  input: ProjectileRendererInput,
) => void

// 弾の見た目差し替えの入口です。描画本体は player weapon / enemy role 単位へ分け、
// ここでは content id と visualRole の対応だけを管理します。
const BATTLE_PLAYER_PROJECTILE_RENDERERS: Record<string, ProjectileRenderer> = {
  "role:playerCarrier": (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  "role:playerPulse": (ctx, input) => drawDefaultPlayerProjectile(ctx, input.projectile),
  proj_player_carrier: (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  proj_player_carrier_blast: (ctx, input) => drawCarrierBlast(ctx, input.projectile, input.timeMs),
  proj_player_pulse_melee: (ctx, input) => drawPulseMelee(ctx, input.projectile, input.timeMs),
  default: (ctx, input) => drawDefaultPlayerProjectile(ctx, input.projectile),
}

const BATTLE_ENEMY_PROJECTILE_RENDERERS: Record<string, ProjectileRenderer> = {
  "role:enemyNoise": (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
  "role:enemyGeometry": (ctx, input) => drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs),
  "role:enemyLance": (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  "role:enemyCore": (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  "role:enemyShard": (ctx, input) => drawSignalShardProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_geo: (ctx, input) => drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_lance: (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_core: (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  // 廃止した花弁表現の content id は残しつつ、描画だけ非花形の信号片へ差し替えます。
  proj_enemy_petal: (ctx, input) => drawSignalShardProjectile(ctx, input.projectile, input.timeMs),
  default: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
}

export function drawPlayerProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const visualRoleSpec = resolveProjectileVisualRoleSpec(renderState, p)
  const projectile = applyProjectileVisualRoleScale(p, visualRoleSpec)
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_PROJECTILE_RENDERERS,
    buildProjectileRendererKeys(projectile, renderState.missionId, visualRoleSpec?.expectedRendererKey),
  )
  if (projectile.inversePhaseVisual && projectile.projectileId !== "proj_player_pulse_melee") {
    drawInversePhaseProjectileAura(ctx, projectile, t)
  }
  drawProjectileVisualRoleGlow(ctx, projectile, visualRoleSpec, t)
  renderer(ctx, { projectile, timeMs: t, renderState, visualRoleSpec })
}

export function drawEnemyProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const visualRoleSpec = resolveProjectileVisualRoleSpec(renderState, p)
  const projectile = applyProjectileVisualRoleScale(p, visualRoleSpec)
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_PROJECTILE_RENDERERS,
    buildProjectileRendererKeys(projectile, renderState.missionId, visualRoleSpec?.expectedRendererKey),
  )
  drawProjectileVisualRoleGlow(ctx, projectile, visualRoleSpec, t)
  renderer(ctx, { projectile, timeMs: t, renderState, visualRoleSpec })
}

function resolveProjectileVisualRoleSpec(
  renderState: BattleRenderState,
  projectile: BattleRenderState["projectiles"][number],
): BulletVisualRoleSpec | undefined {
  return projectile.visualRole ? renderState.bulletVisualRoles?.[projectile.visualRole] : undefined
}

function applyProjectileVisualRoleScale(
  projectile: BattleRenderState["projectiles"][number],
  visualRoleSpec: BulletVisualRoleSpec | undefined,
): BattleRenderState["projectiles"][number] {
  if (!visualRoleSpec || visualRoleSpec.scale === 1) {
    return projectile
  }
  return {
    ...projectile,
    radius: projectile.radius * visualRoleSpec.scale,
  }
}

function drawProjectileVisualRoleGlow(
  ctx: CanvasRenderingContext2D,
  projectile: BattleRenderState["projectiles"][number],
  visualRoleSpec: BulletVisualRoleSpec | undefined,
  timeMs: number,
): void {
  if (!visualRoleSpec || visualRoleSpec.glowStrength <= 0) {
    return
  }
  const role = toAppRgbRole(visualRoleSpec.tokenRoles.glow)
  const pulse = 0.74 + Math.sin(timeMs * 0.004 + visualRoleSpec.seedBucket) * 0.26
  ctx.save()
  ctx.fillStyle = tokenRgba(role, 0.1 * visualRoleSpec.glowStrength * pulse)
  ctx.beginPath()
  ctx.arc(
    projectile.position.x,
    projectile.position.y,
    projectile.radius * (2.1 + visualRoleSpec.glowStrength),
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()
}

function toAppRgbRole(role: BulletVisualRoleSpec["tokenRoles"]["glow"]): VisualRgbRole {
  return role
}

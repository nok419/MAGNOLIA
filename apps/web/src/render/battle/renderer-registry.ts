import type { BulletVisualRoleSpec, ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"

export type PlayerShipRendererInput = {
  x: number
  y: number
  invincible: boolean
  renderState: BattleRenderState
  shipVariant: ShipVariant
}

export type EnemyRendererInput = {
  enemy: BattleRenderState["enemies"][number]
  timeMs: number
  renderState: BattleRenderState
}

export type ProjectileRendererInput = {
  projectile: BattleRenderState["projectiles"][number]
  timeMs: number
  renderState: BattleRenderState
  visualRoleSpec?: BulletVisualRoleSpec
}

export type BattleFrameDrawInput = {
  renderState: BattleRenderState
  transparentBg?: boolean
  shipVariant: ShipVariant
  reduceFlashing?: boolean
}

export function resolveBattleRenderer<T>(registry: Record<string, T>, candidates: Array<string | undefined>): T {
  for (const candidate of candidates) {
    if (candidate && registry[candidate]) {
      return registry[candidate]
    }
  }
  return registry.default
}

export function buildEntityRendererKeys(entityId: string, missionId: string) {
  return [`mission:${missionId}:${entityId}`, entityId, `mission:${missionId}`, "default"]
}

export function buildProjectileRendererKeys(
  projectile: BattleRenderState["projectiles"][number],
  missionId: string,
  expectedRendererKey?: string,
) {
  return [
    projectile.visualRole ? `mission:${missionId}:role:${projectile.visualRole}` : undefined,
    `mission:${missionId}:${projectile.projectileId}`,
    expectedRendererKey,
    projectile.visualRole ? `role:${projectile.visualRole}` : undefined,
    projectile.projectileId,
    `mission:${missionId}`,
    "default",
  ]
}

export function buildShipRendererKeys(renderState: BattleRenderState) {
  return [
    renderState.equippedMainId ? `mission:${renderState.missionId}:main:${renderState.equippedMainId}` : undefined,
    renderState.equippedMainId ? `main:${renderState.equippedMainId}` : undefined,
    renderState.equippedSubId ? `mission:${renderState.missionId}:sub:${renderState.equippedSubId}` : undefined,
    renderState.equippedSubId ? `sub:${renderState.equippedSubId}` : undefined,
    `mission:${renderState.missionId}`,
    "default",
  ]
}

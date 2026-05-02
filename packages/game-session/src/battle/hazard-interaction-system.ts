import type { InternalBattleState } from "../battle-state"
import { doesCircleIntersectHazardArea } from "../battle-world"

export function applyMagneticDisasterEffects(
  battle: InternalBattleState,
  dtMs: number,
): void {
  const activeHazards = battle.hazards.filter(
    (hazard) => hazard.phase === "active",
  )
  if (activeHazards.length === 0) {
    return
  }

  // 磁気災害は局所的な環境ノイズではなく、空間全体を乱す場として扱います。
  // そのため、内部に入った敵弾は消え、敵機も継続的に損耗します。
  battle.projectiles = battle.projectiles.filter((projectile) => {
    if (projectile.side !== "enemy" || projectile.nonColliding) {
      return true
    }

    return !activeHazards.some((hazard) =>
      doesCircleIntersectHazardArea(projectile.position, projectile.radius, hazard.area),
    )
  })

  const dtSeconds = dtMs / 1000
  for (const enemy of battle.enemies) {
    const totalHazardDps = activeHazards.reduce((sum, hazard) => {
      if (!doesCircleIntersectHazardArea(enemy.position, enemy.radius, hazard.area)) {
        return sum
      }
      return sum + hazard.enemyDamagePerSecond
    }, 0)

    if (totalHazardDps <= 0) {
      continue
    }

    enemy.hp -= totalHazardDps * dtSeconds
    enemy.burnUntilMs = Math.max(enemy.burnUntilMs, battle.elapsedMs + 180)
    enemy.burnDamagePerSec = Math.max(enemy.burnDamagePerSec, totalHazardDps * 0.1)
  }
}

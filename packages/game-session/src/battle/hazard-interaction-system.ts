import type { InternalBattleState } from "../battle-state"
import { doesCircleIntersectHazardArea } from "../battle-world"
import { hashString } from "../math"

const MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_BUCKETS = 3
const MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_BUCKET = 0
const MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_GRACE_RATIO = 0.25

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

  // 磁気災害は弾幕そのものを消し切らないよう、範囲内の敵弾を安定した比率で間引きます。
  // active 直後は予兆から本体へ移る見え方を優先し、弾消しを少し遅らせます。
  battle.projectiles = battle.projectiles.filter((projectile) => {
    if (projectile.side !== "enemy" || projectile.nonColliding) {
      return true
    }

    const overlappingHazard = activeHazards.find((hazard) =>
      doesCircleIntersectHazardArea(projectile.position, projectile.radius, hazard.area),
    )
    if (
      !overlappingHazard ||
      overlappingHazard.phaseProgress < MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_GRACE_RATIO
    ) {
      return true
    }

    return !shouldDisruptEnemyProjectile({
      hazardId: overlappingHazard.hazardId,
      projectileInstanceId: projectile.projectileInstanceId,
    })
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

function shouldDisruptEnemyProjectile(input: {
  hazardId: string
  projectileInstanceId: string
}): boolean {
  const bucket =
    hashString(`${input.hazardId}:${input.projectileInstanceId}`) %
    MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_BUCKETS
  return bucket === MAGNETIC_DISASTER_PROJECTILE_DISRUPTION_BUCKET
}

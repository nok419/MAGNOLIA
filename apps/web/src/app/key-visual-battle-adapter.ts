import type { BattleRenderState } from "@magnolia/game-session"
import type { KeyVisualComposition } from "@/app/key-visual-composition"

type KeyVisualEnemyKind = KeyVisualComposition["enemies"][number]["kind"]
type KeyVisualProjectileKind = KeyVisualComposition["projectiles"][number]["kind"]
type KeyVisualEquipmentMain = KeyVisualComposition["equipment"]["main"]
type KeyVisualEquipmentSub = KeyVisualComposition["equipment"]["sub"]

const ENEMY_ID_BY_KIND: Record<KeyVisualEnemyKind, string> = {
  heavy: "enemy_heavy",
  standard: "enemy_standard",
}

const PROJECTILE_ID_BY_KIND: Record<KeyVisualProjectileKind, string> = {
  playerPulse: "proj_player_pulse",
  enemyNoise: "proj_enemy_basic",
  enemyGeometry: "proj_enemy_geo",
  enemyLance: "proj_enemy_lance",
  enemyCore: "proj_enemy_core",
  enemyShard: "proj_enemy_petal",
}

const PROJECTILE_ROLE_BY_KIND = {
  playerPulse: "playerPulse",
  enemyNoise: "enemyNoise",
  enemyGeometry: "enemyGeometry",
  enemyLance: "enemyLance",
  enemyCore: "enemyCore",
  enemyShard: "enemyShard",
} as const satisfies Record<
  KeyVisualProjectileKind,
  BattleRenderState["projectiles"][number]["visualRole"]
>

const EQUIPMENT_ID_BY_KIND: {
  main: Record<KeyVisualEquipmentMain, string>
  sub: Record<KeyVisualEquipmentSub, string>
} = {
  main: {
    pulse: "eq_main_pulse",
  },
  sub: {
    noiseCanceller: "eq_sub_noise_canceller",
  },
}

const RUNTIME_PROFILE_BY_KEY_VISUAL_PROFILE: Record<
  KeyVisualComposition["profile"],
  { missionId: string; visualProfileId: string }
> = {
  poster: {
    missionId: "mission_key_visual_poster",
    visualProfileId: "mission_key_visual_poster",
  },
}

export function keyVisualCompositionToBattleRenderState(
  composition: KeyVisualComposition,
): BattleRenderState {
  const runtimeProfile = RUNTIME_PROFILE_BY_KEY_VISUAL_PROFILE[composition.profile]

  return {
    missionId: runtimeProfile.missionId,
    visualProfileId: runtimeProfile.visualProfileId,
    missionDurationMs: composition.durationMs,
    elapsedMs: composition.elapsedMs,
    player: {
      position: composition.player.position,
      radius: composition.player.radius,
      invincible: composition.player.invincible,
      noiseLevel: composition.player.noiseLevel,
      barrierRadius: composition.player.barrierRadius,
      barrierState: {
        remainingMs: composition.player.barrier.remainingMs,
        maxMs: composition.player.barrier.maxMs,
        active: composition.player.barrier.active,
      },
      subCooldownMs: composition.player.subCooldownMs,
      subMaxCooldownMs: composition.player.subMaxCooldownMs,
    },
    enemies: composition.enemies.map((enemy) => ({
      enemyInstanceId: `kv_${enemy.instanceKey}`,
      enemyId: ENEMY_ID_BY_KIND[enemy.kind],
      position: enemy.position,
      radius: enemy.radius,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      burning: enemy.burning,
    })),
    projectiles: composition.projectiles.map((projectile) => ({
      projectileInstanceId: `kv_${projectile.instanceKey}`,
      projectileId: PROJECTILE_ID_BY_KIND[projectile.kind],
      visualRole: PROJECTILE_ROLE_BY_KIND[projectile.kind],
      side: projectile.side,
      position: projectile.position,
      velocity: projectile.velocity,
      radius: projectile.radius,
    })),
    supportFields: [],
    pickups: [],
    fragments: [],
    hazards: composition.hazards.map((hazard) => ({
      hazardId: `hazard_key_visual_${hazard.key}`,
      phase: hazard.phase,
      phaseProgress: hazard.phaseProgress,
      position: hazard.position,
      size: hazard.size,
    })),
    equippedMainId: EQUIPMENT_ID_BY_KIND.main[composition.equipment.main],
    equippedSubId: EQUIPMENT_ID_BY_KIND.sub[composition.equipment.sub],
  }
}

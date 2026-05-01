import type {
  BattleSpawnPoint,
  ContentHitboxPreset,
  DifficultyModifiers,
  EnemyArchetype,
} from "@magnolia/contracts"
import { resolveHitRadius, resolveSpawnPoint } from "../battle-world"
import type { InternalBattleState } from "../battle-state"

export function spawnMissionEnemies(input: {
  battle: InternalBattleState
  previousElapsedMs: number
  enemies: Record<string, EnemyArchetype>
  battleSpawnPoints: Record<string, BattleSpawnPoint>
  hitboxPresets: Record<string, ContentHitboxPreset>
  difficultyModifiers: DifficultyModifiers
  nextInstanceId(prefix: string): string
}): void {
  input.battle.mission.waves.forEach((wave) => {
    if (input.battle.spawnedWaveIds.has(wave.waveId)) {
      return
    }
    if (wave.atMs < input.previousElapsedMs || wave.atMs > input.battle.elapsedMs) {
      return
    }
    input.battle.spawnedWaveIds.add(wave.waveId)
    wave.entries.forEach((entry) => {
      const enemy = input.enemies[entry.enemyId]
      if (!enemy) {
        throw new Error(`Missing enemy ${entry.enemyId} in mission ${input.battle.mission.missionId}.`)
      }
      const hitbox = input.hitboxPresets[enemy.hitboxPresetId]
      if (!hitbox) {
        throw new Error(`Missing hitbox preset: ${enemy.hitboxPresetId}`)
      }
      const spawnPosition = resolveSpawnPoint(entry.spawnPointId, input.battleSpawnPoints)
      const maxHp = Math.max(1, Math.round(enemy.hp * (input.difficultyModifiers.enemyHpMultiplier ?? 1)))
      // spawnId を弾幕位相の主キーにして、entry 順の変更で同じノイズ源の位相が変わらないようにします。
      const patternSeed = entry.seed === undefined ? entry.spawnId : `${entry.spawnId}:${entry.seed}`
      input.battle.enemies.push({
        enemyInstanceId: input.nextInstanceId(entry.enemyId),
        enemyId: entry.enemyId,
        spawnId: entry.spawnId,
        patternSeed,
        movementPatternId: entry.movementPatternId,
        spawnPosition,
        position: { ...spawnPosition },
        hp: maxHp,
        maxHp,
        enteredAtMs: input.battle.elapsedMs,
        patternLastFiredAtMs: {},
        burnDamagePerSec: 0,
        burnUntilMs: 0,
        radius: resolveHitRadius(hitbox),
        overrides: entry.overrides,
      })
    })
  })
}

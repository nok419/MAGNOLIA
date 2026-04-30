import type { ContentHitboxPreset, DifficultyModifiers, EnemyArchetype } from "@magnolia/contracts"
import { resolveHitRadius, resolveSpawnPoint } from "../battle-world"
import type { InternalBattleState } from "../battle-state"

export function spawnMissionEnemies(input: {
  battle: InternalBattleState
  previousElapsedMs: number
  enemies: Record<string, EnemyArchetype>
  hitboxPresets: Record<string, ContentHitboxPreset>
  difficultyModifiers: DifficultyModifiers
  nextInstanceId(prefix: string): string
}): void {
  input.battle.mission.waves.forEach((wave, waveIndex) => {
    if (input.battle.spawnedWaveIndexes.has(waveIndex)) {
      return
    }
    if (wave.atMs < input.previousElapsedMs || wave.atMs > input.battle.elapsedMs) {
      return
    }
    input.battle.spawnedWaveIndexes.add(waveIndex)
    for (const entry of wave.entries) {
      const enemy = input.enemies[entry.enemyId]
      const hitbox = input.hitboxPresets[enemy.hitboxPresetId]
      if (!hitbox) {
        throw new Error(`Missing hitbox preset: ${enemy.hitboxPresetId}`)
      }
      const spawnPosition = resolveSpawnPoint(entry.spawnPointId)
      const maxHp = Math.max(1, Math.round(enemy.hp * (input.difficultyModifiers.enemyHpMultiplier ?? 1)))
      input.battle.enemies.push({
        enemyInstanceId: input.nextInstanceId(entry.enemyId),
        enemyId: entry.enemyId,
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
    }
  })
}

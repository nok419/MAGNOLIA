import type {
  BattleSpawnPoint,
  ContentHitboxPreset,
  DifficultyModifiers,
  EnemyArchetype,
  EnemySpawn,
  Vector2,
} from "@magnolia/contracts"
import { resolveHitRadius, resolveSpawnPoint } from "../battle-world"
import type { InternalBattleState } from "../battle-state"

type ResolvedEnemySpawn = {
  entry: EnemySpawn
  spawnId: string
  duplicateIndex: number
  sourceIndex: number
}

export function spawnMissionEnemies(input: {
  battle: InternalBattleState
  previousElapsedMs: number
  enemies: Record<string, EnemyArchetype>
  battleSpawnPoints: Record<string, BattleSpawnPoint>
  hitboxPresets: Record<string, ContentHitboxPreset>
  difficultyModifiers: DifficultyModifiers
  nextInstanceId(prefix: string): string
}): void {
  let baseCountBeforeWave = 0
  input.battle.mission.waves.forEach((wave) => {
    const currentWaveBaseCountBefore = baseCountBeforeWave
    baseCountBeforeWave += wave.entries.length
    if (input.battle.spawnedWaveIds.has(wave.waveId)) {
      return
    }
    if (wave.atMs < input.previousElapsedMs || wave.atMs > input.battle.elapsedMs) {
      return
    }
    input.battle.spawnedWaveIds.add(wave.waveId)
    const resolvedEntries = resolveWaveEntriesForDifficulty({
      entries: wave.entries,
      baseCountBeforeWave: currentWaveBaseCountBefore,
      spawnCountMultiplier: input.difficultyModifiers.enemySpawnCountMultiplier ?? 1,
    })
    input.battle.wavePerformance ??= {}
    input.battle.wavePerformance[wave.waveId] = {
      waveId: wave.waveId,
      atMs: wave.atMs,
      expectedEnemyCount: resolvedEntries.length,
      destroyedSpawnIds: new Set<string>(),
    }
    resolvedEntries.forEach(({ entry, spawnId, duplicateIndex, sourceIndex }) => {
      const enemy = input.enemies[entry.enemyId]
      if (!enemy) {
        throw new Error(`Missing enemy ${entry.enemyId} in mission ${input.battle.mission.missionId}.`)
      }
      const hitbox = input.hitboxPresets[enemy.hitboxPresetId]
      if (!hitbox) {
        throw new Error(`Missing hitbox preset: ${enemy.hitboxPresetId}`)
      }
      const spawnPosition = applyDifficultySpawnOffset({
        position: resolveSpawnPoint(entry.spawnPointId, input.battleSpawnPoints),
        duplicateIndex,
        sourceIndex,
      })
      const maxHp = Math.max(1, Math.round(enemy.hp * (input.difficultyModifiers.enemyHpMultiplier ?? 1)))
      // spawnId を弾幕位相の主キーにして、entry 順の変更で同じノイズ源の位相が変わらないようにします。
      const patternSeed = entry.seed === undefined ? spawnId : `${spawnId}:${entry.seed}`
      input.battle.enemies.push({
        enemyInstanceId: input.nextInstanceId(entry.enemyId),
        enemyId: entry.enemyId,
        spawnId,
        waveId: wave.waveId,
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

function resolveWaveEntriesForDifficulty(input: {
  entries: EnemySpawn[]
  baseCountBeforeWave: number
  spawnCountMultiplier: number
}): ResolvedEnemySpawn[] {
  const baseEntries = input.entries.map((entry, sourceIndex) => ({
    entry,
    spawnId: entry.spawnId,
    duplicateIndex: 0,
    sourceIndex,
  }))
  if (input.spawnCountMultiplier <= 1 || input.entries.length === 0) {
    return baseEntries
  }

  const baseCountAfterWave = input.baseCountBeforeWave + input.entries.length
  const targetBeforeWave = Math.floor(input.baseCountBeforeWave * input.spawnCountMultiplier)
  const targetAfterWave = Math.floor(baseCountAfterWave * input.spawnCountMultiplier)
  const targetWaveCount = Math.max(input.entries.length, targetAfterWave - targetBeforeWave)
  const additionalCount = targetWaveCount - input.entries.length

  // mission 全体の累積数で追加分を配分し、1 体 wave だけが極端に増えないようにします。
  const additionalEntries = Array.from({ length: additionalCount }, (_, index) => {
    const sourceIndex = index % input.entries.length
    const duplicateIndex = Math.floor(index / input.entries.length) + 1
    const entry = input.entries[sourceIndex]
    return {
      entry,
      spawnId: `${entry.spawnId}__terminal_${duplicateIndex}`,
      duplicateIndex,
      sourceIndex,
    }
  })

  return [...baseEntries, ...additionalEntries]
}

function applyDifficultySpawnOffset(input: {
  position: Vector2
  duplicateIndex: number
  sourceIndex: number
}): Vector2 {
  if (input.duplicateIndex === 0) {
    return input.position
  }

  const direction = input.sourceIndex % 2 === 0 ? -1 : 1
  return {
    x: input.position.x + direction * 18 * input.duplicateIndex,
    y: input.position.y + 10 * input.duplicateIndex,
  }
}

import type {
  BattleHazardViewModel,
  BattlefieldHazardArea,
  BattlefieldHazardSpec,
  BattlefieldHazardState,
  DifficultyModifiers,
  MissionMaster,
  MissionState,
  Vector2,
} from "@magnolia/contracts"

const MAGNETIC_DISASTER_GROWTH_GRACE_RATIO = 0.18

export function stepBattlefieldHazards(input: {
  mission: MissionMaster
  missionState: MissionState
  playerPosition: Vector2
  dtMs: number
  difficultyModifiers?: DifficultyModifiers
}): {
  missionState: MissionState
  playerNoiseDamage: number
} {
  const currentElapsedMs = input.missionState.elapsedMs
  const previousElapsedMs = Math.max(0, currentElapsedMs - input.dtMs)
  const previousStateById = new Map(
    input.missionState.hazards.map((hazard) => [hazard.hazardId, hazard]),
  )
  let playerNoiseDamage = 0
  const hazardSpecs = resolveBattlefieldHazardSpecsForDifficulty({
    mission: input.mission,
    difficultyModifiers: input.difficultyModifiers,
  })

  const hazards = hazardSpecs.flatMap((spec) => {
    const previousState = previousStateById.get(spec.hazardId)
    const nextState = resolveHazardStateForFrame({
      spec,
      previousState,
      currentElapsedMs,
    })
    if (!nextState) {
      return []
    }

    if (nextState.phase !== "active") {
      return [nextState]
    }

    // 磁気災害は警告が消えた直後に即ダメージを与えず、小さな乱気流が育つ時間を置きます。
    if (nextState.phaseProgress < MAGNETIC_DISASTER_GROWTH_GRACE_RATIO) {
      return [
        {
          ...nextState,
          lastAppliedAtMs: currentElapsedMs,
        },
      ]
    }

    if (!isPointInsideArea(input.playerPosition, nextState.area)) {
      // 接触していない間の tick を次回に持ち越さないよう、非接触時点を基準時刻へ更新します。
      return [
        {
          ...nextState,
          lastAppliedAtMs: currentElapsedMs,
        },
      ]
    }

    const activeStartMs = spec.spawnAtMs + spec.telegraphMs
    const lastAppliedAtMs =
      nextState.lastAppliedAtMs ?? Math.max(activeStartMs, previousElapsedMs)
    const elapsedSinceLastTick = currentElapsedMs - lastAppliedAtMs
    if (elapsedSinceLastTick < nextState.tickIntervalMs) {
      return [nextState]
    }

    const tickCount = Math.floor(elapsedSinceLastTick / nextState.tickIntervalMs)
    playerNoiseDamage += tickCount * nextState.noiseDamage

    return [
      {
        ...nextState,
        lastAppliedAtMs: lastAppliedAtMs + tickCount * nextState.tickIntervalMs,
      },
    ]
  })

  return {
    missionState: {
      ...input.missionState,
      hazards,
    },
    playerNoiseDamage,
  }
}

export function resolveBattlefieldHazardSpecsForDifficulty(input: {
  mission: MissionMaster
  difficultyModifiers?: DifficultyModifiers
}): BattlefieldHazardSpec[] {
  const frequencyMultiplier =
    input.difficultyModifiers?.magneticDisasterFrequencyMultiplier ?? 1
  const magneticHazards = input.mission.hazards.filter(
    (hazard) => hazard.kind === "magneticDisaster",
  )
  if (frequencyMultiplier <= 1 || magneticHazards.length === 0) {
    return input.mission.hazards
  }

  const targetCount = Math.max(
    magneticHazards.length,
    Math.ceil(magneticHazards.length * frequencyMultiplier),
  )
  const additionalCount = targetCount - magneticHazards.length
  const generatedHazards = [...magneticHazards]

  for (let index = 0; index < additionalCount; index += 1) {
    const source = magneticHazards[index % magneticHazards.length]
    const spawnAtMs = chooseAdditionalHazardSpawnAtMs({
      mission: input.mission,
      scheduledHazards: generatedHazards,
      source,
    })
    // 追加 hazard は authored ID を壊さず、difficulty 由来だと分かる安定 ID にします。
    generatedHazards.push({
      ...source,
      hazardId: `${source.hazardId}__terminal_${index + 1}`,
      spawnAtMs,
    })
  }

  const generatedById = new Map(
    generatedHazards.map((hazard) => [hazard.hazardId, hazard]),
  )
  return [
    ...input.mission.hazards.filter((hazard) => hazard.kind !== "magneticDisaster"),
    ...Array.from(generatedById.values()).sort((a, b) => a.spawnAtMs - b.spawnAtMs),
  ]
}

export function buildBattleHazardViewModels(input: {
  hazards: BattlefieldHazardState[]
}): BattleHazardViewModel[] {
  return input.hazards.map((hazard) => ({
    hazardId: hazard.hazardId,
    kind: hazard.kind,
    phase: hazard.phase,
    phaseProgress: hazard.phaseProgress,
    area: hazard.area,
    motion: hazard.motion,
    visualPresetId: hazard.visualPresetId,
  }))
}

function resolveHazardStateForFrame(input: {
  spec: BattlefieldHazardSpec
  previousState: BattlefieldHazardState | undefined
  currentElapsedMs: number
}): BattlefieldHazardState | undefined {
  const totalDurationMs =
    input.spec.telegraphMs + input.spec.activeMs + input.spec.fadeOutMs
  const endAtMs = input.spec.spawnAtMs + totalDurationMs
  if (input.currentElapsedMs < input.spec.spawnAtMs || input.currentElapsedMs >= endAtMs) {
    return undefined
  }

  const telegraphEndMs = input.spec.spawnAtMs + input.spec.telegraphMs
  const activeEndMs = telegraphEndMs + input.spec.activeMs
  const elapsedSinceSpawnMs = input.currentElapsedMs - input.spec.spawnAtMs

  if (input.currentElapsedMs < telegraphEndMs) {
    return {
      hazardId: input.spec.hazardId,
      kind: "magneticDisaster",
      phase: "telegraph",
      phaseProgress: divideProgress(elapsedSinceSpawnMs, input.spec.telegraphMs),
      area: applyHazardMotion(input.spec.area, input.spec, elapsedSinceSpawnMs),
      motion: input.spec.motion,
      tickIntervalMs: input.spec.tickIntervalMs,
      noiseDamage: input.spec.noiseDamage,
      enemyDamagePerSecond: readHazardEnemyDamagePerSecond(input.spec),
      visualPresetId: input.spec.visualPresetId,
      lastAppliedAtMs: input.previousState?.lastAppliedAtMs,
    }
  }

  if (input.currentElapsedMs < activeEndMs) {
    return {
      hazardId: input.spec.hazardId,
      kind: "magneticDisaster",
      phase: "active",
      phaseProgress: divideProgress(
        input.currentElapsedMs - telegraphEndMs,
        input.spec.activeMs,
      ),
      area: applyHazardMotion(input.spec.area, input.spec, elapsedSinceSpawnMs),
      motion: input.spec.motion,
      tickIntervalMs: input.spec.tickIntervalMs,
      noiseDamage: input.spec.noiseDamage,
      enemyDamagePerSecond: readHazardEnemyDamagePerSecond(input.spec),
      visualPresetId: input.spec.visualPresetId,
      lastAppliedAtMs: input.previousState?.lastAppliedAtMs,
    }
  }

  return {
    hazardId: input.spec.hazardId,
    kind: "magneticDisaster",
    phase: "fading",
    phaseProgress: divideProgress(input.currentElapsedMs - activeEndMs, input.spec.fadeOutMs),
    area: applyHazardMotion(input.spec.area, input.spec, elapsedSinceSpawnMs),
    motion: input.spec.motion,
    tickIntervalMs: input.spec.tickIntervalMs,
    noiseDamage: input.spec.noiseDamage,
    enemyDamagePerSecond: readHazardEnemyDamagePerSecond(input.spec),
    visualPresetId: input.spec.visualPresetId,
    lastAppliedAtMs: input.previousState?.lastAppliedAtMs,
  }
}

function chooseAdditionalHazardSpawnAtMs(input: {
  mission: MissionMaster
  scheduledHazards: BattlefieldHazardSpec[]
  source: BattlefieldHazardSpec
}): number {
  const totalDurationMs =
    input.source.telegraphMs + input.source.activeMs + input.source.fadeOutMs
  const latestSpawnAtMs = Math.max(0, input.mission.durationMs - totalDurationMs)
  const scheduledTimes = input.scheduledHazards
    .map((hazard) => Math.max(0, Math.min(latestSpawnAtMs, hazard.spawnAtMs)))
    .sort((a, b) => a - b)
  let bestStartMs = 0
  let bestEndMs = latestSpawnAtMs

  for (let index = 0; index <= scheduledTimes.length; index += 1) {
    const startMs = index === 0 ? 0 : scheduledTimes[index - 1]
    const endMs = index === scheduledTimes.length ? latestSpawnAtMs : scheduledTimes[index]
    if (endMs - startMs > bestEndMs - bestStartMs) {
      bestStartMs = startMs
      bestEndMs = endMs
    }
  }

  // 既存 hazard の間で最も空いている時間帯へ追加し、特定 mission だけに偏らないようにします。
  return Math.round((bestStartMs + bestEndMs) / 2)
}

function readHazardEnemyDamagePerSecond(spec: BattlefieldHazardSpec): number {
  if (typeof spec.enemyDamagePerSecond === "number") {
    return Math.max(0, spec.enemyDamagePerSecond)
  }

  // 敵への継続ダメージは mission ごとに上書きできますが、未指定でも
  // 磁気災害が「場そのもののノイズ源」であることが分かる程度には
  // はっきり効く値を既定値として与えます。
  return Math.max(12, spec.noiseDamage * 180)
}

function applyHazardMotion(
  area: BattlefieldHazardArea,
  spec: BattlefieldHazardSpec,
  elapsedSinceSpawnMs: number,
): BattlefieldHazardArea {
  if (spec.motion.motionKind !== "linear") {
    return area
  }

  const elapsedSeconds = elapsedSinceSpawnMs / 1000
  return {
    ...area,
    x: area.x + spec.motion.velocity.x * elapsedSeconds,
    y: area.y + spec.motion.velocity.y * elapsedSeconds,
  }
}

function isPointInsideArea(position: Vector2, area: BattlefieldHazardArea): boolean {
  return (
    position.x >= area.x &&
    position.x <= area.x + area.width &&
    position.y >= area.y &&
    position.y <= area.y + area.height
  )
}

function divideProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 1
  }

  return Math.max(0, Math.min(1, elapsedMs / durationMs))
}

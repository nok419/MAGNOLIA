import type {
  BattlefieldHazardState,
  MissionMaster,
  MissionResult,
  NoiseState,
  ProjectileVisualRole,
  TimeRange,
  TranscriptChunkId,
  TranscriptChunk,
  TransmissionMaster,
  Vector2,
} from "@magnolia/contracts"
import type {
  createEquipmentRuntimeBindings,
  resolveLoadout,
} from "./equipment-runtime"

export type InternalEnemyState = {
  enemyInstanceId: string
  enemyId: string
  spawnPosition: Vector2
  position: Vector2
  hp: number
  maxHp: number
  enteredAtMs: number
  pauseStartedAtMs?: number
  patternLastFiredAtMs: Record<string, number>
  burnDamagePerSec: number
  burnUntilMs: number
  radius: number
  overrides?: Record<string, number | string | boolean>
}

export type InternalProjectileState = {
  projectileInstanceId: string
  projectileId: string
  visualRole?: ProjectileVisualRole
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  ageMs?: number
  initialLifetimeMs?: number
  radius: number
  remainingMs: number
  spawnDelayMs: number
  damage: number
  noiseDamage: number
  preBendVelocity?: Vector2
  postBendVelocity?: Vector2
  bendAfterMs?: number
  bendDurationMs?: number
  trailExplosionIntervalMs?: number
  trailExplosionTimerMs?: number
  trailExplosionRadius?: number
  trailExplosionDamageMultiplier?: number
  trailExplosionVisualProjectileId?: string
  explosiveRadius?: number
  burnDamagePerSec?: number
  burnDurationMs?: number
  detonationDelayMs?: number
  explosionDamageMultiplier?: number
  explosionVisualProjectileId?: string
  nonColliding?: boolean
  anchorToPlayer?: boolean
  meleeSweep?: {
    damage: number
    arcDeg: number
    hitEnemyInstanceIds: string[]
    burnDamagePerSec?: number
    burnDurationMs?: number
  }
  inversePhaseVisual?: boolean
}

export type InternalBarrierState = {
  barrierId: string
  radius: number
  remainingMs: number
  maxMs: number
  moveSpeedMultiplier: number
  allowAttackDuringUse: boolean
  blocksEnemyBullets: boolean
}

export type InternalSupportFieldState = {
  fieldInstanceId: string
  fieldId: string
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
  dpsInField: number
  blocksEnemyBullets: boolean
  blocksMagneticDisaster: boolean
  mainCadenceMultiplier: number
}

export type InternalPickupState = {
  pickupInstanceId: string
  kind: "selfRepairPoints"
  amount: number
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
}

export type InternalBattleFragmentState = {
  fragmentId: string
  chunkId: TranscriptChunkId
  startRatio: number
  endRatio: number
  origin: Vector2
  position: Vector2
  radius: number
  spawnedAtMs: number
  expiresAtMs: number
  strength: number
}

export type InternalBattleState = {
  mission: MissionMaster
  transmission: TransmissionMaster
  transcript: TranscriptChunk[]
  loadout: ReturnType<typeof resolveLoadout>
  bindings: ReturnType<typeof createEquipmentRuntimeBindings>
  noiseState: NoiseState
  elapsedMs: number
  audioPlaybackMs: number
  phase: "intro" | "playing" | "outro"
  heardRanges: TimeRange[]
  damageRanges: TimeRange[]
  seededHeardRanges: TimeRange[]
  restorationRate: number
  destroyedAnalysisValue: number
  score: number
  selfRepairPointsEarned: number
  cleared: boolean
  spawnedWaveIndexes: Set<number>
  playerPosition: Vector2
  mainCooldownMs: number
  mainMeleeCooldownMs: number
  subCooldownMs: number
  barrier?: InternalBarrierState
  supportFields: InternalSupportFieldState[]
  pickups: InternalPickupState[]
  fragments: InternalBattleFragmentState[]
  enemies: InternalEnemyState[]
  projectiles: InternalProjectileState[]
  activeResult?: MissionResult
  previousNoiseAudible: boolean
  lastFragmentSpawnedAtMs: number
  previousSubPressed: boolean
  hazards: BattlefieldHazardState[]
}

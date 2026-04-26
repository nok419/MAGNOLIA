import type {
  BattlefieldHazardState,
  MissionMaster,
  MissionResult,
  NoiseState,
  TimeRange,
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
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
  remainingMs: number
  spawnDelayMs: number
  damage: number
  noiseDamage: number
  explosiveRadius?: number
  burnDamagePerSec?: number
  burnDurationMs?: number
  detonationDelayMs?: number
  explosionDamageMultiplier?: number
  explosionVisualProjectileId?: string
  nonColliding?: boolean
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
  subCooldownMs: number
  barrier?: InternalBarrierState
  supportFields: InternalSupportFieldState[]
  pickups: InternalPickupState[]
  enemies: InternalEnemyState[]
  projectiles: InternalProjectileState[]
  activeResult?: MissionResult
  previousNoiseAudible: boolean
  previousSubPressed: boolean
  hazards: BattlefieldHazardState[]
}

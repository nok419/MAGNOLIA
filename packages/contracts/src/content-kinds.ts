export const ENEMY_RENDERER_KINDS = ["circleSignal", "shardCore", "bossLattice"] as const
export type EnemyRendererKind = (typeof ENEMY_RENDERER_KINDS)[number]

export const PROJECTILE_RENDERER_KINDS = ["orb", "shard", "lance", "pulse", "carrier"] as const
export type ProjectileRendererKind = (typeof PROJECTILE_RENDERER_KINDS)[number]

export const PROJECTILE_BODY_KINDS = [
  "defaultPlayerPulse",
  "carrierBolt",
  "carrierBlast",
  "noiseOrb",
  "signalShard",
  "geoDiamond",
  "lance",
  "bossCore",
] as const
export type ProjectileBodyKind = (typeof PROJECTILE_BODY_KINDS)[number]

export const HAZARD_RENDERER_KINDS = ["magneticDisaster"] as const
export type HazardRendererKind = (typeof HAZARD_RENDERER_KINDS)[number]

export const BACKGROUND_THEMES = ["centralTower", "broadcastFacility", "voidField"] as const
export type BackgroundTheme = (typeof BACKGROUND_THEMES)[number]

export const HITBOX_SHAPES = ["circle", "ellipse", "rect", "polygon"] as const
export type HitboxShape = (typeof HITBOX_SHAPES)[number]

export const BATTLE_FIELD_WIDTH = 480
export const BATTLE_FIELD_HEIGHT = 520
export const BATTLE_SPAWN_OUTER_MARGIN = 96

export const BATTLE_SPAWN_POINT_SIDES = ["player", "noiseSource", "shared"] as const
export type BattleSpawnPointSide = (typeof BATTLE_SPAWN_POINT_SIDES)[number]

export const ENEMY_BEHAVIOR_KINDS = ["straightDown", "zigzag", "slowDescent"] as const
export type EnemyBehaviorKind = (typeof ENEMY_BEHAVIOR_KINDS)[number]

export const MOVEMENT_PATTERN_KINDS = [
  "linear",
  "sineDrift",
  "pauseThenDrift",
  "bezierRoute",
  "holdAndFade",
] as const
export type MovementPatternKind = (typeof MOVEMENT_PATTERN_KINDS)[number]

export const BULLET_PATTERN_KINDS = ["goldenStream", "radial", "spread"] as const
export type BulletPatternKind = (typeof BULLET_PATTERN_KINDS)[number]

export const BULLET_PATTERN_AUTHORING_PARAM_KEYS = [
  "visualOnly",
  "nonColliding",
  "safeLaneHint",
  "baseAngleDeg",
  "rotationDegPerSec",
  "phaseOffsetDeg",
  "oscillationDeg",
  "oscillationMs",
  "aimAtPlayer",
  "spreadDeg",
] as const
export type BulletPatternAuthoringParamKey = (typeof BULLET_PATTERN_AUTHORING_PARAM_KEYS)[number]

export const ENEMY_OVERRIDE_KEYS = [
  "speed",
  "driftX",
  "driftY",
  "wobbleAmplitude",
  "wobblePeriodMs",
  "pauseAtY",
  "pauseMs",
  "durationMs",
  "holdMs",
  "fadeMs",
] as const
export type EnemyOverrideKey = (typeof ENEMY_OVERRIDE_KEYS)[number]

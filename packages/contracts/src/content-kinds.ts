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

export const ENEMY_BEHAVIOR_KINDS = ["straightDown", "zigzag", "slowDescent"] as const
export type EnemyBehaviorKind = (typeof ENEMY_BEHAVIOR_KINDS)[number]

export const BULLET_PATTERN_KINDS = ["goldenStream", "radial", "spread"] as const
export type BulletPatternKind = (typeof BULLET_PATTERN_KINDS)[number]

export const ENEMY_OVERRIDE_KEYS = [
  "speed",
  "driftX",
  "wobbleAmplitude",
  "wobblePeriodMs",
  "pauseAtY",
  "pauseMs",
] as const
export type EnemyOverrideKey = (typeof ENEMY_OVERRIDE_KEYS)[number]

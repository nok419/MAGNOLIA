// Keep this file aligned with packages/contracts/src/content-kinds.ts.
// The validator emits standalone NodeNext JavaScript, so it cannot import package source directly.
export const ENEMY_RENDERER_KINDS = ["circleSignal", "shardCore", "bossLattice"] as const
export const PROJECTILE_RENDERER_KINDS = ["orb", "shard", "lance", "pulse", "carrier"] as const
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
export const HAZARD_RENDERER_KINDS = ["magneticDisaster"] as const
export const BACKGROUND_THEMES = ["centralTower", "broadcastFacility", "voidField"] as const
export const HITBOX_SHAPES = ["circle", "ellipse", "rect", "polygon"] as const
export const BATTLE_FIELD_WIDTH = 480
export const BATTLE_FIELD_HEIGHT = 520
export const BATTLE_SPAWN_OUTER_MARGIN = 96
export const BATTLE_SPAWN_POINT_SIDES = ["player", "noiseSource", "shared"] as const
export const ENEMY_BEHAVIOR_KINDS = ["straightDown", "zigzag", "slowDescent"] as const
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
export const MOVEMENT_PATTERN_KINDS = [
  "linear",
  "sineDrift",
  "pauseThenDrift",
  "bezierRoute",
  "holdAndFade",
] as const
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

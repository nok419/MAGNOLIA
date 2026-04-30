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

import type {
  BulletVisualPreset,
  ContentBundle,
  EnemyVisualPreset,
  HazardVisualPreset,
  ProjectileId,
  VisualPreset,
  VisualPresetId,
} from "@magnolia/contracts"
import type {
  BattleEnemyVisualView,
  BattleHazardVisualView,
  BattleProjectileVisualView,
  BattleSupportFieldVisualView,
} from "./runtime-types"

export function resolveEnemyVisualView(input: {
  content: ContentBundle
  enemyId: string
}): BattleEnemyVisualView {
  const enemy = input.content.enemies[input.enemyId]
  if (!enemy) {
    throw new Error(`Missing enemy visual source for ${input.enemyId}.`)
  }
  const preset = readEnemyVisualPreset(input.content, enemy.visualPresetId)
  const coreRadius = Math.max(1, preset.coreRadius)

  return {
    visualPresetId: preset.visualPresetId,
    rendererKind: preset.rendererKind,
    paletteRole: preset.paletteRole,
    accentColor: preset.accentColor,
    secondaryColor: preset.secondaryColor,
    glowColor: preset.glowColor,
    seedBucket: preset.seedBucket,
    orbit1Scale: preset.orbit1Radius / coreRadius,
    orbit2Scale: preset.orbit2Radius / coreRadius,
    midOrbitScale:
      preset.rendererKind === "orbitalBoss"
        ? (preset.orbit1Radius + preset.orbit2Radius) / (coreRadius * 2)
        : undefined,
    orbit1Width: preset.orbit1Width,
    orbit2Width: preset.orbit2Width,
    orbit1ArcStart: preset.orbit1ArcStart,
    orbit1ArcEnd: preset.orbit1ArcEnd,
    orbit2ArcStart: preset.orbit2ArcStart,
    orbit2ArcEnd: preset.orbit2ArcEnd,
    orbit1AngularSpeed: preset.orbit1AngularSpeed,
    orbit2AngularSpeed: preset.orbit2AngularSpeed,
    iconType: preset.iconType,
    iconAngle: preset.iconAngle,
    iconGapAngle: preset.iconGapAngle,
    iconSize: Math.max(2.6, coreRadius * 0.3),
    iconCount: preset.rendererKind === "orbitalBoss" ? readBossIconCount(preset.visualPresetId) : undefined,
    glowStrength: preset.glowStrength,
  }
}

export function resolveProjectileVisualView(input: {
  content: ContentBundle
  projectileId: ProjectileId
  inversePhaseVisual?: boolean
}): BattleProjectileVisualView {
  const projectile = input.content.projectiles[input.projectileId]
  if (!projectile) {
    throw new Error(`Missing projectile visual source for ${input.projectileId}.`)
  }
  const preset = readBulletVisualPreset(input.content, projectile.visualPresetId)
  const auraKind =
    input.inversePhaseVisual && preset.rendererKind !== "playerMelee"
      ? "inversePhase"
      : preset.auraKind

  return {
    visualPresetId: preset.visualPresetId,
    rendererKind: preset.rendererKind,
    paletteRole: preset.paletteRole,
    accentColor: preset.accentColor,
    secondaryColor: preset.secondaryColor,
    glowColor: preset.glowColor,
    radiusScale: preset.radiusScale,
    auraKind,
    bodyType: preset.bodyType,
    trailType: projectile.trailPresetId ? preset.trailType : preset.trailType,
    seedBucket: preset.seedBucket,
    scale: preset.scale,
    glowStrength: preset.glowStrength,
  }
}

export function resolveSupportFieldVisualView(fieldId: string): BattleSupportFieldVisualView {
  const rendererKind = fieldId === "field.silent_wave" ? "silentWave" : "default"
  return {
    rendererKind,
    paletteRole: "support",
    accentColor: rendererKind === "silentWave" ? "#74f0ff" : "#9ce06f",
    glowColor:
      rendererKind === "silentWave"
        ? "rgba(116, 240, 255, 0.9)"
        : "rgba(156, 224, 111, 0.72)",
  }
}

export function resolveHazardVisualView(input: {
  content: ContentBundle
  visualPresetId: VisualPresetId
}): BattleHazardVisualView {
  const preset = readHazardVisualPreset(input.content, input.visualPresetId)
  return {
    visualPresetId: preset.visualPresetId,
    rendererKind: "magneticDisaster",
    paletteRole: "dangerNoise",
    telegraphColor: preset.telegraphColor,
    activeColor: preset.activeColor,
    telegraphFlashHz: preset.telegraphFlashHz,
    noiseScrollSpeed: preset.noiseScrollSpeed,
    edgeFeather: preset.edgeFeather,
    telegraphOpacity: preset.telegraphOpacity,
    activeOpacity: preset.activeOpacity,
  }
}

function readEnemyVisualPreset(content: ContentBundle, visualPresetId: VisualPresetId): EnemyVisualPreset {
  const preset = content.visuals[visualPresetId]
  if (!isEnemyVisualPreset(preset)) {
    throw new Error(`Visual preset ${visualPresetId} is not an enemy visual preset.`)
  }
  return preset
}

function readBulletVisualPreset(content: ContentBundle, visualPresetId: VisualPresetId): BulletVisualPreset {
  const preset = content.visuals[visualPresetId]
  if (!isBulletVisualPreset(preset)) {
    throw new Error(`Visual preset ${visualPresetId} is not a bullet visual preset.`)
  }
  return preset
}

function readHazardVisualPreset(content: ContentBundle, visualPresetId: VisualPresetId): HazardVisualPreset {
  const preset = content.visuals[visualPresetId]
  if (!isHazardVisualPreset(preset)) {
    throw new Error(`Visual preset ${visualPresetId} is not a hazard visual preset.`)
  }
  return preset
}

function isEnemyVisualPreset(preset: VisualPreset | undefined): preset is EnemyVisualPreset {
  return Boolean(preset && "coreRadius" in preset && "rendererKind" in preset)
}

function isBulletVisualPreset(preset: VisualPreset | undefined): preset is BulletVisualPreset {
  return Boolean(preset && "bodyType" in preset && "rendererKind" in preset)
}

function isHazardVisualPreset(preset: VisualPreset | undefined): preset is HazardVisualPreset {
  return Boolean(preset && "kind" in preset && preset.kind === "magneticDisaster")
}

function readBossIconCount(visualPresetId: VisualPresetId): number {
  if (visualPresetId.endsWith("_b1")) {
    return 4
  }
  return 3
}

import {
  addIssue,
  asArray,
  asNumber,
  asRecord,
  asString,
  indexById,
  type ValidationContext,
} from "./validate-content.js"

const ENEMY_RENDERER_KINDS = new Set(["circleSignal", "shardCore", "bossLattice"])
const PROJECTILE_RENDERER_KINDS = new Set(["orb", "shard", "lance", "pulse", "carrier"])
const HAZARD_RENDERER_KINDS = new Set(["magneticDisaster"])
const BACKGROUND_THEMES = new Set(["centralTower", "broadcastFacility", "voidField"])
const HITBOX_SHAPES = new Set(["circle", "ellipse", "rect", "polygon"])

export function validatePresetRules(context: ValidationContext): void {
  const visualPresets = indexById(context.store.byGroup["visual-presets"] ?? [], ["presetId"])
  const hitboxPresets = indexById(context.store.byGroup["hitbox-presets"] ?? [], ["presetId", "hitboxPresetId"])
  const backgroundPresets = indexById(context.store.byGroup["background-presets"] ?? [], ["presetId"])

  validatePresetDefinitions(context, visualPresets, hitboxPresets, backgroundPresets)
  validateCoverage(context, visualPresets, hitboxPresets, backgroundPresets)
}

function validatePresetDefinitions(
  context: ValidationContext,
  visualPresets: Map<string, ReturnType<typeof indexById> extends Map<string, infer T> ? T : never>,
  hitboxPresets: Map<string, ReturnType<typeof indexById> extends Map<string, infer T> ? T : never>,
  backgroundPresets: Map<string, ReturnType<typeof indexById> extends Map<string, infer T> ? T : never>,
): void {
  for (const [presetId, file] of visualPresets) {
    const preset = asRecord(file.data)
    const category = asString(preset?.category)
    const rendererKind = asString(preset?.rendererKind)
    if (category === "enemy" && !ENEMY_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Enemy visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "projectile" && !PROJECTILE_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Projectile visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "hazard" && !HAZARD_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Hazard visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (!asString(preset?.paletteRole)) {
      addIssue(context, `Visual preset '${presetId}' must declare paletteRole.`, file.relativePath)
    }
    if (!asString(preset?.accessibilityVariant)) {
      addIssue(context, `Visual preset '${presetId}' must declare accessibilityVariant.`, file.relativePath)
    }
  }

  for (const [presetId, file] of hitboxPresets) {
    const preset = asRecord(file.data)
    const shape = asString(preset?.shape)
    if (!HITBOX_SHAPES.has(shape ?? "")) {
      addIssue(context, `Hitbox preset '${presetId}' has unsupported shape '${String(shape)}'.`, file.relativePath)
    }
  }

  for (const [presetId, file] of backgroundPresets) {
    const preset = asRecord(file.data)
    const theme = asString(preset?.theme)
    if (!BACKGROUND_THEMES.has(theme ?? "")) {
      addIssue(context, `Background preset '${presetId}' has unsupported theme '${String(theme)}'.`, file.relativePath)
    }
    for (const key of ["residualWarmth", "structureDensity", "dustDensity", "scanlineIntensity", "vignetteStrength"]) {
      const value = asNumber(preset?.[key])
      if (value === undefined || value < 0 || value > 1) {
        addIssue(context, `Background preset '${presetId}.${key}' must be between 0 and 1.`, file.relativePath)
      }
    }
  }
}

function validateCoverage(
  context: ValidationContext,
  visualPresets: Map<string, unknown>,
  hitboxPresets: Map<string, unknown>,
  backgroundPresets: Map<string, unknown>,
): void {
  for (const file of context.store.byGroup.missions ?? []) {
    const mission = asRecord(file.data)
    const missionId = asString(mission?.missionId) ?? file.relativePath
    requirePreset(context, backgroundPresets, asString(mission?.backgroundPresetId), "background preset", missionId, file.relativePath)
    for (const hazard of asArray(mission?.hazards)) {
      const hazardRecord = asRecord(hazard)
      requirePreset(context, visualPresets, asString(hazardRecord?.visualPresetId), "hazard visual preset", missionId, file.relativePath)
    }
  }

  for (const file of context.store.byGroup.enemies ?? []) {
    const enemy = asRecord(file.data)
    const enemyId = asString(enemy?.enemyId) ?? file.relativePath
    requirePreset(context, visualPresets, asString(enemy?.visualPresetId), "enemy visual preset", enemyId, file.relativePath)
    requirePreset(context, hitboxPresets, asString(enemy?.hitboxPresetId), "enemy hitbox preset", enemyId, file.relativePath)
  }

  for (const file of context.store.byGroup.projectiles ?? []) {
    const projectile = asRecord(file.data)
    const projectileId = asString(projectile?.projectileId) ?? file.relativePath
    requirePreset(context, visualPresets, asString(projectile?.visualPresetId), "projectile visual preset", projectileId, file.relativePath)
    requirePreset(context, hitboxPresets, asString(projectile?.hitboxPresetId), "projectile hitbox preset", projectileId, file.relativePath)
  }
}

function requirePreset(
  context: ValidationContext,
  index: Map<string, unknown>,
  presetId: string | undefined,
  kind: string,
  owner: string,
  file: string,
): void {
  if (!presetId || !index.has(presetId)) {
    addIssue(context, `Missing ${kind} '${String(presetId)}' referenced by ${owner}.`, file)
  }
}

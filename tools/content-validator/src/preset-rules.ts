import {
  addIssue,
  addWarning,
  asArray,
  asNumber,
  asRecord,
  asString,
  indexById,
  type ValidationContext,
} from "./validate-content.js"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  BACKGROUND_THEMES,
  ENEMY_RENDERER_KINDS,
  HAZARD_RENDERER_KINDS,
  HITBOX_SHAPES,
  PROJECTILE_BODY_KINDS,
  PROJECTILE_RENDERER_KINDS,
} from "./content-kinds.js"

const SUPPORTED_ENEMY_RENDERER_KINDS: ReadonlySet<string> = new Set(ENEMY_RENDERER_KINDS)
const SUPPORTED_PROJECTILE_RENDERER_KINDS: ReadonlySet<string> = new Set(PROJECTILE_RENDERER_KINDS)
const SUPPORTED_PROJECTILE_BODY_KINDS: ReadonlySet<string> = new Set(PROJECTILE_BODY_KINDS)
const SUPPORTED_HAZARD_RENDERER_KINDS: ReadonlySet<string> = new Set(HAZARD_RENDERER_KINDS)
const SUPPORTED_BACKGROUND_THEMES: ReadonlySet<string> = new Set(BACKGROUND_THEMES)
const SUPPORTED_HITBOX_SHAPES: ReadonlySet<string> = new Set(HITBOX_SHAPES)

export function validatePresetRules(context: ValidationContext): void {
  const visualPresets = indexById(context.store.byGroup["visual-presets"] ?? [], ["presetId"])
  const hitboxPresets = indexById(context.store.byGroup["hitbox-presets"] ?? [], ["presetId", "hitboxPresetId"])
  const backgroundPresets = indexById(context.store.byGroup["background-presets"] ?? [], ["presetId"])

  validatePresetDefinitions(context, visualPresets, hitboxPresets, backgroundPresets)
  validateCoverage(context, visualPresets, hitboxPresets, backgroundPresets)
  validateRuntimeConsumptionWarnings(context)
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
    if (category === "enemy" && !SUPPORTED_ENEMY_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Enemy visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "projectile" && !SUPPORTED_PROJECTILE_RENDERER_KINDS.has(rendererKind ?? "")) {
      addIssue(context, `Projectile visual preset '${presetId}' has unsupported rendererKind '${String(rendererKind)}'.`, file.relativePath)
    }
    if (category === "projectile") {
      const bodyKind = asString(preset?.bodyKind)
      if (!SUPPORTED_PROJECTILE_BODY_KINDS.has(bodyKind ?? "")) {
        addIssue(context, `Projectile visual preset '${presetId}' has unsupported bodyKind '${String(bodyKind)}'.`, file.relativePath)
      }
    }
    if (category === "hazard" && !SUPPORTED_HAZARD_RENDERER_KINDS.has(rendererKind ?? "")) {
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
    if (!SUPPORTED_HITBOX_SHAPES.has(shape ?? "")) {
      addIssue(context, `Hitbox preset '${presetId}' has unsupported shape '${String(shape)}'.`, file.relativePath)
    }
  }

  for (const [presetId, file] of backgroundPresets) {
    const preset = asRecord(file.data)
    const theme = asString(preset?.theme)
    if (!SUPPORTED_BACKGROUND_THEMES.has(theme ?? "")) {
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

function validateRuntimeConsumptionWarnings(context: ValidationContext): void {
  if (!context.store.usesDefaultGameplayDir) {
    return
  }

  const runtimeSource = [
    ...collectSourceFiles(path.join(context.store.rootDir, "apps", "web", "src", "render")),
    ...collectSourceFiles(path.join(context.store.rootDir, "packages", "game-session", "src")),
  ].map((file) => readFileSync(file, "utf8")).join("\n")

  warnIfUnused(context, runtimeSource, "trailKind", "visual preset field")
  warnIfUnused(context, runtimeSource, "motionProfile", "visual preset field")
  warnIfUnused(context, runtimeSource, "shape", "hitbox preset field")
  warnIfUnused(context, runtimeSource, "structureDensity", "background preset field")
  warnIfUnused(context, runtimeSource, "dustDensity", "background preset field")
  warnIfUnused(context, runtimeSource, "scanlineIntensity", "background preset field")
  warnIfUnused(context, runtimeSource, "vignetteStrength", "background preset field")
}

function warnIfUnused(
  context: ValidationContext,
  runtimeSource: string,
  field: string,
  label: string,
): void {
  if (runtimeSource.includes(field)) {
    return
  }

  // content schema に field を足しただけで描画や session が読まない状態を検出するための警告です。
  addWarning(
    context,
    `${label} '${field}' is present in content contracts but no renderer/session consumer was found.`,
    "content/gameplay",
  )
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }

  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath)
    }
  }
  return files
}

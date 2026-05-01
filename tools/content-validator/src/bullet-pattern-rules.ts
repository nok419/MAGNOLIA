import {
  addIssue,
  addReport,
  asArray,
  asNumber,
  asRecord,
  asString,
  indexById,
  type ValidationContext,
} from "./validate-content.js"

const ALLOWED_BULLET_PATTERN_PARAMS = new Set([
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
])

const NUMERIC_BULLET_PATTERN_PARAMS = new Set([
  "baseAngleDeg",
  "rotationDegPerSec",
  "phaseOffsetDeg",
  "oscillationDeg",
  "oscillationMs",
  "spreadDeg",
])

const BOOLEAN_BULLET_PATTERN_PARAMS = new Set([
  "visualOnly",
  "nonColliding",
  "aimAtPlayer",
])

export function validateBulletPatternRules(context: ValidationContext): void {
  const missions = indexById(context.store.byGroup.missions ?? [], ["missionId"])
  const enemies = indexById(context.store.byGroup.enemies ?? [], ["enemyId"])
  const patterns = indexById(context.store.byGroup["bullet-patterns"] ?? [], ["bulletPatternId"])
  const projectiles = indexById(context.store.byGroup.projectiles ?? [], ["projectileId"])

  for (const file of context.store.byGroup["bullet-patterns"] ?? []) {
    const pattern = asRecord(file.data)
    if (!pattern) {
      continue
    }
    const patternId = asString(pattern.bulletPatternId) ?? file.relativePath
    const cadenceMs = asNumber(pattern.cadenceMs)
    const burstCount = asNumber(pattern.burstCount)
    if (cadenceMs === undefined || cadenceMs <= 0) {
      addIssue(context, `Bullet pattern '${patternId}' must have positive cadenceMs.`, file.relativePath)
    }
    if (burstCount === undefined || burstCount <= 0) {
      addIssue(context, `Bullet pattern '${patternId}' must have positive burstCount.`, file.relativePath)
    }
    const params = asRecord(pattern.params) ?? {}
    for (const [key, value] of Object.entries(params)) {
      if (!ALLOWED_BULLET_PATTERN_PARAMS.has(key)) {
        addIssue(context, `Bullet pattern '${patternId}' has unsupported params.${key}.`, file.relativePath)
        continue
      }
      if (NUMERIC_BULLET_PATTERN_PARAMS.has(key) && asNumber(value) === undefined) {
        addIssue(context, `Bullet pattern '${patternId}' params.${key} must be a number.`, file.relativePath)
      }
      if (BOOLEAN_BULLET_PATTERN_PARAMS.has(key) && typeof value !== "boolean") {
        addIssue(context, `Bullet pattern '${patternId}' params.${key} must be a boolean.`, file.relativePath)
      }
      if (key === "safeLaneHint" && typeof value !== "string") {
        addIssue(context, `Bullet pattern '${patternId}' params.safeLaneHint must be a string.`, file.relativePath)
      }
    }
  }

  for (const [missionId, file] of missions) {
    const mission = asRecord(file.data)
    if (!mission) {
      continue
    }
    const report = analyzeMissionBulletSafety({
      mission,
      missionId,
      enemies,
      patterns,
      projectiles,
    })
    addReport(
      context,
      `bullet safety: ${missionId} hazardousNoise=${report.hazardousNoise} visualOnlyNoise=${report.visualOnlyNoise} damageSuppressedVisualOnly=${report.damageSuppressedVisualOnly} maxActiveHazardousBullets=${report.maxActiveHazardousBullets}`,
    )

    const dangerLevel = Math.max(1, asNumber(mission.dangerLevel) ?? 1)
    const densityLimit = 240 + dangerLevel * 180
    if (report.maxActiveHazardousBullets > densityLimit) {
      addIssue(
        context,
        `Mission '${missionId}' can keep ${report.maxActiveHazardousBullets} active hazardous bullets, above danger level ${dangerLevel} limit ${densityLimit}.`,
        file.relativePath,
      )
    }

    for (const immediateHit of report.immediateHitOwners) {
      addIssue(
        context,
        `Mission '${missionId}' wave '${immediateHit}' can immediately hit the player spawn.`,
        file.relativePath,
      )
    }
  }
}

function analyzeMissionBulletSafety(input: {
  mission: Record<string, unknown>
  missionId: string
  enemies: Map<string, { data: unknown }>
  patterns: Map<string, { data: unknown }>
  projectiles: Map<string, { data: unknown }>
}): {
  hazardousNoise: number
  visualOnlyNoise: number
  damageSuppressedVisualOnly: number
  maxActiveHazardousBullets: number
  immediateHitOwners: string[]
} {
  const immediateHitOwners: string[] = []
  let hazardousNoise = 0
  let visualOnlyNoise = 0
  let damageSuppressedVisualOnly = 0
  let maxActiveHazardousBullets = 0
  const playerSpawnId = asString(input.mission.playerSpawnId) ?? "spawn_player_center"

  for (const wave of asArray(input.mission.waves)) {
    const waveRecord = asRecord(wave)
    const owner = asString(waveRecord?.waveId) ?? String(asNumber(waveRecord?.atMs) ?? "unknown")
    let activeHazardousBullets = 0
    for (const entry of asArray(waveRecord?.entries)) {
      const entryRecord = asRecord(entry)
      const enemyId = asString(entryRecord?.enemyId)
      const enemy = enemyId ? asRecord(input.enemies.get(enemyId)?.data) : null
      if (!enemy) {
        continue
      }
      for (const patternIdValue of asArray(enemy.bulletPatternIds)) {
        const patternId = asString(patternIdValue)
        const pattern = patternId ? asRecord(input.patterns.get(patternId)?.data) : null
        const projectileId = asString(pattern?.projectileId)
        const projectile = projectileId ? asRecord(input.projectiles.get(projectileId)?.data) : null
        if (!pattern || !projectile || projectile.side !== "enemy") {
          continue
        }
        const params = asRecord(pattern.params) ?? {}
        const burstCount = Math.max(0, Math.trunc(asNumber(pattern.burstCount) ?? 0))
        const cadenceMs = Math.max(1, asNumber(pattern.cadenceMs) ?? 1)
        const lifetimeMs = Math.max(1, asNumber(projectile.lifetimeMs) ?? 1)
        const visualOnly = params.visualOnly === true || params.nonColliding === true
        if (visualOnly) {
          visualOnlyNoise += burstCount
          if ((asNumber(projectile.damage) ?? 0) > 0 || (asNumber(projectile.noiseDamage) ?? 0) > 0) {
            damageSuppressedVisualOnly += burstCount
          }
          continue
        }

        hazardousNoise += burstCount
        activeHazardousBullets += burstCount * Math.ceil(lifetimeMs / cadenceMs)
        if (asString(entryRecord?.spawnPointId) === playerSpawnId) {
          immediateHitOwners.push(owner)
        }
      }
    }
    maxActiveHazardousBullets = Math.max(maxActiveHazardousBullets, activeHazardousBullets)
  }

  return {
    hazardousNoise,
    visualOnlyNoise,
    damageSuppressedVisualOnly,
    maxActiveHazardousBullets,
    immediateHitOwners,
  }
}

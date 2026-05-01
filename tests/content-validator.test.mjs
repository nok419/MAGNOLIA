import assert from "node:assert/strict"
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const ROOT = path.resolve(import.meta.dirname, "..")
const VALIDATOR = path.join(ROOT, "tools", "content-validator", "dist", "validate-content.js")

test("generated content manifest matches loadable gameplay JSON files", () => {
  const manifest = readFileSync(
    path.join(ROOT, "packages", "persistence", "src", "generated", "content-manifest.ts"),
    "utf8",
  )
  const manifestFiles = new Set(
    [...manifest.matchAll(/"\.\.\/\.\.\/\.\.\/\.\.\/content\/gameplay\/([^"]+\.json)"/g)]
      .map((match) => match[1]),
  )
  const contentFiles = new Set(
    collectJsonFiles(path.join(ROOT, "content", "gameplay"))
      .map((file) => path.relative(path.join(ROOT, "content", "gameplay"), file).split(path.sep).join("/"))
      .filter((file) => file !== "migrated-id-map.json"),
  )

  assert.deepEqual(manifestFiles, contentFiles)
})

test("content validator rejects missing visual preset references", () => {
  const fixture = copyGameplayFixture("missing-visual-")
  rmSync(path.join(fixture, "visual-presets", "enemies", "vis_enemy_scout.json"))

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing enemy visual preset 'vis_enemy_scout'/)
})

test("content kind constants stay aligned between contracts and validator", () => {
  const contracts = readFileSync(path.join(ROOT, "packages", "contracts", "src", "content-kinds.ts"), "utf8")
  const validator = readFileSync(path.join(ROOT, "tools", "content-validator", "src", "content-kinds.ts"), "utf8")

  for (const name of [
    "ENEMY_RENDERER_KINDS",
    "PROJECTILE_RENDERER_KINDS",
    "PROJECTILE_BODY_KINDS",
    "HAZARD_RENDERER_KINDS",
    "BACKGROUND_THEMES",
    "HITBOX_SHAPES",
    "BATTLE_SPAWN_POINT_SIDES",
    "ENEMY_BEHAVIOR_KINDS",
    "BULLET_PATTERN_AUTHORING_PARAM_KEYS",
    "MOVEMENT_PATTERN_KINDS",
    "ENEMY_OVERRIDE_KEYS",
  ]) {
    assert.equal(readConstArraySource(contracts, name), readConstArraySource(validator, name))
  }
  for (const name of [
    "BATTLE_FIELD_WIDTH",
    "BATTLE_FIELD_HEIGHT",
    "BATTLE_SPAWN_OUTER_MARGIN",
  ]) {
    assert.equal(readConstValueSource(contracts, name), readConstValueSource(validator, name))
  }
})

test("content validator rejects projectile presets without bodyKind", () => {
  const fixture = copyGameplayFixture("missing-projectile-body-kind-")
  const file = path.join(fixture, "visual-presets", "projectiles", "vis_bullet_player_pulse.json")
  const preset = JSON.parse(readFileSync(file, "utf8"))
  delete preset.bodyKind
  writeFileSync(file, `${JSON.stringify(preset, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unsupported bodyKind/)
})

test("content validator rejects presentation cues without reduceFlashingVariant", () => {
  const fixture = copyGameplayFixture("missing-reduce-flashing-")
  const file = path.join(fixture, "presentation-cues.json")
  const cues = JSON.parse(readFileSync(file, "utf8"))
  delete cues[0].reduceFlashingVariant
  writeFileSync(file, `${JSON.stringify(cues, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must declare reduceFlashingVariant/)
})

test("content validator rejects map nodes with visibility broader than their area", () => {
  const fixture = copyGameplayFixture("broader-node-visibility-")
  const file = path.join(fixture, "map-logic", "world_map_demo.json")
  const map = JSON.parse(readFileSync(file, "utf8"))
  const node = map.collectibleNodes.find((entry) => entry.nodeId === "node_collect_analysis_circuit")
  node.visibilityConditionId = "cond_always"
  writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /broader than area 'area_broadcast_facility'/)
})

test("content validator rejects prototype references from active missions", () => {
  const fixture = copyGameplayFixture("active-prototype-reference-")
  const file = path.join(fixture, "missions", "mission_good_morning.json")
  const mission = JSON.parse(readFileSync(file, "utf8"))
  mission.waves[0].entries[0].enemyId = "a1"
  writeFileSync(file, `${JSON.stringify(mission, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Active mission 'mission_good_morning' references non-active enemy 'a1'/)
})

test("content validator enforces battle spawn point side and margin", () => {
  const fixture = copyGameplayFixture("invalid-spawn-point-")
  const missionFile = path.join(fixture, "missions", "mission_good_morning.json")
  const mission = JSON.parse(readFileSync(missionFile, "utf8"))
  mission.playerSpawnId = "spawn_top_left"
  mission.waves[0].entries[0].spawnPointId = "spawn_player_center"
  writeFileSync(missionFile, `${JSON.stringify(mission, null, 2)}\n`)

  const marginFile = path.join(fixture, "battle-spawn-points", "spawn_bad_margin.json")
  writeFileSync(marginFile, `${JSON.stringify({
    spawnPointId: "spawn_bad_margin",
    side: "noiseSource",
    xRatio: 0,
    yRatio: 0,
    offsetX: -999,
    offsetY: 0,
    authoringLabel: "Bad margin",
    intendedUse: "test.invalid",
  }, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Player spawn point 'spawn_top_left' has side 'noiseSource'/)
  assert.match(result.stderr, /Enemy spawn point 'spawn_player_center' has side 'player'/)
  assert.match(result.stderr, /spawn_bad_margin.*outside the allowed spawn margin/s)
})

test("content validator rejects duplicate wave and spawn IDs", () => {
  const fixture = copyGameplayFixture("duplicate-wave-spawn-")
  const missionFile = path.join(fixture, "missions", "mission_good_morning.json")
  const mission = JSON.parse(readFileSync(missionFile, "utf8"))
  mission.waves[1].waveId = mission.waves[0].waveId
  mission.waves[1].entries[0].spawnId = mission.waves[0].entries[0].spawnId
  writeFileSync(missionFile, `${JSON.stringify(mission, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /duplicate waveId 'gm_wave_01'/)
  assert.match(result.stderr, /duplicate spawnId 'gm_wave_01_spawn_01'/)
})

test("content validator checks movement pattern references and route warnings", () => {
  const fixture = copyGameplayFixture("invalid-movement-pattern-")
  const enemyFile = path.join(fixture, "enemies", "enemy_scout.json")
  const enemy = JSON.parse(readFileSync(enemyFile, "utf8"))
  enemy.movementPatternId = "missing_movement_pattern"
  writeFileSync(enemyFile, `${JSON.stringify(enemy, null, 2)}\n`)

  const slowRouteFile = path.join(fixture, "movement-patterns", "move_warning_slow.json")
  writeFileSync(slowRouteFile, `${JSON.stringify({
    movementPatternId: "move_warning_slow",
    patternKind: "linear",
    speed: 4,
    driftX: 0,
    driftY: 0,
    authoringLabel: "Warning slow route",
    intendedUse: "test.warning",
  }, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing movement pattern 'missing_movement_pattern'/)
  assert.match(result.stderr, /Active enemy 'enemy_scout' references non-active movement pattern 'missing_movement_pattern'/)
  assert.match(result.stderr, /Content id 'move_warning_slow' is not classified/)
  assert.match(result.stderr, /move_warning_slow.*may remain on screen/s)
})

test("content validator reports hazardous and visual-only bullet counts", () => {
  const fixture = copyGameplayFixture("bullet-safety-report-")
  const patternFile = path.join(fixture, "bullet-patterns", "bp_scout_single.json")
  const pattern = JSON.parse(readFileSync(patternFile, "utf8"))
  pattern.params.visualOnly = true
  writeFileSync(patternFile, `${JSON.stringify(pattern, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /bullet safety: mission_evacuation/)
  assert.match(result.stdout, /hazardousNoise=\d+/)
  assert.match(result.stdout, /visualOnlyNoise=\d+/)
  assert.match(result.stdout, /damageSuppressedVisualOnly=\d+/)
})

test("content validator rejects bullets that immediately hit the player spawn", () => {
  const fixture = copyGameplayFixture("bullet-immediate-hit-")
  const file = path.join(fixture, "missions", "mission_good_morning.json")
  const mission = JSON.parse(readFileSync(file, "utf8"))
  mission.waves[0].entries[0].spawnPointId = "spawn_player_center"
  writeFileSync(file, `${JSON.stringify(mission, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /can immediately hit the player spawn/)
})

test("content validator rejects bullet density above the mission danger level", () => {
  const fixture = copyGameplayFixture("bullet-density-")
  const patternFile = path.join(fixture, "bullet-patterns", "bp_scout_single.json")
  const pattern = JSON.parse(readFileSync(patternFile, "utf8"))
  pattern.cadenceMs = 80
  pattern.burstCount = 80
  writeFileSync(patternFile, `${JSON.stringify(pattern, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /active hazardous bullets/)
})

test("content validator rejects unresolved transmission audio assets", () => {
  const fixture = copyGameplayFixture("missing-transmission-audio-")
  const file = path.join(fixture, "transmissions", "tx_good_morning.json")
  const transmission = JSON.parse(readFileSync(file, "utf8"))
  transmission.audioAssetId = "asset.voice.missing"
  transmission.audioDurationMs = 60000
  writeFileSync(file, `${JSON.stringify(transmission, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing sound asset 'asset.voice.missing'/)
})

test("content validator requires migration map for renamed transcript chunks", () => {
  const fixture = copyGameplayFixture("missing-transcript-migration-")
  const chunkFile = path.join(fixture, "transmissions", "tx_good_morning.chunks.json")
  const chunks = JSON.parse(readFileSync(chunkFile, "utf8"))
  chunks[0].previousChunkIds = ["legacy_chunk_gm_001"]
  writeFileSync(chunkFile, `${JSON.stringify(chunks, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /previousChunkId 'legacy_chunk_gm_001'/)
})

test("content validator accepts transcript chunk split migration map", () => {
  const fixture = copyGameplayFixture("transcript-split-migration-")
  const chunkFile = path.join(fixture, "transmissions", "tx_good_morning.chunks.json")
  const chunks = JSON.parse(readFileSync(chunkFile, "utf8"))
  chunks[0].previousChunkIds = ["legacy_chunk_gm_boot"]
  chunks[1].previousChunkIds = ["legacy_chunk_gm_boot"]
  writeFileSync(chunkFile, `${JSON.stringify(chunks, null, 2)}\n`)
  const migrationFile = path.join(fixture, "migrated-id-map.json")
  const migrationMap = JSON.parse(readFileSync(migrationFile, "utf8"))
  migrationMap.migrations.push({
    kind: "transcriptChunk",
    transmissionId: "tx_good_morning",
    fromChunkId: "legacy_chunk_gm_boot",
    toChunkIds: ["chunk_gm_001a", "chunk_gm_001b"],
    reason: "test split migration",
  })
  writeFileSync(migrationFile, `${JSON.stringify(migrationMap, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.equal(result.status, 0, result.stderr)
})

function copyGameplayFixture(prefix) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), prefix))
  // validator fixtures must keep the real directory shape so reference rules run unchanged.
  cpSync(path.join(ROOT, "content", "gameplay"), fixture, { recursive: true })
  return fixture
}

function collectJsonFiles(dir) {
  if (!existsSync(dir)) {
    return []
  }

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath)
    }
  }
  return files
}

function runValidator(gameplayDir) {
  return spawnSync(process.execPath, [VALIDATOR, "--gameplay-dir", gameplayDir], {
    cwd: ROOT,
    encoding: "utf8",
  })
}

function readConstArraySource(source, name) {
  const match = source.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]) as const`))
  assert(match, `missing ${name}`)
  return match[1].replace(/\s+/g, " ").trim()
}

function readConstValueSource(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([^\\n]+)`))
  assert(match, `missing ${name}`)
  return match[1].trim()
}

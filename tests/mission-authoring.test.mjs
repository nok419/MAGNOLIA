import assert from "node:assert/strict"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const ROOT = path.resolve(import.meta.dirname, "..")
const HARNESS = path.join(ROOT, "tools", "mission-authoring", "mission-authoring.mjs")
const PREVIEW_FIXTURE = path.join(ROOT, "tools", "mission-authoring", "fixtures", "mission_good_morning.preview.json")

test("mission authoring lists mission and combat source content", () => {
  const missions = runHarness(["list", "missions"])
  const transmissions = runHarness(["list", "transmissions"])
  const chunks = runHarness(["list", "chunks"])
  const enemies = runHarness(["list", "enemies"])
  const patterns = runHarness(["list", "bullet-patterns"])

  assert.equal(missions.status, 0)
  assert.equal(transmissions.status, 0)
  assert.equal(chunks.status, 0)
  assert.equal(enemies.status, 0)
  assert.equal(patterns.status, 0)
  assert.ok(readJsonOutput(missions).some((mission) => mission.missionId === "mission_good_morning"))
  assert.ok(readJsonOutput(transmissions).some((transmission) => transmission.transmissionId === "tx_good_morning"))
  assert.ok(readJsonOutput(chunks).some((chunk) => chunk.chunkId === "chunk_gm_001a"))
  assert.ok(readJsonOutput(enemies).some((enemy) => enemy.enemyId === "enemy_scout"))
  assert.ok(readJsonOutput(patterns).some((pattern) => pattern.bulletPatternId === "bp_scout_single"))
})

test("mission authoring edits waves, enemy spawns, hazards, and beats on a copied gameplay tree", () => {
  const gameplayDir = copyGameplayFixture("mission-authoring-edit-")
  const missionFile = path.join(gameplayDir, "missions", "mission_good_morning.json")

  // The test edits a copied tree so the command can exercise real JSON writes without touching source content.
  assert.equal(runHarness([
    "wave",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
    "--at-ms",
    "56000",
    "--intent-tag",
    "authoring-test-wave",
    "--entries-json",
    "[]",
  ]).status, 0)

  assert.equal(runHarness([
    "enemy-spawn",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
    "--spawn-id",
    "authoring_test_spawn",
    "--enemy-id",
    "enemy_scout",
    "--spawn-point-id",
    "spawn_top_center",
    "--seed",
    "200",
  ]).status, 0)

  assert.equal(runHarness([
    "enemy-spawn",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
    "--spawn-id",
    "authoring_test_spawn_b",
    "--enemy-id",
    "enemy_scout",
    "--spawn-point-id",
    "spawn_top_center",
    "--seed",
    "300",
  ]).status, 0)

  assert.equal(runHarness([
    "hazard",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--json",
    JSON.stringify({
      hazardId: "hazard_authoring_test",
      kind: "magneticDisaster",
      spawnAtMs: 56500,
      telegraphMs: 1000,
      activeMs: 1000,
      fadeOutMs: 500,
      tickIntervalMs: 250,
      noiseDamage: 0.01,
      enemyDamagePerSecond: 1,
      area: { shape: "rect", x: 0, y: 0, width: 100, height: 100 },
      motion: { motionKind: "static" },
      visualPresetId: "hazard_magnetic_disaster_gentle",
      visibilityConditionId: "cond_always",
    }),
  ]).status, 0)

  assert.equal(runHarness([
    "beat",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--json",
    JSON.stringify({
      beatId: "beat_authoring_test",
      atMs: 55500,
      durationMs: 1000,
      intentTag: "authoring-test-beat",
      transcriptChunkIds: [],
    }),
  ]).status, 0)

  let mission = readJsonFile(missionFile)
  assert.equal(mission.waves.at(-1).waveId, "authoring_test_wave")
  assert.equal(mission.waves.at(-1).entries.find((entry) => entry.spawnId === "authoring_test_spawn").seed, 200)
  assert.ok(mission.hazards.some((hazard) => hazard.hazardId === "hazard_authoring_test"))
  assert.ok(mission.beatEvents.some((beat) => beat.beatId === "beat_authoring_test"))

  const addedWave = mission.waves.find((wave) => wave.waveId === "authoring_test_wave")
  mission.waves = [addedWave, ...mission.waves.filter((wave) => wave.waveId !== "authoring_test_wave")]
  writeJsonFile(missionFile, mission)

  assert.equal(runHarness([
    "wave",
    "update",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
    "--at-ms",
    "57000",
  ]).status, 0)

  mission = readJsonFile(missionFile)
  assert.equal(mission.waves.at(-1).waveId, "authoring_test_wave")
  assert.equal(mission.waves.at(-1).atMs, 57000)
  mission.waves.at(-1).entries.reverse()
  writeJsonFile(missionFile, mission)

  assert.equal(runHarness([
    "enemy-spawn",
    "update",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
    "--spawn-id",
    "authoring_test_spawn",
    "--seed",
    "201",
  ]).status, 0)
  mission = readJsonFile(missionFile)
  const updatedWave = mission.waves.find((wave) => wave.waveId === "authoring_test_wave")
  assert.equal(updatedWave.entries.find((entry) => entry.spawnId === "authoring_test_spawn").seed, 201)
  assert.equal(updatedWave.entries.find((entry) => entry.spawnId === "authoring_test_spawn_b").seed, 300)

  assert.equal(runHarness([
    "hazard",
    "delete",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--hazard-id",
    "hazard_authoring_test",
  ]).status, 0)
  assert.equal(runHarness([
    "beat",
    "delete",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--beat-id",
    "beat_authoring_test",
  ]).status, 0)
  assert.equal(runHarness([
    "wave",
    "delete",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "authoring_test_wave",
  ]).status, 0)

  mission = readJsonFile(missionFile)
  assert.equal(mission.waves.length, 16)
  assert.equal(mission.waves.at(-1).atMs, 34600)
  assert.ok(!mission.hazards.some((hazard) => hazard.hazardId === "hazard_authoring_test"))
  assert.ok(!mission.beatEvents.some((beat) => beat.beatId === "beat_authoring_test"))

  rmSync(gameplayDir, { recursive: true, force: true })
})

test("mission authoring rejects deprecated index selectors", () => {
  const gameplayDir = copyGameplayFixture("mission-authoring-deprecated-")

  const waveUpdate = runHarness([
    "wave",
    "update",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--index",
    "0",
    "--at-ms",
    "9000",
  ])
  assert.notEqual(waveUpdate.status, 0)
  assert.match(waveUpdate.stderr, /--index is deprecated\. Use --wave-id <waveId>\./)

  const spawnAdd = runHarness([
    "enemy-spawn",
    "add",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-index",
    "0",
    "--spawn-id",
    "deprecated_spawn",
    "--enemy-id",
    "enemy_scout",
    "--spawn-point-id",
    "spawn_top_center",
    "--seed",
    "200",
  ])
  assert.notEqual(spawnAdd.status, 0)
  assert.match(spawnAdd.stderr, /--wave-index is deprecated\. Use --wave-id <waveId>\./)

  const spawnUpdate = runHarness([
    "enemy-spawn",
    "update",
    "--gameplay-dir",
    gameplayDir,
    "--mission",
    "mission_good_morning",
    "--wave-id",
    "gm_wave_01",
    "--entry-index",
    "0",
    "--seed",
    "201",
  ])
  assert.notEqual(spawnUpdate.status, 0)
  assert.match(spawnUpdate.stderr, /--entry-index is deprecated\. Use --spawn-id <spawnId>\./)

  rmSync(gameplayDir, { recursive: true, force: true })
})

test("mission preview fixture generation is stable for mission_good_morning", () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "mission-authoring-preview-")), "mission_good_morning.preview.json")
  const result = runHarness(["preview-fixture", "--mission", "mission_good_morning", "--out", out])

  assert.equal(result.status, 0)
  assert.equal(readFileSync(out, "utf8"), readFileSync(PREVIEW_FIXTURE, "utf8"))
})

function copyGameplayFixture(prefix) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), prefix))
  cpSync(path.join(ROOT, "content", "gameplay"), fixture, { recursive: true })
  return fixture
}

function runHarness(args) {
  return spawnSync(process.execPath, [HARNESS, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  })
}

function readJsonOutput(result) {
  assert.equal(result.stderr, "")
  return JSON.parse(result.stdout)
}

function readJsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"))
}

function writeJsonFile(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

const rootDir = path.resolve(import.meta.dirname, "..")
const validatorPath = path.join(rootDir, "tools", "content-validator", "validate-content.mjs")

test("current gameplay content passes validation", () => {
  const result = runValidator()

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /content validation passed/)
})

test("starter pulse shot and silent wave cooldown remain playable", () => {
  const pulseEffect = loadGameplayJson("equipment/effects/eff_main_pulse.json")
  const pulseEquipment = loadGameplayJson("equipment/eq_main_pulse.json")
  const silentWaveEffect = loadGameplayJson("equipment/effects/eff_sub_silent_wave.json")
  const silentWaveEquipment = loadGameplayJson("equipment/eq_sub_silent_wave.json")

  assert.ok(pulseEffect.params.damage > 0, "pulse shot damage must not be zero")
  for (const levelParams of pulseEquipment.levelParams) {
    assert.ok(
      levelParams.effectOverrides.damage > 0,
      `pulse shot damage must not be zero at level ${levelParams.level}`,
    )
  }

  // Keep the menu-facing value and runtime value aligned so the recast display matches combat.
  assert.equal(silentWaveEquipment.active.cooldownMs, silentWaveEffect.params.cooldownMs)
  assert.ok(silentWaveEffect.params.cooldownMs > 0)
  assert.ok(silentWaveEffect.params.cooldownMs <= 10000)
})

test("invalid fixture reports a missing mission reference", () => {
  const fixtureDir = path.join(
    "tools",
    "content-validator",
    "fixtures",
    "missing-reference",
    "content",
    "gameplay",
  )
  const result = runValidator(["--gameplay-dir", fixtureDir])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing mission 'mission_missing'/)
})

test("invalid content-driven fields are rejected", (t) => {
  const fixtureDir = copyCurrentGameplayFixture(t)
  mutateJson(
    path.join(fixtureDir, "transmissions", "tx_good_morning.chunks.json"),
    (chunks) => {
      chunks[0].importance = "urgent"
      chunks[1].fragmentRecovery = {
        minSpanRatio: 0.9,
        maxSpanRatio: 0.2,
      }
    },
  )
  mutateJson(
    path.join(fixtureDir, "missions", "mission_good_morning.json"),
    (mission) => {
      mission.fragmentRecovery.spawnDistanceMin = 300
      mission.fragmentRecovery.spawnDistanceMax = 100
      mission.fragmentRecovery.lifetimeMs.expert = 2000
    },
  )
  mutateJson(
    path.join(fixtureDir, "map-logic", "world_map_demo.json"),
    (map) => {
      map.transmissionNodes[0].signalProfile.scanRadius = 0
    },
  )

  const result = runValidator(["--gameplay-dir", fixtureDir])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unsupported importance 'urgent'/)
  assert.match(result.stderr, /minSpanRatio must be less than or equal to/)
  assert.match(result.stderr, /spawnDistanceMin must be less than or equal to/)
  assert.match(result.stderr, /unsupported key 'expert'/)
  assert.match(result.stderr, /signalProfile\.scanRadius must be a positive number/)
})

function runValidator(args = []) {
  // Spawn the command exactly as package scripts do, so fixture tests cover CLI wiring too.
  return spawnSync(process.execPath, [validatorPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
  })
}

function loadGameplayJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, "content", "gameplay", relativePath), "utf8"),
  )
}

function copyCurrentGameplayFixture(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magnolia-content-validator-"))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  const fixtureDir = path.join(tempRoot, "gameplay")
  fs.cpSync(path.join(rootDir, "content", "gameplay"), fixtureDir, { recursive: true })
  return fixtureDir
}

function mutateJson(filePath, mutate) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
  mutate(data)
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

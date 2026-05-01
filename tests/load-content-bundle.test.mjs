import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import esbuild from "esbuild"

const ROOT = path.resolve(import.meta.dirname, "..")

test("loadContentBundle loads content presets and presentation cues", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-bundle-smoke-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "bundle.mjs")
  writeFileSync(entry, [
    "import { loadContentBundle } from './packages/persistence/src/load-content-bundle.ts'",
    "const bundle = loadContentBundle()",
  "export const counts = {",
  "  battleSpawnPoints: Object.keys(bundle.battleSpawnPoints).sort(),",
  "  movementPatterns: Object.keys(bundle.movementPatterns).sort(),",
  "  visualPresets: Object.keys(bundle.contentVisualPresets).length,",
    "  hitboxPresets: Object.keys(bundle.contentHitboxPresets).length,",
    "  backgroundPresets: Object.keys(bundle.backgroundPresets).length,",
    "  presentationCues: Object.keys(bundle.presentationCues).length,",
    "  enemies: Object.keys(bundle.enemies).sort(),",
    "  bulletPatterns: Object.keys(bundle.bulletPatterns).sort(),",
    "  projectiles: Object.keys(bundle.projectiles).sort(),",
    "}",
    "",
  ].join("\n").replace("./packages", `${ROOT}/packages`))

  // esbuild bundles TypeScript path aliases and JSON imports so the smoke test executes the real loader.
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    sourcemap: false,
    logLevel: "silent",
    tsconfig: path.join(ROOT, "tsconfig.base.json"),
  })

  const { counts } = await import(`file://${outfile}`)

  assert.deepEqual(counts.battleSpawnPoints, [
    "spawn_mid_left",
    "spawn_mid_right",
    "spawn_player_center",
    "spawn_side_left",
    "spawn_side_right",
    "spawn_top_center",
    "spawn_top_left",
    "spawn_top_right",
  ])
  assert.deepEqual(counts.movementPatterns, [
    "move_linear_standard",
    "move_pause_then_drift_heavy",
    "move_sine_drift_scout",
  ])
  assert.equal(counts.visualPresets, 18)
  assert.equal(counts.hitboxPresets, 7)
  assert.equal(counts.backgroundPresets, 2)
  assert.equal(counts.presentationCues, 16)
  assert.deepEqual(counts.enemies, ["enemy_heavy", "enemy_scout", "enemy_standard"])
  assert.deepEqual(counts.bulletPatterns, [
    "bp_heavy_burst",
    "bp_scout_single",
    "bp_spiral_stream",
    "bp_standard_spread",
  ])
  assert.deepEqual(counts.projectiles, [
    "proj_enemy_basic",
    "proj_enemy_geo",
    "proj_enemy_petal",
    "proj_player_carrier",
    "proj_player_carrier_blast",
    "proj_player_pulse",
    "proj_player_pulse_melee",
  ])
})

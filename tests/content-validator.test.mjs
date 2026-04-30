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
  ]) {
    assert.equal(readConstArraySource(contracts, name), readConstArraySource(validator, name))
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

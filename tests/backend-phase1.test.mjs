import assert from "node:assert/strict"
import fs from "node:fs"
import { mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import esbuild from "esbuild"

const ROOT = path.resolve(import.meta.dirname, "..")

test("hitbox JSON controls battle collision radius", async () => {
  const { resolveHitRadius } = await bundleBattleWorld()
  const large = readJson("content/gameplay/hitbox-presets/enemies/hitbox_enemy_large.json")
  const player = readJson("content/gameplay/hitbox-presets/player/hitbox_player_core.json")
  const thin = readJson("content/gameplay/hitbox-presets/projectiles/hitbox_bullet_thin.json")

  assert.equal(resolveHitRadius(large), 24)
  assert.equal(resolveHitRadius({ ...large, presetId: "renamed_without_size_word" }), 24)
  assert.equal(resolveHitRadius(player), 6)
  assert.equal(resolveHitRadius(thin), 12)

  const battleWorldSource = readProjectFile("packages/game-session/src/battle-world.ts")
  assert.doesNotMatch(battleWorldSource, /includes\("small"\)|includes\("large"\)|radiusScale|orbitScale/)
})

test("BattleRenderState exposes resolved battle presets and communication deltas", () => {
  const runtimeTypes = readProjectFile("packages/game-session/src/runtime-types.ts")
  const sessionSource = readProjectFile("packages/game-session/src/game-session.ts")
  const battleRenderStateSource = readProjectFile("packages/game-session/src/battle/battle-render-state.ts")
  const battleStepSource = readProjectFile("packages/game-session/src/battle/step-battle.ts")
  const cues = readProjectFile("content/gameplay/presentation-cues.json")

  assert.match(runtimeTypes, /background:\s*BackgroundPreset/)
  assert.match(runtimeTypes, /visual:\s*EnemyContentVisualPreset/)
  assert.match(runtimeTypes, /visual:\s*ProjectileContentVisualPreset/)
  assert.match(runtimeTypes, /visual:\s*HazardContentVisualPreset/)
  assert.match(runtimeTypes, /currentChunkProtectedRatio:\s*number/)
  assert.match(runtimeTypes, /protectedSpans:\s*TranscriptSpan\[\]/)
  assert.match(runtimeTypes, /damagedSpans:\s*TranscriptSpan\[\]/)
  assert.match(runtimeTypes, /newlyLostRange\?:\s*TimeRange/)
  assert.match(runtimeTypes, /newlyRecoveredRange\?:\s*TimeRange/)
  assert.match(sessionSource, /buildBattleRenderState/)
  assert.match(sessionSource, /stepBattleFrame/)
  assert.match(battleStepSource, /resolveBattleCollisions/)
  assert.match(battleStepSource, /finalizeBattleMission/)
  assert.match(battleRenderStateSource, /transcriptSpansFromTimeRanges\(\s*\n\s*battle\.transcript,\s*\n\s*battle\.damageRanges/)
  assert.match(battleStepSource, /createBattleSubtitleDamagePresentation/)
  assert.match(cues, /"id": "battle\.subtitle\.damage"/)
})

test("carrier blast splits pulse melee damage and clears enemy projectiles", async () => {
  const { detonatePlayerProjectile } = await bundleBattleEffects()
  const battle = {
    enemies: [
      {
        enemyInstanceId: "enemy.1",
        enemyId: "enemy_standard",
        position: { x: 100, y: 100 },
      hp: 72,
        radius: 10,
      },
    ],
    projectiles: [
      {
        projectileInstanceId: "enemy.bullet.1",
        projectileId: "proj_enemy_basic",
        side: "enemy",
        position: { x: 105, y: 100 },
        radius: 5,
      },
    ],
  }

  const visual = detonatePlayerProjectile({
    battle,
    projectile: {
      projectileInstanceId: "carrier.1",
      projectileId: "proj_player_carrier",
      side: "player",
      position: { x: 100, y: 100 },
      velocity: { x: 0, y: -1 },
      radius: 12,
      remainingMs: 1000,
      spawnDelayMs: 0,
      damage: 36,
      noiseDamage: 0,
      explosiveRadius: 30,
      explosionDamageMultiplier: 1,
      explosionAreaDamageMultiplier: 1,
      explosionAreaDamageDurationMs: 480,
      explosionClearsEnemyProjectiles: true,
      explosionVisualProjectileId: "proj_player_carrier_blast",
    },
    projectiles: {
      proj_player_carrier_blast: {
        projectileId: "proj_player_carrier_blast",
        side: "player",
        damage: 0,
        noiseDamage: 0,
        speed: 0,
        lifetimeMs: 480,
        visualPresetId: "vis_bullet_player_carrier_blast",
        hitboxPresetId: "hitbox_bullet_medium",
      },
    },
    nextInstanceId: (prefix) => `${prefix}.visual`,
  })

  assert.equal(battle.enemies[0].hp, 36)
  assert.equal(battle.projectiles.length, 0)
  assert.equal(visual.radius, 30)
  assert.equal(visual.areaClearsEnemyProjectiles, true)
  assert.equal(visual.areaDamagePerSecond, 36 / 0.48)
})

test("source audit is wired into the root test gate", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"))
  assert.equal(packageJson.scripts["source:audit"], "node tools/source-audit.mjs")
  assert.match(packageJson.scripts.test, /npm run source:audit/)
})

async function bundleBattleWorld() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-battle-world-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "battle-world.mjs")
  writeFileSync(entry, [
    "export { resolveHitRadius } from './packages/game-session/src/battle-world.ts'",
    "",
  ].join("\n").replace("./packages", `${ROOT}/packages`))

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

  return import(`file://${outfile}`)
}

async function bundleBattleEffects() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-battle-effects-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "battle-effects.mjs")
  writeFileSync(entry, [
    "export { detonatePlayerProjectile } from './packages/game-session/src/battle-effects.ts'",
    "",
  ].join("\n").replace("./packages", `${ROOT}/packages`))

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

  return import(`file://${outfile}`)
}

function readJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath))
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
}

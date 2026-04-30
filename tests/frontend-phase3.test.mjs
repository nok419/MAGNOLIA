import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import esbuild from "esbuild"

const rootDir = path.resolve(import.meta.dirname, "..")

test("frontend phase 3 removes render component shims and projectile trail stub", () => {
  assert.equal(existsSync(projectPath("apps/web/src/components/BattleCanvas.tsx")), false)
  assert.equal(existsSync(projectPath("apps/web/src/components/ExploreCanvas.tsx")), false)
  assert.equal(existsSync(projectPath("apps/web/src/components/battle-renderer.ts")), false)
  assert.equal(existsSync(projectPath("apps/web/src/render/battle/projectiles/projectile-trails.ts")), false)

  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")
  const exploreScreenSource = readProjectFile("apps/web/src/screens/explore/ExploreScreen.tsx")
  const keyVisualSource = readProjectFile("apps/web/src/components/KeyVisualModal.tsx")

  assert.match(battleScreenSource, /@\/render\/battle\/BattleCanvas/)
  assert.match(exploreScreenSource, /@\/render\/explore\/ExploreCanvas/)
  assert.match(keyVisualSource, /@\/render\/battle\/BattleCanvas/)
  assert.doesNotMatch(`${battleScreenSource}\n${exploreScreenSource}\n${keyVisualSource}`, /@\/components\/(BattleCanvas|ExploreCanvas|battle-renderer)/)
})

test("key visual render state fixture validates required content presets", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-fe3-keyvisual-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "bundle.mjs")
  writeFileSync(entry, [
    "import { loadContentBundle } from './packages/persistence/src/load-content-bundle.ts'",
    "import { buildKeyVisualRenderState } from './apps/web/src/render/battle/fixtures/key-visual-render-state.ts'",
    "const content = loadContentBundle()",
    "const state = buildKeyVisualRenderState(content, 1200, 'windowed')",
    "const broken = { ...content, contentVisualPresets: { ...content.contentVisualPresets } }",
    "delete broken.contentVisualPresets.vis_enemy_heavy",
    "let missingPresetMessage = ''",
    "try { buildKeyVisualRenderState(broken, 1200, 'windowed') } catch (error) { missingPresetMessage = String(error instanceof Error ? error.message : error) }",
    "export const result = {",
    "  enemyIds: state.enemies.map((enemy) => enemy.enemyId),",
    "  projectileIds: state.projectiles.map((projectile) => projectile.projectileId),",
    "  playerPulseIds: state.projectiles.filter((projectile) => projectile.projectileId === 'proj_player_pulse').map((projectile) => projectile.projectileId),",
    "  backgroundPresetId: state.backgroundPresetId,",
    "  missingPresetMessage,",
    "}",
    "",
  ].join("\n").replaceAll("./packages", `${rootDir}/packages`).replaceAll("./apps", `${rootDir}/apps`))

  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    sourcemap: false,
    logLevel: "silent",
    tsconfig: path.join(rootDir, "tsconfig.base.json"),
  })

  const { result } = await import(`file://${outfile}`)
  assert.deepEqual(result.enemyIds, ["kv_enemy_heavy", "kv_enemy_standard_l", "kv_enemy_standard_r"])
  assert.equal(result.playerPulseIds.length, 3)
  assert.ok(result.projectileIds.every((id) => id.startsWith("kv_") || id === "proj_player_pulse"))
  assert.equal(result.backgroundPresetId, "bg_broadcast_facility")
  assert.match(result.missingPresetMessage, /missing enemy visual preset: vis_enemy_heavy/)
})

test("canvas cache and low frame rate mode are wired into battle and markers", () => {
  const pathCacheSource = readProjectFile("apps/web/src/render/shared/canvas-path-cache.ts")
  const drawBattleFrameSource = readProjectFile("apps/web/src/render/battle/draw-battle-frame.ts")
  const projectileSource = readProjectFile("apps/web/src/render/battle/projectiles/projectile-renderer.ts")
  const enemySource = readProjectFile("apps/web/src/render/battle/enemies/enemy-renderer.ts")
  const fragmentSource = readProjectFile("apps/web/src/render/battle/fragments.ts")
  const markerSource = readProjectFile("apps/web/src/app/canvas-markers.ts")
  const trailSource = readProjectFile("apps/web/src/render/explore/trail.ts")
  const titleSource = readProjectFile("apps/web/src/components/title/SignalBackdropCanvas.tsx")

  assert.match(pathCacheSource, /rendererKind/)
  assert.match(pathCacheSource, /visualPresetId/)
  assert.match(pathCacheSource, /paletteRole/)
  assert.match(pathCacheSource, /reduceFlashing/)
  assert.match(pathCacheSource, /lowFrameRateMode/)
  assert.match(drawBattleFrameSource, /lowFrameRateMode/)
  assert.match(projectileSource, /readCachedCanvasPath/)
  assert.match(enemySource, /readCachedCanvasPath/)
  assert.match(fragmentSource, /readCachedCanvasPath/)
  assert.match(markerSource, /readCachedCanvasPath/)
  assert.match(markerSource, /satelliteRole: "threatNoise"/)
  assert.match(markerSource, /satelliteRole: "signalReadable"/)
  assert.match(trailSource, /lowFrameRateMode \? 180 : TRAIL_MAX_NODE_COUNT/)
  assert.match(titleSource, /drawSignalPulse/)
  assert.match(titleSource, /drawArtificialGrid/)
})

test("direct color baseline and exception policy are current", () => {
  const baseline = JSON.parse(readProjectFile("tools/style-audit/direct-color-baseline.json"))
  const paletteDoc = readProjectFile("docs/11_design_package/02_palette.md")
  const tokensSource = readProjectFile("apps/web/src/styles/tokens.css")

  assert.equal(baseline.source, "apps/web/src")
  assert.match(paletteDoc, /direct color baseline 例外/)
  assert.match(paletteDoc, /新規ファイルまたは件数増加は失敗扱い/)
  assert.match(paletteDoc, /hazard、被弾、聴取不能、danger tone/)
  assert.match(tokensSource, /--mg-deep:\s*var\(--color-void-depth\)/)
})

function readProjectFile(relativePath) {
  return readFileSync(projectPath(relativePath), "utf8")
}

function projectPath(relativePath) {
  return path.join(rootDir, relativePath)
}

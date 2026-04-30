import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

const rootDir = path.resolve(import.meta.dirname, "..")

test("semantic palette helpers and style audit baseline are wired", () => {
  const paletteSource = readProjectFile("apps/web/src/render/shared/canvas-palette.ts")
  const tokensSource = readProjectFile("apps/web/src/styles/tokens.css")
  const baseSource = readProjectFile("apps/web/src/styles/base.css")
  const auditSource = readProjectFile("tools/style-audit.mjs")
  const baseline = JSON.parse(readProjectFile("tools/style-audit/direct-color-baseline.json"))

  assert.match(tokensSource, /--color-void-depth:\s*#0a1628;/)
  assert.match(baseSource, /--mg-deep:\s*var\(--color-void-depth\)/)
  assert.match(paletteSource, /export function hex/)
  assert.match(paletteSource, /export function rgba/)
  assert.match(paletteSource, /export function gradientStop/)
  assert.match(paletteSource, /export function resolveGlow/)
  for (const cssVar of new Set([...paletteSource.matchAll(/cssVar: "(--[^"]+)"/g)].map((match) => match[1]))) {
    assert.match(tokensSource, new RegExp(`${escapeRegExp(cssVar)}\\s*:`))
  }
  assert.match(auditSource, /direct color literals are not allowed in new baseline files/)
  assert.match(auditSource, /red threatNoise-like literals increased/)
  assert.equal(baseline.source, "apps/web/src")
  assert.ok(Object.keys(baseline.files).length > 0)
})

test("shared canvas effects expose phase 1 rendering entry points", () => {
  const effectsIndex = readProjectFile("apps/web/src/render/shared/effects/index.ts")
  const scanPulseSource = readProjectFile("apps/web/src/render/explore/scan-pulse.ts")
  const battlePresentationSource = readProjectFile("apps/web/src/render/battle/presentation-layer.ts")

  assert.match(effectsIndex, /signal-pulse/)
  assert.match(effectsIndex, /residual-fragment/)
  assert.match(effectsIndex, /threat-noise-field/)
  assert.match(effectsIndex, /artificial-grid/)
  assert.match(effectsIndex, /surface-frame/)
  assert.match(scanPulseSource, /drawSignalPulse/)
  assert.match(battlePresentationSource, /drawThreatNoiseField/)
  assert.match(battlePresentationSource, /drawResidualFragment/)
})

test("battle renderers consume preset motion, palette, and subtitle spans", () => {
  const enemyRendererSource = readProjectFile("apps/web/src/render/battle/enemies/enemy-renderer.ts")
  const hazardRendererSource = readProjectFile("apps/web/src/render/battle/hazards/magnetic-disaster.ts")
  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")

  assert.match(enemyRendererSource, /readEnemyMotionProfile\(enemy\.visual\.motionProfile\)/)
  assert.match(hazardRendererSource, /readHazardPaletteRole\(hazard\.visual\.paletteRole\)/)
  assert.match(hazardRendererSource, /drawThreatNoiseField/)
  assert.match(battleScreenSource, /protectedSpans/)
  assert.match(battleScreenSource, /damagedSpans/)
  assert.match(battleScreenSource, /renderSubtitleProtectionSegments/)
})

test("pointer and overlay input edges are not carried into explore", () => {
  const inputSource = readProjectFile("apps/web/src/app/use-magnolia-input.ts")
  const frameLoopSource = readProjectFile("apps/web/src/app/frame-loop/use-magnolia-frame-loop.ts")

  assert.match(inputSource, /const supportsPointerEvents = "PointerEvent" in window/)
  assert.match(inputSource, /window\.addEventListener\("pointerdown", handlePointerDown, true\)/)
  assert.match(inputSource, /window\.addEventListener\("mousedown", handleMouseDown, true\)/)

  const contextMenuHandler = inputSource.match(/function handleContextMenu[\s\S]*?\n    }/)?.[0] ?? ""
  assert.match(contextMenuHandler, /event\.preventDefault\(\)/)
  assert.doesNotMatch(contextMenuHandler, /queueMouseButtonPress/)
  assert.doesNotMatch(contextMenuHandler, /releaseMouseButton/)

  assert.match(frameLoopSource, /snapshot\.screen === "explore" && appState\.equipmentModalNodeId[\s\S]*?input\.syncButtonEdges\(settings\)/)
})

test("presentation requests reach battle and transition renderers", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")
  const appSource = readProjectFile("apps/web/src/app/App.tsx")
  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")
  const battleCanvasSource = readProjectFile("apps/web/src/render/battle/BattleCanvas.tsx")
  const drawBattleFrameSource = readProjectFile("apps/web/src/render/battle/draw-battle-frame.ts")
  const battlePresentationSource = readProjectFile("apps/web/src/render/battle/presentation-layer.ts")
  const transitionLayerSource = readProjectFile("apps/web/src/app/presentation/TransitionPresentationLayer.tsx")

  assert.match(hookSource, /drainPresentationRequests\(\)/)
  assert.match(hookSource, /selectBattlePresentationEvents/)
  assert.match(hookSource, /selectTransitionPresentationEvents/)
  assert.match(appSource, /battleEvents=\{app\.battleEvents\}/)
  assert.match(battleScreenSource, /battleEvents=\{battleEvents\}/)
  assert.match(battleCanvasSource, /battleEvents,\s*\n/)
  assert.match(drawBattleFrameSource, /drawBattlePresentationLayer/)
  assert.match(battlePresentationSource, /case "battle\.player\.hit":/)
  assert.match(appSource, /<TransitionPresentationLayer[\s\S]*?events=\{app\.transitionEvents\}/)
  assert.match(transitionLayerSource, /transmission\.connect\.sequence/)
})

test("title save slots treat zero play time profiles as empty", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")

  assert.match(hookSource, /function isTitleSaveSlotEmpty/)
  assert.match(hookSource, /return !slot\.profileId \|\| slot\.playTimeMs <= 0/)
  assert.match(hookSource, /updatedAt: isEmpty \? undefined : formatTimestamp\(slot\.updatedAt\)/)
  assert.match(hookSource, /!isEmpty && slot\.currentAreaId/)
})

test("battle and explore renderers share basic render math", () => {
  const sharedMath = readProjectFile("apps/web/src/render/shared/render-math.ts")
  const battleUtils = readProjectFile("apps/web/src/render/battle/battle-renderer-utils.ts")
  const exploreUtils = readProjectFile("apps/web/src/render/explore/explore-render-utils.ts")

  assert.match(sharedMath, /export const TAU = Math\.PI \* 2/)
  assert.match(sharedMath, /export function easeOutCubic/)
  assert.match(sharedMath, /export function seededUnit/)
  assert.match(battleUtils, /from "@\/render\/shared\/render-math"/)
  assert.match(exploreUtils, /from "@\/render\/shared\/render-math"/)
})

test("idle auto save warns, cancels on input, and skips title", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")
  const inputSource = readProjectFile("apps/web/src/app/use-magnolia-input.ts")
  const appSource = readProjectFile("apps/web/src/app/App.tsx")

  assert.match(hookSource, /IDLE_AUTO_SAVE_WARNING_AFTER_MS = 50_000/)
  assert.match(hookSource, /IDLE_AUTO_SAVE_COUNTDOWN_MS = 10_000/)
  assert.match(hookSource, /snapshot\.screen === "title"[\s\S]*?current\.slotSelectMode/)
  assert.match(hookSource, /input\.getLastActivityAt\(\) > countdown\.startedAt/)
  assert.match(hookSource, /selectIdleAutoSaveSlot\(snapshot\.saveSlots\.slots\)/)
  assert.match(hookSource, /await session\.dispatch\(\{ type: "saveToSlot", slotId: countdown\.targetSlotId \}\)/)
  assert.match(hookSource, /await session\.dispatch\(\{ type: "returnToTitle" \}\)/)
  assert.match(hookSource, /slots\.find\(\(slot\) => isTitleSaveSlotEmpty\(slot\)\)/)
  assert.match(hookSource, /readSlotUpdatedAtMs\(left\.updatedAt\) - readSlotUpdatedAtMs\(right\.updatedAt\)/)
  assert.match(inputSource, /getLastActivityAt\(\): number/)
  assert.match(inputSource, /hasActiveInput\(\): boolean/)
  assert.match(appSource, /IdleAutoSaveOverlay/)
})

test("scan key defaults and prompts use Space", () => {
  const settingsSource = readProjectFile("packages/contracts/src/settings.ts")
  const inputSource = readProjectFile("apps/web/src/app/use-magnolia-input.ts")
  const exploreScreenSource = readProjectFile("apps/web/src/screens/explore/ExploreScreen.tsx")

  assert.match(settingsSource, /scan: "Space"/)
  assert.match(settingsSource, /current\.scan === "KeyR" \? DEFAULT_KEYBINDINGS\.scan : current\.scan/)
  assert.match(inputSource, /const SCAN_FALLBACK_CODES = \["Space"\]/)
  assert.match(exploreScreenSource, /keys=\{\["Space", "click 2"\]\}/)
  assert.match(exploreScreenSource, /keyLabel=\{\["Space", "click 2"\]\}/)
  assert.match(exploreScreenSource, /ariaLabel="Space または click 2 でスキャンを出します"/)
  assert.match(exploreScreenSource, /keyLabel=\{\["Space", "click 2"\]\}[\s\S]*?tone="warm"/)
  assert.match(exploreScreenSource, /placement=\{shipPromptPlacement\}[\s\S]*?keyLabel=\{\["Space", "click 2"\]\}/)
})

test("scan cooldown meter uses session ratio and completion flash state", () => {
  const exploreCanvasSource = readProjectFile("apps/web/src/render/explore/ExploreCanvas.tsx")
  const exploreFrameSource = readProjectFile("apps/web/src/render/explore/draw-explore-frame.ts")
  const exploreRendererSource = readProjectFile("apps/web/src/render/explore/explore-scene-renderer.ts")
  const scanMeterSource = readProjectFile("apps/web/src/render/explore/scan-cooldown-meter.ts")

  assert.match(exploreCanvasSource, /createScanCooldownMeterState/)
  assert.match(exploreCanvasSource, /scanMeterStateRef/)
  assert.match(exploreFrameSource, /scanMeterState: refs\.scanMeterStateRef\.current/)
  assert.match(exploreRendererSource, /drawScanCooldownMeter/)
  assert.match(exploreRendererSource, /ratio: input\.renderState\.scanCooldownRatio/)
  assert.match(scanMeterSource, /SCAN_METER_FLASH_MS = 520/)
  assert.match(scanMeterSource, /wasCoolingDown/)
  assert.match(scanMeterSource, /flashUntilMs = input\.timeMs \+ SCAN_METER_FLASH_MS/)
  assert.match(scanMeterSource, /drawCompletionGlow/)
})

test("frontend phase 2 boundaries are enforced in source", () => {
  const exploreCanvasSource = readProjectFile("apps/web/src/render/explore/ExploreCanvas.tsx")
  const exploreFrameSource = readProjectFile("apps/web/src/render/explore/draw-explore-frame.ts")
  const mapScreenSource = readProjectFile("apps/web/src/screens/map/MapScreen.tsx")
  const mapRendererSource = readProjectFile("apps/web/src/render/map/map-renderer.ts")
  const miniMapSource = readProjectFile("apps/web/src/components/MiniMap.tsx")
  const miniMapRendererSource = readProjectFile("apps/web/src/render/map/minimap-renderer.ts")
  const menuScreenSource = readProjectFile("apps/web/src/screens/menu/MenuScreen.tsx")
  const equipmentPanelSource = readProjectFile("apps/web/src/screens/menu/EquipmentPanel.tsx")
  const archivePanelSource = readProjectFile("apps/web/src/screens/menu/ArchivePanel.tsx")
  const battlePresentationSource = readProjectFile("apps/web/src/render/battle/presentation-layer.ts")
  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")

  assert.ok(exploreCanvasSource.split("\n").length <= 500)
  assert.doesNotMatch(exploreCanvasSource, /function worldToCanvas|function isCanvasPointVisible/)
  assert.match(exploreCanvasSource, /drawExploreFrame/)
  assert.match(exploreFrameSource, /drawExploreScene/)
  assert.match(mapScreenSource, /drawMapCanvas/)
  assert.doesNotMatch(mapScreenSource, /function drawMapCanvas|#[0-9a-fA-F]{3,8}/)
  assert.match(mapRendererSource, /drawArtificialGrid/)
  assert.match(mapRendererSource, /drawSignalPulse/)
  assert.match(miniMapSource, /drawMiniMapFrame/)
  assert.match(miniMapSource, /useCanvasAnimationLoop/)
  assert.match(miniMapRendererSource, /canvas-palette/)

  assert.match(menuScreenSource, /menuViewModel: MenuViewModel/)
  assert.match(equipmentPanelSource, /viewModel: EquipmentPanelViewModel/)
  assert.match(archivePanelSource, /viewModel: ArchiveViewModel/)
  assert.doesNotMatch(equipmentPanelSource, /ContentBundle|ProfileAggregate|unlockSource|levelParams/)
  assert.doesNotMatch(archivePanelSource, /ContentBundle|ProfileAggregate|hasVisibleArchiveContent/)

  assert.match(battlePresentationSource, /case "battle\.mission\.beat":/)
  assert.match(battlePresentationSource, /intentTag/)
  assert.match(battleScreenSource, /readMissionBeatSubtitleTone/)
})

test("presentation reducer dedupes request ids and prunes expired events", () => {
  const reducerSource = readProjectFile("apps/web/src/app/presentation/presentation-reducer.ts")

  assert.match(reducerSource, /const knownRequestIds = collectKnownRequestIds\(pruned\)/)
  assert.match(reducerSource, /knownRequestIds\.has\(request\.requestId\)/)
  assert.match(reducerSource, /knownRequestIds\.add\(request\.requestId\)/)
  assert.match(reducerSource, /battleEvents: current\.battleEvents\.filter\(\(event\) => event\.expiresAt > now\)/)
  assert.match(reducerSource, /transitionEvents: current\.transitionEvents\.filter\(\(event\) => event\.expiresAt > now\)/)
})

test("audio acceptance path has one settings source and guarded placeholder assets", () => {
  const audioHubSource = readProjectFile("apps/web/src/audio/AudioHub.ts")
  const audioControllerSource = readProjectFile("apps/web/src/app/audio-controller.ts")
  const audioAdapterSource = readProjectFile("apps/web/src/app/audio-event-adapter.ts")
  const appSource = readProjectFile("apps/web/src/app/App.tsx")
  const soundCatalogSource = readProjectFile("apps/web/src/audio/soundCatalog.ts")
  const sessionTypesSource = readProjectFile("packages/contracts/src/session-types.ts")
  const battleStepSource = readProjectFile("packages/game-session/src/battle/step-battle.ts")

  assert.doesNotMatch(audioHubSource, /localStorage|AUDIO_SETTINGS_STORAGE_KEY|setVolume\(|toggleMuted\(|subscribe\(/)
  assert.match(audioControllerSource, /audioHub\.applyMixerGains\(createAudioMixerGains\(settings\)\)/)
  assert.match(audioControllerSource, /SETTINGS_VOLUME_STEPS/)
  assert.match(appSource, /initializeGameAudio\(\)/)
  assert.match(audioAdapterSource, /playSessionAudioEvents/)
  assert.match(audioAdapterSource, /playerMainWeaponFired/)
  assert.match(audioAdapterSource, /playedPresentationRequestIds/)
  assert.match(sessionTypesSource, /type: "playerMainWeaponFired"/)
  assert.match(battleStepSource, /events\.push\(\{ type: "playerMainWeaponFired" \}\)/)

  assert.match(soundCatalogSource, /PLACEHOLDER_SHOT_MP3_URL = '\/sound\/shot-placeholder\.mp3'/)
  assert.doesNotMatch(soundCatalogSource, /new URL\(|sound\/ショット|ショット\.mp3/)
  assert.ok(fs.existsSync(path.join(rootDir, "apps/web/public/sound/shot-placeholder.mp3")))
  assert.ok(!fs.existsSync(path.join(rootDir, "sound/ショット.mp3")))

  const placeholderLines = soundCatalogSource
    .split("\n")
    .filter((line) => line.includes("placeholderEvent("))
  assert.ok(placeholderLines.length > 0)
  assert.ok(!placeholderLines.some((line) => /BGM_|NOISE_|BARRIER_LOOP|COMBAT_ENEMY_SHOT/.test(line)))
  assert.match(soundCatalogSource, /missingEvent\(SOUND_KEYS\.BGM_TITLE/)
  assert.match(soundCatalogSource, /missingEvent\(SOUND_KEYS\.NOISE_RADIO_STATIC/)
  assert.match(soundCatalogSource, /const missingEvent[\s\S]*?undefined, options\)/)
})

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

const rootDir = path.resolve(import.meta.dirname, "..")

test("app hook does not own gameplay event synthesis or fixed reward identifiers", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")

  assert.doesNotMatch(hookSource, /buildExploreNodeInteractionEvents/)
  assert.doesNotMatch(hookSource, /type:\s*["']collectibleCollected["']/)
  assert.doesNotMatch(hookSource, /mission_good_morning/)
  assert.doesNotMatch(hookSource, /eq_os_magnolia/)
})

test("session owns collectible domain events and exposes a drain boundary", () => {
  const sessionSource = readProjectFile("packages/game-session/src/game-session.ts")

  assert.match(sessionSource, /private\s+domainEventQueue:\s*DomainEvent\[\]\s*=\s*\[\]/)
  assert.match(sessionSource, /drainDomainEvents\(\):\s*DomainEvent\[\]/)
  assert.match(sessionSource, /type:\s*["']collectibleCollected["']/)
  assert.match(sessionSource, /enqueueCollectibleEvent\(this\.handleCollectItem/)
})

test("presentation requests outside overlay are retained for renderers", () => {
  const appStateSource = readProjectFile("apps/web/src/app/app-state.ts")
  const presentationQueueSource = readProjectFile("apps/web/src/app/presentation-queue.ts")
  const appSource = readProjectFile("apps/web/src/app/App.tsx")
  const transitionLayerSource = readProjectFile("apps/web/src/app/TransitionPresentationLayer.tsx")

  assert.match(appStateSource, /activeNonOverlayPresentations:\s*TimedPresentationRequest\[\]/)
  assert.match(presentationQueueSource, /activeNonOverlayPresentations/)
  assert.match(presentationQueueSource, /function\s+mergeNonOverlayPresentations/)
  assert.match(presentationQueueSource, /request\.channel\s*!==\s*OVERLAY_CHANNEL/)
  assert.match(appSource, /<TransitionPresentationLayer/)
  assert.match(appSource, /transitionPresentationRequests/)
  assert.match(transitionLayerSource, /transmission\.connect\.sequence/)
  assert.match(transitionLayerSource, /warp\.transition\.sequence/)
})

test("frame loop and equipment hint selection stay outside the app facade", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")
  const frameLoopSource = readProjectFile("apps/web/src/app/frame-loop.ts")
  const selectorsSource = readProjectFile("packages/game-session/src/selectors.ts")

  assert.match(hookSource, /useMagnoliaFrameLoop\(/)
  assert.doesNotMatch(hookSource, /requestAnimationFrame/)
  assert.match(frameLoopSource, /export\s+function\s+useMagnoliaFrameLoop/)
  assert.match(frameLoopSource, /requestAnimationFrame/)
  assert.match(selectorsSource, /export\s+function\s+selectEquipmentHint/)
  assert.match(selectorsSource, /export\s+function\s+selectExploreInteractionTargets/)
})

test("app command dispatch remains table driven for panel commands", () => {
  const commandSource = readProjectFile("apps/web/src/app/app-commands.ts")
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")

  for (const commandType of [
    "openMap",
    "openArchive",
    "openEquipment",
    "openSettings",
    "closePanel",
    "returnToTitle",
    "saveToCurrentSlot",
  ]) {
    assert.match(commandSource, new RegExp(`type:\\s*["']${commandType}["']`))
  }

  assert.match(hookSource, /dispatchCommandTarget\(/)
  assert.match(hookSource, /type:\s*["']startMission["']/)
  assert.match(hookSource, /type:\s*["']interactExploreNode["']/)
  assert.match(hookSource, /type:\s*["']equipItem["']/)
  assert.match(hookSource, /type:\s*["']purchaseEquipment["']/)
  assert.match(hookSource, /type:\s*["']upgradeEquipment["']/)
  assert.match(hookSource, /type:\s*["']saveToSlot["']/)
  assert.match(hookSource, /type:\s*["']changeSetting["']/)
})

test("map and battle screens receive view models instead of full content bundles", () => {
  const mapScreenSource = readProjectFile("apps/web/src/screens/map/MapScreen.tsx")
  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")
  const selectorsSource = readProjectFile("packages/game-session/src/selectors.ts")

  assert.match(selectorsSource, /export\s+type\s+WorldMapViewModel/)
  assert.match(selectorsSource, /export\s+type\s+BattleResultViewModel/)
  assert.doesNotMatch(mapScreenSource, /ContentBundle/)
  assert.doesNotMatch(mapScreenSource, /Object\.keys\(content\.mapLogic\)/)
  assert.doesNotMatch(battleScreenSource, /ContentBundle/)
})

test("content identifier migration is shared by loader and save normalizer", () => {
  const loaderSource = readProjectFile("packages/persistence/src/load-content-bundle.ts")
  const normalizerSource = readProjectFile("packages/persistence/src/save-normalizer.ts")

  // 移行表を片側だけで使うと、旧 save と現行 content の対応が処理ごとにずれます。
  assert.match(loaderSource, /migratedIds/)
  assert.match(normalizerSource, /migrateAreaId/)
  assert.match(normalizerSource, /migrateMissionId/)
  assert.match(normalizerSource, /migrateTransmissionId/)
  assert.match(normalizerSource, /migrateEquipmentId/)
  assert.match(normalizerSource, /migrateWorldMapNodeId/)
})

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

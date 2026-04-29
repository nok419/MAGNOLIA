import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"

const rootDir = path.resolve(import.meta.dirname, "..")

test("app hook does not own fixed reward identifiers or frame loop details", () => {
  const hookSource = readProjectFile("apps/web/src/app/use-magnolia-app.ts")
  const frameLoopSource = readProjectFile("apps/web/src/app/frame-loop/use-magnolia-frame-loop.ts")
  const selectorsSource = readProjectFile("packages/game-session/src/selectors.ts")

  assert.match(hookSource, /useMagnoliaFrameLoop\(/)
  assert.doesNotMatch(hookSource, /requestAnimationFrame/)
  assert.doesNotMatch(hookSource, /mission_good_morning/)
  assert.doesNotMatch(hookSource, /eq_os_magnolia/)
  assert.match(frameLoopSource, /export\s+function\s+useMagnoliaFrameLoop/)
  assert.match(frameLoopSource, /requestAnimationFrame/)
  assert.match(selectorsSource, /export\s+function\s+selectEquipmentHint/)
  assert.match(selectorsSource, /unlockSource\.kind !== "transmissionReward"/)
  assert.match(selectorsSource, /clearedMissionIds/)
})

test("session owns collectible domain events and exposes a drain boundary", () => {
  const sessionSource = readProjectFile("packages/game-session/src/game-session.ts")

  assert.match(sessionSource, /private\s+domainEventQueue:\s*DomainEvent\[\]\s*=\s*\[\]/)
  assert.match(sessionSource, /drainDomainEvents\(\):\s*DomainEvent\[\]/)
  assert.match(sessionSource, /type:\s*"collectibleCollected"/)
  assert.match(sessionSource, /this\.domainEventQueue\.push/)
})

test("map screen receives a view model instead of a full content bundle", () => {
  const mapScreenSource = readProjectFile("apps/web/src/screens/map/MapScreen.tsx")
  const battleScreenSource = readProjectFile("apps/web/src/screens/battle/BattleScreen.tsx")
  const appSource = readProjectFile("apps/web/src/app/App.tsx")
  const runtimeTypesSource = readProjectFile("packages/game-session/src/runtime-types.ts")

  assert.match(mapScreenSource, /viewModel:\s*WorldMapViewModel/)
  assert.doesNotMatch(mapScreenSource, /ContentBundle/)
  assert.doesNotMatch(mapScreenSource, /Object\.keys\(content\.mapLogic\)/)
  assert.match(appSource, /viewModel=\{app\.worldMapViewModel\}/)
  assert.match(runtimeTypesSource, /export\s+type\s+BattleResultViewModel/)
  assert.match(runtimeTypesSource, /resultViewModel\?:\s*BattleResultViewModel/)
  assert.doesNotMatch(battleScreenSource, /ContentBundle/)
  const battleScreenTag = appSource.match(/<BattleScreen[\s\S]*?\/>/)?.[0] ?? ""
  assert.doesNotMatch(battleScreenTag, /content=\{app\.content\}/)
})

test("presentation requests outside overlay are retained for renderers", () => {
  const stateSource = readProjectFile("apps/web/src/app/presentation/presentation-state.ts")
  const reducerSource = readProjectFile("apps/web/src/app/presentation/presentation-reducer.ts")

  assert.match(stateSource, /battleEvents:/)
  assert.match(stateSource, /exploreEvents:/)
  assert.match(stateSource, /transitionEvents:/)
  assert.match(reducerSource, /isBattlePresentationRequest/)
  assert.match(reducerSource, /isExplorePresentationRequest/)
  assert.match(reducerSource, /isTransitionPresentationRequest/)
})

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

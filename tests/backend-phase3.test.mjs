import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import esbuild from "esbuild"

const ROOT = path.resolve(import.meta.dirname, "..")

test("state transition, save, reload, and export keep durable progress only", async () => {
  const { createMemoryRepository, createSession } = await bundleBackendPhase3()
  const repository = createMemoryRepository()
  const session = await createSession(repository)

  assert.equal(session.getSnapshot().screen, "title")
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  assert.equal(session.getSnapshot().screen, "explore")

  for (let index = 0; index < 6; index += 1) {
    session.stepExplore({
      dtMs: 2200,
      move: { x: 0, y: 0 },
      dashPressed: false,
      interactPressed: false,
      scanPressed: true,
    })
  }

  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  const transientPresentation = session.drainPresentationRequests()
  assert.ok(transientPresentation.some((request) => request.cueId === "transmission.connect.sequence"))

  stepBattleUntilResult(session)
  const battleRenderState = session.getBattleRenderState()
  assert.equal(battleRenderState?.missionId, "mission_good_morning")
  assert.ok(battleRenderState?.resultViewModel)

  await session.dispatch({ type: "returnToExplore" })
  await session.dispatch({ type: "openEquipment" })
  const equipmentBeforeReload = session.getSnapshot().equipment?.catalog.items.find(
    (item) => item.equipmentId === "eq_main_carrier",
  )
  assert.equal(equipmentBeforeReload?.canPurchase, false)

  await session.dispatch({ type: "openArchive" })
  const archiveBeforeReload = session.getSnapshot().archive?.viewModel.entries.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )
  assert.ok(archiveBeforeReload)
  assert.ok(archiveBeforeReload.chunks.some((chunk) => chunk.restorationRatio > 0))

  await session.dispatch({ type: "saveToCurrentSlot" })
  const serialized = await repository.exportProfile(1)
  assert.doesNotMatch(serialized, /transmission\.connect\.sequence|activeOverlay|presentationQueue/)

  const reloaded = await createSession(repository)
  await reloaded.dispatch({ type: "resumeSaveSlot", slotId: 1 })
  assert.equal(reloaded.getSnapshot().screen, "explore")
  assert.equal(
    reloaded.getProfileAggregate().transmissionProgress.find(
      (entry) => entry.transmissionId === "tx_good_morning",
    )?.signalConfidence,
    1,
  )
  assert.ok(
    reloaded.getExploreRenderState()?.signalHints.some(
      (hint) => hint.nodeId === "node_tx_good_morning" && hint.detectedState === "recorded",
    ),
  )
  assert.ok(reloaded.getProfileAggregate().profile.clearedMissionIds.includes("mission_good_morning"))
  assert.ok(reloaded.getProfileAggregate().profile.ownedEquipmentIds.includes("eq_os_magnolia"))

  await reloaded.dispatch({ type: "openEquipment" })
  const equipmentAfterReload = reloaded.getSnapshot().equipment?.catalog.items.find(
    (item) => item.equipmentId === "eq_main_carrier",
  )
  assert.equal(equipmentAfterReload?.canPurchase, equipmentBeforeReload?.canPurchase)
  assert.equal(equipmentAfterReload?.lockedReasonLabel, equipmentBeforeReload?.lockedReasonLabel)

  await reloaded.dispatch({ type: "openArchive" })
  const archiveAfterReload = reloaded.getSnapshot().archive?.viewModel.entries.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )
  assert.ok(archiveAfterReload?.chunks.some((chunk) => chunk.restorationRatio > 0))

  const importedProfileId = await repository.importProfile(2, serialized)
  const imported = await repository.loadProfile(importedProfileId)
  assert.ok(imported?.profile.clearedMissionIds.includes("mission_good_morning"))
  assert.ok(imported?.profile.ownedEquipmentIds.includes("eq_os_magnolia"))
  assert.equal(imported?.profile.slotId, 2)
})

test("old save migration drops unknown ids and keeps current content defaults", async () => {
  const { loadContentBundle, normalizePersistedAggregate } = await bundleBackendPhase3()
  const content = loadContentBundle()
  const normalized = normalizePersistedAggregate({
    slotId: 1,
    content,
    aggregate: {
      profile: {
        profileId: "legacy_profile",
        slotId: 1,
        schemaVersion: 0,
        difficulty: "calm",
        currentAreaId: "missing_area",
        playerPosition: { x: Number.NaN, y: 12 },
        equipped: {
          main: "missing_equipment",
          sub: "eq_sub_noise_canceller",
          os: "missing_os",
          subsystems: ["eq_subsystem_guided_wave", "missing_subsystem"],
        },
        ownedEquipmentIds: ["missing_equipment", "eq_sub_noise_canceller"],
        equipmentLevels: { missing_equipment: 9, eq_sub_noise_canceller: 3 },
        selfRepairPoints: -20,
        collectedNodeIds: ["missing_node"],
        identifiedNodeIds: ["node_tx_good_morning", "missing_node"],
        unlockedFlags: ["legacy.flag"],
        clearedMissionIds: ["mission_good_morning", "missing_mission"],
      },
      saveSlot: { slotId: 1, profileId: "legacy_profile", label: "", currentAreaId: "missing_area", playTimeMs: -1 },
      areaProgress: [],
      transmissionProgress: [
        {
          profileId: "legacy_profile",
          transmissionId: "tx_good_morning",
          areaId: "area_central_tower",
          clearCount: 1,
          bestAnalysisRate: 2,
          bestRunRestorationRate: 2,
          archiveRestorationRate: 2,
          heardRanges: [{ startMs: -100, endMs: 999999 }],
          transcriptSpans: [],
          damageRanges: [],
          metadataUnlocked: { title: true, speaker: true, location: true, summary: true },
          signalConfidence: 2,
        },
        {
          profileId: "legacy_profile",
          transmissionId: "missing_tx",
          areaId: "missing_area",
          clearCount: 1,
          bestAnalysisRate: 1,
          bestRunRestorationRate: 1,
          archiveRestorationRate: 1,
          heardRanges: [],
          transcriptSpans: [],
          damageRanges: [],
          metadataUnlocked: {},
          signalConfidence: 1,
        },
      ],
      missionRuns: [],
    },
  })

  assert.equal(normalized.profile.currentAreaId, "area_central_tower")
  assert.equal(normalized.profile.selfRepairPoints, 0)
  assert.ok(normalized.profile.ownedEquipmentIds.includes("eq_main_pulse"))
  assert.ok(normalized.profile.ownedEquipmentIds.includes("eq_os_broken"))
  assert.ok(!normalized.profile.ownedEquipmentIds.includes("missing_equipment"))
  assert.deepEqual(normalized.profile.identifiedNodeIds, ["node_tx_good_morning"])
  assert.deepEqual(normalized.profile.clearedMissionIds, ["mission_good_morning"])
  assert.equal(normalized.transmissionProgress.length, 1)
  assert.equal(normalized.transmissionProgress[0].archiveRestorationRate, 1)
})

function stepBattleUntilResult(session) {
  for (let index = 0; index < 5; index += 1) {
    session.stepBattle({
      dtMs: 20000,
      move: { x: 0, y: 0 },
      fireMain: false,
      fireSub: false,
      focus: false,
      pausePressed: false,
    })
    if (session.getBattleRenderState()?.resultViewModel) {
      return
    }
  }
  throw new Error("mission result was not produced")
}

async function bundleBackendPhase3() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-backend-phase3-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "backend-phase3.mjs")
  writeFileSync(entry, [
    "import { MagnoliaGameSession } from './packages/game-session/src/game-session.ts'",
    "import { loadContentBundle } from './packages/persistence/src/load-content-bundle.ts'",
    "import { normalizePersistedAggregate, normalizePersistedSettings, parseImportedAggregate } from './packages/persistence/src/save-normalizer.ts'",
    "import { createDefaultSaveSlots, createDefaultSettings } from './packages/persistence/src/defaults.ts'",
    "export { loadContentBundle, normalizePersistedAggregate }",
    "export async function createSession(repository = createMemoryRepository()) {",
    "  const session = new MagnoliaGameSession({ content: loadContentBundle(), repository })",
    "  await session.initialize()",
    "  return session",
    "}",
    "export function createMemoryRepository() {",
    "  let slots = createDefaultSaveSlots()",
    "  let settings = createDefaultSettings()",
    "  const profiles = new Map()",
    "  return {",
    "    async listSaveSlots() { return slots },",
    "    async loadProfile(profileId) { return profiles.get(profileId) ?? null },",
    "    async loadProfileBySlot(slotId) {",
    "      const slot = slots.find((entry) => entry.slotId === slotId)",
    "      return slot?.profileId ? profiles.get(slot.profileId) ?? null : null",
    "    },",
    "    async createProfileAtSlot(slotId, aggregate) {",
    "      const normalized = normalizePersistedAggregate({ slotId, aggregate, content: loadContentBundle() })",
    "      profiles.set(normalized.profile.profileId, normalized)",
    "      slots = slots.map((slot) => slot.slotId === slotId ? normalized.saveSlot : slot)",
    "    },",
    "    async saveProfileToSlot(slotId, aggregate) {",
    "      const normalized = normalizePersistedAggregate({ slotId, aggregate, content: loadContentBundle() })",
    "      profiles.set(normalized.profile.profileId, normalized)",
    "      slots = slots.map((slot) => slot.slotId === slotId ? normalized.saveSlot : slot)",
    "    },",
    "    async saveMissionRun() {},",
    "    async loadSettings() { return settings },",
    "    async saveSettings(nextSettings) { settings = normalizePersistedSettings(nextSettings) },",
    "    async loadMeta() { return null },",
    "    async saveMeta() {},",
    "    async exportProfile(slotId) {",
    "      const aggregate = await this.loadProfileBySlot(slotId)",
    "      return JSON.stringify(aggregate)",
    "    },",
    "    async importProfile(slotId, serialized) {",
    "      const aggregate = parseImportedAggregate(serialized)",
    "      const normalized = normalizePersistedAggregate({ slotId, aggregate, content: loadContentBundle(), rebindProfileId: true })",
    "      await this.saveProfileToSlot(slotId, normalized)",
    "      return normalized.profile.profileId",
    "    }",
    "  }",
    "}",
    "",
  ].join("\n").replaceAll("./packages", `${ROOT}/packages`))

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

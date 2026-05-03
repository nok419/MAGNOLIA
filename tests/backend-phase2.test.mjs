import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import esbuild from "esbuild"

const ROOT = path.resolve(import.meta.dirname, "..")

test("equipment catalog ViewModel and purchase precondition use the same reason", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const pulseItem = session.getSnapshot().equipment.catalog.items.find(
    (item) => item.equipmentId === "eq_main_pulse",
  )
  assert.equal(pulseItem.statGroups[0].label, "弾丸")
  assert.ok(pulseItem.statGroups[0].stats.some((stat) => stat.label === "威力" && stat.value === "9"))
  assert.equal(
    pulseItem.upgradePreview.summary,
    "メインショットの威力が上がり、近接攻撃の範囲が広がる。",
  )

  const purchaseItem = session.getSnapshot().equipment.catalog.items.find(
    (item) => item.equipmentId === "eq_main_carrier",
  )

  assert.equal(purchaseItem.canPurchase, false)
  assert.equal(purchaseItem.purchaseCost, 200)
  assert.equal(purchaseItem.lockedReasonLabel, "自己修復ポイントが不足しています")

  await session.dispatch({ type: "purchaseEquipment", equipmentId: "eq_main_carrier" })

  assert.equal(session.getLastCommandErrorReason(), purchaseItem.lockedReasonLabel)
  assert.equal(
    session.getProfileAggregate().profile.ownedEquipmentIds.includes("eq_main_carrier"),
    false,
  )
})

test("debug mode starts after mission 01 with magnolia and level 1 equipment", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  const saveSlotsBefore = JSON.stringify(session.getSnapshot().saveSlots.slots)

  await session.dispatch({ type: "startDebugMode", difficulty: "calm" })

  const content = session.getContentBundle()
  const profile = session.getProfileAggregate().profile
  const equipmentIds = Object.keys(content.equipment).sort()
  const exploreSnapshot = session.getExploreSnapshot()
  const renderState = session.getExploreRenderState()
  const progress = session.getProfileAggregate().transmissionProgress.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )

  assert.equal(session.getSnapshot().screen, "explore")
  assert.deepEqual([...profile.ownedEquipmentIds].sort(), equipmentIds)
  assert.ok(equipmentIds.every((equipmentId) => profile.equipmentLevels[equipmentId] === 1))
  assert.equal(profile.selfRepairPoints, 900)
  assert.ok(profile.clearedMissionIds.includes("mission_good_morning"))
  assert.equal(profile.equipped.os, "eq_os_magnolia")
  assert.ok(profile.unlockedFlags.includes("tutorial.released"))
  assert.ok(profile.unlockedFlags.includes("ui.map.enabled"))
  assert.equal(exploreSnapshot.featureAccess.canOpenMap, true)
  assert.equal(exploreSnapshot.featureAccess.mapVisionUnlocked, true)
  assert.equal(renderState.tutorialRestricted, false)
  assert.equal(progress?.clearCount, 1)
  assert.equal(progress?.archiveRestorationRate, 1)
  assert.equal(progress?.signalConfidence, 1)

  await session.dispatch({ type: "saveToCurrentSlot" })
  assert.equal(JSON.stringify(session.getSnapshot().saveSlots.slots), saveSlotsBefore)
})

test("terminal difficulty can be selected and applied to current progression", async () => {
  const { createSession, resolveBattlefieldHazardSpecsForDifficulty } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  await session.dispatch({ type: "changeSetting", path: "difficulty", value: "terminal" })

  const content = session.getContentBundle()
  const profile = session.getProfileAggregate().profile
  const terminalModifiers = content.difficultyModifiers.terminal
  assert.equal(session.getSettings().difficulty, "terminal")
  assert.equal(profile.difficulty, "terminal")

  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })

  const mission = content.missions.mission_good_morning
  const baseHearingThreshold = mission.hearingThresholdOverride ?? content.playerShipSpec.hearingThreshold
  const expectedHearingThreshold = Math.min(
    1,
    Math.max(0, baseHearingThreshold + (terminalModifiers.hearingThresholdOffset ?? 0)),
  )
  assert.equal(
    session.battleState.noiseState.hearingThreshold,
    expectedHearingThreshold,
  )

  const generatedHazard = resolveBattlefieldHazardSpecsForDifficulty({
    mission,
    difficultyModifiers: terminalModifiers,
  }).find((hazard) => hazard.hazardId.includes("__terminal_"))
  assert.ok(generatedHazard)

  session.battleState.elapsedMs = Math.max(0, generatedHazard.spawnAtMs - 1)
  session.stepBattle({
    dtMs: 2,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })
  assert.ok(
    session.battleState.hazards.some((hazard) => hazard.hazardId === generatedHazard.hazardId),
  )
})

test("terminal difficulty increases hazard and spawn pressure in every mission", async () => {
  const {
    loadContentBundle,
    resolveBattlefieldHazardSpecsForDifficulty,
    spawnMissionEnemies,
  } = await bundleBackendPhase2()
  const content = loadContentBundle()

  for (const mission of Object.values(content.missions)) {
    const calmHazards = resolveBattlefieldHazardSpecsForDifficulty({
      mission,
      difficultyModifiers: content.difficultyModifiers.calm,
    })
    const terminalHazards = resolveBattlefieldHazardSpecsForDifficulty({
      mission,
      difficultyModifiers: content.difficultyModifiers.terminal,
    })
    assert.ok(
      terminalHazards.length > calmHazards.length,
      `${mission.missionId} should schedule more magnetic disasters on terminal`,
    )

    const calmBattle = createDifficultySpawnBattle(mission)
    spawnMissionEnemies({
      battle: calmBattle,
      previousElapsedMs: 0,
      enemies: content.enemies,
      battleSpawnPoints: content.battleSpawnPoints,
      hitboxPresets: content.contentHitboxPresets,
      difficultyModifiers: content.difficultyModifiers.calm,
      nextInstanceId: (prefix) => `${prefix}.calm`,
    })

    const terminalBattle = createDifficultySpawnBattle(mission)
    spawnMissionEnemies({
      battle: terminalBattle,
      previousElapsedMs: 0,
      enemies: content.enemies,
      battleSpawnPoints: content.battleSpawnPoints,
      hitboxPresets: content.contentHitboxPresets,
      difficultyModifiers: content.difficultyModifiers.terminal,
      nextInstanceId: (prefix) => `${prefix}.terminal`,
    })

    assert.ok(
      terminalBattle.enemies.length > calmBattle.enemies.length,
      `${mission.missionId} should spawn more enemies on terminal`,
    )
    assert.equal(
      sumExpectedEnemies(terminalBattle),
      terminalBattle.enemies.length,
    )
    assert.ok(
      terminalBattle.enemies.some((enemy) => enemy.maxHp > content.enemies[enemy.enemyId].hp),
      `${mission.missionId} should apply terminal enemy HP`,
    )
  }
})

test("terminal difficulty changes enemy projectile patterns", async () => {
  const { fireEnemyPatterns, loadContentBundle } = await bundleBackendPhase2()
  const content = loadContentBundle()
  const calmBattle = createDifficultyPatternBattle()
  const terminalBattle = createDifficultyPatternBattle()

  fireEnemyPatterns({
    battle: calmBattle,
    enemy: createDifficultyPatternEnemy(),
    enemyDefinition: {
      ...content.enemies.enemy_standard,
      bulletPatternIds: ["bp_standard_spread"],
    },
    bulletPatterns: content.bulletPatterns,
    projectiles: content.projectiles,
    hitboxPresets: content.contentHitboxPresets,
    difficultyModifiers: content.difficultyModifiers.calm,
    nextInstanceId: (prefix) => `${prefix}.calm`,
  })
  fireEnemyPatterns({
    battle: terminalBattle,
    enemy: createDifficultyPatternEnemy(),
    enemyDefinition: {
      ...content.enemies.enemy_standard,
      bulletPatternIds: ["bp_standard_spread"],
    },
    bulletPatterns: content.bulletPatterns,
    projectiles: content.projectiles,
    hitboxPresets: content.contentHitboxPresets,
    difficultyModifiers: content.difficultyModifiers.terminal,
    nextInstanceId: (prefix) => `${prefix}.terminal`,
  })

  const pattern = content.bulletPatterns.bp_standard_spread
  assert.equal(calmBattle.projectiles.length, pattern.burstCount)
  assert.equal(
    terminalBattle.projectiles.length,
    pattern.burstCount + content.difficultyModifiers.terminal.enemyPatternBurstBonus,
  )
  assert.ok(
    readProjectileSpeed(terminalBattle.projectiles[0]) > readProjectileSpeed(calmBattle.projectiles[0]),
  )
})

test("surviving enemies delay follow-up shots after the opening volley", async () => {
  const { fireEnemyPatterns, loadContentBundle } = await bundleBackendPhase2()
  const content = loadContentBundle()
  const battle = createDifficultyPatternBattle()
  const enemy = createDifficultyPatternEnemy()
  const patternId = "bp_scout_single"
  const pattern = content.bulletPatterns[patternId]
  const enemyDefinition = {
    ...content.enemies.enemy_scout,
    bulletPatternIds: [patternId],
  }
  const fire = () => fireEnemyPatterns({
    battle,
    enemy,
    enemyDefinition,
    bulletPatterns: content.bulletPatterns,
    projectiles: content.projectiles,
    hitboxPresets: content.contentHitboxPresets,
    difficultyModifiers: content.difficultyModifiers.calm,
    nextInstanceId: (prefix) => `${prefix}.${battle.elapsedMs}`,
  })
  const baseCadenceMs = pattern.cadenceMs * content.difficultyModifiers.calm.enemyCadenceMultiplier

  fire()
  assert.equal(battle.projectiles.length, pattern.burstCount)

  battle.elapsedMs = baseCadenceMs
  fire()
  assert.equal(
    battle.projectiles.length,
    pattern.burstCount,
    "follow-up shots should not use the old first-shot cadence",
  )

  battle.elapsedMs = baseCadenceMs * 1.8 + 1
  fire()
  assert.equal(battle.projectiles.length, pattern.burstCount * 2)
})

test("battle runtime caps enemy projectiles before render state growth", async () => {
  const { createSession, BATTLE_ENEMY_PROJECTILE_BUDGET } = await bundleBackendPhase2()
  const missionIds = ["mission_good_morning", "mission_where_are_you", "mission_evacuation"]

  for (const missionId of missionIds) {
    const session = await createSession()
    await session.dispatch({ type: "startDebugMode", difficulty: "calm" })
    await session.dispatch({ type: "startMission", missionId })

    const durationMs = session.getContentBundle().missions[missionId].durationMs
    let maxEnemyProjectiles = 0
    for (let elapsedMs = 0; elapsedMs < durationMs + 2500; elapsedMs += 1000 / 60) {
      session.stepBattle({
        dtMs: 1000 / 60,
        move: { x: 0, y: 0 },
        fireMain: false,
        fireSub: false,
        focus: false,
        pausePressed: false,
      })
      const enemyProjectileCount = session.battleState.projectiles.filter(
        (projectile) => projectile.side === "enemy",
      ).length
      maxEnemyProjectiles = Math.max(maxEnemyProjectiles, enemyProjectileCount)
    }

    assert.ok(
      maxEnemyProjectiles <= BATTLE_ENEMY_PROJECTILE_BUDGET,
      `${missionId} enemy projectiles should stay within the runtime budget`,
    )
  }
})

test("battle runtime drops projectiles shortly after leaving the screen", async () => {
  const { updateBattleProjectiles } = await bundleBackendPhase2()
  const battle = {
    playerPosition: { x: 240, y: 420 },
    enemies: [],
    projectiles: [
      createRuntimeProjectile("enemy-inside", "enemy", { x: 10, y: 10 }, { x: 0, y: 0 }, 6),
      createRuntimeProjectile("player-inside", "player", { x: 10, y: 20 }, { x: 0, y: 0 }, 6),
      createRuntimeProjectile("enemy-outside-left", "enemy", { x: -13, y: 120 }, { x: 0, y: 0 }, 12),
      createRuntimeProjectile("player-outside-bottom", "player", { x: 120, y: 653 }, { x: 0, y: 0 }, 12),
    ],
  }

  updateBattleProjectiles({
    battle,
    dtMs: 1000 / 60,
    statModifiers: undefined,
    projectiles: {},
    hitboxPresets: {},
    nextInstanceId: (prefix) => `${prefix}.runtime-cull`,
  })

  assert.deepEqual(
    battle.projectiles.map((projectile) => projectile.projectileInstanceId),
    ["enemy-inside", "player-inside"],
  )
})

test("magnetic disasters thin enemy projectiles without clearing the hazard area", async () => {
  const { applyMagneticDisasterEffects } = await bundleBackendPhase2()
  const projectiles = Array.from({ length: 12 }, (_, index) =>
    createRuntimeProjectile(`enemy.hazard.${index}`, "enemy", { x: 120, y: 180 }, { x: 0, y: 0 }, 6),
  )
  const battle = {
    elapsedMs: 12000,
    enemies: [],
    projectiles,
    hazards: [{
      hazardId: "hazard.test",
      kind: "magneticDisaster",
      phase: "active",
      phaseProgress: 0.6,
      area: { shape: "rect", x: 80, y: 140, width: 120, height: 120 },
      motion: { motionKind: "static" },
      tickIntervalMs: 250,
      noiseDamage: 0.08,
      enemyDamagePerSecond: 20,
      visualPresetId: "hazard_magnetic_disaster_standard",
    }],
  }

  applyMagneticDisasterEffects(battle, 16)

  const remainingEnemyProjectiles = battle.projectiles.filter((projectile) => projectile.side === "enemy")
  assert.ok(remainingEnemyProjectiles.length > 0)
  assert.ok(remainingEnemyProjectiles.length < projectiles.length)
})

test("subsystem equipment cannot be equipped in both subsystem slots", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  profile.ownedEquipmentIds.push("eq_subsystem_guided_wave")
  profile.equipmentLevels.eq_subsystem_guided_wave = 1
  await session.dispatch({
    type: "equipItem",
    slot: "subsystem",
    subsystemIndex: 0,
    equipmentId: "eq_subsystem_guided_wave",
  })
  await session.dispatch({
    type: "equipItem",
    slot: "subsystem",
    subsystemIndex: 1,
    equipmentId: "eq_subsystem_guided_wave",
  })

  assert.deepEqual(profile.equipped.subsystems, ["eq_subsystem_guided_wave", null])
  assert.equal(session.getLastCommandErrorReason(), "もう一方のサブシステム枠で装備中です")
})

test("broken OS final upgrade grants and equips OS LILY", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  profile.equipped.os = "eq_os_broken"
  profile.equipmentLevels.eq_os_broken = 9
  profile.selfRepairPoints = 140

  await session.dispatch({ type: "upgradeEquipment", equipmentId: "eq_os_broken" })

  assert.equal(profile.equipmentLevels.eq_os_broken, 10)
  assert.ok(profile.ownedEquipmentIds.includes("eq_os_lily"))
  assert.equal(profile.equipmentLevels.eq_os_lily, 1)
  assert.equal(profile.equipped.os, "eq_os_lily")
  assert.equal(profile.selfRepairPoints, 0)
})

test("equipment equip and unequip commands emit audio domain events", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  session.drainDomainEvents()

  const profile = session.getProfileAggregate().profile
  profile.ownedEquipmentIds.push("eq_sub_silent_wave")
  profile.equipmentLevels.eq_sub_silent_wave = 1

  await session.dispatch({
    type: "equipItem",
    slot: "sub",
    equipmentId: "eq_sub_silent_wave",
  })

  assert.equal(profile.equipped.sub, "eq_sub_silent_wave")
  assert.deepEqual(session.drainDomainEvents(), [{
    type: "equipmentEquipped",
    equipmentId: "eq_sub_silent_wave",
    slot: "sub",
  }])

  await session.dispatch({
    type: "unequipItem",
    slot: "sub",
    equipmentId: "eq_sub_silent_wave",
  })

  assert.equal(profile.equipped.sub, undefined)
  assert.deepEqual(session.drainDomainEvents(), [{
    type: "equipmentUnequipped",
    equipmentId: "eq_sub_silent_wave",
    slot: "sub",
  }])
})

test("collect command rejects nodes that are not currently collectible", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  await session.dispatch({
    type: "collectItem",
    nodeId: "node_collect_repair_cluster_e",
  })

  assert.equal(session.getLastCommandErrorReason(), "収集ノードが表示されていません")
  assert.deepEqual(session.getProfileAggregate().profile.collectedNodeIds, [])
})

test("scan identification is normalized into saved exploration state", async () => {
  const { createSession, normalizePersistedAggregate, loadContentBundle } =
    await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  for (let index = 0; index < 6; index += 1) {
    session.stepExplore({
      dtMs: 2200,
      move: { x: 0, y: 0 },
      dashPressed: false,
      interactPressed: false,
      scanPressed: true,
    })
  }

  const aggregate = session.getProfileAggregate()
  const normalized = normalizePersistedAggregate({
    slotId: 1,
    aggregate,
    content: loadContentBundle(),
  })
  const progress = normalized.transmissionProgress.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )

  assert.equal(progress.signalConfidence, 1)
  assert.match(progress.signalDiscoveredAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.ok(
    session.getExploreRenderState().signalHints.some(
      (hint) => hint.nodeId === "node_tx_good_morning" && hint.detectedState === "recorded",
    ),
  )
})

test("scan-identified uncleared missions still drive signal strength", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  for (let index = 0; index < 6; index += 1) {
    session.stepExplore({
      dtMs: 2200,
      move: { x: 0, y: 0 },
      dashPressed: false,
      interactPressed: false,
      scanPressed: true,
    })
  }

  const progress = session.getProfileAggregate().transmissionProgress.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )

  assert.equal(progress.signalConfidence, 1)
  assert.equal(
    session.getProfileAggregate().profile.clearedMissionIds.includes("mission_good_morning"),
    false,
  )
  assert.ok(session.getExploreRenderState().nearestTransmissionStrength > 0)
})

test("signal panel meters react beyond the old short range", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  profile.playerPosition = { x: -120, y: 126 }
  session.stepExplore({
    dtMs: 16,
    move: { x: 0, y: 0 },
    dashPressed: false,
    interactPressed: false,
    scanPressed: false,
  })

  // good morning の通信から約334px離れた地点で、旧300px基準なら反応しません。
  const renderState = session.getExploreRenderState()
  assert.ok(renderState.nearestTransmissionStrength > 0)
  assert.ok(renderState.nearestAnyTransmissionStrength > 0)
})

test("mission icons inside the explored view do not require scan identification", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  profile.playerPosition = { x: 214, y: 126 }
  session.stepExplore({
    dtMs: 16,
    move: { x: 0, y: 0 },
    dashPressed: false,
    interactPressed: false,
    scanPressed: false,
  })

  const progress = session.getProfileAggregate().transmissionProgress.find(
    (entry) => entry.transmissionId === "tx_good_morning",
  )
  assert.ok((progress?.signalConfidence ?? 0) < 1)
  assert.equal(progress?.signalDiscoveredAt, undefined)
  assert.ok(
    session.getExploreRenderState().visibleTransmissions.some(
      (node) => node.nodeId === "node_tx_good_morning",
    ),
  )
})

test("MAGNOLIA level 2 expands the explore vision circle from the narrower base", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  assert.equal(session.getExploreRenderState().visionRadius, 132)

  profile.ownedEquipmentIds.push("eq_os_magnolia")
  profile.equipmentLevels.eq_os_magnolia = 2
  profile.equipped.os = "eq_os_magnolia"

  assert.equal(session.getExploreRenderState().visionRadius, 150)
})

test("scan tutorial hint is dismissed by scan or the first mission clear", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  assert.equal(session.getExploreRenderState().shouldShowScanHint, true)

  session.stepExplore({
    dtMs: 16,
    move: { x: 0, y: 0 },
    dashPressed: false,
    interactPressed: false,
    scanPressed: true,
  })

  assert.equal(session.getExploreRenderState().shouldShowScanHint, false)
  assert.ok(
    session.getProfileAggregate().profile.unlockedFlags.includes("tutorial.scan_hint.dismissed"),
  )

  const clearedSession = await createSession()
  await clearedSession.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  clearedSession.getProfileAggregate().profile.clearedMissionIds.push("mission_good_morning")

  assert.equal(clearedSession.getExploreRenderState().shouldShowScanHint, false)
})

test("os magnolia signal prompt ends after MAGNOLIA is equipped", async () => {
  const { createSession, selectEquipmentHint } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  assert.deepEqual(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).unseenEquipmentIds,
    [],
  )

  profile.clearedMissionIds.push("mission_good_morning")
  profile.ownedEquipmentIds.push("eq_os_magnolia")
  profile.equipmentLevels.eq_os_magnolia = 1

  assert.deepEqual(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).unseenEquipmentIds,
    ["eq_os_magnolia"],
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).shouldShowEquipmentTutorialIcon,
    false,
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).shouldShowOsMagnoliaEquipPrompt,
    true,
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).equipmentGuideTargetId,
    "eq_os_magnolia",
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: ["eq_os_magnolia"],
    }).shouldShowOsMagnoliaEquipPrompt,
    true,
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: ["eq_os_magnolia"],
    }).equipmentGuideTargetId,
    null,
  )

  profile.equipped.os = "eq_os_magnolia"
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).shouldShowOsMagnoliaEquipPrompt,
    false,
  )
  assert.equal(
    selectEquipmentHint({
      content: session.getContentBundle(),
      profile: session.getProfileAggregate(),
      seenEquipmentIds: [],
    }).equipmentGuideTargetId,
    null,
  )
})

test("explore node interaction keeps visual-near icons clickable", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  profile.playerPosition = { x: 300, y: -34 }
  profile.identifiedNodeIds.push("node_collect_repair_cluster_e")
  const target = session.getExploreRenderState().interactionTargets.find(
    (entry) => entry.nodeId === "node_collect_repair_cluster_e",
  )

  assert.equal(target?.clickable, true)
  assert.equal(target?.interactionRadius, 44)

  const pointsBeforeCollect = profile.selfRepairPoints
  await session.dispatch({ type: "interactExploreNode", nodeId: "node_collect_repair_cluster_e" })

  assert.ok(profile.collectedNodeIds.includes("node_collect_repair_cluster_e"))
  assert.equal(profile.selfRepairPoints, pointsBeforeCollect + 52)
})

test("mission beat events become PresentationRequest without mission-specific frontend branches", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  session.drainPresentationRequests()

  const requests = []
  for (let index = 0; index < 9; index += 1) {
    requests.push(
      ...session.stepBattle({
        dtMs: 1000,
        move: { x: 0, y: 0 },
        fireMain: false,
        fireSub: false,
        focus: false,
        pausePressed: false,
      }).presentationRequests,
    )
  }

  assert.ok(
    requests.some(
      (request) =>
        request.cueId === "battle.mission.beat" &&
        request.beatId === "gm_main_drill" &&
        request.transcriptChunkIds.includes("chunk_gm_002a"),
    ),
  )
})

test("battle render state exposes transmission audio sync state", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  session.drainDomainEvents()
  const battle = session.battleState
  battle.transmission = {
    ...battle.transmission,
    audioAssetId: "asset.voice.radioBlip",
    audioDurationMs: 57000,
  }

  const introState = session.getBattleRenderState().transmissionAudio
  assert.equal(introState.transmissionId, "tx_good_morning")
  assert.equal(introState.audioAssetId, "asset.voice.radioBlip")
  assert.equal(introState.audioStartDelayMs, 1200)
  assert.equal(introState.audioPlaybackMs, 0)
  assert.equal(introState.phase, "intro")
  assert.equal(introState.isPaused, false)

  session.stepBattle({
    dtMs: 1300,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })

  const playingState = session.getBattleRenderState().transmissionAudio
  assert.equal(playingState.phase, "playing")
  assert.equal(playingState.audioPlaybackMs, 1300)
})

test("missed enemies in the preceding waves corrupt the next subtitle in all playable missions", async () => {
  const { createSession } = await bundleBackendPhase2()
  const missionIds = [
    "mission_good_morning",
    "mission_where_are_you",
    "mission_evacuation",
  ]

  for (const missionId of missionIds) {
    const session = await createSession()
    await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
    if (missionId !== "mission_good_morning") {
      session.getProfileAggregate().profile.clearedMissionIds.push("mission_good_morning")
    }
    await session.dispatch({ type: "startMission", missionId })

    const battle = session.battleState
    const target = activateSubtitleAfterPrecedingWaves({
      battle,
      destroyedEnemyCount: 0,
      progress: 0.05,
    })
    const renderState = session.getBattleRenderState()

    assert.equal(renderState.activeSubtitle.chunkId, target.chunk.chunkId)
    assert.equal(renderState.activeSubtitle.waveInterference.mode, "heavy")
    assert.equal(renderState.activeSubtitle.waveInterference.expectedEnemyCount, target.expectedEnemyCount)
    assert.equal(renderState.activeSubtitle.waveInterference.destroyedEnemyCount, 0)
  }
})

test("minor wave misses stay readable and medium misses recover during the subtitle", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })

  const battle = session.battleState
  const readableTarget = activateSubtitleAfterPrecedingWaves({
    battle,
    destroyedEnemyCount: "all-but-one",
    minExpectedEnemyCount: 4,
    progress: 0.05,
  })
  const readableInterference = session.getBattleRenderState().activeSubtitle.waveInterference
  assert.equal(readableInterference.mode, "readableGlitch")
  assert.equal(readableInterference.destroyedEnemyCount, readableTarget.expectedEnemyCount - 1)

  const recoveringTarget = activateSubtitleAfterPrecedingWaves({
    battle,
    destroyedEnemyCount: 2,
    minExpectedEnemyCount: 3,
    progress: 0.05,
  })
  const earlyInterference = session.getBattleRenderState().activeSubtitle.waveInterference
  assert.equal(earlyInterference.mode, "recovering")
  assert.equal(earlyInterference.expectedEnemyCount, recoveringTarget.expectedEnemyCount)

  activateSubtitleAfterPrecedingWaves({
    battle,
    chunkId: recoveringTarget.chunk.chunkId,
    destroyedEnemyCount: 2,
    progress: 0.95,
  })
  const lateInterference = session.getBattleRenderState().activeSubtitle.waveInterference
  assert.equal(lateInterference.mode, "recovering")
  assert.ok(lateInterference.effectiveMissRate < earlyInterference.effectiveMissRate)
})

test("mission evacuation final observation is scrambled until b1 is defeated", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  session.getProfileAggregate().profile.clearedMissionIds.push("mission_good_morning")
  await session.dispatch({ type: "startMission", missionId: "mission_evacuation" })

  const battle = session.battleState
  const finalChunk = battle.transcript.find(
    (chunk) => chunk.chunkId === "tx_evacuation_09a",
  )
  const bossWave = battle.mission.waves.find(
    (wave) => wave.waveId === "evac_wave_17_boss",
  )
  const content = session.getContentBundle()
  const bossDefinition = content.enemies.b1
  const coreBurst = content.bulletPatterns.bp_b1_core_burst
  const lanceStream = content.bulletPatterns.bp_b1_lance_stream
  assert.equal(finalChunk.text, "観測情報を提供します")
  assert.equal(bossWave.entries[0].enemyId, "b1")
  // 最終観測のロック解除条件と同じ敵を見て、03 ボスの耐久と負荷調整後の弾幕を固定します。
  assert.equal(bossDefinition.hp, 1500)
  assert.equal(bossDefinition.collisionDamage, 34)
  assert.equal(bossDefinition.behaviorParams.pauseMs, 9000)
  assert.equal(coreBurst.cadenceMs, 2300)
  assert.equal(coreBurst.burstCount, 26)
  assert.equal(lanceStream.cadenceMs, 240)
  assert.equal(lanceStream.burstCount, 5)

  battle.phase = "playing"
  battle.audioPlaybackMs = finalChunk.startMs + 100
  battle.elapsedMs = battle.mission.audioStartDelayMs + battle.audioPlaybackMs
  battle.heardRanges = [{ startMs: 0, endMs: battle.transcript.at(-1).endMs }]
  battle.damageRanges = []
  battle.restorationRate = 1
  battle.wavePerformance = {
    [bossWave.waveId]: {
      waveId: bossWave.waveId,
      atMs: bossWave.atMs,
      expectedEnemyCount: 1,
      destroyedSpawnIds: new Set(),
    },
  }

  const lockedSubtitle = session.getBattleRenderState().activeSubtitle
  assert.equal(lockedSubtitle.chunkId, "tx_evacuation_09a")
  assert.equal(lockedSubtitle.waveInterference.mode, "heavy")

  battle.wavePerformance[bossWave.waveId].destroyedSpawnIds.add("evac_wave_17_boss_spawn_01")
  const unlockedSubtitle = session.getBattleRenderState().activeSubtitle
  assert.equal(unlockedSubtitle.text, "観測情報を提供します")
  assert.equal(unlockedSubtitle.waveInterference, undefined)
})

test("main pulse and noise canceller can be used in the same battle frame", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })

  session.stepBattle({
    dtMs: 34,
    move: { x: 0, y: 0 },
    fireMain: true,
    fireSub: true,
    focus: false,
    pausePressed: false,
  })

  const renderState = session.getBattleRenderState()
  assert.equal(renderState.player.barrierState.active, true)
  assert.ok(renderState.projectiles.some((projectile) => projectile.projectileId === "proj_player_pulse"))
})

test("noise canceller level 3 cooldown scales with consumed barrier time", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })

  const profile = session.getProfileAggregate().profile
  if (!profile.ownedEquipmentIds.includes("eq_sub_noise_canceller")) {
    profile.ownedEquipmentIds.push("eq_sub_noise_canceller")
  }
  profile.equipmentLevels.eq_sub_noise_canceller = 3
  profile.equipped.sub = "eq_sub_noise_canceller"
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })

  const battle = session.battleState
  session.stepBattle({
    dtMs: 16,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: true,
    focus: false,
    pausePressed: false,
  })

  assert.equal(battle.barrier?.maxMs, 1600)
  assert.equal(battle.subCooldownMs, 0)

  session.stepBattle({
    dtMs: 200,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: true,
    focus: false,
    pausePressed: false,
  })
  session.stepBattle({
    dtMs: 16,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })

  assert.equal(battle.barrier, undefined)
  assert.ok(battle.subCooldownMs > 90)
  assert.ok(battle.subCooldownMs < 100)

  battle.subCooldownMs = 0
  session.stepBattle({
    dtMs: 16,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: true,
    focus: false,
    pausePressed: false,
  })

  assert.equal(battle.barrier?.maxMs, 1600)

  session.stepBattle({
    dtMs: 1700,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: true,
    focus: false,
    pausePressed: false,
  })

  assert.equal(battle.barrier, undefined)
  assert.equal(battle.subCooldownMs, 700)
})

test("pulse melee collision follows the visible sweep after the first frame", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  const battle = session.battleState
  const enemyPosition = {
    x: battle.playerPosition.x + 95,
    y: battle.playerPosition.y - 55,
  }
  battle.enemies = [{
    enemyInstanceId: "test.right-side-noise",
    enemyId: "enemy_standard",
    spawnId: "test.right-side-noise",
    patternSeed: "test.right-side-noise",
    spawnPosition: enemyPosition,
    position: enemyPosition,
    hp: 56,
    maxHp: 56,
    enteredAtMs: battle.elapsedMs,
    patternLastFiredAtMs: {},
    burnDamagePerSec: 0,
    burnUntilMs: 0,
    radius: 14,
    overrides: { speed: 0 },
  }]

  session.stepBattle({
    dtMs: 34,
    move: { x: 0, y: 0 },
    fireMain: true,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })
  assert.equal(battle.enemies.length, 1)

  for (let index = 0; index < 10 && battle.enemies.length > 0; index += 1) {
    session.stepBattle({
      dtMs: 34,
      move: { x: 0, y: 0 },
      fireMain: false,
      fireSub: false,
      focus: false,
      pausePressed: false,
    })
  }

  assert.equal(battle.enemies.length, 0)
})

test("main pulse melee emits a domain event when the sweep spawns", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })

  const battle = session.battleState
  const enemyPosition = {
    x: battle.playerPosition.x,
    y: battle.playerPosition.y - 95,
  }
  battle.enemies = [{
    enemyInstanceId: "test.front-noise",
    enemyId: "enemy_standard",
    spawnId: "test.front-noise",
    patternSeed: "test.front-noise",
    spawnPosition: enemyPosition,
    position: enemyPosition,
    hp: 200,
    maxHp: 200,
    enteredAtMs: battle.elapsedMs,
    patternLastFiredAtMs: {},
    burnDamagePerSec: 0,
    burnUntilMs: 0,
    radius: 14,
    overrides: { speed: 0 },
  }]

  const meleeFrame = session.stepBattle({
    dtMs: 34,
    move: { x: 0, y: 0 },
    fireMain: true,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })

  assert.ok(
    meleeFrame.events.some((event) => event.type === "playerMainMeleeUsed"),
  )
})

test("visual-only enemy bullets stay non-colliding across runtime clears", async () => {
  const {
    applyBattleEffectRequests,
    fireEnemyPatterns,
    loadContentBundle,
    resolveBattleCollisions,
  } = await bundleBackendPhase2()
  const content = loadContentBundle()
  const playerPosition = { x: 240, y: 456 }
  const battle = {
    elapsedMs: 0,
    projectiles: [],
    enemies: [],
    supportFields: [],
    playerPosition,
    noiseState: { invincibleUntilMs: 0, noiseLevel: 0 },
    barrier: {
      barrierId: "test_barrier",
      radius: 999,
      remainingMs: 1000,
      maxMs: 1000,
      moveSpeedMultiplier: 1,
      allowAttackDuringUse: true,
      blocksEnemyBullets: true,
    },
  }
  const enemy = {
    enemyInstanceId: "enemy_test_1",
    enemyId: "enemy_scout",
    spawnId: "enemy_test_1",
    patternSeed: "visual-only-test",
    spawnPosition: playerPosition,
    position: playerPosition,
    hp: 10,
    maxHp: 10,
    enteredAtMs: 0,
    patternLastFiredAtMs: {},
    burnDamagePerSec: 0,
    burnUntilMs: 0,
    radius: 12,
  }
  const visualOnlyPattern = {
    ...content.bulletPatterns.bp_scout_single,
    params: {
      ...content.bulletPatterns.bp_scout_single.params,
      visualOnly: true,
    },
  }

  fireEnemyPatterns({
    battle,
    enemy,
    enemyDefinition: {
      ...content.enemies.enemy_scout,
      bulletPatternIds: [visualOnlyPattern.bulletPatternId],
    },
    bulletPatterns: {
      [visualOnlyPattern.bulletPatternId]: visualOnlyPattern,
    },
    projectiles: content.projectiles,
    hitboxPresets: content.contentHitboxPresets,
    difficultyModifiers: content.difficultyModifiers.calm,
    nextInstanceId: (prefix) => `${prefix}_1`,
  })

  assert.equal(battle.projectiles.length, 1)
  assert.equal(battle.projectiles[0].nonColliding, true)
  assert.equal(battle.projectiles[0].damage, 0)
  assert.equal(battle.projectiles[0].noiseDamage, 0)

  const collision = resolveBattleCollisions({
    battle,
    dtMs: 16,
    content,
    resolvePlayerHitRadius: () => 12,
    spawnSelfRepairPickup() {},
    nextInstanceId: (prefix) => `${prefix}_2`,
  })

  assert.equal(collision.playerNoiseDamage, 0)
  assert.deepEqual(collision.events, [])
  assert.equal(battle.projectiles.length, 1)

  applyBattleEffectRequests({
    battle,
    effectRequests: [{
      kind: "clearEnemyProjectiles",
      position: playerPosition,
      radius: 999,
    }],
    projectiles: content.projectiles,
    hitboxPresets: content.contentHitboxPresets,
    nextInstanceId: (prefix) => `${prefix}_3`,
    mainCadenceMultiplier: 1,
  })

  assert.equal(battle.projectiles.length, 1)
})

test("equipment runtime applies level overrides to active and passive effects", async () => {
  const {
    applyEquippedPassives,
    createEquipmentRuntimeBindings,
    defaultEquipmentRuntimeRegistry,
    fireEquippedMainWeapon,
    loadContentBundle,
    resolveLoadout,
    runSubsystemHooks,
    useEquippedSubWeapon,
  } = await bundleBackendPhase2()
  const content = loadContentBundle()
  const resolve = (equipped, equipmentLevels) =>
    resolveLoadout({
      equipped: {
        main: equipped.main,
        sub: equipped.sub,
        os: equipped.os,
        subsystems: [equipped.subsystem, undefined],
      },
      equipmentLevels,
      equipment: content.equipment,
      effects: content.effects,
    })
  const bindingsFor = (loadout) =>
    createEquipmentRuntimeBindings({ loadout, registry: defaultEquipmentRuntimeRegistry })

  const pulseLevel1 = resolve({ main: "eq_main_pulse" }, { eq_main_pulse: 1 })
  const pulseRequest = fireEquippedMainWeapon({
    bindings: bindingsFor(pulseLevel1),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: pulseLevel1,
      frameTimeMs: 16,
    },
  })[0]
  assert.equal(pulseRequest.damage, 9)
  assert.equal(pulseRequest.params.meleeDamage, 72)
  assert.equal(pulseRequest.params.meleeCollisionRange, 122)

  const pulseLevel3 = resolve({ main: "eq_main_pulse" }, { eq_main_pulse: 3 })
  assert.equal(pulseLevel3.main.activeEffects[0].params.damage, 11)
  assert.equal(pulseLevel3.main.activeEffects[0].params.extraSideShotCount, 2)
  assert.equal(pulseLevel3.main.activeEffects[0].params.meleeDamage, 92)

  const carrierLevel3 = resolve({ main: "eq_main_carrier" }, { eq_main_carrier: 3 })
  const carrierRequests = fireEquippedMainWeapon({
    bindings: bindingsFor(carrierLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: carrierLevel3,
      frameTimeMs: 16,
    },
  })
  const carrierRequest = carrierRequests[0]
  assert.equal(carrierRequest.damage, 48)
  assert.equal(carrierRequest.params.explosionRadius, 40)
  assert.equal(carrierRequest.params.trailExplosionIntervalMs, 190)
  assert.equal(carrierRequest.params.explosionDamageMultiplier, 1)
  assert.equal(carrierRequest.params.explosionAreaDamageMultiplier, 1)
  assert.equal(carrierRequest.params.explosionClearsEnemyProjectiles, true)
  assert.equal(
    carrierRequests.find((request) => request.kind === "applyCooldown")?.durationMs,
    750,
  )

  const cancellerLevel3 = resolve({ sub: "eq_sub_noise_canceller" }, { eq_sub_noise_canceller: 3 })
  const barrierRequest = useEquippedSubWeapon({
    bindings: bindingsFor(cancellerLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: cancellerLevel3,
      frameTimeMs: 16,
      stock: 3,
    },
  })[0]
  assert.equal(barrierRequest.radius, 48)
  assert.equal(barrierRequest.durationMs, 1600)
  assert.equal(barrierRequest.cooldownMs, 700)
  assert.equal(barrierRequest.allowAttackDuringUse, true)
  const barrierCooldownRequest = useEquippedSubWeapon({
    bindings: bindingsFor(cancellerLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: cancellerLevel3,
      frameTimeMs: 16,
      stock: 3,
    },
  }).find((request) => request.kind === "applyCooldown")
  assert.equal(barrierCooldownRequest, undefined)

  const silentWaveLevel3 = resolve({ sub: "eq_sub_silent_wave" }, { eq_sub_silent_wave: 3 })
  const silentWaveRequests = useEquippedSubWeapon({
    bindings: bindingsFor(silentWaveLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: silentWaveLevel3,
      frameTimeMs: 16,
      stock: 3,
    },
  })
  const fieldRequest = silentWaveRequests[0]
  assert.equal(fieldRequest.radius, 84)
  assert.equal(fieldRequest.dpsInField, 4)
  assert.equal(fieldRequest.blocksMagneticDisaster, true)
  assert.equal(
    silentWaveRequests.find((request) => request.kind === "applyCooldown")?.durationMs,
    3000,
  )

  const guidedLevel3 = resolve({ subsystem: "eq_subsystem_guided_wave" }, { eq_subsystem_guided_wave: 3 })
  const guidedPatch = applyEquippedPassives({
    bindings: bindingsFor(guidedLevel3),
    context: { phase: "battle", resolvedLoadout: guidedLevel3 },
  })
  assert.equal(guidedPatch.statModifiers.homingStrength, 0.82)
  assert.equal(guidedPatch.statModifiers.homingRange, 250)

  const burnLevel3 = resolve({ subsystem: "eq_subsystem_inverse_phase" }, { eq_subsystem_inverse_phase: 3 })
  const burnPatch = applyEquippedPassives({
    bindings: bindingsFor(burnLevel3),
    context: { phase: "battle", resolvedLoadout: burnLevel3 },
  })
  assert.equal(burnPatch.statModifiers.burnDamagePerSec, 6.4)
  assert.equal(burnPatch.statModifiers.burnDurationMs, 3800)
  assert.equal(burnPatch.visibilityModifiers.burnEnabled, true)

  const magnoliaLevel3 = resolve({ os: "eq_os_magnolia" }, { eq_os_magnolia: 3 })
  const magnoliaPatch = applyEquippedPassives({
    bindings: bindingsFor(magnoliaLevel3),
    context: { phase: "explore", resolvedLoadout: magnoliaLevel3 },
  })
  assert.equal(magnoliaPatch.statModifiers.exploreVisionBonus, 18)
  assert.equal(magnoliaPatch.statModifiers.exploreScanRadiusBonus, 120)
  assert.ok(Math.abs(magnoliaPatch.statModifiers.exploreScanCooldownMultiplier + 0.18) < 0.000001)
  assert.ok(Math.abs(magnoliaPatch.statModifiers.exploreSpeedMultiplier - 0.04) < 0.000001)

  const precision = resolve({ subsystem: "eq_subsystem_precision_control" }, { eq_subsystem_precision_control: 1 })
  const precisionPatch = applyEquippedPassives({
    bindings: bindingsFor(precision),
    context: { phase: "battle", resolvedLoadout: precision },
  })
  assert.equal(precisionPatch.statModifiers.focusSpeedMultiplier, 0.5)
  assert.equal(precisionPatch.visibilityModifiers.focusMovementEnabled, true)

  const analysisLevel3 = resolve({ subsystem: "eq_subsystem_analysis_circuit" }, { eq_subsystem_analysis_circuit: 3 })
  const analysisResult = runSubsystemHooks({
    bindings: bindingsFor(analysisLevel3),
    context: { hook: "onBattleStep", frameTimeMs: 16, resolvedLoadout: analysisLevel3 },
  })
  assert.equal(analysisResult.analysisDelta, 0.006)

  const noiseGateLevel3 = resolve({ subsystem: "eq_subsystem_noise_gate" }, { eq_subsystem_noise_gate: 3 })
  const noiseGateResult = runSubsystemHooks({
    bindings: bindingsFor(noiseGateLevel3),
    context: {
      hook: "onPlayerHit",
      noiseDamage: 0.5,
      worldPosition: { x: 240, y: 450 },
      resolvedLoadout: noiseGateLevel3,
    },
  })
  assert.equal(noiseGateResult.noiseDelta, -0.35)
})

test("battle pickups stay until they reach the lower screen edge", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  const battle = session.battleState
  battle.pickups = [{
    pickupInstanceId: "pickup.test",
    kind: "selfRepairPoints",
    amount: 5,
    position: { x: 24, y: 120 },
    velocity: { x: 0, y: 0 },
    radius: 10,
    remainingMs: 1,
  }]

  session.stepBattle({
    dtMs: 6000,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })
  assert.equal(battle.pickups.length, 1)

  battle.pickups[0].position.y = 545
  session.stepBattle({
    dtMs: 16,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })
  assert.equal(battle.pickups.length, 0)
})

test("battle fragments pull toward the player and restore damaged ranges when collected", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  const battle = session.battleState
  const chunk = battle.transcript[0]
  const damagedRange = {
    startMs: chunk.startMs + (chunk.endMs - chunk.startMs) * 0.2,
    endMs: chunk.startMs + (chunk.endMs - chunk.startMs) * 0.4,
  }
  battle.phase = "intro"
  battle.heardRanges = []
  battle.damageRanges = [damagedRange]
  battle.restorationRate = 0
  battle.fragments = [{
    fragmentId: "fragment.test",
    chunkId: chunk.chunkId,
    startRatio: 0.2,
    endRatio: 0.4,
    position: { x: battle.playerPosition.x + 80, y: battle.playerPosition.y },
    originPosition: { ...battle.playerPosition },
    createdAtMs: battle.elapsedMs,
    radius: 13,
    expiresAtMs: battle.elapsedMs + 5000,
    strength: 1,
  }]

  session.stepBattle({
    dtMs: 200,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })

  assert.equal(battle.fragments.length, 0)
  assert.deepEqual(battle.damageRanges, [])
  assert.ok(battle.heardRanges.some((range) => range.startMs <= damagedRange.startMs && range.endMs >= damagedRange.endMs))
  assert.ok(battle.restorationRate > 0)
})

test("player hit damages a readable transcript span before fragment recovery", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
  const battle = session.battleState
  const transcriptEndMs = battle.transcript.at(-1).endMs
  battle.elapsedMs = battle.mission.audioStartDelayMs + 5000
  battle.audioPlaybackMs = 5000
  battle.phase = "playing"
  battle.heardRanges = [{ startMs: 0, endMs: transcriptEndMs }]
  battle.damageRanges = []
  battle.restorationRate = 1
  battle.projectiles = [{
    projectileInstanceId: "projectile.hit.test",
    projectileId: "proj_enemy_basic",
    side: "enemy",
    position: { ...battle.playerPosition },
    velocity: { x: 0, y: 0 },
    radius: 12,
    remainingMs: 1000,
    spawnDelayMs: 0,
    damage: 0,
    noiseDamage: 0.08,
  }]

  session.stepBattle({
    dtMs: 16,
    move: { x: 0, y: 0 },
    fireMain: false,
    fireSub: false,
    focus: false,
    pausePressed: false,
  })

  const damagedRange = battle.damageRanges[0]
  const renderState = session.getBattleRenderState()
  assert.ok(damagedRange.endMs - damagedRange.startMs >= 1000)
  assert.ok(battle.restorationRate < 0.99)
  assert.ok(renderState.activeSubtitle.damagedSpans.length > 0)
})

function createDifficultySpawnBattle(mission) {
  return {
    mission,
    spawnedWaveIds: new Set(),
    elapsedMs: mission.durationMs,
    enemies: [],
    wavePerformance: {},
  }
}

function sumExpectedEnemies(battle) {
  return Object.values(battle.wavePerformance).reduce(
    (total, wave) => total + wave.expectedEnemyCount,
    0,
  )
}

function createDifficultyPatternBattle() {
  return {
    elapsedMs: 0,
    projectiles: [],
  }
}

function createDifficultyPatternEnemy() {
  return {
    enemyInstanceId: "enemy.difficulty.pattern",
    enemyId: "enemy_standard",
    spawnId: "enemy.difficulty.pattern",
    patternSeed: "difficulty-pattern",
    spawnPosition: { x: 240, y: 120 },
    position: { x: 240, y: 120 },
    hp: 56,
    maxHp: 56,
    enteredAtMs: 0,
    patternLastFiredAtMs: {},
    burnDamagePerSec: 0,
    burnUntilMs: 0,
    radius: 12,
  }
}

function readProjectileSpeed(projectile) {
  return Math.hypot(projectile.velocity.x, projectile.velocity.y)
}

function createRuntimeProjectile(projectileInstanceId, side, position, velocity, radius) {
  return {
    projectileInstanceId,
    projectileId: side === "enemy" ? "proj_enemy_basic" : "proj_player_pulse",
    side,
    position,
    velocity,
    radius,
    remainingMs: 1000,
    spawnDelayMs: 0,
    damage: 0,
    noiseDamage: 0.08,
  }
}

function activateSubtitleAfterPrecedingWaves(input) {
  const target = selectSubtitleWaveWindow(input)
  const destroyedEnemyCount = input.destroyedEnemyCount === "all-but-one"
    ? target.expectedEnemyCount - 1
    : input.destroyedEnemyCount
  const chunkDurationMs = target.chunk.endMs - target.chunk.startMs
  input.battle.phase = "playing"
  input.battle.audioPlaybackMs = target.chunk.startMs + Math.max(1, Math.floor(chunkDurationMs * input.progress))
  input.battle.elapsedMs = input.battle.mission.audioStartDelayMs + input.battle.audioPlaybackMs
  input.battle.heardRanges = [{ startMs: 0, endMs: input.battle.transcript.at(-1).endMs }]
  input.battle.damageRanges = []
  input.battle.restorationRate = 1
  input.battle.wavePerformance = buildWavePerformance(target.waves, destroyedEnemyCount)
  return target
}

function selectSubtitleWaveWindow(input) {
  const requestedChunkId = input.chunkId
  for (let index = 1; index < input.battle.transcript.length; index += 1) {
    const chunk = input.battle.transcript[index]
    if (requestedChunkId && chunk.chunkId !== requestedChunkId) {
      continue
    }
    const previousChunk = input.battle.transcript[index - 1]
    const previousStartMs = input.battle.mission.audioStartDelayMs + previousChunk.startMs
    const currentStartMs = input.battle.mission.audioStartDelayMs + chunk.startMs
    const waves = input.battle.mission.waves.filter(
      (wave) => wave.atMs >= previousStartMs && wave.atMs < currentStartMs,
    )
    const expectedEnemyCount = waves.reduce((total, wave) => total + wave.entries.length, 0)
    if (expectedEnemyCount >= (input.minExpectedEnemyCount ?? 1)) {
      return { chunk, waves, expectedEnemyCount }
    }
  }

  throw new Error(`No subtitle wave window found for ${input.battle.mission.missionId}`)
}

function buildWavePerformance(waves, destroyedEnemyCount) {
  const performance = {}
  let remainingDestroyed = destroyedEnemyCount
  for (const wave of waves) {
    const destroyedEntries = wave.entries.slice(0, Math.max(0, remainingDestroyed))
    remainingDestroyed -= destroyedEntries.length
    performance[wave.waveId] = {
      waveId: wave.waveId,
      atMs: wave.atMs,
      expectedEnemyCount: wave.entries.length,
      destroyedSpawnIds: new Set(destroyedEntries.map((entry) => entry.spawnId)),
    }
  }
  return performance
}

async function bundleBackendPhase2() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-backend-phase2-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "backend-phase2.mjs")
  writeFileSync(entry, [
    "import { MagnoliaGameSession } from './packages/game-session/src/game-session.ts'",
    "import { applyBattleEffectRequests, BATTLE_ENEMY_PROJECTILE_BUDGET, updateBattleProjectiles } from './packages/game-session/src/battle-effects.ts'",
    "import { applyMagneticDisasterEffects } from './packages/game-session/src/battle/hazard-interaction-system.ts'",
    "import { resolveBattleCollisions } from './packages/game-session/src/battle/collision-system.ts'",
    "import { fireEnemyPatterns } from './packages/game-session/src/battle/enemy-pattern-system.ts'",
    "import { spawnMissionEnemies } from './packages/game-session/src/battle/spawn-system.ts'",
    "import { resolveBattlefieldHazardSpecsForDifficulty } from './packages/game-session/src/hazards.ts'",
    "import { selectEquipmentHint } from './packages/game-session/src/selectors.ts'",
    "import { loadContentBundle } from './packages/persistence/src/load-content-bundle.ts'",
    "import { applyEquippedPassives, createEquipmentRuntimeBindings, defaultEquipmentRuntimeRegistry, fireEquippedMainWeapon, resolveLoadout, runSubsystemHooks, useEquippedSubWeapon } from './packages/game-session/src/equipment-runtime.ts'",
    "import { normalizePersistedAggregate, normalizePersistedSettings } from './packages/persistence/src/save-normalizer.ts'",
    "import { createDefaultSaveSlots, createDefaultSettings } from './packages/persistence/src/defaults.ts'",
    "export { applyBattleEffectRequests, applyEquippedPassives, applyMagneticDisasterEffects, BATTLE_ENEMY_PROJECTILE_BUDGET, createEquipmentRuntimeBindings, defaultEquipmentRuntimeRegistry, fireEnemyPatterns, fireEquippedMainWeapon, loadContentBundle, normalizePersistedAggregate, resolveBattleCollisions, resolveBattlefieldHazardSpecsForDifficulty, resolveLoadout, runSubsystemHooks, selectEquipmentHint, spawnMissionEnemies, updateBattleProjectiles, useEquippedSubWeapon }",
    "export async function createSession() {",
    "  const repository = createMemoryRepository()",
    "  const session = new MagnoliaGameSession({ content: loadContentBundle(), repository })",
    "  await session.initialize()",
    "  return session",
    "}",
    "function createMemoryRepository() {",
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
    "      const aggregate = JSON.parse(serialized)",
    "      await this.saveProfileToSlot(slotId, aggregate)",
    "      return this.loadProfileBySlot(slotId).then((profile) => profile.profile.profileId)",
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

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
  assert.equal(profile.selfRepairPoints, pointsBeforeCollect + 16)
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
        request.beatId === "gm_main_confirmation" &&
        request.transcriptChunkIds.includes("chunk_gm_003a"),
    ),
  )
})

test("battle render state exposes transmission audio sync state", async () => {
  const { createSession } = await bundleBackendPhase2()
  const session = await createSession()
  await session.dispatch({ type: "startNewGameAtSlot", slotId: 1, difficulty: "calm" })
  await session.dispatch({ type: "startMission", missionId: "mission_good_morning" })
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
  const carrierRequest = fireEquippedMainWeapon({
    bindings: bindingsFor(carrierLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: carrierLevel3,
      frameTimeMs: 16,
    },
  })[0]
  assert.equal(carrierRequest.damage, 48)
  assert.equal(carrierRequest.params.explosionDamageMultiplier, 1)
  assert.equal(carrierRequest.params.explosionAreaDamageMultiplier, 1)
  assert.equal(carrierRequest.params.explosionClearsEnemyProjectiles, true)

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
  assert.equal(barrierRequest.durationMs, 1400)
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
  assert.ok(barrierCooldownRequest)
  assert.equal(barrierCooldownRequest.durationMs, 1500)

  const silentWaveLevel3 = resolve({ sub: "eq_sub_silent_wave" }, { eq_sub_silent_wave: 3 })
  const fieldRequest = useEquippedSubWeapon({
    bindings: bindingsFor(silentWaveLevel3),
    context: {
      playerPosition: { x: 240, y: 450 },
      facing: { x: 0, y: -1 },
      resolvedLoadout: silentWaveLevel3,
      frameTimeMs: 16,
      stock: 3,
    },
  })[0]
  assert.equal(fieldRequest.radius, 84)
  assert.equal(fieldRequest.dpsInField, 4)
  assert.equal(fieldRequest.blocksMagneticDisaster, true)

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
  assert.equal(burnPatch.statModifiers.burnDamagePerSec, 3.2)
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

async function bundleBackendPhase2() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "magnolia-backend-phase2-"))
  const entry = path.join(tempDir, "entry.ts")
  const outfile = path.join(tempDir, "backend-phase2.mjs")
  writeFileSync(entry, [
    "import { MagnoliaGameSession } from './packages/game-session/src/game-session.ts'",
    "import { applyBattleEffectRequests } from './packages/game-session/src/battle-effects.ts'",
    "import { resolveBattleCollisions } from './packages/game-session/src/battle/collision-system.ts'",
    "import { fireEnemyPatterns } from './packages/game-session/src/battle/enemy-pattern-system.ts'",
    "import { loadContentBundle } from './packages/persistence/src/load-content-bundle.ts'",
    "import { applyEquippedPassives, createEquipmentRuntimeBindings, defaultEquipmentRuntimeRegistry, fireEquippedMainWeapon, resolveLoadout, runSubsystemHooks, useEquippedSubWeapon } from './packages/game-session/src/equipment-runtime.ts'",
    "import { normalizePersistedAggregate, normalizePersistedSettings } from './packages/persistence/src/save-normalizer.ts'",
    "import { createDefaultSaveSlots, createDefaultSettings } from './packages/persistence/src/defaults.ts'",
    "export { applyBattleEffectRequests, applyEquippedPassives, createEquipmentRuntimeBindings, defaultEquipmentRuntimeRegistry, fireEnemyPatterns, fireEquippedMainWeapon, loadContentBundle, normalizePersistedAggregate, resolveBattleCollisions, resolveLoadout, runSubsystemHooks, useEquippedSubWeapon }",
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

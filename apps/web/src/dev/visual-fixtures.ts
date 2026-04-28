import type { ProjectileVisualRole, VisualProfileId } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"

export type VisualFixtureScreen = "title" | "explore" | "map" | "battle" | "menu" | "archive"

export type VisualFixture = {
  id: string
  screen: VisualFixtureScreen
  description: string
  seed: string
  reduceFlashing: boolean
  lowFrameRateMode: boolean
}

type BattleProjectileRoleFixture = {
  visualRole: ProjectileVisualRole
  projectileId: string
  expectedRendererKey: string
}

type FixedBattleRenderStateFixture = {
  id: string
  description: string
  capturedAtMs: number
  renderState: BattleRenderState
}

type CreateBattleRenderStateFixtureInput = {
  missionId?: string
  visualProfileId?: VisualProfileId
  elapsedMs?: number
  includeAllEnemyRoles?: boolean
}

export const VISUAL_FIXTURES: VisualFixture[] = [
  {
    id: "title.seeded-backdrop",
    screen: "title",
    description: "Title backdrop, logo desync, and reduced flashing comparison.",
    seed: "fixture:title:seeded-backdrop",
    reduceFlashing: false,
    lowFrameRateMode: false,
  },
  {
    id: "explore.reboot-settle",
    screen: "explore",
    description: "Blackout, ship-only bridge, world restore, vision circle, and trail state.",
    seed: "fixture:explore:reboot-settle",
    reduceFlashing: false,
    lowFrameRateMode: false,
  },
  {
    id: "battle.roles",
    screen: "battle",
    description: "Mission visual profile and projectile visualRole renderer selection.",
    seed: "fixture:battle:roles",
    reduceFlashing: false,
    lowFrameRateMode: false,
  },
  {
    id: "map.signal-cartography",
    screen: "map",
    description: "Map canvas markers, selected area panel, archive link, and fog overlay.",
    seed: "fixture:map:signal-cartography",
    reduceFlashing: false,
    lowFrameRateMode: false,
  },
  {
    id: "menu.archive-damaged-text",
    screen: "archive",
    description: "Archive damaged transcript through text SignalDistortion.",
    seed: "fixture:archive:damaged-text",
    reduceFlashing: true,
    lowFrameRateMode: false,
  },
  {
    id: "mode.transition-veil",
    screen: "menu",
    description: "ScreenVeilTransition between 2d exploration and battle.",
    seed: "fixture:mode:transition-veil",
    reduceFlashing: true,
    lowFrameRateMode: true,
  },
]

const BATTLE_PROJECTILE_ROLE_FIXTURES: BattleProjectileRoleFixture[] = [
  { visualRole: "enemyNoise", projectileId: "proj_enemy_basic", expectedRendererKey: "role:enemyNoise" },
  { visualRole: "enemyGeometry", projectileId: "proj_enemy_geo", expectedRendererKey: "role:enemyGeometry" },
  { visualRole: "enemyLance", projectileId: "proj_enemy_lance", expectedRendererKey: "role:enemyLance" },
  { visualRole: "enemyCore", projectileId: "proj_enemy_core", expectedRendererKey: "role:enemyCore" },
  { visualRole: "enemyShard", projectileId: "proj_enemy_petal", expectedRendererKey: "role:enemyShard" },
]

export const FIXED_VISUAL_TIMESTAMPS_MS = {
  titleIdle: 12000,
  exploreRebootSettleBlackout: 360,
  exploreRebootSettleShipOnly: 1280,
  exploreRebootSettleHudRestore: 2320,
  battleRoleFrame: 18400,
  archiveDamagedText: 9000,
  modeTransitionVeil: 420,
} as const

const ROLE_FIXTURE_PROJECTILE_SPACING = 44

export const FIXED_BATTLE_RENDER_STATE_FIXTURES: FixedBattleRenderStateFixture[] = [
  {
    id: "battle.mission-good-morning.roles.fixed-frame",
    description: "Fixed battle frame with every active enemy visualRole visible at once.",
    capturedAtMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
    renderState: createBattleRenderStateFixture({
      missionId: "mission_good_morning",
      visualProfileId: "mission_good_morning",
      elapsedMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
      includeAllEnemyRoles: true,
    }),
  },
  {
    id: "battle.mission-where-are-you.profile.fixed-frame",
    description: "Fixed battle frame for interrupted-arc mission profile screenshot checks.",
    capturedAtMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
    renderState: createBattleRenderStateFixture({
      missionId: "mission_where_are_you",
      visualProfileId: "mission_where_are_you",
      elapsedMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
    }),
  },
  {
    id: "battle.mission-evacuation.profile.fixed-frame",
    description: "Fixed battle frame for compression-band mission profile screenshot checks.",
    capturedAtMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
    renderState: createBattleRenderStateFixture({
      missionId: "mission_evacuation",
      visualProfileId: "mission_evacuation",
      elapsedMs: FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame,
    }),
  },
]

function createBattleRenderStateFixture(
  input: CreateBattleRenderStateFixtureInput = {},
): BattleRenderState {
  const missionId = input.missionId ?? "mission_good_morning"
  const elapsedMs = input.elapsedMs ?? FIXED_VISUAL_TIMESTAMPS_MS.battleRoleFrame

  return {
    missionId,
    visualProfileId: input.visualProfileId ?? missionId,
    missionDurationMs: 60000,
    elapsedMs,
    player: {
      position: { x: 240, y: 430 },
      radius: 10,
      invincible: false,
      noiseLevel: 0.24,
      barrierRadius: 34,
      barrierState: {
        remainingMs: 2800,
        maxMs: 5000,
        active: true,
      },
      subCooldownMs: 1200,
      subMaxCooldownMs: 5000,
    },
    enemies: [
      {
        enemyInstanceId: "fixture_enemy_standard",
        enemyId: "enemy_standard",
        position: { x: 240, y: 86 },
        radius: 16,
        hp: 72,
        maxHp: 100,
        burning: false,
      },
      {
        enemyInstanceId: "fixture_enemy_heavy",
        enemyId: "enemy_heavy",
        position: { x: 336, y: 142 },
        radius: 22,
        hp: 160,
        maxHp: 220,
        burning: true,
      },
    ],
    projectiles: [
      ...createEnemyProjectileRoleFixtures(input.includeAllEnemyRoles ?? false),
      {
        projectileInstanceId: "fixture_player_pulse",
        projectileId: "proj_player_pulse",
        visualRole: "playerPulse",
        side: "player",
        position: { x: 240, y: 330 },
        velocity: { x: 0, y: -320 },
        radius: 4,
        progress: 0.42,
      },
      {
        projectileInstanceId: "fixture_player_pulse_melee",
        projectileId: "proj_player_pulse_melee",
        side: "player",
        position: { x: 240, y: 430 },
        velocity: { x: 0, y: -1 },
        radius: 92,
        progress: 0.46,
        meleeSweep: {
          arcDeg: 132,
        },
      },
      {
        projectileInstanceId: "fixture_player_carrier",
        projectileId: "proj_player_carrier",
        visualRole: "playerCarrier",
        side: "player",
        position: { x: 274, y: 360 },
        velocity: { x: 18, y: -260 },
        radius: 5,
        progress: 0.58,
      },
    ],
    supportFields: [
      {
        fieldInstanceId: "fixture_support_noise_canceller",
        fieldId: "eff_sub_noise_canceller",
        position: { x: 240, y: 430 },
        radius: 56,
        remainingMs: 1800,
        blocksEnemyBullets: true,
        blocksMagneticDisaster: false,
      },
    ],
    pickups: [
      {
        pickupInstanceId: "fixture_pickup_self_repair",
        kind: "selfRepairPoints",
        position: { x: 188, y: 312 },
        radius: 8,
        amount: 12,
      },
    ],
    fragments: [
      {
        fragmentId: "fixture_fragment_eject",
        chunkId: "fixture_subtitle_01",
        startRatio: 0.1,
        endRatio: 0.24,
        originX: 240,
        originY: 430,
        x: 322,
        y: 292,
        spawnedAtMs: elapsedMs - 180,
        expiresAtMs: elapsedMs + 3200,
        strength: 0.82,
      },
    ],
    hazards: [
      {
        hazardId: "fixture_hazard_magnetic_disaster",
        phase: "telegraph",
        phaseProgress: 0.62,
        position: { x: 58, y: 206 },
        size: { width: 364, height: 82 },
      },
    ],
    activeSubtitle: {
      transmissionId: "tx_good_morning",
      chunkId: "fixture_subtitle_01",
      speakerLabel: "MAGNOLIA",
      text: "Signal restored for visual fixture capture.",
      audible: true,
      noiseLevel: 0.24,
      hearingThreshold: 0.8,
      progress: 0.5,
    },
    equippedMainId: "eq_main_pulse",
    equippedSubId: "eq_sub_noise_canceller",
  }
}

function createEnemyProjectileRoleFixtures(includeAllEnemyRoles: boolean): BattleRenderState["projectiles"] {
  const fixtures = includeAllEnemyRoles
    ? BATTLE_PROJECTILE_ROLE_FIXTURES
    : BATTLE_PROJECTILE_ROLE_FIXTURES.slice(0, 3)

  // 弾の座標を固定し、role ごとの renderer 差分だけを比較できるようにします。
  return fixtures.map((fixture, index) => ({
    projectileInstanceId: `fixture_${fixture.visualRole}`,
    projectileId: fixture.projectileId,
    visualRole: fixture.visualRole,
    side: "enemy",
    position: {
      x: 124 + index * ROLE_FIXTURE_PROJECTILE_SPACING,
      y: 210 + (index % 2) * 36,
    },
    velocity: { x: index % 2 === 0 ? 24 : -24, y: 120 },
    radius: fixture.visualRole === "enemyCore" ? 8 : 6,
    progress: 0.35 + index * 0.08,
  }))
}

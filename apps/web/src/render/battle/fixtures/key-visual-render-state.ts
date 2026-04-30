import type {
  BackgroundPreset,
  ContentBundle,
  EffectSpec,
  ContentHitboxPreset,
  EnemyContentVisualPreset,
  HazardContentVisualPreset,
  ProjectileSpec,
  ProjectileContentVisualPreset,
} from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { PHI, TAU } from "../../shared/render-math"

/* 黄金角 (137.508 deg) は弾幕配置だけに使う。runtime の敵挙動には接続しない。 */
const GOLDEN_ANGLE = TAU * (1 - 1 / PHI)

const KEY_VISUAL_PRESETS = {
  background: "bg_broadcast_facility",
  playerHitbox: "hitbox_player_core",
  enemyHeavyHitbox: "hitbox_enemy_large",
  enemyStandardHitbox: "hitbox_enemy_medium",
  projectileSmallHitbox: "hitbox_bullet_small",
  projectileMediumHitbox: "hitbox_bullet_medium",
  playerPulseEffect: "eff_main_pulse",
  playerPulseProjectile: "proj_player_pulse",
  enemyHeavyVisual: "vis_enemy_heavy",
  enemyStandardVisual: "vis_enemy_standard",
  playerPulseVisual: "vis_bullet_player_pulse",
  enemyBasicVisual: "vis_bullet_enemy_basic",
  enemyGeoVisual: "vis_bullet_enemy_geo",
  hazardVisual: "hazard_magnetic_disaster_standard",
} as const

type KeyVisualProjectileKind = "playerPulse" | "enemyBasic" | "enemyGeo"

type KeyVisualPresetSet = {
  background: BackgroundPreset
  playerHitbox: ContentHitboxPreset
  enemyHeavyHitbox: ContentHitboxPreset
  enemyStandardHitbox: ContentHitboxPreset
  projectileSmallHitbox: ContentHitboxPreset
  projectileMediumHitbox: ContentHitboxPreset
  playerPulseEffect: EffectSpec
  playerPulseProjectile: ProjectileSpec
  enemyHeavyVisual: EnemyContentVisualPreset
  enemyStandardVisual: EnemyContentVisualPreset
  playerPulseVisual: ProjectileContentVisualPreset
  enemyBasicVisual: ProjectileContentVisualPreset
  enemyGeoVisual: ProjectileContentVisualPreset
  hazardVisual: HazardContentVisualPreset
}

export function buildKeyVisualRenderState(
  content: ContentBundle,
  elapsedMs: number,
  variant: "fullscreen" | "windowed" = "fullscreen",
): BattleRenderState {
  const presets = readKeyVisualPresetSet(content)
  const cx = 240
  const isW = variant === "windowed"

  // key visual は実ミッションではないため、敵や弾の domain ID ではなく fixture ID だけで構図を作る。
  const basePlayerY = isW ? 345 : 295
  const playerY = basePlayerY + Math.cos(elapsedMs * 0.0016) * 3
  const bossY = (isW ? 105 : 80) + Math.sin(elapsedMs * 0.0008) * 4
  const stdLX = isW ? 72 : 56
  const stdRX = isW ? 408 : 424
  const stdY = (isW ? 200 : 175) + Math.cos(elapsedMs * 0.0012) * 5

  const enemies: BattleRenderState["enemies"] = [
    {
      enemyInstanceId: "kv_heavy",
      enemyId: "kv_enemy_heavy",
      visualPresetId: presets.enemyHeavyVisual.presetId,
      visual: presets.enemyHeavyVisual,
      hitboxPresetId: presets.enemyHeavyHitbox.presetId,
      hitbox: presets.enemyHeavyHitbox,
      position: { x: cx, y: bossY },
      radius: 34,
      hp: 999,
      maxHp: 999,
      burning: false,
    },
    {
      enemyInstanceId: "kv_std_l",
      enemyId: "kv_enemy_standard_l",
      visualPresetId: presets.enemyStandardVisual.presetId,
      visual: presets.enemyStandardVisual,
      hitboxPresetId: presets.enemyStandardHitbox.presetId,
      hitbox: presets.enemyStandardHitbox,
      position: { x: stdLX, y: stdY },
      radius: 20,
      hp: 50,
      maxHp: 56,
      burning: false,
    },
    {
      enemyInstanceId: "kv_std_r",
      enemyId: "kv_enemy_standard_r",
      visualPresetId: presets.enemyStandardVisual.presetId,
      visual: presets.enemyStandardVisual,
      hitboxPresetId: presets.enemyStandardHitbox.presetId,
      hitbox: presets.enemyStandardHitbox,
      position: { x: stdRX, y: stdY },
      radius: 20,
      hp: 50,
      maxHp: 56,
      burning: false,
    },
  ]

  const playerProjectiles = kvPulseVolley(cx, playerY - 36, elapsedMs, presets)
  const bRot = elapsedMs * 0.0003
  const enemyProjectiles: BattleRenderState["projectiles"] = [
    ...kvGoldenSpiral(cx, bossY, 42, isW ? 82 : 95, isW ? 14 : 18, bRot * 1.2, "enemyBasic", "kv_b1", presets),
    ...kvRing(cx, bossY, isW ? 110 : 125, 3, -bRot * 2.0, "enemyGeo", "kv_b2", presets),
    ...kvGoldenSpiral(cx, bossY, isW ? 130 : 148, isW ? 200 : 240, isW ? 16 : 22, -bRot * 0.8, "enemyBasic", "kv_b3", presets),
    ...kvRing(cx, bossY, isW ? 160 : 190, 3, bRot * 1.4, "enemyBasic", "kv_b4", presets),
    ...kvRing(cx, bossY, isW ? 210 : 250, 6, bRot * 0.4, "enemyGeo", "kv_b5", presets),
    ...kvGoldenSpiral(cx, bossY, isW ? 215 : 260, isW ? 300 : 380, isW ? 10 : 14, -bRot * 0.6, "enemyBasic", "kv_b6", presets),
    ...kvGoldenSpiral(stdLX, stdY, 28, isW ? 65 : 80, isW ? 10 : 12, bRot * 0.7, "enemyBasic", "kv_sl_sp", presets),
    ...kvRing(stdLX, stdY, isW ? 48 : 58, 3, -bRot * 1.5, "enemyGeo", "kv_sl_tri", presets),
    ...kvGoldenSpiral(stdRX, stdY, 28, isW ? 65 : 80, isW ? 10 : 12, -bRot * 0.7, "enemyBasic", "kv_sr_sp", presets),
    ...kvRing(stdRX, stdY, isW ? 48 : 58, 3, bRot * 1.5, "enemyGeo", "kv_sr_tri", presets),
  ]

  return {
    missionId: "mission_key_visual_poster",
    backgroundPresetId: presets.background.presetId,
    background: presets.background,
    missionDurationMs: 120000,
    elapsedMs,
    currentChunkProtectedRatio: 1,
    noiseLevel: 0.18,
    hearingThreshold: 0.7,
    analysisRate: 0.72,
    player: {
      position: { x: cx, y: playerY },
      hitboxPresetId: presets.playerHitbox.presetId,
      hitbox: presets.playerHitbox,
      radius: 10,
      invincible: false,
      noiseLevel: 0.18,
      barrierRadius: 30,
      barrierState: { remainingMs: 2400, maxMs: 2600, active: true },
      subCooldownMs: 340,
      subMaxCooldownMs: 1000,
    },
    enemies,
    projectiles: [
      ...enemyProjectiles.filter((p) => {
        if (p.side !== "enemy") return true
        const hx0 = -16
        const hy0 = -10
        const hx1 = -16 + 480 * 0.72
        const hy1 = -10 + 115
        if (p.position.x >= hx0 && p.position.x <= hx1 && p.position.y >= hy0 && p.position.y <= hy1) return false
        const dx = p.position.x - cx
        const dy = p.position.y - playerY
        return dx * dx + dy * dy >= 34 * 34
      }),
      ...playerProjectiles,
    ],
    supportFields: [],
    pickups: [],
    fragments: [],
    hazards: [
      {
        hazardId: "hazard_key_visual_top",
        phase: "active",
        phaseProgress: 0.7 + 0.2 * Math.sin(elapsedMs * 0.0006),
        visualPresetId: presets.hazardVisual.presetId,
        visual: presets.hazardVisual,
        position: { x: -16, y: -10 },
        size: { width: 480 * 0.72, height: 115 },
      },
    ],
  }
}

function readKeyVisualPresetSet(content: ContentBundle): KeyVisualPresetSet {
  return {
    background: readBackgroundPreset(content, KEY_VISUAL_PRESETS.background),
    playerHitbox: readHitboxPreset(content, KEY_VISUAL_PRESETS.playerHitbox, "player"),
    enemyHeavyHitbox: readHitboxPreset(content, KEY_VISUAL_PRESETS.enemyHeavyHitbox, "enemy"),
    enemyStandardHitbox: readHitboxPreset(content, KEY_VISUAL_PRESETS.enemyStandardHitbox, "enemy"),
    projectileSmallHitbox: readHitboxPreset(content, KEY_VISUAL_PRESETS.projectileSmallHitbox, "projectile"),
    projectileMediumHitbox: readHitboxPreset(content, KEY_VISUAL_PRESETS.projectileMediumHitbox, "projectile"),
    playerPulseEffect: readEffectSpec(content, KEY_VISUAL_PRESETS.playerPulseEffect),
    playerPulseProjectile: readProjectileSpec(content, KEY_VISUAL_PRESETS.playerPulseProjectile),
    enemyHeavyVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.enemyHeavyVisual, "enemy"),
    enemyStandardVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.enemyStandardVisual, "enemy"),
    playerPulseVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.playerPulseVisual, "projectile"),
    enemyBasicVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.enemyBasicVisual, "projectile"),
    enemyGeoVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.enemyGeoVisual, "projectile"),
    hazardVisual: readVisualPreset(content, KEY_VISUAL_PRESETS.hazardVisual, "hazard"),
  }
}

function readBackgroundPreset(content: ContentBundle, presetId: string): BackgroundPreset {
  const preset = content.backgroundPresets[presetId]
  if (!preset) {
    throw new Error(`[key-visual-fixture] missing background preset: ${presetId}`)
  }
  return preset
}

function readEffectSpec(content: ContentBundle, effectId: string): EffectSpec {
  const effect = content.effects[effectId]
  if (!effect) {
    throw new Error(`[key-visual-fixture] missing effect: ${effectId}`)
  }
  return effect
}

function readProjectileSpec(content: ContentBundle, projectileId: string): ProjectileSpec {
  const projectile = content.projectiles[projectileId]
  if (!projectile) {
    throw new Error(`[key-visual-fixture] missing projectile: ${projectileId}`)
  }
  return projectile
}

function readHitboxPreset(
  content: ContentBundle,
  presetId: string,
  category: ContentHitboxPreset["category"],
): ContentHitboxPreset {
  const preset = content.contentHitboxPresets[presetId]
  if (!preset || preset.category !== category) {
    throw new Error(`[key-visual-fixture] missing ${category} hitbox preset: ${presetId}`)
  }
  return preset
}

function readVisualPreset(
  content: ContentBundle,
  presetId: string,
  category: "enemy",
): EnemyContentVisualPreset
function readVisualPreset(
  content: ContentBundle,
  presetId: string,
  category: "projectile",
): ProjectileContentVisualPreset
function readVisualPreset(
  content: ContentBundle,
  presetId: string,
  category: "hazard",
): HazardContentVisualPreset
function readVisualPreset(
  content: ContentBundle,
  presetId: string,
  category: "enemy" | "projectile" | "hazard",
): EnemyContentVisualPreset | ProjectileContentVisualPreset | HazardContentVisualPreset {
  const preset = content.contentVisualPresets[presetId]
  if (!preset || preset.category !== category) {
    throw new Error(`[key-visual-fixture] missing ${category} visual preset: ${presetId}`)
  }
  return preset
}

function kvPulseVolley(
  baseX: number,
  baseY: number,
  t: number,
  presets: KeyVisualPresetSet,
): BattleRenderState["projectiles"] {
  const count = Math.max(1, readEffectNumber(presets.playerPulseEffect, "shotCount", 3))
  const spreadDeg = readEffectNumber(presets.playerPulseEffect, "spreadDeg", 28)
  const speed = presets.playerPulseProjectile.speed
  const foldSideProjectiles = Boolean(presets.playerPulseEffect.params?.foldSideProjectiles)
  const travelPx = 58 + (t * 0.12) % 34
  const bendAfterPx = Math.max(
    0,
    speed * readEffectNumber(presets.playerPulseEffect, "foldBendAfterMs", 130) / 1000,
  )
  const baseDirection = { x: 0, y: -1 }
  const hitbox = presets.projectileSmallHitbox

  // key visual は実ミッションではないため状態更新は持たないが、shotCount と spread は content 正本から読む。
  return Array.from({ length: count }, (_, index) => {
    const spreadOffset =
      count === 1 ? 0 : ((index / (count - 1)) * spreadDeg - spreadDeg / 2) * (Math.PI / 180)
    const preBendDirection = rotateVector(baseDirection, spreadOffset)
    const direction =
      foldSideProjectiles && Math.abs(spreadOffset) > 0.001 ? baseDirection : preBendDirection
    const preBendTravel = Math.min(travelPx, bendAfterPx)
    const postBendTravel = Math.max(0, travelPx - bendAfterPx)
    const position = {
      x: baseX + preBendDirection.x * preBendTravel + direction.x * postBendTravel,
      y: baseY + preBendDirection.y * preBendTravel + direction.y * postBendTravel,
    }

    return {
      projectileInstanceId: `kv_ps_${index}`,
      projectileId: presets.playerPulseProjectile.projectileId,
      visualPresetId: presets.playerPulseVisual.presetId,
      visual: presets.playerPulseVisual,
      hitboxPresetId: hitbox.presetId,
      hitbox,
      side: "player" as const,
      position,
      velocity: { x: direction.x * speed, y: direction.y * speed },
      radius: hitbox.radius ?? 6,
    }
  })
}

function readEffectNumber(effect: EffectSpec, key: string, fallback: number): number {
  const value = effect.params?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function rotateVector(vector: { x: number; y: number }, radians: number): { x: number; y: number } {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  }
}

function kvGoldenSpiral(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  count: number,
  rotOffset: number,
  projectileKind: KeyVisualProjectileKind,
  prefix: string,
  presets: KeyVisualPresetSet,
): BattleRenderState["projectiles"] {
  const rRange = outerR - innerR
  return Array.from({ length: count }, (_, i) => {
    const angle = rotOffset + i * GOLDEN_ANGLE
    const r = innerR + (i / Math.max(1, count - 1)) * rRange
    return createEnemyProjectile(`${prefix}_${i}`, projectileKind, presets, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }, {
      x: Math.cos(angle) * 30,
      y: Math.sin(angle) * 30,
    })
  })
}

function kvRing(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  rotOffset: number,
  projectileKind: KeyVisualProjectileKind,
  prefix: string,
  presets: KeyVisualPresetSet,
): BattleRenderState["projectiles"] {
  return Array.from({ length: count }, (_, i) => {
    const angle = rotOffset + (TAU / count) * i
    return createEnemyProjectile(`${prefix}_${i}`, projectileKind, presets, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    }, {
      x: Math.cos(angle) * 25,
      y: Math.sin(angle) * 25,
    })
  })
}

function createEnemyProjectile(
  projectileInstanceId: string,
  projectileKind: KeyVisualProjectileKind,
  presets: KeyVisualPresetSet,
  position: { x: number; y: number },
  velocity: { x: number; y: number },
): BattleRenderState["projectiles"][number] {
  const visual = projectileKind === "enemyGeo" ? presets.enemyGeoVisual : presets.enemyBasicVisual
  const hitbox = projectileKind === "enemyGeo" ? presets.projectileMediumHitbox : presets.projectileSmallHitbox
  return {
    projectileInstanceId,
    projectileId: `kv_${projectileKind}`,
    visualPresetId: visual.presetId,
    visual,
    hitboxPresetId: hitbox.presetId,
    hitbox,
    side: "enemy",
    position,
    velocity,
    radius: 7,
  }
}

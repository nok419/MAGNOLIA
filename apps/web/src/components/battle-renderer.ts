import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { drawShip } from "@/app/ship-renderer"
import {
  clamp01,
  easeInOutCubic,
  easeOutCubicFinite as easeOutCubic,
  hashString,
  seededRandom,
} from "@/render/shared/canvas-math"

export const BATTLE_CANVAS_WIDTH = 480
export const BATTLE_CANVAS_HEIGHT = 520
const PHI = 1.618033988749895
const PHI_INV = 1 / PHI
const TAU = Math.PI * 2

type PlayerShipRendererInput = {
  x: number
  y: number
  invincible: boolean
  renderState: BattleRenderState
  shipVariant: ShipVariant
}

type EnemyRendererInput = {
  enemy: BattleRenderState["enemies"][number]
  timeMs: number
  renderState: BattleRenderState
}

type ProjectileRendererInput = {
  projectile: BattleRenderState["projectiles"][number]
  timeMs: number
  renderState: BattleRenderState
}

type HazardRendererInput = {
  hazard: BattleRenderState["hazards"][number]
  timeMs: number
  renderState: BattleRenderState
  reduceFlashing: boolean
}

type BattleFrameDrawInput = {
  renderState: BattleRenderState
  transparentBg?: boolean
  shipVariant: ShipVariant
  reduceFlashing?: boolean
}

// ここが見た目差し替えの入口です。装備や mission ごとの変更は registry に集約し、
// 戦闘ルール側へ個別の描画分岐を広げないようにします。
const BATTLE_PLAYER_SHIP_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: PlayerShipRendererInput) => void
> = {
  default: (ctx, input) =>
    drawDefaultPlayerShip(ctx, input.x, input.y, input.invincible, input.shipVariant, input.renderState.elapsedMs),
}

const BATTLE_ENEMY_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: EnemyRendererInput) => void
> = {
  vis_enemy_a1: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  vis_enemy_a2: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  vis_enemy_b1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.b1),
  vis_enemy_c1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.c1),
  vis_enemy_scout: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  vis_enemy_standard: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  vis_enemy_heavy: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.heavy),
  a1: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  a2: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  c1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.c1),
  b1: (ctx, input) => drawCircleBossEnemy(ctx, input.enemy, input.timeMs, ENEMY_BOSS_VISUAL_PROFILES.b1),
  enemy_scout: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a1),
  enemy_standard: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
  enemy_heavy: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.heavy),
  default: (ctx, input) => drawCircleEnemy(ctx, input.enemy, input.timeMs, ENEMY_VISUAL_PROFILES.a2),
}

const BATTLE_PLAYER_PROJECTILE_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: ProjectileRendererInput) => void
> = {
  vis_bullet_player_carrier: (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  vis_bullet_player_carrier_blast: (ctx, input) => drawCarrierBlast(ctx, input.projectile, input.timeMs),
  vis_bullet_player_melee: (ctx, input) => drawPulseMelee(ctx, input.projectile, input.timeMs),
  proj_player_carrier: (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  proj_player_carrier_blast: (ctx, input) => drawCarrierBlast(ctx, input.projectile, input.timeMs),
  proj_player_pulse_melee: (ctx, input) => drawPulseMelee(ctx, input.projectile, input.timeMs),
  default: (ctx, input) => drawDefaultPlayerProjectile(ctx, input.projectile),
}

const BATTLE_ENEMY_PROJECTILE_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: ProjectileRendererInput) => void
> = {
  vis_bullet_enemy_geo: (ctx, input) => drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs),
  vis_bullet_enemy_lance: (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  vis_bullet_enemy_core: (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  vis_bullet_enemy_petal: (ctx, input) => drawSignalShardProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_geo: (ctx, input) => drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_lance: (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_core: (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  // 廃止した花弁表現の content id は残しつつ、描画だけ非花形の信号片へ差し替えます。
  proj_enemy_petal: (ctx, input) => drawSignalShardProjectile(ctx, input.projectile, input.timeMs),
  default: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
}

const BATTLE_HAZARD_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: HazardRendererInput) => void
> = {
  hazard_magnetic_disaster_gentle: (ctx, input) =>
    drawMagneticDisasterHazard(ctx, input.hazard, input.timeMs, input.reduceFlashing),
  hazard_magnetic_disaster_standard: (ctx, input) =>
    drawMagneticDisasterHazard(ctx, input.hazard, input.timeMs, input.reduceFlashing),
  default: (ctx, input) =>
    drawMagneticDisasterHazard(ctx, input.hazard, input.timeMs, input.reduceFlashing),
}


const WIDTH = BATTLE_CANVAS_WIDTH
const HEIGHT = BATTLE_CANVAS_HEIGHT

export function drawBattleFrame(
  ctx: CanvasRenderingContext2D,
  input: BattleFrameDrawInput,
): void {
  const { renderState, transparentBg, shipVariant } = input
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (!transparentBg) {
    drawBattleBackground(ctx, renderState.elapsedMs)
  } else {
    // Key Visual 用の透過描画では、背景担当の canvas を隠さないように干渉帯だけを重ねます。
    drawTransparentAtmosphere(ctx, renderState.elapsedMs)
  }

  // 戦闘 Canvas は renderState の描画に専念し、当たり判定や字幕選択は session 側で完結させます。
  // UI 側で命中判定を持ち始めると、演出変更がルール破壊に直結するためです。
  for (const hazard of renderState.hazards) {
    drawHazard(ctx, hazard, renderState.elapsedMs, renderState, input.reduceFlashing ?? false)
  }

  for (const field of renderState.supportFields) {
    drawSupportField(ctx, field, renderState.elapsedMs)
  }

  for (const projectile of renderState.projectiles) {
    if (projectile.side === "enemy") {
      drawEnemyProjectile(ctx, projectile, renderState.elapsedMs, renderState)
    }
  }

  for (const pickup of renderState.pickups) {
    drawBattlePickup(ctx, pickup, renderState.elapsedMs)
  }

  for (const enemy of renderState.enemies) {
    drawEnemy(ctx, enemy, renderState.elapsedMs, renderState)
  }

  for (const projectile of renderState.projectiles) {
    if (projectile.side === "player") {
      drawPlayerProjectile(ctx, projectile, renderState.elapsedMs, renderState)
    }
  }

  drawBarrierGauge(ctx, renderState)
  drawPlayerShip(ctx, renderState, shipVariant)
}

function resolveBattleRenderer<T>(registry: Record<string, T>, candidates: Array<string | undefined>): T {
  for (const candidate of candidates) {
    if (candidate && registry[candidate]) {
      return registry[candidate]
    }
  }
  return registry.default
}

function buildEntityRendererKeys(visualPresetId: string, entityId: string, missionId: string) {
  // 描画 preset を第一候補にし、古い content id registry は互換用の fallback として残します。
  return [
    `mission:${missionId}:visual:${visualPresetId}`,
    visualPresetId,
    `mission:${missionId}:${entityId}`,
    entityId,
    `mission:${missionId}`,
    "default",
  ]
}

function buildShipRendererKeys(renderState: BattleRenderState) {
  return [
    renderState.equippedMainId ? `mission:${renderState.missionId}:main:${renderState.equippedMainId}` : undefined,
    renderState.equippedMainId ? `main:${renderState.equippedMainId}` : undefined,
    renderState.equippedSubId ? `mission:${renderState.missionId}:sub:${renderState.equippedSubId}` : undefined,
    renderState.equippedSubId ? `sub:${renderState.equippedSubId}` : undefined,
    `mission:${renderState.missionId}`,
    "default",
  ]
}

/* ============================================================
   BACKGROUND
   ============================================================ */
function drawBattleBackground(ctx: CanvasRenderingContext2D, t: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, "#0a0510")
  gradient.addColorStop(0.4, "#060d1a")
  gradient.addColorStop(1, "#040810")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // grid lines (1 パスにまとめて描画)
  ctx.strokeStyle = "rgba(93, 164, 209, 0.05)"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let gx = 0; gx < WIDTH; gx += 40) {
    ctx.moveTo(gx, 0)
    ctx.lineTo(gx, HEIGHT)
  }
  ctx.stroke()

  // scrolling scan lines (1 パスにまとめて描画)
  ctx.strokeStyle = "rgba(140, 195, 255, 0.06)"
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const offset = (t * 0.06 + i * 60) % (HEIGHT + 60)
    ctx.moveTo(0, offset - 30)
    ctx.lineTo(WIDTH, offset)
  }
  ctx.stroke()

  // faint particles
  ctx.fillStyle = "rgba(140, 195, 255, 0.15)"
  for (let i = 0; i < 20; i++) {
    const px = seededRandom(i * 7 + 1) * WIDTH
    const py = (seededRandom(i * 13 + 3) * HEIGHT + t * 0.02 * (1 + seededRandom(i * 5) * 0.5)) % HEIGHT
    const pr = 0.4 + seededRandom(i * 3) * 0.8
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, TAU)
    ctx.fill()
  }
}

/* ============================================================
   TRANSPARENT ATMOSPHERE — KV (Key Visual) 用の干渉帯・波紋
   SignalBackdropCanvas の上に重ねて、タイトル画面のような深みを追加。
   ============================================================ */
function drawTransparentAtmosphere(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save()

  // ── 干渉帯: 斜めに横切る薄い光の帯 (SignalBackdropCanvas と同系色) ──
  const bands = [
    { period: 14000, phase: 0, yBase: 0.25, tilt: -0.12, thickness: 50 },
    { period: 19000, phase: 5200, yBase: 0.55, tilt: 0.08, thickness: 65 },
    { period: 24000, phase: 11000, yBase: 0.78, tilt: -0.04, thickness: 40 },
  ] as const

  for (const band of bands) {
    const progress = ((t + band.phase) % band.period) / band.period
    const centerX = (-0.3 + progress * 1.6) * WIDTH
    const centerY = HEIGHT * band.yBase + Math.sin((t + band.phase) * 0.00025) * HEIGHT * 0.04

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(band.tilt)

    const bw = WIDTH * 0.8
    const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0)
    grad.addColorStop(0, "rgba(93, 164, 209, 0)")
    grad.addColorStop(0.2, "rgba(93, 164, 209, 0.012)")
    grad.addColorStop(0.5, "rgba(140, 210, 250, 0.035)")
    grad.addColorStop(0.8, "rgba(93, 164, 209, 0.012)")
    grad.addColorStop(1, "rgba(93, 164, 209, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(-bw / 2, -band.thickness / 2, bw, band.thickness)

    // 帯内の細い干渉ライン
    ctx.strokeStyle = "rgba(180, 230, 255, 0.025)"
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const ly = -band.thickness / 2 + (band.thickness / 4) * i + Math.sin(t * 0.002 + i) * 1.5
      ctx.beginPath()
      ctx.moveTo(-bw * 0.4, ly)
      ctx.lineTo(bw * 0.4, ly - 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ── 波紋: 画面端から広がる同心弧 (ソナーリング風) ──
  const rippleSources = [
    { sx: -0.05, sy: 0.35, interval: 11000, maxR: 0.55, tint: "93, 164, 209" },
    { sx: 1.08, sy: 0.62, interval: 14000, maxR: 0.48, tint: "140, 200, 240" },
  ] as const

  for (const src of rippleSources) {
    for (let ring = 0; ring < 3; ring++) {
      const progress = ((t + ring * (src.interval / 3)) % src.interval) / src.interval
      const radius = 30 + progress * WIDTH * src.maxR
      const alpha = (1 - progress) * 0.06
      ctx.strokeStyle = `rgba(${src.tint}, ${alpha.toFixed(3)})`
      ctx.lineWidth = 1.0 + (1 - progress) * 0.8
      ctx.beginPath()
      ctx.arc(
        src.sx * WIDTH, src.sy * HEIGHT, radius,
        Math.PI * (0.15 + ring * 0.1), Math.PI * (1.55 + ring * 0.1),
      )
      ctx.stroke()
    }
  }

  // ── 微粒子: 漂う光点 ──
  ctx.fillStyle = "rgba(140, 200, 255, 0.08)"
  for (let i = 0; i < 12; i++) {
    const px = seededRandom(i * 7 + 3) * WIDTH
    const py = (seededRandom(i * 13 + 1) * HEIGHT + t * 0.015 * (1 + seededRandom(i * 5) * 0.4)) % HEIGHT
    const pr = 0.5 + seededRandom(i * 3 + 2) * 0.6
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, TAU)
    ctx.fill()
  }

  ctx.restore()
}

/* ============================================================
   PLAYER SHIP — 共通レンダラ (`ship-renderer.ts`) に委譲。
   装備・mission ごとの見た目差は BATTLE_PLAYER_SHIP_RENDERERS で上書きする。
   ============================================================ */
function drawPlayerShip(
  ctx: CanvasRenderingContext2D,
  renderState: BattleRenderState,
  shipVariant: ShipVariant,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_SHIP_RENDERERS,
    buildShipRendererKeys(renderState),
  )
  renderer(ctx, {
    x: renderState.player.position.x,
    y: renderState.player.position.y,
    invincible: renderState.player.invincible,
    renderState,
    shipVariant,
  })
}

function drawDefaultPlayerShip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  invincible: boolean,
  variant: ShipVariant,
  timeMs: number,
) {
  // 戦闘中は可読性を最優先したいので、art バリアントの装飾強度は 0.55 に抑える。
  // これより高くすると弾との衝突判定を目で追いにくくなる。
  drawShip(ctx, {
    variant,
    center: { x: cx, y: cy },
    scale: 1,
    stroke: invincible ? "#fff4a7" : "#e8f4ff",
    fill: invincible ? "rgba(255, 244, 167, 0.12)" : "rgba(180, 220, 255, 0.06)",
    lineWidth: 1.5,
    glow: {
      color: invincible ? "rgba(255, 244, 167, 0.7)" : "rgba(93, 164, 209, 0.5)",
      blur: invincible ? 18 : 10,
    },
    core: {
      color: invincible ? "#fff4a7" : "#5da4d1",
      glowColor: invincible ? "rgba(255, 244, 167, 0.7)" : "rgba(93, 164, 209, 0.5)",
      glowBlur: invincible ? 18 : 10,
      radius: 2,
      pulse: 1,
    },
    timeMs,
    artDetailStrength: 0.55,
  })
}

/* ============================================================
   ENEMY — orbital structure (circle-based)
   Center: filled circle
   Orbit 1: arc (partial, rotating)
   Orbit 2: wider arc (with diamond icon)
   a1 / a2 / heavy: small enemies. c1 / b1: bosses (concentric rings).
   ============================================================ */
type CircleEnemyProfile = {
  accent: string
  glow: string
  outerOrbitScale: number   // r2 = r * outerOrbitScale (見た目の外周)
  innerOrbitScale: number   // r1 = r * innerOrbitScale
  iconSize: number
  seedOffset: number
}

type CircleBossProfile = {
  accent: string
  secondary: string
  glow: string
  outerOrbitScale: number
  innerOrbitScale: number
  iconSize: number
  iconCount: number          // 外周に並ぶダイヤアイコン数
  midOrbitScale: number      // 中間の追加リング
  seedOffset: number
}

const ENEMY_VISUAL_PROFILES: Record<string, CircleEnemyProfile> = {
  a1: {
    accent: "#ffc9a2",
    glow: "rgba(255, 178, 116, 0.7)",
    outerOrbitScale: PHI * PHI,    // 約 2.618
    innerOrbitScale: PHI,          // 約 1.618
    iconSize: 3,
    seedOffset: 11,
  },
  a2: {
    accent: "#ffd7a8",
    glow: "rgba(255, 198, 130, 0.7)",
    outerOrbitScale: PHI * PHI * 1.05,
    innerOrbitScale: PHI * 1.05,
    iconSize: 3.2,
    seedOffset: 23,
  },
  heavy: {
    accent: "#ffb16f",
    glow: "rgba(255, 151, 82, 0.78)",
    outerOrbitScale: PHI * PHI * 1.12,
    innerOrbitScale: PHI * 1.12,
    iconSize: 3.6,
    seedOffset: 37,
  },
}

const ENEMY_BOSS_VISUAL_PROFILES: Record<string, CircleBossProfile> = {
  c1: {
    accent: "#ffbc83",
    secondary: "#fff0c4",
    glow: "rgba(255, 172, 104, 0.86)",
    outerOrbitScale: 2.35,
    innerOrbitScale: 1.55,
    midOrbitScale: 1.95,
    iconSize: 3.6,
    iconCount: 3,
    seedOffset: 101,
  },
  b1: {
    accent: "#ff976f",
    secondary: "#ffe0a8",
    glow: "rgba(255, 117, 86, 0.94)",
    outerOrbitScale: 2.7,
    innerOrbitScale: 1.7,
    midOrbitScale: 2.18,
    iconSize: 4,
    iconCount: 4,
    seedOffset: 211,
  },
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_RENDERERS,
    buildEntityRendererKeys(enemy.visualPresetId, enemy.enemyId, renderState.missionId),
  )
  renderer(ctx, { enemy, timeMs: t, renderState })
}

function drawCircleEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  profile: CircleEnemyProfile,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accent
  const glowIntensity = 0.3 + hpRatio * 0.5

  const seed = hashString(enemy.enemyInstanceId) + profile.seedOffset
  const rotSpeed1 = 0.0008 + (seed % 5) * 0.0001
  const rotSpeed2 = 0.0005 + (seed % 3) * 0.00008
  const rot1 = t * rotSpeed1
  const rot2 = -t * rotSpeed2

  ctx.save()
  ctx.shadowColor = profile.glow
  ctx.shadowBlur = 6 * glowIntensity

  // orbit 2 — wide arc with gap (見た目用の外周)
  const r2 = r * profile.outerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.25 * glowIntensity
  ctx.lineWidth = 1
  const gapAngle = 25 * Math.PI / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  // diamond icon on orbit 2
  const iconAngle = rot2 + Math.PI
  const ix = x + Math.cos(iconAngle) * r2
  const iy = y + Math.sin(iconAngle) * r2
  const iconSize = profile.iconSize
  ctx.globalAlpha = 0.6 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.moveTo(ix, iy - iconSize)
  ctx.lineTo(ix + iconSize, iy)
  ctx.lineTo(ix, iy + iconSize)
  ctx.lineTo(ix - iconSize, iy)
  ctx.closePath()
  ctx.fill()

  // orbit 1 — partial arc
  const r1 = r * profile.innerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.4 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.15 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.8
  ctx.strokeStyle = baseColor
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // hp depleted indicator — inner ring fades
  if (hpRatio < 1) {
    ctx.globalAlpha = 0.3 * (1 - hpRatio)
    ctx.strokeStyle = "#ff5a6e"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

function drawCircleBossEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: BattleRenderState["enemies"][number],
  t: number,
  profile: CircleBossProfile,
) {
  const { x, y } = enemy.position
  const r = enemy.radius
  const hpRatio = Math.max(0, enemy.hp / Math.max(1, enemy.maxHp))
  const baseColor = enemy.burning ? "#ffaf61" : profile.accent
  const glowIntensity = 0.36 + hpRatio * 0.54

  const seed = hashString(enemy.enemyInstanceId) + profile.seedOffset
  const rot1 = t * (0.0006 + (seed % 5) * 0.00008)
  const rot2 = -t * (0.00042 + (seed % 3) * 0.00006)
  const rot3 = t * 0.00028

  ctx.save()
  ctx.shadowColor = profile.glow
  ctx.shadowBlur = 11 * glowIntensity

  // outer orbit — full arc with gap, larger radius
  const r2 = r * profile.outerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.26 * glowIntensity
  ctx.lineWidth = 1.1
  const gapAngle = 22 * Math.PI / 180
  ctx.beginPath()
  ctx.arc(x, y, r2, rot2 + gapAngle, rot2 + TAU - gapAngle)
  ctx.stroke()

  // orbital diamond icons (multiple, evenly spaced)
  const iconSize = profile.iconSize
  ctx.globalAlpha = 0.7 * glowIntensity
  ctx.fillStyle = baseColor
  for (let i = 0; i < profile.iconCount; i++) {
    const a = rot2 + (TAU / profile.iconCount) * i + Math.PI / profile.iconCount
    const ix = x + Math.cos(a) * r2
    const iy = y + Math.sin(a) * r2
    ctx.beginPath()
    ctx.moveTo(ix, iy - iconSize)
    ctx.lineTo(ix + iconSize, iy)
    ctx.lineTo(ix, iy + iconSize)
    ctx.lineTo(ix - iconSize, iy)
    ctx.closePath()
    ctx.fill()
  }

  // mid orbit — counter-rotating thin ring
  const rMid = r * profile.midOrbitScale
  ctx.globalAlpha = 0.22 * glowIntensity
  ctx.strokeStyle = profile.secondary
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(x, y, rMid, rot3 + 0.4, rot3 + TAU - 0.4)
  ctx.stroke()

  // inner orbit — partial arc
  const r1 = r * profile.innerOrbitScale
  ctx.strokeStyle = baseColor
  ctx.globalAlpha = 0.45 * glowIntensity
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r1, rot1, rot1 + Math.PI * 1.2)
  ctx.stroke()

  // center body
  ctx.globalAlpha = 0.16 * glowIntensity
  ctx.fillStyle = baseColor
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.85
  ctx.strokeStyle = baseColor
  ctx.lineWidth = 1.9
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // core highlight (boss は中心が一段明るい)
  ctx.globalAlpha = 0.7
  ctx.fillStyle = profile.secondary
  ctx.beginPath()
  ctx.arc(x, y, r * 0.22, 0, TAU)
  ctx.fill()

  if (hpRatio < 1) {
    ctx.globalAlpha = 0.34 * (1 - hpRatio)
    ctx.strokeStyle = "#ff5a6e"
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, r * 0.6, 0, TAU * (1 - hpRatio))
    ctx.stroke()
  }

  ctx.restore()
}

/* ============================================================
   PLAYER PROJECTILE — Energy Lance
   ============================================================ */
function drawPlayerProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_PROJECTILE_RENDERERS,
    buildEntityRendererKeys(p.visualPresetId, p.projectileId, renderState.missionId),
  )
  if (p.inversePhaseVisual && p.projectileId !== "proj_player_pulse_melee") {
    drawInversePhaseProjectileAura(ctx, p, t)
  }
  renderer(ctx, { projectile: p, timeMs: t, renderState })
}

function drawDefaultPlayerProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
) {
  const { x, y } = p.position
  const length = p.radius * 4
  const width = p.radius * 0.7

  ctx.save()

  // Outer aura
  ctx.shadowColor = "rgba(93, 164, 209, 0.9)"
  ctx.shadowBlur = 8
  
  // fading tail
  const tailGrad = ctx.createLinearGradient(x, y - length * 0.3, x, y + length * 1.5)
  tailGrad.addColorStop(0, "rgba(230, 248, 255, 1)")
  tailGrad.addColorStop(0.3, "rgba(93, 164, 209, 0.6)")
  tailGrad.addColorStop(1, "rgba(93, 164, 209, 0)")
  ctx.fillStyle = tailGrad
  ctx.fillRect(x - width * 0.5, y, width, length * 1.5)

  // Lance Core (sharp shape)
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.moveTo(x, y - length * 0.6) // Pointy tip
  ctx.lineTo(x + width * 0.6, y)
  ctx.lineTo(x, y + length * 0.4)
  ctx.lineTo(x - width * 0.6, y)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawInversePhaseProjectileAura(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
) {
  const { x, y } = p.position
  const seed = hashString(p.projectileInstanceId)
  const glitch = Math.sin(t * 0.018 + seed) * 1.4

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.lineWidth = 0.7
  ctx.strokeStyle = "rgba(168, 220, 255, 0.26)"
  ctx.shadowColor = "rgba(90, 170, 230, 0.38)"
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.ellipse(x + glitch, y - glitch * 0.35, p.radius * 1.45, p.radius * 2.15, 0, 0, TAU)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = "rgba(40, 78, 120, 0.28)"
  for (let i = 0; i < 3; i++) {
    const yy = y + (i - 1) * p.radius * 0.72 + Math.sin(t * 0.012 + seed + i) * 1.2
    ctx.beginPath()
    ctx.moveTo(x - p.radius * (1.4 + i * 0.16), yy)
    ctx.lineTo(x + p.radius * (1.2 - i * 0.1), yy + glitch * 0.35)
    ctx.stroke()
  }
  ctx.restore()
}

function drawCarrierProjectile(
  ctx: CanvasRenderingContext2D,
  p: {
    position: { x: number; y: number }
    velocity: { x: number; y: number }
    radius: number
  },
) {
  const { x, y } = p.position
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const tailLength = p.radius * 8.5
  const halfWidth = Math.max(1.6, p.radius * 0.48)
  const tailX = x - direction.x * tailLength
  const tailY = y - direction.y * tailLength
  const normal = { x: -direction.y, y: direction.x }

  ctx.save()
  ctx.shadowColor = "rgba(120, 235, 255, 0.9)"
  ctx.shadowBlur = 14

  const beamGradient = ctx.createLinearGradient(tailX, tailY, x, y)
  beamGradient.addColorStop(0, "rgba(24, 102, 170, 0)")
  beamGradient.addColorStop(0.35, "rgba(86, 184, 255, 0.36)")
  beamGradient.addColorStop(0.78, "rgba(210, 248, 255, 0.92)")
  beamGradient.addColorStop(1, "rgba(255, 255, 255, 1)")
  ctx.fillStyle = beamGradient
  ctx.beginPath()
  ctx.moveTo(tailX + normal.x * halfWidth, tailY + normal.y * halfWidth)
  ctx.lineTo(x + normal.x * (halfWidth * 0.35), y + normal.y * (halfWidth * 0.35))
  ctx.lineTo(x - normal.x * (halfWidth * 0.35), y - normal.y * (halfWidth * 0.35))
  ctx.lineTo(tailX - normal.x * halfWidth, tailY - normal.y * halfWidth)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = "rgba(223, 248, 255, 0.92)"
  ctx.lineWidth = Math.max(1, halfWidth * 0.8)
  ctx.beginPath()
  ctx.moveTo(tailX, tailY)
  ctx.lineTo(x, y)
  ctx.stroke()

  ctx.restore()
}

function drawCarrierBlast(
  ctx: CanvasRenderingContext2D,
  p: { position: { x: number; y: number }; radius: number },
  t: number,
) {
  const { x, y } = p.position
  const pulse = 0.84 + Math.sin(t * 0.02) * 0.08

  ctx.save()
  ctx.shadowColor = "rgba(120, 235, 255, 0.8)"
  ctx.shadowBlur = 16
  ctx.strokeStyle = "rgba(188, 242, 255, 0.82)"
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x, y, p.radius * pulse, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = "rgba(120, 235, 255, 0.4)"
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(x, y, p.radius * 0.62 * pulse, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function drawPulseMelee(
  ctx: CanvasRenderingContext2D,
  p: {
    position: { x: number; y: number }
    velocity: { x: number; y: number }
    radius: number
    progress?: number
  },
  t: number,
) {
  const { x, y } = p.position
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const angle = Math.atan2(direction.y, direction.x)
  const rawProgress = clamp01(p.progress ?? 0)
  const swingPhase = clamp01((rawProgress - 0.08) / 0.74)
  const progress = easeInOutCubic(swingPhase)
  const fadeIn = clamp01(rawProgress / 0.12)
  const fadeOut = clamp01((1 - rawProgress) / 0.26)
  const alpha = Math.min(fadeIn, fadeOut)
  if (alpha <= 0.01) {
    return
  }

  const sweepSpan = 2.08
  const bladeAngle = angle - sweepSpan * 0.5 + sweepSpan * progress
  const bladeLength = p.radius * 1.28
  const bladeStart = Math.max(12, p.radius * 0.13)
  const bladeWidth = Math.max(7.4, p.radius * 0.105)
  const impactPulse = Math.sin(Math.PI * swingPhase)
  const surfacePulse = 0.9 + Math.sin(t * 0.008) * 0.06
  const grip = {
    x: x - Math.cos(bladeAngle) * Math.max(15, p.radius * 0.22),
    y: y - Math.sin(bladeAngle) * Math.max(15, p.radius * 0.22),
  }
  const blade = buildPulseMeleeBladeGeometry(
    x,
    y,
    bladeAngle,
    bladeStart,
    bladeLength,
    bladeWidth * (1 + impactPulse * 0.22),
  )

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = "rgba(93, 164, 209, 0.9)"
  ctx.shadowBlur = 17
  ctx.globalCompositeOperation = "lighter"

  // 判定は前方範囲のまま、見た目は太い一枚刃を遅く振り抜く表現へ寄せます。
  drawPulseMeleeWake(ctx, x, y, angle - sweepSpan * 0.5, bladeAngle, bladeLength, alpha, progress)
  drawPulseMeleeAfterImages(
    ctx,
    x,
    y,
    angle,
    sweepSpan,
    swingPhase,
    bladeStart,
    bladeLength,
    bladeWidth,
    alpha,
  )

  const bladeGradient = ctx.createLinearGradient(blade.start.x, blade.start.y, blade.tip.x, blade.tip.y)
  bladeGradient.addColorStop(0, "rgba(72, 166, 232, 0.1)")
  bladeGradient.addColorStop(0.28, `rgba(140, 226, 255, ${(0.64 * surfacePulse).toFixed(3)})`)
  bladeGradient.addColorStop(0.72, "rgba(238, 252, 255, 0.98)")
  bladeGradient.addColorStop(1, "rgba(255, 255, 255, 1)")
  ctx.fillStyle = bladeGradient
  tracePulseMeleeBlade(ctx, blade)
  ctx.fill()

  drawPulseMeleeGlitchTrail(ctx, x, y, bladeAngle, bladeLength, alpha, t)

  ctx.shadowBlur = 10
  ctx.strokeStyle = `rgba(246, 253, 255, ${(0.94 * alpha).toFixed(3)})`
  ctx.lineWidth = Math.max(2.6, bladeWidth * 0.42)
  ctx.beginPath()
  ctx.moveTo(grip.x, grip.y)
  ctx.quadraticCurveTo(
    x + Math.cos(bladeAngle) * p.radius * 0.42,
    y + Math.sin(bladeAngle) * p.radius * 0.42,
    blade.tip.x,
    blade.tip.y,
  )
  ctx.stroke()

  ctx.shadowBlur = 18
  ctx.fillStyle = `rgba(248, 253, 255, ${(0.74 * alpha).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(blade.tip.x, blade.tip.y, Math.max(3.4, p.radius * 0.052), 0, TAU)
  ctx.fill()

  ctx.shadowBlur = 7
  ctx.strokeStyle = `rgba(154, 226, 255, ${(0.3 * alpha).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(
    x + Math.cos(angle - sweepSpan * 0.5) * p.radius * 0.28,
    y + Math.sin(angle - sweepSpan * 0.5) * p.radius * 0.28,
  )
  ctx.lineTo(
    x + Math.cos(angle - sweepSpan * 0.5) * p.radius * 0.48,
    y + Math.sin(angle - sweepSpan * 0.5) * p.radius * 0.48,
  )
  ctx.moveTo(
    x + Math.cos(angle + sweepSpan * 0.5) * p.radius * 0.28,
    y + Math.sin(angle + sweepSpan * 0.5) * p.radius * 0.28,
  )
  ctx.lineTo(
    x + Math.cos(angle + sweepSpan * 0.5) * p.radius * 0.48,
    y + Math.sin(angle + sweepSpan * 0.5) * p.radius * 0.48,
  )
  ctx.stroke()
  ctx.restore()
}

type PulseMeleeBladeGeometry = {
  start: { x: number; y: number }
  mid: { x: number; y: number }
  tip: { x: number; y: number }
  normal: { x: number; y: number }
  width: number
  tipWidth: number
}

function buildPulseMeleeBladeGeometry(
  x: number,
  y: number,
  angle: number,
  startDistance: number,
  bladeLength: number,
  bladeWidth: number,
): PulseMeleeBladeGeometry {
  return {
    start: {
      x: x + Math.cos(angle) * startDistance,
      y: y + Math.sin(angle) * startDistance,
    },
    mid: {
      x: x + Math.cos(angle) * ((startDistance + bladeLength) * 0.58),
      y: y + Math.sin(angle) * ((startDistance + bladeLength) * 0.58),
    },
    tip: {
      x: x + Math.cos(angle) * bladeLength,
      y: y + Math.sin(angle) * bladeLength,
    },
    normal: { x: -Math.sin(angle), y: Math.cos(angle) },
    width: bladeWidth,
    tipWidth: Math.max(1.8, bladeWidth * 0.3),
  }
}

function tracePulseMeleeBlade(
  ctx: CanvasRenderingContext2D,
  blade: PulseMeleeBladeGeometry,
): void {
  const n = blade.normal
  ctx.beginPath()
  ctx.moveTo(blade.start.x + n.x * blade.width, blade.start.y + n.y * blade.width)
  ctx.quadraticCurveTo(
    blade.mid.x + n.x * blade.width * 1.08,
    blade.mid.y + n.y * blade.width * 1.08,
    blade.tip.x + n.x * blade.tipWidth,
    blade.tip.y + n.y * blade.tipWidth,
  )
  ctx.lineTo(blade.tip.x - n.x * blade.tipWidth, blade.tip.y - n.y * blade.tipWidth)
  ctx.quadraticCurveTo(
    blade.mid.x - n.x * blade.width * 0.86,
    blade.mid.y - n.y * blade.width * 0.86,
    blade.start.x - n.x * blade.width,
    blade.start.y - n.y * blade.width,
  )
  ctx.closePath()
}

function drawPulseMeleeWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  startAngle: number,
  bladeAngle: number,
  bladeLength: number,
  alpha: number,
  progress: number,
): void {
  const wakeAlpha = alpha * (0.36 + 0.22 * (1 - progress))
  for (let layer = 0; layer < 3; layer += 1) {
    const layerAlpha = wakeAlpha * (1 - layer * 0.28)
    ctx.strokeStyle = `rgba(103, 202, 255, ${layerAlpha.toFixed(3)})`
    ctx.lineWidth = 20 - layer * 5.2
    ctx.beginPath()
    ctx.arc(x, y, bladeLength * (0.78 - layer * 0.08), startAngle, bladeAngle)
    ctx.stroke()
  }
}

function drawPulseMeleeAfterImages(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseAngle: number,
  sweepSpan: number,
  swingPhase: number,
  bladeStart: number,
  bladeLength: number,
  bladeWidth: number,
  alpha: number,
): void {
  // 残像は刃そのものの過去位置を薄く残し、単なる円弧に戻らないようにします。
  for (let index = 6; index >= 1; index -= 1) {
    const ghostPhase = clamp01(swingPhase - index * 0.055)
    if (ghostPhase <= 0) {
      continue
    }
    const ghostProgress = easeInOutCubic(ghostPhase)
    const ghostAngle = baseAngle - sweepSpan * 0.5 + sweepSpan * ghostProgress
    const ghostBlade = buildPulseMeleeBladeGeometry(
      x,
      y,
      ghostAngle,
      bladeStart,
      bladeLength * (0.98 - index * 0.018),
      bladeWidth * (0.74 - index * 0.055),
    )
    const ageFade = Math.pow(1 - index / 7, 1.9)
    ctx.fillStyle = `rgba(118, 211, 255, ${(alpha * 0.18 * ageFade).toFixed(3)})`
    tracePulseMeleeBlade(ctx, ghostBlade)
    ctx.fill()
  }
}

function drawPulseMeleeGlitchTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bladeAngle: number,
  bladeLength: number,
  alpha: number,
  timeMs: number,
): void {
  const normal = { x: -Math.sin(bladeAngle), y: Math.cos(bladeAngle) }
  const forward = { x: Math.cos(bladeAngle), y: Math.sin(bladeAngle) }

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = `rgba(180, 232, 255, ${(0.12 * alpha).toFixed(3)})`
  ctx.lineWidth = 0.8
  for (let i = 0; i < 4; i++) {
    const phase = (i + 1) / 5
    const jitter = Math.sin(timeMs * 0.024 + i * 2.13) * 3.2
    const cx = x + forward.x * bladeLength * (0.34 + phase * 0.52) + normal.x * jitter
    const cy = y + forward.y * bladeLength * (0.34 + phase * 0.52) + normal.y * jitter
    ctx.beginPath()
    ctx.moveTo(cx - normal.x * 7, cy - normal.y * 7)
    ctx.lineTo(cx + normal.x * (7 + i * 1.6), cy + normal.y * (7 + i * 1.6))
    ctx.stroke()
  }
  ctx.restore()
}

/* ============================================================
   ENEMY PROJECTILE — Noise Particles / Signal Shards

   美しさは弾幕全体の幾何学的配置が担う。個々の弾はミニマルに。
   gradient を毎フレーム生成しない設計で高速描画。

   Variant 1 (basic): 同心円グロー — 丸く柔らかいノイズ粒子
   Variant 2 (geo):   回転菱形アウトライン — 鋭く幾何学的な粒子
   Variant 3 (shard): 境界が砕けたような角片 — 非花形の暖色粒子
   ============================================================ */
function drawEnemyProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_PROJECTILE_RENDERERS,
    buildEntityRendererKeys(p.visualPresetId, p.projectileId, renderState.missionId),
  )
  renderer(ctx, { projectile: p, timeMs: t, renderState })
}

function drawHazard(
  ctx: CanvasRenderingContext2D,
  hazard: BattleRenderState["hazards"][number],
  t: number,
  renderState: BattleRenderState,
  reduceFlashing: boolean,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_HAZARD_RENDERERS,
    buildEntityRendererKeys(hazard.visualPresetId, hazard.hazardId, renderState.missionId),
  )
  renderer(ctx, { hazard, timeMs: t, renderState, reduceFlashing })
}

/* ── Variant 1: ノイズ・オーブ (軌道リング + 周回粒子 + 十字スパークル) ──
   エネルギーを放射するノイズ粒子。原子/軌道モチーフ。
   gradient 不使用で高速描画を維持。                                    ── */
function drawNoiseOrbProjectile(
  ctx: CanvasRenderingContext2D,
  p: { projectileInstanceId: string; position: { x: number; y: number }; radius: number },
  t: number,
) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const hue = 28 + (seed % 11)
  const dir = seed % 2 === 0 ? 1 : -1

  const breathe = 0.88 + 0.12 * Math.sin(t * 0.004 + seed)
  const pulse = 0.8 + 0.2 * Math.sin(t * 0.01 + seed)
  const rot = t * 0.0025 * dir + seed * 0.1

  ctx.save()

  // 1. 呼吸するハロー (有機的な拡縮)
  ctx.globalAlpha = 0.07 + 0.04 * breathe
  ctx.fillStyle = `hsl(${hue}, 78%, 68%)`
  ctx.beginPath()
  ctx.arc(x, y, r * 2.0 * breathe, 0, TAU)
  ctx.fill()

  // 2. 回転する軌道アーク (生命感・エネルギー放射)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = `hsl(${hue}, 65%, 78%)`
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(x, y, r * 1.2, rot, rot + Math.PI * 1.3)
  ctx.stroke()

  // 3. 十字スパークル (放射する光の十字, 1パスで描画)
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = `hsl(${hue + 6}, 45%, 90%)`
  ctx.lineWidth = 0.5
  const crossRot = rot * 0.6
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = crossRot + (TAU / 4) * i
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    ctx.moveTo(x + ca * r * 0.25, y + sa * r * 0.25)
    ctx.lineTo(x + ca * r * 1.4, y + sa * r * 1.4)
  }
  ctx.stroke()

  // 4. コロナリング (コア外縁の薄いストローク)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = `hsl(${hue + 4}, 75%, 82%)`
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(x, y, r * 0.78, 0, TAU)
  ctx.stroke()

  // 5. コア本体
  ctx.globalAlpha = 0.5
  ctx.fillStyle = `hsl(${hue}, 82%, 76%)`
  ctx.beginPath()
  ctx.arc(x, y, r * 0.6, 0, TAU)
  ctx.fill()

  // 6. 周回する微小粒子 (3個, 電子の軌道のように, 1パスで描画)
  ctx.globalAlpha = 0.45
  ctx.fillStyle = `hsl(${hue + 3}, 70%, 84%)`
  const moteR = r * 0.07
  const moteOrbit = r * 0.5
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const ma = rot * 1.6 + (TAU / 3) * i
    const mx = x + Math.cos(ma) * moteOrbit
    const my = y + Math.sin(ma) * moteOrbit
    ctx.moveTo(mx + moteR, my)
    ctx.arc(mx, my, moteR, 0, TAU)
  }
  ctx.fill()

  // 7. 白熱する中心核 (パルス)
  ctx.globalAlpha = 0.9
  ctx.fillStyle = `hsl(${hue + 8}, 40%, 96%)`
  ctx.beginPath()
  ctx.arc(x, y, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/* ── Variant 2: ジオ・ダイアモンド (回転菱形, 幾何学的) ── */
function drawGeoDiamondProjectile(
  ctx: CanvasRenderingContext2D,
  p: { projectileInstanceId: string; position: { x: number; y: number }; radius: number },
  t: number,
) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const hue = 33 + (seed % 9)
  const rot = t * 0.003 * (seed % 2 === 0 ? 1 : -1) + seed * 0.01
  const s = r * 0.8
  const sw = s * PHI_INV   // 菱形の横幅 (黄金比)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  // 1. ソフトハロー
  ctx.globalAlpha = 0.09
  ctx.fillStyle = `hsl(${hue}, 65%, 72%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.7, 0, TAU)
  ctx.fill()

  // 2. 菱形アウトライン
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = `hsla(${hue}, 78%, 80%, 0.85)`
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(sw, 0)
  ctx.lineTo(0, s)
  ctx.lineTo(-sw, 0)
  ctx.closePath()
  ctx.stroke()

  // 3. 菱形内側フィル
  ctx.globalAlpha = 0.12
  ctx.fillStyle = `hsl(${hue}, 70%, 78%)`
  ctx.fill()

  // 4. 中心ドット
  ctx.globalAlpha = 0.85
  ctx.fillStyle = `hsl(${hue + 5}, 40%, 95%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.15, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/* ── 三角弾: 進行方向に向く軽い三角形 + 円ハロー。
   ランス系の鋭さを抑え、丸+三角の幾何学的な美しさだけ残します。      ── */
function drawEnemyLanceProjectile(
  ctx: CanvasRenderingContext2D,
  p: {
    projectileInstanceId: string
    position: { x: number; y: number }
    velocity: { x: number; y: number }
    radius: number
  },
  t: number,
) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const hue = 28 + (seed % 9)
  const direction = normalizeCanvasVector(p.velocity.x, p.velocity.y)
  const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.006 + seed)

  ctx.save()
  ctx.translate(x, y)

  // 1. ソフトハロー (円)
  ctx.globalAlpha = 0.09 + 0.04 * pulse
  ctx.fillStyle = `hsl(${hue}, 70%, 70%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.55, 0, TAU)
  ctx.fill()

  ctx.rotate(angle)

  // 2. 三角アウトライン (進行方向に向く正三角形)
  const tip = r * 1.05
  const base = r * 0.78
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = `hsla(${hue}, 78%, 82%, 0.9)`
  ctx.lineWidth = 0.95
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(0, -tip)
  ctx.lineTo(base, tip * 0.55)
  ctx.lineTo(-base, tip * 0.55)
  ctx.closePath()
  ctx.stroke()

  // 3. 三角内側フィル
  ctx.globalAlpha = 0.16
  ctx.fillStyle = `hsl(${hue}, 72%, 78%)`
  ctx.fill()

  // 4. 中心ドット
  ctx.globalAlpha = 0.92
  ctx.fillStyle = `hsl(${hue + 6}, 38%, 96%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/* ── ボス弾: 大型サイズの円バリアント。中心の三角アクセントで
   通常弾と差別化しつつ、過度な攻撃感は出さないように調整します。 ── */
function drawBossCoreProjectile(
  ctx: CanvasRenderingContext2D,
  p: { projectileInstanceId: string; position: { x: number; y: number }; radius: number },
  t: number,
) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const hue = 24 + (seed % 8)
  const rot = t * 0.0018 * (seed % 2 === 0 ? 1 : -1) + seed * 0.04
  const pulse = 0.86 + 0.14 * Math.sin(t * 0.005 + seed)
  const breathe = 0.94 + 0.06 * Math.sin(t * 0.003 + seed)

  ctx.save()
  ctx.translate(x, y)

  // 1. ソフトハロー (大きめ)
  ctx.globalAlpha = 0.1
  ctx.fillStyle = `hsl(${hue}, 68%, 72%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.05 * breathe, 0, TAU)
  ctx.fill()

  // 2. 外周リング (円アウトライン)
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = `hsla(${hue}, 76%, 82%, 0.92)`
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.18, 0, TAU)
  ctx.stroke()

  // 3. 内側リング (薄く)
  ctx.globalAlpha = 0.32
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, TAU)
  ctx.stroke()

  // 4. 中心の小三角 (回転、丸+三角の対比)
  ctx.rotate(rot)
  ctx.globalAlpha = 0.78
  ctx.strokeStyle = `hsla(${hue + 4}, 80%, 88%, 0.92)`
  ctx.lineWidth = 0.9
  const triR = r * 0.46
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const a = (TAU / 3) * i - Math.PI / 2
    const px = Math.cos(a) * triR
    const py = Math.sin(a) * triR
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()

  // 5. 中心コア
  ctx.globalAlpha = 0.95
  ctx.fillStyle = `hsl(${hue + 6}, 38%, 96%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.2 * pulse, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/* ── Variant 3: シグナル・シャード (角片の発散) ──
   以前の花形表現は廃止し、制御境界が砕けたような角片へ置き換えます。 ── */
function drawSignalShardProjectile(
  ctx: CanvasRenderingContext2D,
  p: { projectileInstanceId: string; position: { x: number; y: number }; radius: number },
  t: number,
) {
  const { x, y } = p.position
  const r = p.radius
  const seed = hashString(p.projectileInstanceId)
  const hue = 24 + (seed % 12)
  const dir = seed % 2 === 0 ? 1 : -1
  const rot = t * 0.0022 * dir + seed * 0.08
  const pulse = 0.82 + 0.18 * Math.sin(t * 0.008 + seed)
  const haloScale = 0.92 + 0.08 * Math.sin(t * 0.004 + seed)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  ctx.globalAlpha = 0.07 + 0.03 * pulse
  ctx.fillStyle = `hsl(${hue}, 74%, 68%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 2.1 * haloScale, 0, TAU)
  ctx.fill()

  for (let index = 0; index < 4; index++) {
    const angle = (TAU / 4) * index
    ctx.save()
    ctx.rotate(angle)

    ctx.globalAlpha = 0.22 + (index % 2) * 0.06
    ctx.fillStyle = `hsl(${hue + 3}, 68%, 76%)`
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.35)
    ctx.lineTo(r * 0.42, -r * 0.24)
    ctx.lineTo(0, r * 0.2)
    ctx.lineTo(-r * 0.42, -r * 0.24)
    ctx.closePath()
    ctx.fill()

    ctx.globalAlpha = 0.44
    ctx.strokeStyle = `hsl(${hue + 6}, 76%, 84%)`
    ctx.lineWidth = 0.65
    ctx.stroke()
    ctx.restore()
  }

  ctx.globalAlpha = 0.22
  ctx.strokeStyle = `hsl(${hue + 5}, 70%, 82%)`
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.92, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.86
  ctx.fillStyle = `hsl(${hue + 8}, 42%, 95%)`
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.22 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.16
  ctx.strokeStyle = `hsl(${hue + 3}, 52%, 88%)`
  ctx.lineWidth = 0.4
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (TAU / 4) * i
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)
    ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5)
  }
  ctx.stroke()

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawBattlePickup(
  ctx: CanvasRenderingContext2D,
  pickup: { position: { x: number; y: number }; radius: number; amount: number },
  t: number,
) {
  const { x, y } = pickup.position
  const r = pickup.radius
  const pulse = 0.7 + Math.sin(t * 0.008) * 0.2

  ctx.save()
  ctx.shadowColor = "rgba(93, 164, 209, 0.55)"
  ctx.shadowBlur = 12

  ctx.globalAlpha = 0.16 * pulse
  ctx.fillStyle = "#5da4d1"
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.9
  ctx.strokeStyle = "#d8f1ff"
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.65, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.65, y)
  ctx.closePath()
  ctx.stroke()

  ctx.fillStyle = "#d8f1ff"
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.fillText(`+${pickup.amount}`, x, y - r - 6)
  ctx.restore()
}

/* ============================================================
   BARRIER GAUGE — circular arc around player
   ============================================================ */
function drawBarrierGauge(ctx: CanvasRenderingContext2D, state: BattleRenderState) {
  const player = state.player
  const { x, y } = player.position
  const gaugeRadius = 28

  // barrier active -> cyan arc shrinks with remaining
  if (player.barrierState?.active && player.barrierState.maxMs > 0) {
    const ratio = Math.max(0, player.barrierState.remainingMs / player.barrierState.maxMs)
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + TAU * ratio
    const t = state.elapsedMs
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.006)

    ctx.save()

    // ── 1. 広域ブルーグロー (深い青の拡散光) ──
    ctx.shadowColor = "rgba(60, 140, 255, 0.8)"
    ctx.shadowBlur = 28 * breathe
    ctx.globalAlpha = 0.08 + 0.04 * breathe
    ctx.fillStyle = "rgba(40, 120, 255, 1)"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 14, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0

    // ── 2. シアン主アーク (残量ゲージ) ──
    ctx.globalAlpha = 1
    ctx.shadowColor = "rgba(80, 180, 255, 0.9)"
    ctx.shadowBlur = 16
    ctx.strokeStyle = "rgba(104, 220, 255, 0.9)"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    // ── 3. 背景トラック ──
    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(104, 220, 255, 0.1)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // ── 4. シールドフィル (呼吸するシアンの薄膜) ──
    const shieldAlpha = 0.06 + 0.04 * Math.sin(t * 0.008)
    ctx.fillStyle = `rgba(80, 180, 255, ${shieldAlpha})`
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius + 4, 0, TAU)
    ctx.fill()

    // ── 5. 内側ヘキサゴングリッド (エネルギーフィールドの構造) ──
    ctx.globalAlpha = 0.12 * breathe
    ctx.strokeStyle = "rgba(100, 200, 255, 0.5)"
    ctx.lineWidth = 0.4
    const hexRot = t * 0.0008
    for (let ring = 0; ring < 2; ring++) {
      const hexR = gaugeRadius * (0.45 + ring * 0.3)
      const sides = 6
      ctx.beginPath()
      for (let i = 0; i <= sides; i++) {
        const a = hexRot + (TAU / sides) * i
        const hx = x + Math.cos(a) * hexR
        const hy = y + Math.sin(a) * hexR
        if (i === 0) ctx.moveTo(hx, hy)
        else ctx.lineTo(hx, hy)
      }
      ctx.stroke()
    }

    // ── 6. パルスリング (二重展開) ──
    ctx.globalAlpha = 1
    for (let pr = 0; pr < 2; pr++) {
      const pulsePhase = ((t + pr * 600) % 1400) / 1400
      const pulseR = gaugeRadius + 4 + pulsePhase * 22
      const pulseAlpha = 0.35 * (1 - pulsePhase)
      ctx.strokeStyle = `rgba(80, 170, 255, ${pulseAlpha})`
      ctx.lineWidth = 1.2 - pulsePhase * 0.4
      ctx.beginPath()
      ctx.arc(x, y, pulseR, 0, TAU)
      ctx.stroke()
    }

    // ── 7. 軌道パーティクル (6個, 逆回転ペア) ──
    ctx.fillStyle = "rgba(140, 220, 255, 0.75)"
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const dir = i < 3 ? 1 : -1
      const speed = 0.004 + (i % 3) * 0.0008
      const orbitAngle = t * speed * dir + (TAU / 3) * (i % 3)
      const orbitR = gaugeRadius + 2 + (i < 3 ? 0 : 4)
      const px = x + Math.cos(orbitAngle) * orbitR
      const py = y + Math.sin(orbitAngle) * orbitR
      ctx.moveTo(px + 1.3, py)
      ctx.arc(px, py, 1.3, 0, TAU)
    }
    ctx.fill()

    // ── 8. アーク先端のブルースパーク ──
    if (ratio > 0.05) {
      const tipX = x + Math.cos(endAngle) * gaugeRadius
      const tipY = y + Math.sin(endAngle) * gaugeRadius
      ctx.shadowColor = "rgba(100, 200, 255, 1)"
      ctx.shadowBlur = 12
      ctx.fillStyle = "rgba(200, 240, 255, 0.9)"
      ctx.beginPath()
      ctx.arc(tipX, tipY, 2.2 * breathe, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.restore()
    return
  }

  // sub cooldown active -> dark arc with progress
  if (player.subCooldownMs > 0 && player.subMaxCooldownMs > 0) {
    const ratio = 1 - player.subCooldownMs / player.subMaxCooldownMs
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + TAU * ratio

    ctx.save()
    // track
    ctx.strokeStyle = "rgba(90, 122, 150, 0.2)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, 0, TAU)
    ctx.stroke()

    // progress
    ctx.strokeStyle = ratio > 0.95 ? "rgba(104, 220, 255, 0.7)" : "rgba(90, 122, 150, 0.5)"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
    ctx.stroke()

    if (ratio > 0.95) {
      ctx.shadowColor = "rgba(104, 220, 255, 0.5)"
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(x, y, gaugeRadius, startAngle, endAngle)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/* ============================================================
   SUPPORT FIELD
   ============================================================ */
function drawSupportField(
  ctx: CanvasRenderingContext2D,
  field: {
    fieldId: string
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  if (field.fieldId === "field.silent_wave") {
    drawSilentWaveField(ctx, field, t)
    return
  }

  const { x, y } = field.position
  const r = field.radius
  const color = field.blocksMagneticDisaster ? "#74f0ff" : "#9ce06f"

  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 8

  // outer ring
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  // inner spinning arc
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  const spin = t * 0.002
  ctx.beginPath()
  ctx.arc(x, y, r * PHI_INV, spin, spin + Math.PI * 1.2)
  ctx.stroke()

  ctx.restore()
}

function drawSilentWaveField(
  ctx: CanvasRenderingContext2D,
  field: {
    position: { x: number; y: number }
    radius: number
    blocksMagneticDisaster: boolean
  },
  t: number,
) {
  const { x, y } = field.position
  const r = field.radius
  const pulse = 0.9 + Math.sin(t * 0.003) * 0.06

  ctx.save()
  ctx.shadowColor = "rgba(116, 240, 255, 0.9)"
  ctx.shadowBlur = 18

  ctx.globalAlpha = 0.11
  ctx.fillStyle = "rgba(116, 240, 255, 1)"
  ctx.beginPath()
  ctx.arc(x, y, r * 1.08 * pulse, 0, TAU)
  ctx.fill()

  ctx.globalAlpha = 0.48
  ctx.strokeStyle = "rgba(196, 249, 255, 0.88)"
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()

  ctx.globalAlpha = 0.28
  ctx.lineWidth = 1
  const spin = t * 0.0014
  ctx.beginPath()
  ctx.arc(x, y, r * 0.58, spin, spin + Math.PI * 1.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.82, -spin * 1.2, -spin * 1.2 + Math.PI * 0.9)
  ctx.stroke()

  ctx.globalAlpha = 0.2
  ctx.strokeStyle = field.blocksMagneticDisaster
    ? "rgba(116, 240, 255, 0.62)"
    : "rgba(156, 224, 111, 0.62)"
  ctx.lineWidth = 0.9
  for (let band = 0; band < 4; band += 1) {
    const offset = ((t * 0.08 + band * r * 0.55) % (r * 2)) - r
    ctx.beginPath()
    ctx.moveTo(x - r * 0.72, y + offset)
    ctx.quadraticCurveTo(x, y + offset - 8, x + r * 0.72, y + offset)
    ctx.stroke()
  }

  ctx.restore()
}

function normalizeCanvasVector(x: number, y: number) {
  const length = Math.hypot(x, y)
  if (length <= 0.0001) {
    return { x: 0, y: -1 }
  }
  return { x: x / length, y: y / length }
}

/* ============================================================
   HAZARD — 磁気干渉ノイズゾーン
   グリッチ・色収差・不規則乱流・ストロボを重ねた不安定な表現。
   ============================================================ */
function drawMagneticDisasterHazard(
  ctx: CanvasRenderingContext2D,
  hazard: {
    hazardId: string
    visualPresetId: string
    phase: string
    phaseProgress: number
    position: { x: number; y: number }
    size: { width: number; height: number }
  },
  t: number,
  reduceFlashing: boolean,
) {
  const { x, y } = hazard.position
  const { width: w, height: h } = hazard.size
  const growth = easeOutCubic(hazard.phaseProgress)
  ctx.save()
  const isTelegraph = hazard.phase === "telegraph"
  const isFading = hazard.phase === "fading"

  if (isTelegraph) {
    /* ── 予告フェーズ: ダッシュ枠 + グリッチ予兆 ── */
    const pulse = reduceFlashing ? 0.54 + 0.1 * Math.sin(t * 0.006) : 0.45 + 0.35 * Math.sin(t * 0.016)

    ctx.fillStyle = `rgba(255, 72, 96, ${0.08 + pulse * 0.1})`
    ctx.fillRect(x, y, w, h)

    // 動くダッシュ枠
    ctx.strokeStyle = `rgba(255, 92, 114, ${0.32 + pulse * 0.38})`
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.lineDashOffset = Math.floor(t * 0.02) % 16
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])

    // グリッチ予兆 — 散発的に薄い水平バーが走る
    const gf = Math.floor(t * 0.008)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(gf + i * 37) > 0.6) {
        const gy = y + seededRandom(gf + i * 71) * h
        const gh = 1 + seededRandom(gf + i * 13) * 3
        const gxOff = (seededRandom(gf + i * 53) - 0.5) * 6
        ctx.globalAlpha = 0.15 * pulse
        ctx.fillStyle = "rgba(255, 120, 140, 0.8)"
        ctx.fillRect(x + gxOff, gy, w, gh)
      }
    }
    ctx.globalAlpha = 1
  } else {
    /* ── アクティブ / フェードフェーズ ── */
    const phaseAlpha = isFading ? 1 - growth : growth
    const turbulenceScale = reduceFlashing ? 0.08 + growth * 0.32 : 0.12 + growth * 0.88
    const glitchIntensity = phaseAlpha * turbulenceScale

    /* ── 0. 暗域フォグ: 影響範囲を示す、境界線がぼやけた暗い面 ──
       正確な矩形ではなく、各辺にグラデーションのフェザーを持たせて
       「磁気災害が空間を侵食している」雰囲気を出す。
       角はあえてカバーしないことで有機的な曖昧さを残す。 */
    const fogColor = "6, 1, 4"
    const fogAlpha = phaseAlpha * 0.22
    const fogFeather = 32

    // コア (フェザー分だけ内側のベタ塗り)
    ctx.globalAlpha = fogAlpha
    ctx.fillStyle = `rgb(${fogColor})`
    ctx.fillRect(x + fogFeather * 0.25, y + fogFeather * 0.25,
      w - fogFeather * 0.5, h - fogFeather * 0.5)

    // 右辺フェザー
    ctx.globalAlpha = 1
    const fogR = ctx.createLinearGradient(x + w - fogFeather, 0, x + w + fogFeather, 0)
    fogR.addColorStop(0, `rgba(${fogColor}, ${fogAlpha})`)
    fogR.addColorStop(1, `rgba(${fogColor}, 0)`)
    ctx.fillStyle = fogR
    ctx.fillRect(x + w - fogFeather, y + fogFeather * 0.25,
      fogFeather * 2, h - fogFeather * 0.5)

    // 下辺フェザー
    const fogB = ctx.createLinearGradient(0, y + h - fogFeather, 0, y + h + fogFeather)
    fogB.addColorStop(0, `rgba(${fogColor}, ${fogAlpha})`)
    fogB.addColorStop(1, `rgba(${fogColor}, 0)`)
    ctx.fillStyle = fogB
    ctx.fillRect(x + fogFeather * 0.25, y + h - fogFeather,
      w - fogFeather * 0.5, fogFeather * 2)

    // 左辺フェザー
    const fogL = ctx.createLinearGradient(x + fogFeather, 0, x - fogFeather, 0)
    fogL.addColorStop(0, `rgba(${fogColor}, ${fogAlpha})`)
    fogL.addColorStop(1, `rgba(${fogColor}, 0)`)
    ctx.fillStyle = fogL
    ctx.fillRect(x - fogFeather, y + fogFeather * 0.25,
      fogFeather * 2, h - fogFeather * 0.5)

    // 上辺フェザー
    const fogT = ctx.createLinearGradient(0, y + fogFeather, 0, y - fogFeather)
    fogT.addColorStop(0, `rgba(${fogColor}, ${fogAlpha})`)
    fogT.addColorStop(1, `rgba(${fogColor}, 0)`)
    ctx.fillStyle = fogT
    ctx.fillRect(x + fogFeather * 0.25, y - fogFeather,
      w - fogFeather * 0.5, fogFeather * 2)

    // 暗い下地 (既存 — コア内のみ)
    ctx.globalAlpha = 1
    ctx.fillStyle = `rgba(38, 10, 18, ${0.08 + phaseAlpha * 0.14})`
    ctx.fillRect(x, y, w, h)

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    drawMagneticStormNoise(ctx, {
      x,
      y,
      width: w,
      height: h,
      timeMs: t,
      phaseAlpha,
      glitchIntensity,
    })

    /* ── 1. グリッチ変位バー: 水平帯が不規則にズレる ── */
    const glitchFrame = Math.floor(t * 0.012)
    for (let i = 0; i < 5; i++) {
      if (seededRandom(glitchFrame * 3 + i * 41 + 7) > 0.35) {
        const barY = y + seededRandom(glitchFrame + i * 97) * h
        const barH = 1 + seededRandom(glitchFrame + i * 23) * 4 * glitchIntensity
        const shift = (seededRandom(glitchFrame + i * 59) - 0.5) * 16 * glitchIntensity
        ctx.globalAlpha = 0.12 + 0.1 * glitchIntensity
        ctx.fillStyle = "rgba(255, 85, 110, 0.7)"
        ctx.fillRect(x + shift, barY, w, barH)
      }
    }

    /* ── 1b. スクリーンティア: 画面が水平に引き裂かれる破壊的グリッチ ── */
    const tearFrame = Math.floor(t * 0.003)
    const tearActive = seededRandom(tearFrame * 13 + 71) > 0.55
    if (tearActive && glitchIntensity > 0.2) {
      const tearCount = 1 + Math.floor(seededRandom(tearFrame * 7 + 3) * 3)
      for (let i = 0; i < tearCount; i++) {
        const tearY = y + seededRandom(tearFrame + i * 89) * h
        const tearH = 2 + seededRandom(tearFrame + i * 31) * 12 * glitchIntensity
        const tearShift = (seededRandom(tearFrame + i * 47) - 0.5) * 40 * glitchIntensity
        // 引き裂かれた帯は赤い警告域の範囲内に抑え、白黒の閃きを強くしすぎない。
        ctx.globalAlpha = 0.05 + 0.08 * glitchIntensity
        ctx.fillStyle = seededRandom(tearFrame + i * 61) > 0.5
          ? "rgba(255, 190, 205, 0.8)"
          : "rgba(24, 4, 9, 0.8)"
        ctx.fillRect(x + tearShift, tearY, w, tearH)
        // ティアの境界線は警告色に寄せ、ノイズの層として見せる。
        ctx.globalAlpha = 0.18 * glitchIntensity
        ctx.fillStyle = "rgba(255, 126, 144, 0.9)"
        ctx.fillRect(x + tearShift, tearY, w, 1)
      }
    }

    /* ── 2. 色収差ストリップ: R/Cyan チャネル分離 ── */
    const chromaFrame = Math.floor(t * 0.006)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(chromaFrame + i * 131) > 0.5) {
        const cy2 = y + seededRandom(chromaFrame + i * 67) * h
        const ch = 2 + seededRandom(chromaFrame + i * 29) * 6
        const offset = (seededRandom(chromaFrame + i * 83) - 0.5) * 8 * glitchIntensity
        ctx.globalAlpha = 0.06 * glitchIntensity
        ctx.fillStyle = "rgba(255, 40, 60, 0.8)"
        ctx.fillRect(x + offset, cy2, w, ch)
        ctx.fillStyle = "rgba(60, 220, 255, 0.5)"
        ctx.fillRect(x - offset * 0.5, cy2 + 1, w, ch * 0.6)
      }
    }

    /* ── 3. 乱流グローバンド (速度・位置を不揃いに) ── */
    ctx.globalAlpha = 1
    for (let band = 0; band < 6; band += 1) {
      const bandSeed = hashString(`${hazard.position.x}:${hazard.position.y}:${band}`)
      const bandSpeed = 0.0018 + seededRandom(bandSeed) * 0.0024
      const bandProgress =
        ((t * bandSpeed) + band * 0.17 + seededRandom(bandSeed + 5) * 0.3) % 1
      const centerX = x + w * bandProgress
      const centerY =
        y +
        h * (0.12 + seededRandom(bandSeed + 3) * 0.76) +
        Math.sin(t * (0.002 + seededRandom(bandSeed + 1) * 0.003) + bandSeed) * h * 0.08
      const radiusX =
        (w * (0.06 + seededRandom(bandSeed + 7) * 0.1)) * turbulenceScale
      const radiusY =
        (h * (0.1 + seededRandom(bandSeed + 9) * 0.12)) * turbulenceScale

      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusX)
      glow.addColorStop(0, `rgba(255, 118, 138, ${0.18 + phaseAlpha * 0.16})`)
      glow.addColorStop(0.55, `rgba(255, 74, 106, ${0.1 + phaseAlpha * 0.1})`)
      glow.addColorStop(1, "rgba(255, 74, 106, 0)")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.ellipse(
        centerX, centerY, radiusX, radiusY,
        Math.sin(t * 0.0015 + band), 0, TAU,
      )
      ctx.fill()
    }

    /* ── 4. ノイズピクセル散乱: 細かい矩形が明滅 ── */
    ctx.globalAlpha = 0.2 * glitchIntensity
    ctx.fillStyle = "rgba(255, 130, 155, 0.6)"
    const pixFrame = Math.floor(t * 0.015)
    for (let i = 0; i < 12; i++) {
      if (seededRandom(pixFrame + i * 43) > 0.4) {
        const px2 = x + seededRandom(pixFrame + i * 17) * w
        const py2 = y + seededRandom(pixFrame + i * 31) * h
        const pw = 1 + seededRandom(pixFrame + i * 7) * 4
        const ph = 1 + seededRandom(pixFrame + i * 11) * 2
        ctx.fillRect(px2, py2, pw, ph)
      }
    }

    /* ── 4b. TVスタティック: 急激に切り替わる白黒ノイズの塊 ── */
    const staticBurst = Math.floor(t * 0.004)
    const burstActive = seededRandom(staticBurst * 17 + 53) > 0.6
    if (burstActive && glitchIntensity > 0.15) {
      // 不規則な矩形領域にスタティックを集中させる
      const regionX = x + seededRandom(staticBurst * 23) * w * 0.5
      const regionY = y + seededRandom(staticBurst * 31) * h * 0.4
      const regionW = w * (0.2 + seededRandom(staticBurst * 43) * 0.5)
      const regionH = h * (0.15 + seededRandom(staticBurst * 59) * 0.4)
      // 塊ごとに白黒ピクセルを高密度に撒く
      const density = 20 + Math.floor(glitchIntensity * 30)
      for (let i = 0; i < density; i++) {
        const spx = regionX + seededRandom(staticBurst * 100 + i * 7) * regionW
        const spy = regionY + seededRandom(staticBurst * 100 + i * 13) * regionH
        const spw = 1 + seededRandom(staticBurst * 100 + i * 3) * 3
        const sph = 1 + seededRandom(staticBurst * 100 + i * 17) * 2
        ctx.globalAlpha = 0.07 + seededRandom(staticBurst * 100 + i * 29) * 0.16
        ctx.fillStyle = seededRandom(staticBurst * 100 + i * 41) > 0.5
          ? "rgba(255, 190, 205, 0.85)"
          : "rgba(32, 5, 12, 0.8)"
        ctx.fillRect(spx, spy, spw, sph)
      }
    }

    /* ── 4c. 縦グリッチライン: 赤系にはない縦方向の信号断裂 ── */
    const vFrame = Math.floor(t * 0.007)
    for (let i = 0; i < 3; i++) {
      if (seededRandom(vFrame * 11 + i * 83 + 29) > 0.65) {
        const vx = x + seededRandom(vFrame + i * 67) * w
        const vw = 1 + seededRandom(vFrame + i * 23) * 3
        const vy = y + seededRandom(vFrame + i * 97) * h * 0.3
        const vh = h * (0.3 + seededRandom(vFrame + i * 41) * 0.7)
        ctx.globalAlpha = 0.06 + 0.12 * glitchIntensity
        ctx.fillStyle = seededRandom(vFrame + i * 53) > 0.3
          ? "rgba(255, 160, 178, 0.65)"
          : "rgba(24, 4, 9, 0.72)"
        ctx.fillRect(vx, vy, vw, vh)
      }
    }

    /* ── 5. スキャンライン (不均一間隔 + ジッター) ── */
    ctx.globalCompositeOperation = "lighter"
    ctx.lineWidth = 1
    for (let i = 0; i < 7; i += 1) {
      const lineSpeed = 0.07 + seededRandom(i * 19) * 0.06
      const lineGap = 14 + seededRandom(i * 23) * 12
      const sy = y + ((t * lineSpeed + i * lineGap) % (h + 18))
      const jitter = Math.sin(t * 0.01 + i * 4.7) * 4
      const lineAlpha = 0.1 + phaseAlpha * 0.16 * seededRandom(i * 37 + 1)
      ctx.strokeStyle = `rgba(255, 126, 144, ${lineAlpha})`
      ctx.beginPath()
      ctx.moveTo(x, sy + jitter)
      ctx.lineTo(x + w, sy - 10 + jitter * 0.7)
      ctx.stroke()
    }

    /* ── 5b. インターレース崩壊: 偶数/奇数ラインが分離してチラつく ── */
    const ilaceFrame = Math.floor(t * 0.006)
    if (seededRandom(ilaceFrame * 19 + 7) > 0.5 && glitchIntensity > 0.25) {
      const ilaceY = y + seededRandom(ilaceFrame * 37) * h * 0.6
      const ilaceH = 6 + seededRandom(ilaceFrame * 43) * 20
      ctx.globalAlpha = 0.08 + 0.12 * glitchIntensity
      for (let scanY = ilaceY; scanY < ilaceY + ilaceH && scanY < y + h; scanY += 2) {
        ctx.fillStyle = "#fff"
        ctx.fillRect(x, scanY, w, 1)
      }
    }

    /* ── 6. ストロボフラッシュ (稀に全面が白く閃く) ── */
    ctx.globalCompositeOperation = "source-over"
    const strobeChance = seededRandom(Math.floor(t * 0.004) * 7 + 31)
    if (strobeChance > 0.92 && phaseAlpha > 0.3) {
      ctx.globalAlpha = 0.06 * phaseAlpha
      ctx.fillStyle = "rgba(255, 200, 210, 1)"
      ctx.fillRect(x, y, w, h)
    }

    /* ── 7. ブロック破損: JPEGアーティファクト風の大きな矩形が瞬間的に出現 ── */
    const corruptFrame = Math.floor(t * 0.003)
    if (seededRandom(corruptFrame * 31 + 41) > 0.72 && glitchIntensity > 0.3) {
      const cx2 = x + seededRandom(corruptFrame * 101) * w * 0.6
      const cy2 = y + seededRandom(corruptFrame * 113) * h * 0.5
      const cw = 20 + seededRandom(corruptFrame * 47) * 50
      const ch2 = 8 + seededRandom(corruptFrame * 59) * 20
      // 黒い欠損ブロックは赤い嵐の影として薄く残す。
      ctx.globalAlpha = 0.12 + 0.12 * glitchIntensity
      ctx.fillStyle = "rgba(18, 2, 7, 0.95)"
      ctx.fillRect(cx2, cy2, cw, ch2)
      // ブロック内に赤いノイズ線
      ctx.globalAlpha = 0.22 * glitchIntensity
      ctx.fillStyle = "rgba(255, 150, 170, 0.9)"
      for (let ln = 0; ln < 3; ln++) {
        const lny = cy2 + seededRandom(corruptFrame + ln * 71) * ch2
        ctx.fillRect(cx2, lny, cw, 1)
      }
    }

    /* ── 7b. 信号消失パッチ: 一瞬だけ領域が真黒に抜ける ── */
    const dropFrame = Math.floor(t * 0.002)
    if (seededRandom(dropFrame * 43 + 17) > 0.85 && phaseAlpha > 0.4) {
      const dx = x + seededRandom(dropFrame * 67) * w * 0.4
      const dy = y + seededRandom(dropFrame * 79) * h * 0.3
      const dw = 30 + seededRandom(dropFrame * 53) * 60
      const dh = 4 + seededRandom(dropFrame * 89) * 14
      ctx.globalAlpha = 0.3 + 0.15 * phaseAlpha
      ctx.fillStyle = "#000"
      ctx.fillRect(dx, dy, dw, dh)
    }

    ctx.restore()
    drawMagneticWarningRim(ctx, {
      x,
      y,
      width: w,
      height: h,
      timeMs: t,
      phaseAlpha,
    })
  }

  ctx.restore()
}

function drawMagneticStormNoise(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    width: number
    height: number
    timeMs: number
    phaseAlpha: number
    glitchIntensity: number
  },
) {
  const { x, y, width, height, timeMs, phaseAlpha, glitchIntensity } = input
  const frame = Math.floor(timeMs * 0.018)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"

  // 粒状ノイズは矩形の一様塗りを避けるため、座標 seed で位置を固定しつつ明滅だけ動かす。
  const particleCount = Math.max(44, Math.floor((width * height) / 900))
  for (let i = 0; i < particleCount; i += 1) {
    const seed = hashString(`${Math.round(x)}:${Math.round(y)}:${i}`)
    const drift = (timeMs * (0.00005 + seededRandom(seed + 3) * 0.00008) + seededRandom(seed + 7)) % 1
    const baseX = x + ((seededRandom(seed + 11) + drift * 0.12) % 1) * width
    const baseY =
      y +
      ((seededRandom(seed + 13) +
        Math.sin(timeMs * 0.0012 + seed) * 0.025 +
        drift * 0.04) % 1) *
        height
    const radius = 0.7 + seededRandom(seed + 17) * 2.6
    const flicker = 0.38 + 0.62 * seededRandom(frame + seed * 5)
    const alpha = (0.025 + seededRandom(seed + 19) * 0.07) * phaseAlpha * flicker
    const dot = ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, radius * 5)
    dot.addColorStop(0, `rgba(255, 168, 188, ${(alpha * 1.25).toFixed(3)})`)
    dot.addColorStop(0.42, `rgba(255, 72, 106, ${(alpha * 0.68).toFixed(3)})`)
    dot.addColorStop(1, "rgba(255, 72, 106, 0)")
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(baseX, baseY, radius * 5, 0, TAU)
    ctx.fill()
  }

  // 斜めの流線で「嵐」の向きを作る。線は短く、警告域の赤を保つ。
  ctx.lineCap = "round"
  ctx.lineWidth = 0.8
  for (let i = 0; i < 18; i += 1) {
    const seed = hashString(`storm:${Math.round(x)}:${Math.round(y)}:${i}`)
    const progress = (timeMs * (0.00018 + seededRandom(seed + 1) * 0.00018) + seededRandom(seed + 2)) % 1
    const sx = x + progress * width
    const sy = y + (seededRandom(seed + 3) * 0.9 + 0.05) * height
    const sway = Math.sin(timeMs * 0.0018 + seed) * height * 0.035
    const length = 22 + seededRandom(seed + 4) * 54
    const alpha = (0.055 + seededRandom(seed + 5) * 0.08) * phaseAlpha * (0.55 + glitchIntensity * 0.45)
    const line = ctx.createLinearGradient(sx - length, sy + sway + length * 0.25, sx + length, sy + sway - length * 0.25)
    line.addColorStop(0, "rgba(255, 72, 106, 0)")
    line.addColorStop(0.5, `rgba(255, 156, 176, ${alpha.toFixed(3)})`)
    line.addColorStop(1, "rgba(255, 72, 106, 0)")
    ctx.strokeStyle = line
    ctx.beginPath()
    ctx.moveTo(sx - length, sy + sway + length * 0.25)
    ctx.quadraticCurveTo(sx, sy + sway - length * 0.08, sx + length, sy + sway - length * 0.25)
    ctx.stroke()
  }

  ctx.restore()
}

function drawMagneticWarningRim(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; width: number; height: number; timeMs: number; phaseAlpha: number },
) {
  const pulse = 0.65 + 0.35 * Math.sin(input.timeMs * 0.004)

  ctx.save()
  ctx.strokeStyle = `rgba(255, 72, 96, ${(0.2 + pulse * 0.18) * input.phaseAlpha})`
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.lineDashOffset = -(input.timeMs * 0.035)
  ctx.shadowColor = `rgba(255, 72, 96, ${(0.2 * input.phaseAlpha).toFixed(3)})`
  ctx.shadowBlur = 12
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.setLineDash([])

  ctx.strokeStyle = `rgba(255, 168, 188, ${(0.08 + pulse * 0.08) * input.phaseAlpha})`
  ctx.lineWidth = 7
  ctx.shadowBlur = 18
  ctx.strokeRect(input.x, input.y, input.width, input.height)
  ctx.restore()
}

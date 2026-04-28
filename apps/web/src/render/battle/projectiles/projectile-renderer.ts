import type { BattleRenderState } from "@magnolia/game-session"
import {
  PHI_INV,
  TAU,
  buildEntityRendererKeys,
  clamp01,
  easeInOutCubic,
  hashString,
  normalizeCanvasVector,
  resolveBattleRenderer,
} from "@/render/battle/battle-renderer-utils"

export type BattleProjectileRenderEffect = "inversePhase" | "inversePhaseAura" | "meleeSweep"

type ProjectileRendererInput = {
  projectile: BattleRenderState["projectiles"][number]
  timeMs: number
  renderState: BattleRenderState
}

const BATTLE_PLAYER_PROJECTILE_RENDERERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, input: ProjectileRendererInput) => void
> = {
  vis_bullet_player_carrier: (ctx, input) => drawCarrierProjectile(ctx, input.projectile),
  vis_bullet_player_carrier_blast: (ctx, input) => drawCarrierBlast(ctx, input.projectile, input.timeMs),
  vis_bullet_player_melee: (ctx, input) => drawPulseMelee(ctx, input.projectile, input.timeMs),
  vis_bullet_player_pulse: (ctx, input) => drawDefaultPlayerProjectile(ctx, input.projectile),
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
  vis_bullet_enemy_basic: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_geo: (ctx, input) => drawGeoDiamondProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_lance: (ctx, input) => drawEnemyLanceProjectile(ctx, input.projectile, input.timeMs),
  proj_enemy_core: (ctx, input) => drawBossCoreProjectile(ctx, input.projectile, input.timeMs),
  // 廃止した花弁表現の content id は残しつつ、描画だけ非花形の信号片へ差し替えます。
  proj_enemy_petal: (ctx, input) => drawSignalShardProjectile(ctx, input.projectile, input.timeMs),
  default: (ctx, input) => drawNoiseOrbProjectile(ctx, input.projectile, input.timeMs),
}

export function drawPlayerProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_PLAYER_PROJECTILE_RENDERERS,
    buildEntityRendererKeys({
      visualPresetId: p.visualPresetId,
      legacyEntityId: p.projectileId,
      missionId: renderState.missionId,
    }),
  )
  const renderEffects = p.renderEffects ?? (p.inversePhaseVisual ? ["inversePhase"] : [])
  if (renderEffects.includes("inversePhaseAura")) {
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
export function drawEnemyProjectile(
  ctx: CanvasRenderingContext2D,
  p: BattleRenderState["projectiles"][number],
  t: number,
  renderState: BattleRenderState,
) {
  const renderer = resolveBattleRenderer(
    BATTLE_ENEMY_PROJECTILE_RENDERERS,
    buildEntityRendererKeys({
      visualPresetId: p.visualPresetId,
      legacyEntityId: p.projectileId,
      missionId: renderState.missionId,
    }),
  )
  renderer(ctx, { projectile: p, timeMs: t, renderState })
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

export type KeyVisualVariant = "fullscreen" | "windowed"

export type KeyVisualComposition = {
  profile: "poster"
  variant: KeyVisualVariant
  elapsedMs: number
  durationMs: number
  player: KeyVisualPlayer
  enemies: KeyVisualEnemy[]
  projectiles: KeyVisualProjectile[]
  hazards: KeyVisualHazard[]
  equipment: {
    main: "pulse"
    sub: "noiseCanceller"
  }
}

type Vector2 = { x: number; y: number }

type KeyVisualPlayer = {
  position: Vector2
  radius: number
  invincible: boolean
  noiseLevel: number
  barrierRadius: number
  barrier: {
    remainingMs: number
    maxMs: number
    active: boolean
  }
  subCooldownMs: number
  subMaxCooldownMs: number
}

type KeyVisualEnemy = {
  instanceKey: string
  kind: "heavy" | "standard"
  position: Vector2
  radius: number
  hp: number
  maxHp: number
  burning: boolean
}

type KeyVisualProjectile = {
  instanceKey: string
  kind: "playerPulse" | "enemyNoise" | "enemyGeometry" | "enemyLance" | "enemyCore" | "enemyShard"
  side: "player" | "enemy"
  position: Vector2
  velocity: Vector2
  radius: number
}

type KeyVisualHazard = {
  key: string
  kind: "magneticDisaster"
  phase: "active"
  phaseProgress: number
  position: Vector2
  size: { width: number; height: number }
}

const TAU = Math.PI * 2
const GOLDEN_RATIO = 1.618033988749895
const GOLDEN_ANGLE = TAU * (1 - 1 / GOLDEN_RATIO)
const KEY_VISUAL_CENTER_X = 240

export function buildKeyVisualComposition(
  elapsedMs: number,
  variant: KeyVisualVariant = "fullscreen",
): KeyVisualComposition {
  const isWindowed = variant === "windowed"
  const player = createKeyVisualPlayer(elapsedMs, isWindowed)
  const enemies = createKeyVisualEnemies(elapsedMs, isWindowed)
  const hazards = createKeyVisualHazards(elapsedMs)
  const projectiles = applyProjectileOcclusion([
    ...createPlayerShotColumn(KEY_VISUAL_CENTER_X, player.position.y - 36, elapsedMs),
    ...createEnemyProjectilePattern(enemies, elapsedMs, isWindowed),
  ], player, hazards)

  return {
    profile: "poster",
    variant,
    elapsedMs,
    durationMs: 120000,
    player,
    enemies,
    projectiles,
    hazards,
    equipment: {
      main: "pulse",
      sub: "noiseCanceller",
    },
  }
}

function createKeyVisualPlayer(elapsedMs: number, isWindowed: boolean): KeyVisualPlayer {
  // windowed は正方形に収めるため下寄り、fullscreen はロゴ領域との重なりを避けて少し上へ置きます。
  const basePlayerY = isWindowed ? 345 : 295

  return {
    position: {
      x: KEY_VISUAL_CENTER_X,
      y: basePlayerY + Math.cos(elapsedMs * 0.0016) * 3,
    },
    radius: 10,
    invincible: false,
    noiseLevel: 0.18,
    barrierRadius: 30,
    barrier: {
      remainingMs: 2400,
      maxMs: 2600,
      active: true,
    },
    subCooldownMs: 340,
    subMaxCooldownMs: 1000,
  }
}

function createKeyVisualEnemies(elapsedMs: number, isWindowed: boolean): KeyVisualEnemy[] {
  const bossY = (isWindowed ? 105 : 80) + Math.sin(elapsedMs * 0.0008) * 4
  const standardLeftX = isWindowed ? 72 : 56
  const standardRightX = isWindowed ? 408 : 424
  const standardY = (isWindowed ? 200 : 175) + Math.cos(elapsedMs * 0.0012) * 5

  return [
    {
      instanceKey: "heavy",
      kind: "heavy",
      position: { x: KEY_VISUAL_CENTER_X, y: bossY },
      radius: 34,
      hp: 999,
      maxHp: 999,
      burning: false,
    },
    {
      instanceKey: "standard_left",
      kind: "standard",
      position: { x: standardLeftX, y: standardY },
      radius: 20,
      hp: 50,
      maxHp: 56,
      burning: false,
    },
    {
      instanceKey: "standard_right",
      kind: "standard",
      position: { x: standardRightX, y: standardY },
      radius: 20,
      hp: 50,
      maxHp: 56,
      burning: false,
    },
  ]
}

function createKeyVisualHazards(elapsedMs: number): KeyVisualHazard[] {
  return [
    {
      key: "top",
      kind: "magneticDisaster",
      phase: "active",
      phaseProgress: 0.7 + 0.2 * Math.sin(elapsedMs * 0.0006),
      position: { x: -16, y: -10 },
      size: { width: 480 * 0.72, height: 115 },
    },
  ]
}

function createEnemyProjectilePattern(
  enemies: KeyVisualEnemy[],
  elapsedMs: number,
  isWindowed: boolean,
): KeyVisualProjectile[] {
  const boss = enemies.find((enemy) => enemy.kind === "heavy")
  const standards = enemies.filter((enemy) => enemy.kind === "standard")
  if (!boss || standards.length < 2) {
    return []
  }

  // 方向指定の狙い撃ちではなく、幾何学パターンだけで poster 用の圧力を作ります。
  const rotation = elapsedMs * 0.0003
  const [leftStandard, rightStandard] = standards

  return [
    ...createGoldenSpiral(boss.position.x, boss.position.y, 42, isWindowed ? 82 : 95, isWindowed ? 14 : 18, rotation * 1.2, "enemyNoise", "boss_spiral_inner"),
    ...createRing(boss.position.x, boss.position.y, isWindowed ? 110 : 125, 3, -rotation * 2.0, "enemyGeometry", "boss_triangle_inner"),
    ...createGoldenSpiral(boss.position.x, boss.position.y, isWindowed ? 130 : 148, isWindowed ? 200 : 240, isWindowed ? 16 : 22, -rotation * 0.8, "enemyNoise", "boss_spiral_outer"),
    ...createRing(boss.position.x, boss.position.y, isWindowed ? 160 : 190, 3, rotation * 1.4, "enemyNoise", "boss_triangle_outer"),
    ...createRing(boss.position.x, boss.position.y, isWindowed ? 210 : 250, 6, rotation * 0.4, "enemyGeometry", "boss_hex_outer"),
    ...createGoldenSpiral(boss.position.x, boss.position.y, isWindowed ? 215 : 260, isWindowed ? 300 : 380, isWindowed ? 10 : 14, -rotation * 0.6, "enemyNoise", "boss_far_spiral"),
    ...createGoldenSpiral(leftStandard.position.x, leftStandard.position.y, 28, isWindowed ? 65 : 80, isWindowed ? 10 : 12, rotation * 0.7, "enemyNoise", "left_spiral"),
    ...createRing(leftStandard.position.x, leftStandard.position.y, isWindowed ? 48 : 58, 3, -rotation * 1.5, "enemyGeometry", "left_triangle"),
    ...createGoldenSpiral(rightStandard.position.x, rightStandard.position.y, 28, isWindowed ? 65 : 80, isWindowed ? 10 : 12, -rotation * 0.7, "enemyNoise", "right_spiral"),
    ...createRing(rightStandard.position.x, rightStandard.position.y, isWindowed ? 48 : 58, 3, rotation * 1.5, "enemyGeometry", "right_triangle"),
  ]
}

function createPlayerShotColumn(
  baseX: number,
  baseY: number,
  elapsedMs: number,
): KeyVisualProjectile[] {
  return Array.from({ length: 5 }, (_, index) => ({
    instanceKey: `player_pulse_${index}`,
    kind: "playerPulse",
    side: "player",
    position: { x: baseX, y: baseY - index * 42 + (elapsedMs * 0.12) % 42 },
    velocity: { x: 0, y: -400 },
    radius: 6,
  }))
}

function createGoldenSpiral(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  count: number,
  rotationOffset: number,
  kind: KeyVisualProjectile["kind"],
  prefix: string,
): KeyVisualProjectile[] {
  const radiusRange = outerRadius - innerRadius
  return Array.from({ length: count }, (_, index) => {
    const angle = rotationOffset + index * GOLDEN_ANGLE
    const radius = innerRadius + (index / Math.max(1, count - 1)) * radiusRange
    return {
      instanceKey: `${prefix}_${index}`,
      kind,
      side: "enemy",
      position: {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      },
      velocity: {
        x: Math.cos(angle) * 30,
        y: Math.sin(angle) * 30,
      },
      radius: 7,
    }
  })
}

function createRing(
  centerX: number,
  centerY: number,
  radius: number,
  count: number,
  rotationOffset: number,
  kind: KeyVisualProjectile["kind"],
  prefix: string,
): KeyVisualProjectile[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = rotationOffset + (TAU / count) * index
    return {
      instanceKey: `${prefix}_${index}`,
      kind,
      side: "enemy",
      position: {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      },
      velocity: {
        x: Math.cos(angle) * 25,
        y: Math.sin(angle) * 25,
      },
      radius: 7,
    }
  })
}

function applyProjectileOcclusion(
  projectiles: KeyVisualProjectile[],
  player: KeyVisualPlayer,
  hazards: KeyVisualHazard[],
): KeyVisualProjectile[] {
  return projectiles.filter((projectile) => {
    if (projectile.side !== "enemy") {
      return true
    }

    // poster 上の磁気災害と barrier は、runtime state ではなく composition 上の遮蔽として扱います。
    if (hazards.some((hazard) => containsPoint(hazard, projectile.position))) {
      return false
    }

    const dx = projectile.position.x - player.position.x
    const dy = projectile.position.y - player.position.y
    return dx * dx + dy * dy >= (player.barrierRadius + 4) ** 2
  })
}

function containsPoint(hazard: KeyVisualHazard, point: Vector2): boolean {
  return (
    point.x >= hazard.position.x &&
    point.x <= hazard.position.x + hazard.size.width &&
    point.y >= hazard.position.y &&
    point.y <= hazard.position.y + hazard.size.height
  )
}

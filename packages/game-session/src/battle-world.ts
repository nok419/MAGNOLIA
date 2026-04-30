import type { BulletPattern, ContentHitboxPreset, Vector2 } from "@magnolia/contracts"

export const BATTLE_WIDTH = 480
export const BATTLE_HEIGHT = 520

type PositionedCircle = {
  position: Vector2
  radius: number
}

type PatternEnemy = {
  enemyInstanceId: string
}

export function resolveSpawnPoint(spawnPointId: string): Vector2 {
  // 戦闘フィールド比率を変更しても敵配置の意味が崩れないよう、代表 spawn は画面比率で再計算します。
  const leftX = Math.round(BATTLE_WIDTH * 0.15)
  const centerX = Math.round(BATTLE_WIDTH * 0.5)
  const rightX = Math.round(BATTLE_WIDTH * 0.85)
  const midLeftX = Math.round(BATTLE_WIDTH * 0.2)
  const midRightX = Math.round(BATTLE_WIDTH * 0.8)

  switch (spawnPointId) {
    case "spawn_top_left":
      return { x: leftX, y: -24 }
    case "spawn_top_center":
      return { x: centerX, y: -24 }
    case "spawn_top_right":
      return { x: rightX, y: -24 }
    case "spawn_mid_left":
      return { x: midLeftX, y: 96 }
    case "spawn_mid_right":
      return { x: midRightX, y: 96 }
    case "spawn_side_left":
      return { x: -24, y: 80 }
    case "spawn_side_right":
      return { x: BATTLE_WIDTH + 24, y: 80 }
    default:
      return { x: centerX, y: -24 }
  }
}

export function resolveHitRadius(hitbox: ContentHitboxPreset | undefined): number {
  if (!hitbox) {
    return 8
  }
  if (hitbox.shape === "circle") {
    return readPositiveNumber(hitbox.radius, 8)
  }
  if (hitbox.shape === "ellipse") {
    return Math.max(readPositiveNumber(hitbox.radiusX, 8), readPositiveNumber(hitbox.radiusY, 8))
  }
  if (hitbox.shape === "rect") {
    const halfWidth = readPositiveNumber(hitbox.width, 16) / 2
    const halfHeight = readPositiveNumber(hitbox.height, 16) / 2
    return Math.hypot(halfWidth, halfHeight)
  }
  if (hitbox.shape === "polygon" && hitbox.points && hitbox.points.length > 0) {
    return Math.max(...hitbox.points.map((point) => Math.hypot(point.x, point.y)))
  }
  return 8
}

function readPositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function readPatternNumericParam(
  pattern: BulletPattern,
  key: string,
  fallback: number,
): number {
  const value = pattern.params[key]
  return typeof value === "number" ? value : fallback
}

export function resolveEnemyPatternBaseDirection(input: {
  battleElapsedMs: number
  enemy: PatternEnemy
  pattern: BulletPattern
}): Vector2 {
  const baseAngleDeg = readPatternNumericParam(input.pattern, "baseAngleDeg", 90)
  const oscillationDeg = readPatternNumericParam(input.pattern, "oscillationDeg", 0)
  const oscillationMs = Math.max(1, readPatternNumericParam(input.pattern, "oscillationMs", 2400))
  const phaseOffsetDeg =
    readPatternNumericParam(input.pattern, "phaseOffsetDeg", 0) +
    pseudoRandomUnit(hashString(input.enemy.enemyInstanceId)) * 28
  const oscillation =
    oscillationDeg === 0
      ? 0
      : Math.sin(((input.battleElapsedMs + Math.abs(phaseOffsetDeg) * 8) / oscillationMs) * Math.PI * 2) *
        oscillationDeg

  return vectorFromAngleDeg(baseAngleDeg + phaseOffsetDeg + oscillation)
}

export function readEnemyPatternBaseRotation(input: {
  battleElapsedMs: number
  enemy: PatternEnemy
  pattern: BulletPattern
}): number {
  const baseAngleDeg = readPatternNumericParam(input.pattern, "baseAngleDeg", 90)
  const rotationDegPerSec = readPatternNumericParam(input.pattern, "rotationDegPerSec", 0)
  const phaseOffsetDeg =
    readPatternNumericParam(input.pattern, "phaseOffsetDeg", 0) +
    pseudoRandomUnit(hashString(`${input.enemy.enemyInstanceId}:rot`)) * 32

  return ((baseAngleDeg + phaseOffsetDeg + (input.battleElapsedMs / 1000) * rotationDegPerSec) * Math.PI) / 180
}

function vectorFromAngleDeg(angleDeg: number): Vector2 {
  const radians = (angleDeg * Math.PI) / 180
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pseudoRandomUnit(seed: number): number {
  return (seed % 1000) / 1000 - 0.5
}

export function rotateVector(vector: Vector2, radians: number): Vector2 {
  return {
    x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
    y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians),
  }
}

export function isCircleInsideCircle(
  position: Vector2,
  radius: number,
  targetPosition: Vector2,
  targetRadius: number,
): boolean {
  return Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y) <= radius + targetRadius
}

export function doesCircleIntersectHazardArea(
  position: Vector2,
  radius: number,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  const nearestX = Math.max(area.x, Math.min(position.x, area.x + area.width))
  const nearestY = Math.max(area.y, Math.min(position.y, area.y + area.height))
  const dx = position.x - nearestX
  const dy = position.y - nearestY
  return dx * dx + dy * dy <= radius * radius
}

export function findNearestEnemyInRange<T extends PositionedCircle>(
  enemies: T[],
  position: Vector2,
  range: number,
): T | undefined {
  return enemies
    .map((enemy) => ({
      enemy,
      distance: Math.hypot(enemy.position.x - position.x, enemy.position.y - position.y),
    }))
    .filter((entry) => entry.distance <= range)
    .sort((left, right) => left.distance - right.distance)[0]?.enemy
}

export function hasEnemyWithinRange<T extends PositionedCircle>(
  enemies: T[],
  position: Vector2,
  range: number,
): boolean {
  return enemies.some((enemy) =>
    Math.hypot(position.x - enemy.position.x, position.y - enemy.position.y) <= range + enemy.radius,
  )
}

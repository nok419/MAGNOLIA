import type { EnemyArchetype, MovementPattern, Vector2 } from "@magnolia/contracts"
import { BATTLE_HEIGHT, BATTLE_WIDTH } from "../battle-world"
import type { InternalEnemyState } from "../battle-state"
import { clamp01 } from "../math"

type EnemyMovementInput = {
  enemy: InternalEnemyState
  enemyDefinition: EnemyArchetype
  movementPatterns: Record<string, MovementPattern>
  battleElapsedMs: number
  dtMs: number
}

export function advanceEnemyMovement(input: EnemyMovementInput): void {
  const pattern = resolveEnemyMovementPattern(input)
  const params = {
    ...readPatternParams(pattern),
    ...(input.enemy.overrides ?? {}),
  }
  const elapsed = Math.max(0, input.battleElapsedMs - input.enemy.enteredAtMs)
  const dtSeconds = input.dtMs / 1000

  switch (pattern.patternKind) {
    case "linear":
      moveLinear(input.enemy, params, dtSeconds)
      break
    case "sineDrift":
      moveSineDrift(input.enemy, params, elapsed, dtSeconds)
      break
    case "pauseThenDrift":
      movePauseThenDrift(input.enemy, params, input.battleElapsedMs, dtSeconds)
      break
    case "bezierRoute":
      moveBezierRoute(input.enemy, pattern.points, readNumber(params.durationMs, pattern.durationMs), elapsed)
      break
    case "holdAndFade":
      moveHoldAndFade(input.enemy, params, elapsed, dtSeconds)
      break
  }
}

export function shouldKeepEnemyInBattle(enemy: InternalEnemyState): boolean {
  if (enemy.fadedOut) {
    return false
  }
  const margin = enemy.radius + 72
  return (
    enemy.position.y < BATTLE_HEIGHT + margin &&
    enemy.position.x > -margin &&
    enemy.position.x < BATTLE_WIDTH + margin
  )
}

function resolveEnemyMovementPattern(input: EnemyMovementInput): MovementPattern {
  const movementPatternId = input.enemy.movementPatternId ?? input.enemyDefinition.movementPatternId
  if (movementPatternId) {
    const pattern = input.movementPatterns[movementPatternId]
    if (!pattern) {
      throw new Error(`Missing movement pattern ${movementPatternId} for enemy ${input.enemy.enemyId}.`)
    }
    return pattern
  }

  // 旧 content の behaviorKind を即時に壊さないため、未移行の敵だけ既存挙動相当の route を合成します。
  return legacyMovementPatternFromBehavior(input.enemyDefinition)
}

function legacyMovementPatternFromBehavior(enemyDefinition: EnemyArchetype): MovementPattern {
  const params = enemyDefinition.behaviorParams
  switch (enemyDefinition.behaviorKind) {
    case "zigzag":
    case "straightDown":
      return {
        movementPatternId: `legacy:${enemyDefinition.enemyId}:${enemyDefinition.behaviorKind}`,
        patternKind: "sineDrift",
        speed: readNumber(params.speed, 40),
        driftX: readNumber(params.driftX, 0),
        driftY: 0,
        wobbleAmplitude: readNumber(
          params.wobbleAmplitude,
          enemyDefinition.behaviorKind === "zigzag" ? 40 : 0,
        ),
        wobblePeriodMs: readNumber(
          params.wobblePeriodMs,
          enemyDefinition.behaviorKind === "zigzag" ? 2000 : 3000,
        ),
        authoringLabel: "Legacy behavior fallback",
        intendedUse: "legacy.behaviorKind",
      }
    case "slowDescent":
      return {
        movementPatternId: `legacy:${enemyDefinition.enemyId}:slowDescent`,
        patternKind: "pauseThenDrift",
        speed: readNumber(params.speed, 40),
        driftX: readNumber(params.driftX, 0),
        driftY: 0,
        pauseAtY: readNumber(params.pauseAtY, 100),
        pauseMs: readNumber(params.pauseMs, 1000),
        authoringLabel: "Legacy behavior fallback",
        intendedUse: "legacy.behaviorKind",
      }
  }
}

function readPatternParams(pattern: MovementPattern): Record<string, number | string | boolean> {
  switch (pattern.patternKind) {
    case "linear":
      return { speed: pattern.speed, driftX: pattern.driftX ?? 0, driftY: pattern.driftY ?? 0 }
    case "sineDrift":
      return {
        speed: pattern.speed,
        driftX: pattern.driftX ?? 0,
        driftY: pattern.driftY ?? 0,
        wobbleAmplitude: pattern.wobbleAmplitude,
        wobblePeriodMs: pattern.wobblePeriodMs,
      }
    case "pauseThenDrift":
      return {
        speed: pattern.speed,
        driftX: pattern.driftX ?? 0,
        driftY: pattern.driftY ?? 0,
        pauseAtY: pattern.pauseAtY,
        pauseMs: pattern.pauseMs,
      }
    case "bezierRoute":
      return { durationMs: pattern.durationMs }
    case "holdAndFade":
      return {
        holdMs: pattern.holdMs,
        fadeMs: pattern.fadeMs,
        driftX: pattern.driftX ?? 0,
        driftY: pattern.driftY ?? 0,
      }
  }
}

function moveLinear(
  enemy: InternalEnemyState,
  params: Record<string, number | string | boolean>,
  dtSeconds: number,
): void {
  enemy.position.x += readNumber(params.driftX, 0) * dtSeconds
  enemy.position.y += (readNumber(params.speed, 40) + readNumber(params.driftY, 0)) * dtSeconds
}

function moveSineDrift(
  enemy: InternalEnemyState,
  params: Record<string, number | string | boolean>,
  elapsed: number,
  dtSeconds: number,
): void {
  const speed = readNumber(params.speed, 40)
  const driftX = readNumber(params.driftX, 0)
  const driftY = readNumber(params.driftY, 0)
  const wobbleAmplitude = readNumber(params.wobbleAmplitude, 0)
  const wobblePeriodMs = Math.max(1, readNumber(params.wobblePeriodMs, 3000))

  enemy.position.y += (speed + driftY) * dtSeconds
  enemy.position.x =
    enemy.spawnPosition.x +
    driftX * (elapsed / 1000) +
    Math.sin((elapsed / wobblePeriodMs) * Math.PI * 2) * wobbleAmplitude
}

function movePauseThenDrift(
  enemy: InternalEnemyState,
  params: Record<string, number | string | boolean>,
  battleElapsedMs: number,
  dtSeconds: number,
): void {
  const speed = readNumber(params.speed, 40)
  const pauseAtY = readNumber(params.pauseAtY, 100)
  const pauseMs = readNumber(params.pauseMs, 1000)

  enemy.position.x += readNumber(params.driftX, 0) * dtSeconds
  if (enemy.position.y < pauseAtY) {
    enemy.position.y += (speed + readNumber(params.driftY, 0)) * dtSeconds
    return
  }
  if (!enemy.pauseStartedAtMs) {
    enemy.pauseStartedAtMs = battleElapsedMs
    return
  }
  if (battleElapsedMs - enemy.pauseStartedAtMs > pauseMs) {
    enemy.position.y += (speed + readNumber(params.driftY, 0)) * dtSeconds
  }
}

function moveBezierRoute(
  enemy: InternalEnemyState,
  points: Vector2[],
  durationMs: number,
  elapsed: number,
): void {
  const t = clamp01(elapsed / Math.max(1, durationMs))
  if (points.length === 2) {
    enemy.position = lerpPoint(points[0], points[1], t)
    return
  }
  if (points.length === 3) {
    enemy.position = quadraticBezier(points[0], points[1], points[2], t)
    return
  }
  enemy.position = cubicBezier(points[0], points[1], points[2], points[3], t)
}

function moveHoldAndFade(
  enemy: InternalEnemyState,
  params: Record<string, number | string | boolean>,
  elapsed: number,
  dtSeconds: number,
): void {
  const holdMs = readNumber(params.holdMs, 0)
  const fadeMs = Math.max(1, readNumber(params.fadeMs, 1))
  if (elapsed < holdMs) {
    return
  }

  enemy.position.x += readNumber(params.driftX, 0) * dtSeconds
  enemy.position.y += readNumber(params.driftY, 0) * dtSeconds
  if (elapsed >= holdMs + fadeMs) {
    enemy.fadedOut = true
  }
}

function readNumber(value: number | string | boolean | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function lerpPoint(start: Vector2, end: Vector2, t: number): Vector2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

function quadraticBezier(a: Vector2, b: Vector2, c: Vector2, t: number): Vector2 {
  return lerpPoint(lerpPoint(a, b, t), lerpPoint(b, c, t), t)
}

function cubicBezier(a: Vector2, b: Vector2, c: Vector2, d: Vector2, t: number): Vector2 {
  return lerpPoint(quadraticBezier(a, b, c, t), quadraticBezier(b, c, d, t), t)
}

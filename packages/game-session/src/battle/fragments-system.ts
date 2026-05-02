import type {
  Difficulty,
  PresentationRequest,
  TimeRange,
  Vector2,
} from "@magnolia/contracts"
import type {
  InternalBattleFragmentState,
  InternalBattleState,
} from "../battle-state"
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  isCircleInsideCircle,
} from "../battle-world"
import { clamp01, hashString } from "../math"
import { normalizeVector } from "../explore-world"
import {
  appendTimeRange,
  computeRecoverableArchiveHeardRanges,
  computeRestorationRate,
  subtractTimeRanges,
  timeRangesFromTranscriptSpans,
  transcriptSpanForTimeRange,
} from "../progression"
import { createBattleFragmentRecoveredPresentation } from "../presentation"

export function maybeSpawnBattleFragment(input: {
  battle: InternalBattleState
  audioWindow: TimeRange
  difficulty: Difficulty
  strength: number
  nextInstanceId: (prefix: string) => string
}): void {
  const battle = input.battle
  const fragmentCooldownMs = 1300
  if (battle.elapsedMs - battle.lastFragmentSpawnedAtMs < fragmentCooldownMs) {
    return
  }

  const activeChunk = battle.transcript.find(
    (chunk) =>
      chunk.startMs < input.audioWindow.endMs &&
      chunk.endMs > input.audioWindow.startMs,
  )
  if (!activeChunk) {
    return
  }

  // audioWindow 上の欠損位置を transcript ratio に戻し、回収時に同じ範囲を復元できるようにします。
  const chunkDurationMs = Math.max(1, activeChunk.endMs - activeChunk.startMs)
  const centerRatio = clamp01(
    ((input.audioWindow.startMs + input.audioWindow.endMs) / 2 - activeChunk.startMs) /
      chunkDurationMs,
  )
  const widthRatio = Math.min(0.42, 0.22 + clamp01(input.strength) * 0.16)
  const startRatio = clamp01(centerRatio - widthRatio / 2)
  const endRatio = clamp01(Math.max(startRatio + 0.12, centerRatio + widthRatio / 2))
  const timeRange = {
    startMs: activeChunk.startMs + chunkDurationMs * startRatio,
    endMs: activeChunk.startMs + chunkDurationMs * endRatio,
  }
  const span = transcriptSpanForTimeRange(activeChunk, timeRange)
  const seed = hashString(`${activeChunk.chunkId}:${Math.floor(battle.elapsedMs / 250)}:${battle.fragments.length}`)
  const angle = -Math.PI * 0.5 + (unitFromSineSeed(seed) - 0.5) * Math.PI * 1.25
  const distance = 72 + unitFromSineSeed(seed + 17) * 112
  const fragment: InternalBattleFragmentState = {
    fragmentId: input.nextInstanceId("frag_signal"),
    chunkId: span.chunkId,
    startRatio: span.startRatio,
    endRatio: span.endRatio,
    position: {
      x: Math.max(24, Math.min(BATTLE_WIDTH - 24, battle.playerPosition.x + Math.cos(angle) * distance)),
      y: Math.max(52, Math.min(BATTLE_HEIGHT - 36, battle.playerPosition.y + Math.sin(angle) * distance)),
    },
    // fragment は通信欠損が自機付近からこぼれたものとして見せるため、
    // 判定とは別に出現元と発生時刻を renderState へ渡します。
    originPosition: { ...battle.playerPosition },
    createdAtMs: battle.elapsedMs,
    radius: 13,
    expiresAtMs: battle.elapsedMs + (input.difficulty === "terminal" ? 2800 : 3800),
    strength: clamp01(input.strength),
  }

  battle.fragments.push(fragment)
  battle.lastFragmentSpawnedAtMs = battle.elapsedMs
}

export function updateBattleFragments(input: {
  battle: InternalBattleState
  dtMs: number
  playerHitRadius: number
}): PresentationRequest[] {
  const battle = input.battle
  const remaining: InternalBattleFragmentState[] = []
  const presentationRequests: PresentationRequest[] = []
  let collected = false
  const dtSeconds = input.dtMs / 1000

  for (const fragment of battle.fragments) {
    if (fragment.expiresAtMs <= battle.elapsedMs) {
      continue
    }
    pullFragmentTowardPlayer({
      fragment,
      playerPosition: battle.playerPosition,
      dtSeconds,
    })
    if (isCircleInsideCircle(battle.playerPosition, input.playerHitRadius, fragment.position, fragment.radius)) {
      const recoveredRange = resolveFragmentTimeRange(battle, fragment)
      if (recoveredRange) {
        battle.heardRanges = appendTimeRange(battle.heardRanges, recoveredRange)
        battle.damageRanges = subtractTimeRanges(battle.damageRanges, [recoveredRange])
        battle.newlyRecoveredRange = recoveredRange
        presentationRequests.push(
          ...createBattleFragmentRecoveredPresentation({
            fragmentId: fragment.fragmentId,
            chunkId: fragment.chunkId,
          }),
        )
        collected = true
      }
      continue
    }
    remaining.push(fragment)
  }

  battle.fragments = remaining
  if (collected) {
    refreshBattleRestorationRate(battle)
  }
  return presentationRequests
}

function pullFragmentTowardPlayer(input: {
  fragment: InternalBattleFragmentState
  playerPosition: Vector2
  dtSeconds: number
}): void {
  const toPlayer = {
    x: input.playerPosition.x - input.fragment.position.x,
    y: input.playerPosition.y - input.fragment.position.y,
  }
  const distance = Math.hypot(toPlayer.x, toPlayer.y)
  if (distance > 132 || distance <= 0.001) {
    return
  }

  // fragment は失敗を取り戻す手段なので、近づいた後は pickup と同じように吸着させます。
  const direction = normalizeVector(toPlayer)
  const speed = 420 + input.fragment.strength * 140
  const travel = Math.min(distance, speed * input.dtSeconds)
  input.fragment.position.x += direction.x * travel
  input.fragment.position.y += direction.y * travel
}

function resolveFragmentTimeRange(
  battle: InternalBattleState,
  fragment: InternalBattleFragmentState,
): TimeRange | null {
  const chunk = battle.transcript.find((candidate) => candidate.chunkId === fragment.chunkId)
  if (!chunk) {
    return null
  }
  return timeRangesFromTranscriptSpans(battle.transcript, [{
    chunkId: fragment.chunkId,
    startRatio: fragment.startRatio,
    endRatio: fragment.endRatio,
  }])[0] ?? null
}

function refreshBattleRestorationRate(battle: InternalBattleState): void {
  battle.restorationRate = computeRestorationRate(
    computeRecoverableArchiveHeardRanges({
      heardRanges: battle.heardRanges,
      seededHeardRanges: battle.seededHeardRanges,
      damageRanges: battle.damageRanges,
    }),
    battle.transcript,
  )
}

function unitFromSineSeed(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

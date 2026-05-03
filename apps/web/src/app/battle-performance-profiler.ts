export type BattlePerformanceProfilerSample = {
  enabled: boolean
  frames: number
  frameMs: number
  stepMs: number
  syncMs: number
  renderStateMs: number
  drawMs: number
  dtMs: number
  fps: number
  enemies: number
  projectiles: number
  enemyProjectiles: number
  playerProjectiles: number
  lastUpdatedAt: number
}

type BattleRuntimeSample = {
  frameMs: number
  stepMs: number
  syncMs: number
  dtMs: number
}

type BattleRenderStateSample = {
  renderStateMs: number
  enemies: number
  projectiles: number
  enemyProjectiles: number
  playerProjectiles: number
}

type BattleDrawSample = {
  drawMs: number
}

type BattlePerformanceAccumulator = {
  frames: number
  frameMs: number
  stepMs: number
  syncMs: number
  renderStateMs: number
  drawMs: number
  dtMs: number
}

const PROFILER_QUERY_KEYS = ["perf", "profile", "battlePerf"]
const PROFILER_STORAGE_KEY = "magnolia:battlePerf"
const SNAPSHOT_INTERVAL_MS = 1000

let enabledCache: boolean | null = null
let accumulator: BattlePerformanceAccumulator = createEmptyAccumulator()
let latestCounts = {
  enemies: 0,
  projectiles: 0,
  enemyProjectiles: 0,
  playerProjectiles: 0,
}
let latestSnapshot: BattlePerformanceProfilerSample = createEmptySnapshot(false)
let lastSnapshotAt = 0

export function readPerformanceNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

export function isBattlePerformanceProfilerEnabled(): boolean {
  if (enabledCache !== null) {
    return enabledCache
  }
  if (typeof window === "undefined") {
    enabledCache = false
    return enabledCache
  }

  const search = new URLSearchParams(window.location.search)
  enabledCache = PROFILER_QUERY_KEYS.some((key) => search.get(key) === "1")
  if (!enabledCache) {
    enabledCache = window.localStorage.getItem(PROFILER_STORAGE_KEY) === "1"
  }
  return enabledCache
}

export function recordBattleRuntimeSample(sample: BattleRuntimeSample): void {
  if (!isBattlePerformanceProfilerEnabled()) {
    return
  }
  accumulator.frames += 1
  accumulator.frameMs += sample.frameMs
  accumulator.stepMs += sample.stepMs
  accumulator.syncMs += sample.syncMs
  accumulator.dtMs += sample.dtMs
  maybePublishSnapshot()
}

export function recordBattleRenderStateSample(sample: BattleRenderStateSample): void {
  if (!isBattlePerformanceProfilerEnabled()) {
    return
  }
  accumulator.renderStateMs += sample.renderStateMs
  latestCounts = {
    enemies: sample.enemies,
    projectiles: sample.projectiles,
    enemyProjectiles: sample.enemyProjectiles,
    playerProjectiles: sample.playerProjectiles,
  }
  maybePublishSnapshot()
}

export function recordBattleDrawSample(sample: BattleDrawSample): void {
  if (!isBattlePerformanceProfilerEnabled()) {
    return
  }
  accumulator.drawMs += sample.drawMs
  maybePublishSnapshot()
}

function maybePublishSnapshot(): void {
  const now = readPerformanceNow()
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
    return
  }
  publishSnapshot(now)
}

function publishSnapshot(now: number): void {
  const frames = Math.max(1, accumulator.frames)
  const averageDtMs = accumulator.dtMs / frames
  latestSnapshot = {
    enabled: true,
    frames: accumulator.frames,
    frameMs: accumulator.frameMs / frames,
    stepMs: accumulator.stepMs / frames,
    syncMs: accumulator.syncMs / frames,
    renderStateMs: accumulator.renderStateMs / frames,
    drawMs: accumulator.drawMs / frames,
    dtMs: averageDtMs,
    fps: averageDtMs > 0 ? 1000 / averageDtMs : 0,
    enemies: latestCounts.enemies,
    projectiles: latestCounts.projectiles,
    enemyProjectiles: latestCounts.enemyProjectiles,
    playerProjectiles: latestCounts.playerProjectiles,
    lastUpdatedAt: now,
  }
  accumulator = createEmptyAccumulator()
  lastSnapshotAt = now
  exposeSnapshotToDevtools()
  logSnapshotToConsole()
}

function exposeSnapshotToDevtools(): void {
  if (typeof window === "undefined") {
    return
  }
  ;(window as typeof window & {
    __magnoliaBattlePerf?: BattlePerformanceProfilerSample
  }).__magnoliaBattlePerf = latestSnapshot
}

function logSnapshotToConsole(): void {
  if (typeof console === "undefined") {
    return
  }
  // Safari の開発ツールで、1 秒ごとの平均値として読むための計測ログです。
  console.table({
    "frame ms": round2(latestSnapshot.frameMs),
    "stepBattle ms": round2(latestSnapshot.stepMs),
    "sync ms": round2(latestSnapshot.syncMs),
    "renderState ms": round2(latestSnapshot.renderStateMs),
    "draw ms": round2(latestSnapshot.drawMs),
    "dt ms": round2(latestSnapshot.dtMs),
    fps: round1(latestSnapshot.fps),
    enemies: latestSnapshot.enemies,
    projectiles: latestSnapshot.projectiles,
    "enemy projectiles": latestSnapshot.enemyProjectiles,
    "player projectiles": latestSnapshot.playerProjectiles,
    frames: latestSnapshot.frames,
  })
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function createEmptyAccumulator(): BattlePerformanceAccumulator {
  return {
    frames: 0,
    frameMs: 0,
    stepMs: 0,
    syncMs: 0,
    renderStateMs: 0,
    drawMs: 0,
    dtMs: 0,
  }
}

function createEmptySnapshot(enabled: boolean): BattlePerformanceProfilerSample {
  return {
    enabled,
    frames: 0,
    frameMs: 0,
    stepMs: 0,
    syncMs: 0,
    renderStateMs: 0,
    drawMs: 0,
    dtMs: 0,
    fps: 0,
    enemies: 0,
    projectiles: 0,
    enemyProjectiles: 0,
    playerProjectiles: 0,
    lastUpdatedAt: 0,
  }
}

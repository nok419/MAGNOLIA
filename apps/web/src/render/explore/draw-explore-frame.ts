import { DEFAULT_EXPLORE_VIEWPORT_HEIGHT } from "@magnolia/contracts"
import type { ExploreSnapshot, ShipVariant } from "@magnolia/contracts"
import type { ExploreRenderState, Rect } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import type { ExplorePresentationState } from "@/app/explore-presentation"
import type {
  ExploreChannelPresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import { drawBackground, drawFogGrid } from "@/render/explore/background"
import {
  readRebootViewportHeight,
  readReleaseViewportHeight,
  resolveCameraViewport,
  type CameraState,
} from "@/render/explore/camera"
import { type ExploreTrailState } from "@/render/explore/trail"
import { worldToCanvasPoint } from "@/render/shared/coordinates"
import { drawExplorePlayer } from "@/render/explore/explore-player"
import { drawExploreScene, readExploreTrailEventBoost } from "@/render/explore/explore-scene-renderer"
import {
  drawRebootBackdrop,
  drawRebootSequence,
  readRebootSequence,
  type RebootSequenceState,
} from "@/render/explore/reboot-sequence"
import {
  drawRebootBlackoutBackdrop,
  drawRebootSettleBridge,
  readRebootSettle,
  readRebootSettlePhase,
  type RebootSettleState,
} from "@/render/explore/reboot-settle"
import {
  readReleaseSequence,
  type ReleaseSequenceState,
} from "@/render/explore/boundary-release"
import type { ScanCooldownMeterState } from "@/render/explore/scan-cooldown-meter"

const DEFAULT_VIEWPORT_HEIGHT = DEFAULT_EXPLORE_VIEWPORT_HEIGHT
type ActiveReleaseSequence = ReturnType<typeof readReleaseSequence>

type MutableRef<T> = {
  current: T
}

export type ExploreOverlayFrame = {
  viewport: Rect
  width: number
  height: number
  padding: number
  playerPoint: { x: number; y: number }
  visionPx: number
}

export type ExploreDrawFrameRefs = {
  cameraRef: MutableRef<CameraState | null>
  trailStateRef: MutableRef<ExploreTrailState>
  rebootSequenceRef: MutableRef<RebootSequenceState | null>
  rebootSettleRef: MutableRef<RebootSettleState | null>
  releaseSequenceRef: MutableRef<ReleaseSequenceState | null>
  scanMeterStateRef: MutableRef<ScanCooldownMeterState>
}

export function drawExploreFrame(input: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  presentation: ExplorePresentationState
  exploreEvents: TimedPresentationRequest<ExploreChannelPresentationRequest>[]
  shipVariant: ShipVariant
  onOverlayFrame?: (frame: ExploreOverlayFrame) => void
  displayOptions: DisplayOptions
  refs: ExploreDrawFrameRefs
}): void {
  const {
    ctx,
    width,
    height,
    snapshot,
    renderState,
    presentation,
    exploreEvents,
    shipVariant,
    onOverlayFrame,
    displayOptions,
    refs,
  } = input

  ctx.clearRect(0, 0, width, height)

  const padding = 12
  const now = performance.now()
  const trailEventBoost = readExploreTrailEventBoost(exploreEvents, now)
  const rebootSequenceRequestId =
    presentation.kind === "reboot" ? presentation.requestId : undefined
  const rebootSequenceDurationMs =
    presentation.kind === "reboot" ? presentation.durationMs : undefined
  const rebootSettleRequestId =
    presentation.kind === "reboot-settle" ? presentation.requestId : undefined
  const rebootSettleDurationMs =
    presentation.kind === "reboot-settle" ? presentation.durationMs : undefined
  const releaseSequenceRequestId =
    presentation.kind === "release" ? presentation.requestId : undefined
  const releaseSequenceDurationMs =
    presentation.kind === "release" ? presentation.durationMs : undefined
  const rebootSequence = readRebootSequence({
    rebootSequenceRef: refs.rebootSequenceRef,
    requestId: rebootSequenceRequestId,
    durationMs: rebootSequenceDurationMs ?? 4800,
    now,
  })
  const rebootSettle = readRebootSettle({
    rebootSettleRef: refs.rebootSettleRef,
    requestId: rebootSettleRequestId,
    durationMs: rebootSettleDurationMs ?? 1600,
    now,
  })
  const releaseSequence = readReleaseSequence({
    releaseSequenceRef: refs.releaseSequenceRef,
    requestId: releaseSequenceRequestId,
    durationMs: releaseSequenceDurationMs ?? 1200,
    now,
    renderState,
  })
  const rebootSettlePhase = rebootSettle
    ? readRebootSettlePhase(rebootSettle.progress)
    : null
  const visionIntensity = rebootSettlePhase
    ? rebootSettlePhase.worldRevealProgress
    : 1
  const viewportHeight = rebootSequence
    ? readRebootViewportHeight(DEFAULT_VIEWPORT_HEIGHT, rebootSequence.progress)
    : releaseSequence
      ? readReleaseViewportHeight(DEFAULT_VIEWPORT_HEIGHT, releaseSequence.progress)
      : DEFAULT_VIEWPORT_HEIGHT
  const drawableWidth = Math.max(1, width - padding * 2)
  const drawableHeight = Math.max(1, height - padding * 2)
  // 1 枚の大きな world map を前提に、画面には camera viewport だけを出します。
  const viewport = resolveCameraViewport({
    cameraRef: refs.cameraRef,
    worldBounds: renderState.worldBounds,
    playerPosition: renderState.playerPosition,
    viewportHeight,
    aspectRatio: Math.max(1, drawableWidth / drawableHeight),
    rebootSequence,
    releaseSequence,
    timeMs: now,
  })

  const playerPoint = worldToCanvasPoint({
    bounds: viewport,
    size: { width, height },
    padding,
    worldPosition: renderState.playerPosition,
  })
  const visionPx = Math.max(0.5, (renderState.visionRadius / Math.max(1, viewport.width)) * drawableWidth)
  const playerAngle = Math.atan2(renderState.playerFacing.y, renderState.playerFacing.x) + Math.PI / 2

  // DOM 側の誘導表示は canvas と同じ座標変換結果を使い、自機やアイコンに追従させます。
  onOverlayFrame?.({
    viewport,
    width,
    height,
    padding,
    playerPoint,
    visionPx,
  })

  if (rebootSequence) {
    drawRebootBackdrop(ctx, width, height, now, playerPoint, rebootSequence.progress)
    drawRebootSequence(ctx, {
      width,
      height,
      playerPoint,
      playerAngle,
      visionPx,
      timeMs: now,
      progress: rebootSequence.progress,
      shipVariant,
    })
    return
  }

  if (rebootSettlePhase) {
    drawRebootBlackoutBackdrop(ctx, width, height, now, playerPoint)
    drawRebootSettleBridge(ctx, playerPoint, now, rebootSettle?.progress ?? 0)
    ctx.save()
    ctx.globalAlpha = rebootSettlePhase.bridgeShipAlpha
    drawExplorePlayer(ctx, playerPoint.x, playerPoint.y, playerAngle, now, shipVariant)
    ctx.restore()

    if (rebootSettlePhase.worldRevealProgress > 0.001) {
      ctx.save()
      ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
      drawBackground(ctx, width, height, now, viewport)
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
      drawFogGrid(ctx, width, height, padding, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
      ctx.restore()

      drawExploreSceneLayer({
        ctx,
        snapshot,
        renderState,
        viewport,
        width,
        height,
        padding,
        playerPoint,
        playerAngle,
        visionPx,
        visionIntensity,
        playerOpacity: rebootSettlePhase.worldRevealProgress,
        trailOpacity: rebootSettlePhase.worldRevealProgress,
        timeMs: now,
        releaseSequence,
        shipVariant,
        trailState: refs.trailStateRef.current,
        trailEventBoost,
        scanMeterState: refs.scanMeterStateRef.current,
        displayOptions,
      })
    }
    return
  }

  drawBackground(ctx, width, height, now, viewport)
  drawFogGrid(ctx, width, height, padding, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
  drawExploreSceneLayer({
    ctx,
    snapshot,
    renderState,
    viewport,
    width,
    height,
    padding,
    playerPoint,
    playerAngle,
    visionPx,
    visionIntensity,
    playerOpacity: 1,
    trailOpacity: 1,
    timeMs: now,
    releaseSequence,
    shipVariant,
    trailState: refs.trailStateRef.current,
    trailEventBoost,
    scanMeterState: refs.scanMeterStateRef.current,
    displayOptions,
  })
}

function drawExploreSceneLayer(input: {
  ctx: CanvasRenderingContext2D
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  viewport: Rect
  width: number
  height: number
  padding: number
  playerPoint: { x: number; y: number }
  playerAngle: number
  visionPx: number
  visionIntensity: number
  playerOpacity: number
  trailOpacity: number
  timeMs: number
  releaseSequence: ActiveReleaseSequence
  shipVariant: ShipVariant
  trailState: ExploreTrailState
  trailEventBoost: number
  scanMeterState: ScanCooldownMeterState
  displayOptions: DisplayOptions
}): void {
  drawExploreScene(input.ctx, {
    snapshot: input.snapshot,
    renderState: input.renderState,
    viewport: input.viewport,
    width: input.width,
    height: input.height,
    padding: input.padding,
    playerPoint: input.playerPoint,
    playerAngle: input.playerAngle,
    visionPx: input.visionPx,
    visionIntensity: input.visionIntensity,
    playerOpacity: input.playerOpacity,
    trailOpacity: input.trailOpacity,
    timeMs: input.timeMs,
    releaseSequence: input.releaseSequence,
    shipVariant: input.shipVariant,
    trailState: input.trailState,
    trailEventBoost: input.trailEventBoost,
    scanMeterState: input.scanMeterState,
    reduceFlashing: input.displayOptions.reduceFlashing,
    lowFrameRateMode: input.displayOptions.lowFrameRateMode,
  })
}

import { DEFAULT_EXPLORE_VIEWPORT_HEIGHT } from "@magnolia/contracts"
import { worldToCanvas } from "@/render/shared/coordinates"
import { drawBackground, drawFogGrid } from "./background"
import { drawExploreScene } from "./scene"
import { drawExplorePlayer } from "./player"
import {
  drawRebootBackdrop,
  drawRebootBlackoutBackdrop,
  drawRebootSequence,
  drawRebootSettleBridge,
  readRebootSequence,
  readRebootSettle,
  readRebootSettlePhase,
  readRebootViewportHeight,
} from "./reboot"
import {
  readReleaseSequence,
  readReleaseViewportHeight,
  resolveCameraViewport,
} from "./release"
import type { DrawExploreFrameInput } from "./types"

const DEFAULT_VIEWPORT_HEIGHT = DEFAULT_EXPLORE_VIEWPORT_HEIGHT
const PADDING = 12

export function drawExploreFrame(ctx: CanvasRenderingContext2D, input: DrawExploreFrameInput) {
  const W = input.width
  const H = input.height
  const now = input.now
  const { snapshot, renderState, presentation, shipVariant, refs } = input
  const reduceFlashing = input.displayOptions.reduceFlashing
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

  // camera は frame 間の状態を持つため、host の ref を通して更新します。
  const viewport = resolveCameraViewport({
    cameraRef: refs.cameraRef,
    worldBounds: renderState.worldBounds,
    playerPosition: renderState.playerPosition,
    viewportHeight,
    aspectRatio: Math.max(1, (W - PADDING * 2) / Math.max(1, H - PADDING * 2)),
    rebootSequence,
    releaseSequence,
  })

  const pp = worldToCanvas(viewport, W, H, PADDING, renderState.playerPosition.x, renderState.playerPosition.y)
  const visionPx = (renderState.visionRadius / Math.max(1, viewport.width)) * (W - PADDING * 2)
  const angle = Math.atan2(renderState.playerFacing.y, renderState.playerFacing.x) + Math.PI / 2

  input.onOverlayFrame?.({
    viewport,
    width: W,
    height: H,
    padding: PADDING,
    playerPoint: pp,
    visionPx,
  })

  if (rebootSequence) {
    drawRebootBackdrop(ctx, W, H, now, pp, rebootSequence.progress)
    drawRebootSequence(ctx, {
      width: W,
      height: H,
      playerPoint: pp,
      playerAngle: angle,
      visionPx,
      timeMs: now,
      progress: rebootSequence.progress,
      shipVariant,
    })
    return
  }

  if (rebootSettlePhase) {
    drawRebootBlackoutBackdrop(ctx, W, H, now, pp)
    drawRebootSettleBridge(ctx, pp, now, rebootSettle?.progress ?? 0)
    ctx.save()
    ctx.globalAlpha = rebootSettlePhase.bridgeShipAlpha
    drawExplorePlayer(ctx, pp.x, pp.y, angle, now, shipVariant)
    ctx.restore()

    if (rebootSettlePhase.worldRevealProgress <= 0.001) {
      return
    }

    ctx.save()
    ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
    drawBackground(ctx, W, H, now, viewport)
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = rebootSettlePhase.worldRevealProgress
    drawFogGrid(ctx, W, H, PADDING, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
    ctx.restore()

    drawExploreScene(ctx, {
      snapshot,
      renderState,
      viewport,
      width: W,
      height: H,
      padding: PADDING,
      playerPoint: pp,
      playerAngle: angle,
      visionPx,
      visionIntensity,
      playerOpacity: rebootSettlePhase.worldRevealProgress,
      trailOpacity: rebootSettlePhase.worldRevealProgress,
      timeMs: now,
      trailState: refs.trailStateRef.current,
      releaseSequence,
      reduceFlashing,
      shipVariant,
    })
    return
  }

  drawBackground(ctx, W, H, now, viewport)
  drawFogGrid(ctx, W, H, PADDING, snapshot.map.fogBitmap, renderState.worldBounds, viewport)
  drawExploreScene(ctx, {
    snapshot,
    renderState,
    viewport,
    width: W,
    height: H,
    padding: PADDING,
    playerPoint: pp,
    playerAngle: angle,
    visionPx,
    visionIntensity,
    playerOpacity: 1,
    trailOpacity: 1,
    timeMs: now,
    trailState: refs.trailStateRef.current,
    releaseSequence,
    reduceFlashing,
    shipVariant,
  })
}

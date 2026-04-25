import type {
  AreaId,
  HitPresentationRequest,
  InvincibleStartPresentationRequest,
  MotionTrailPresentationRequest,
  NoiseClearPresentationRequest,
  NoisePeakPresentationRequest,
  PresentationRequest,
  RebootSequencePresentationRequest,
  ReleasePresentationRequest,
  RestrictionPresentationRequest,
  SystemMessagePresentationRequest,
  TransitionPresentationRequest,
  TransmissionId,
  Vector2,
} from "@magnolia/contracts"

let presentationRequestSerial = 0

export function createInitialSystemMessagePresentation(input: {
  lines: string[]
}): SystemMessagePresentationRequest[] {
  if (input.lines.length === 0) {
    return []
  }

  return [
    {
      requestId: nextPresentationRequestId("system.boot.message"),
      cueId: "system.boot.message",
      channel: "overlay",
      blocking: true,
      lines: input.lines,
    },
  ]
}

export function createRebootSequencePresentation(): RebootSequencePresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("system.reboot.sequence"),
      cueId: "system.reboot.sequence",
      channel: "overlay",
      blocking: true,
    },
  ]
}

export function createTutorialRestrictionPresentation(input: {
  visibleRadius: number
  lockedActions: string[]
  blocking: boolean
}): RestrictionPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("tutorial.restriction.enter"),
      cueId: "tutorial.restriction.enter",
      channel: "overlay",
      blocking: input.blocking,
      visibleRadius: input.visibleRadius,
      lockedActions: input.lockedActions,
    },
  ]
}

export function createTutorialReleasePresentation(input: {
  worldPosition: Vector2
  releasedActions: string[]
  blocking: boolean
}): ReleasePresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("tutorial.restriction.release"),
      cueId: "tutorial.restriction.release",
      // 現行 Web 実装では overlay queue を探索 canvas へ受け渡して境界解除演出を駆動します。
      // channel を overlay に寄せ、blocking cue として確実に拾えるようにします。
      channel: "overlay",
      blocking: input.blocking,
      worldPosition: input.worldPosition,
      releasedActions: input.releasedActions,
    },
  ]
}

export function createExploreTrailPresentation(input: {
  worldPosition: Vector2
  velocity: Vector2
  lifetimeMs: number
}): MotionTrailPresentationRequest | null {
  // 停止中にも trail を発生させると常時 request が積まれるため、移動中だけ返します。
  if (Math.hypot(input.velocity.x, input.velocity.y) <= 0.001) {
    return null
  }

  return {
    requestId: nextPresentationRequestId("explore.player.trail"),
    cueId: "explore.player.trail",
    channel: "explore",
    blocking: false,
    worldPosition: input.worldPosition,
    velocity: input.velocity,
    lifetimeMs: input.lifetimeMs,
  }
}

export function createTransmissionConnectPresentation(input: {
  worldPosition: Vector2
  areaId: AreaId
  transmissionId: TransmissionId
}): TransitionPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("transmission.connect.sequence"),
      cueId: "transmission.connect.sequence",
      channel: "transition",
      blocking: true,
      worldPosition: input.worldPosition,
      areaId: input.areaId,
      transmissionId: input.transmissionId,
      destination: "battle",
    },
  ]
}

export function createWarpTransitionPresentation(input: {
  worldPosition: Vector2
  areaId: AreaId
  destination: "explore"
}): TransitionPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("warp.transition.sequence"),
      cueId: "warp.transition.sequence",
      channel: "transition",
      blocking: true,
      worldPosition: input.worldPosition,
      areaId: input.areaId,
      destination: input.destination,
    },
  ]
}

export function createBattleHitPresentation(input: {
  worldPosition: Vector2
  noiseLevel: number
}): HitPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("battle.player.hit"),
      cueId: "battle.player.hit",
      channel: "battle",
      blocking: false,
      noiseLevel: input.noiseLevel,
      worldPosition: input.worldPosition,
    },
  ]
}

export function createBattleNoisePeakPresentation(): NoisePeakPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("battle.noise.peak"),
      cueId: "battle.noise.peak",
      channel: "battle",
      blocking: false,
    },
  ]
}

export function createBattleNoiseClearPresentation(): NoiseClearPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("battle.noise.clear"),
      cueId: "battle.noise.clear",
      channel: "battle",
      blocking: false,
    },
  ]
}

export function createBattleInvincibleStartPresentation(input: {
  durationMs: number
}): InvincibleStartPresentationRequest[] {
  return [
    {
      requestId: nextPresentationRequestId("battle.invincible.start"),
      cueId: "battle.invincible.start",
      channel: "battle",
      blocking: false,
      durationMs: input.durationMs,
    },
  ]
}

export function flattenPresentationRequests(
  groups: Array<PresentationRequest[] | PresentationRequest | null | undefined>,
): PresentationRequest[] {
  const flattened: PresentationRequest[] = []

  for (const group of groups) {
    if (!group) {
      continue
    }

    if (Array.isArray(group)) {
      flattened.push(...group)
      continue
    }

    flattened.push(group)
  }

  return flattened
}

function nextPresentationRequestId(cueId: string): string {
  presentationRequestSerial += 1
  return `${cueId}:${presentationRequestSerial}`
}

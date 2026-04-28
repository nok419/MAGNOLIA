import type { AreaId, ThemeId, TransmissionId, Vector2 } from "./game-types"

export type ExploreTransitionSourceFrame = {
  screenAnchor: Vector2
  playerPoint: Vector2
  viewport: { x: number; y: number; width: number; height: number }
  screenSize: { width: number; height: number }
  padding: number
  capturedAtMs: number
}

export type PresentationCueId =
  | "system.boot.message"
  | "system.reboot.sequence"
  | "system.reboot.settle"
  | "tutorial.restriction.enter"
  | "tutorial.restriction.release"
  | "explore.player.trail"
  | "transmission.connect.sequence"
  | "warp.transition.sequence"
  | "battle.player.hit"
  | "battle.noise.peak"
  | "battle.noise.clear"
  | "battle.fragment.recovered"
  | "battle.noiseSource.clear"
  | "battle.invincible.start"

export type PresentationChannel =
  | "overlay"
  | "explore"
  | "battle"
  | "transition"
  | "ui"

export type PresentationCueSpec = {
  id: PresentationCueId
  channel: PresentationChannel
  renderer: "phaser" | "react" | "shared"
  blocking: boolean
  skippable: boolean
  defaultDurationMs?: number
  maxFlashHz?: number
  reduceFlashingVariant?: {
    defaultDurationMs?: number
    motionScale: number
    flashEnabled: boolean
  }
  assetIds?: string[]
  themeId?: ThemeId
}

export type SystemMessagePresentationRequest = {
  requestId: string
  cueId: "system.boot.message"
  channel: "overlay"
  blocking: true
  lines: string[]
}

export type RestrictionPresentationRequest = {
  requestId: string
  cueId: "tutorial.restriction.enter"
  channel: "overlay" | "explore"
  blocking: boolean
  visibleRadius: number
  lockedActions: string[]
}

export type RebootSequencePresentationRequest = {
  requestId: string
  cueId: "system.reboot.sequence"
  channel: "overlay" | "explore"
  blocking: true
}

export type RebootSettlePresentationRequest = {
  requestId: string
  cueId: "system.reboot.settle"
  channel: "overlay" | "explore"
  blocking: true
}

export type ReleasePresentationRequest = {
  requestId: string
  cueId: "tutorial.restriction.release"
  channel: "overlay" | "explore"
  blocking: boolean
  worldPosition: Vector2
  releasedActions: string[]
}

export type MotionTrailPresentationRequest = {
  requestId: string
  cueId: "explore.player.trail"
  channel: "explore"
  blocking: false
  worldPosition: Vector2
  velocity: Vector2
  lifetimeMs: number
}

export type TransitionPresentationRequest = {
  requestId: string
  cueId: "transmission.connect.sequence" | "warp.transition.sequence"
  channel: "transition"
  blocking: true
  worldPosition: Vector2
  sourceFrame?: ExploreTransitionSourceFrame
  areaId: AreaId
  transmissionId?: TransmissionId
  destination: "battle" | "explore"
}

export type HitPresentationRequest = {
  requestId: string
  cueId: "battle.player.hit"
  channel: "battle"
  blocking: false
  noiseLevel: number
  worldPosition: Vector2
}

export type NoisePeakPresentationRequest = {
  requestId: string
  cueId: "battle.noise.peak"
  channel: "battle"
  blocking: false
}

export type NoiseClearPresentationRequest = {
  requestId: string
  cueId: "battle.noise.clear"
  channel: "battle"
  blocking: false
}

export type NoiseBandKind = "subtitle" | "speaker" | "metadata" | "fragment" | "waveform"

export type FragmentRecoveredPresentationRequest = {
  requestId: string
  cueId: "battle.fragment.recovered"
  channel: "battle"
  blocking: false
  fragmentId: string
  chunkId: string
}

export type NoiseSourceClearPresentationRequest = {
  requestId: string
  cueId: "battle.noiseSource.clear"
  channel: "battle"
  blocking: false
  enemyId: string
  worldPosition: Vector2
  noiseBandKind?: NoiseBandKind
  analysisDelta: number
}

export type InvincibleStartPresentationRequest = {
  requestId: string
  cueId: "battle.invincible.start"
  channel: "battle"
  blocking: false
  durationMs: number
}

export type PresentationRequest =
  | SystemMessagePresentationRequest
  | RebootSequencePresentationRequest
  | RebootSettlePresentationRequest
  | RestrictionPresentationRequest
  | ReleasePresentationRequest
  | MotionTrailPresentationRequest
  | TransitionPresentationRequest
  | HitPresentationRequest
  | NoisePeakPresentationRequest
  | NoiseClearPresentationRequest
  | FragmentRecoveredPresentationRequest
  | NoiseSourceClearPresentationRequest
  | InvincibleStartPresentationRequest

import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import type { TimedPresentationRequest } from "@/app/app-state"

export type PlayerShipRendererInput = {
  x: number
  y: number
  invincible: boolean
  renderState: BattleRenderState
  shipVariant: ShipVariant
}

export type EnemyRendererInput = {
  enemy: BattleRenderState["enemies"][number]
  timeMs: number
  renderState: BattleRenderState
}

export type ProjectileRendererInput = {
  projectile: BattleRenderState["projectiles"][number]
  timeMs: number
  renderState: BattleRenderState
}

export type BattleFrameDrawInput = {
  renderState: BattleRenderState
  presentationRequests?: TimedPresentationRequest[]
  transparentBg?: boolean
  shipVariant: ShipVariant
  reduceFlashing?: boolean
}

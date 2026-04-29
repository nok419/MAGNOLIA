import type {
  ArchiveSnapshot,
  ContentBundle,
  PresentationRequest,
  ProfileAggregate,
  RootSnapshot,
  SettingsRow,
} from "@magnolia/contracts"
import type {
  BattleResultViewModel,
  BattleRenderState,
  ExploreRenderState,
  WorldMapViewModel,
} from "@magnolia/game-session"
import type { SlotSelectMode } from "@/app/app-types"
import type { OverlayPresentationRequest } from "@/app/explore-presentation"

export type ExploreItemPopup = {
  id: string
  title: string
  detail: string
  expiresAt: number
}

export type TimedPresentationRequest = PresentationRequest & {
  receivedAtMs: number
  expiresAtMs: number
}

export type MagnoliaAppState = {
  ready: boolean
  errorMessage?: string
  snapshot: RootSnapshot | null
  content: ContentBundle | null
  profile: ProfileAggregate | null
  settings: SettingsRow | null
  exploreSnapshot: RootSnapshot["explore"] | null
  exploreRenderState: ExploreRenderState | null
  worldMapViewModel: WorldMapViewModel | null
  battleRenderState: BattleRenderState | null
  battleResultViewModel: BattleResultViewModel | null
  archiveSnapshot: ArchiveSnapshot | null
  slotSelectMode: SlotSelectMode | null
  activeOverlayPresentation: OverlayPresentationRequest | null
  pendingOverlayPresentations: OverlayPresentationRequest[]
  activeNonOverlayPresentations: TimedPresentationRequest[]
  itemPopups: ExploreItemPopup[]
  equipmentModalNodeId: string | null
  seenEquipmentIds: string[]
  scanHintDismissed: boolean
}

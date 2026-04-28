import type {
  ArchiveSnapshot,
  ContentBundle,
  ProfileAggregate,
  RootSnapshot,
  SettingsRow,
} from "@magnolia/contracts"
import type { BattleRenderState, ExploreRenderState } from "@magnolia/game-session"
import type { MapViewModel } from "@magnolia/game-session"
import type { SlotSelectMode } from "@/app/app-types"
import type { OverlayPresentationRequest } from "@/app/explore-presentation"
import type { ExploreItemPopup } from "@/app/internal/explore-popups"

export type MagnoliaAppState = {
  ready: boolean
  errorMessage?: string
  snapshot: RootSnapshot | null
  content: ContentBundle | null
  profile: ProfileAggregate | null
  settings: SettingsRow | null
  exploreSnapshot: RootSnapshot["explore"] | null
  exploreRenderState: ExploreRenderState | null
  mapViewModel: MapViewModel | null
  battleRenderState: BattleRenderState | null
  archiveSnapshot: ArchiveSnapshot | null
  slotSelectMode: SlotSelectMode | null
  activeOverlayPresentation: OverlayPresentationRequest | null
  pendingOverlayPresentations: OverlayPresentationRequest[]
  itemPopups: ExploreItemPopup[]
  equipmentModalNodeId: string | null
  seenEquipmentIds: string[]
}

export const INITIAL_MAGNOLIA_APP_STATE: MagnoliaAppState = {
  ready: false,
  snapshot: null,
  content: null,
  profile: null,
  settings: null,
  exploreSnapshot: null,
  exploreRenderState: null,
  mapViewModel: null,
  battleRenderState: null,
  archiveSnapshot: null,
  slotSelectMode: null,
  activeOverlayPresentation: null,
  pendingOverlayPresentations: [],
  itemPopups: [],
  equipmentModalNodeId: null,
  seenEquipmentIds: [],
}

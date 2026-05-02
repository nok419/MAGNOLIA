import type {
  Dispatch,
  SetStateAction,
} from "react"
import type {
  ArchiveSnapshot,
  ContentBundle,
  ProfileAggregate,
  RootSnapshot,
  SettingsRow,
} from "@magnolia/contracts"
import type {
  BattleRenderState,
  ExploreRenderState,
  WorldMapViewModel,
} from "@magnolia/game-session"
import type { SlotSelectMode } from "@/app/app-types"
import type { WebPresentationState } from "@/app/presentation/presentation-state"
import type { ExploreItemPopup } from "@/app/popups/item-popups"

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
  presentation: WebPresentationState
  archiveSnapshot: ArchiveSnapshot | null
  slotSelectMode: SlotSelectMode | null
  itemPopups: ExploreItemPopup[]
  equipmentModalNodeId: string | null
  seenEquipmentIds: string[]
  equipmentGuideTargetId: string | null
}

export type MagnoliaAppStateSetter = Dispatch<SetStateAction<MagnoliaAppState>>

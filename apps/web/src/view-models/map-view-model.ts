import type {
  AreaId,
  ContentBundle,
  ExploreSnapshot,
  ProfileAggregate,
  TransmissionId,
  TransmissionProgressRow,
  WorldMapLogic,
} from "@magnolia/contracts"
import {
  computeAreaCompletionRate,
  readTransmissionCompletionState,
  type ExploreRenderState,
  type Rect,
} from "@magnolia/game-session"

export type MapAreaViewItem = {
  areaId: AreaId
  name: string
  completionRate: number
  bounds: Rect
  nodePosition: { x: number; y: number }
}

export type MapTransmissionViewItem = {
  areaId: AreaId
  transmissionId: TransmissionId
  displayTitle: string
  displaySender: string
  displayRecipient: string
  restorationRate: number
  state: ReturnType<typeof readTransmissionCompletionState>
  position: { x: number; y: number }
}

export type MapCollectibleViewItem = {
  nodeId: string
  collectibleKind: "selfRepairPoints" | "hiddenEquipment"
  position: { x: number; y: number }
}

export type MapViewModel = {
  worldBounds: Rect
  fogBitmap: string
  playerPosition: { x: number; y: number }
  playerFacing: { x: number; y: number }
  visionRadius: number
  currentAreaId?: AreaId
  areas: MapAreaViewItem[]
  transmissions: MapTransmissionViewItem[]
  collectibles: MapCollectibleViewItem[]
}

export function buildMapViewModel(input: {
  content: ContentBundle
  profile: ProfileAggregate
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
}): MapViewModel {
  const mapLogic = resolveWorldMapLogic(input.content)
  const transmissionProgressById = toProgressRecord(input.profile.transmissionProgress)
  const visibleAreaIds = new Set(input.snapshot.featureAccess.visibleAreaIds)
  const accessibleTransmissionIds = new Set(input.snapshot.featureAccess.accessibleTransmissionIds)
  const visibleCollectibleNodeIds = new Set(input.snapshot.map.visibleCollectibleNodeIds)

  const areas = input.snapshot.featureAccess.visibleAreaIds
    .map((areaId) => input.content.areas[areaId])
    .filter(Boolean)
    .map((area) => ({
      areaId: area.areaId,
      name: area.name,
      completionRate: computeAreaCompletionRate({
        area,
        transmissionProgress: transmissionProgressById,
      }),
      bounds: computeAreaBounds(mapLogic, input.content, area.areaId),
      nodePosition:
        mapLogic.areaNodes.find((node) => node.areaId === area.areaId) ??
        area.worldPosition,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))

  const transmissions = mapLogic.transmissionNodes
    .filter((node) => accessibleTransmissionIds.has(node.transmissionId))
    .map((node) => {
      const transmission = input.content.transmissions[node.transmissionId]
      const progress = transmissionProgressById[node.transmissionId]
      return {
        areaId: node.areaId,
        transmissionId: node.transmissionId,
        displayTitle: progress?.metadataUnlocked.title ? transmission.title : "???",
        displaySender: progress?.metadataUnlocked.sender ? transmission.sender : "???",
        displayRecipient: progress?.metadataUnlocked.recipient ? transmission.recipient : "???",
        restorationRate: progress?.archiveRestorationRate ?? 0,
        state: readTransmissionCompletionState(progress),
        position: { x: node.x, y: node.y },
      }
    })

  const collectibles = mapLogic.collectibleNodes
    .filter((node) => visibleCollectibleNodeIds.has(node.nodeId))
    .map((node) => ({
      nodeId: node.nodeId,
      collectibleKind: node.collectibleKind,
      position: { x: node.x, y: node.y },
    }))

  return {
    worldBounds: input.renderState.worldBounds,
    fogBitmap: input.snapshot.map.fogBitmap,
    playerPosition: input.snapshot.playerPosition,
    playerFacing: input.renderState.playerFacing,
    visionRadius: input.renderState.visionRadius,
    currentAreaId: input.snapshot.hud.currentAreaId,
    areas: areas.filter((area) => visibleAreaIds.has(area.areaId)),
    transmissions,
    collectibles,
  }
}

function resolveWorldMapLogic(content: ContentBundle): WorldMapLogic {
  const firstMapId = Object.keys(content.mapLogic)[0]
  return content.mapLogic[firstMapId]
}

function computeAreaBounds(content: WorldMapLogic, bundle: ContentBundle, areaId: AreaId): Rect {
  const worldPosition = bundle.areas[areaId]?.worldPosition ?? { x: 0, y: 0 }
  const points = [
    worldPosition,
    ...content.areaNodes.filter((node) => node.areaId === areaId),
    ...content.transmissionNodes.filter((node) => node.areaId === areaId),
    ...content.collectibleNodes.filter((node) => node.areaId === areaId),
    ...content.warpNodes.filter((node) => node.areaId === areaId),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    x: minX - 40,
    y: minY - 40,
    width: Math.max(160, maxX - minX + 80),
    height: Math.max(160, maxY - minY + 80),
  }
}

function toProgressRecord(progressRows: ProfileAggregate["transmissionProgress"]) {
  return Object.fromEntries(progressRows.map((row) => [row.transmissionId, row])) as Record<
    TransmissionId,
    TransmissionProgressRow
  >
}

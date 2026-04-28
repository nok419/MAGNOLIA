import type {
  AreaId,
  ContentBundle,
  ExploreSnapshot,
  ProfileAggregate,
  TransmissionId,
  WorldMapNodeId,
} from "@magnolia/contracts"
import {
  computeAreaCompletionRate,
  readTransmissionCompletionState,
  type TransmissionCompletionState,
} from "./progression"
import type { ExploreRenderState, Rect } from "./runtime-types"

export type MapViewModel = {
  canvasPixelRatio: number
  reduceMotion: boolean
  initialSelectedAreaId?: AreaId
  fogBitmap: string
  worldBounds: Rect
  playerPosition: { x: number; y: number }
  playerFacing: { x: number; y: number }
  visionRadius: number
  visibleAreas: MapAreaViewModel[]
  areasById: Record<AreaId, MapAreaViewModel>
  areaNodes: MapAreaNodeViewModel[]
  collectibleNodes: MapCollectibleNodeViewModel[]
  transmissionNodes: MapTransmissionNodeViewModel[]
  transmissionsById: Record<TransmissionId, MapTransmissionViewModel>
}

export type MapAreaViewModel = {
  areaId: AreaId
  name: string
  completionPercent: number
  bounds: Rect
}

export type MapAreaNodeViewModel = {
  areaId: AreaId
  x: number
  y: number
}

export type MapCollectibleNodeViewModel = {
  nodeId: WorldMapNodeId
  x: number
  y: number
  areaId: AreaId
  collectibleKind: "selfRepairPoints" | "hiddenEquipment"
}

export type MapTransmissionNodeViewModel = {
  nodeId: WorldMapNodeId
  x: number
  y: number
  areaId: AreaId
  transmissionId: TransmissionId
  state: TransmissionCompletionState
}

export type MapTransmissionViewModel = {
  transmissionId: TransmissionId
  areaId: AreaId
  titleLabel: string
  senderLabel: string
  recipientLabel: string
  restorationPercent: number
}

export function createMapViewModel(input: {
  content: ContentBundle
  profile: ProfileAggregate
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  displayOptions: {
    canvasPixelRatio: number
    reduceMotion: boolean
  }
}): MapViewModel {
  const mapLogic = resolveWorldMapLogic(input.content)
  const transmissionProgressById = toProgressRecord(input.profile.transmissionProgress)
  const visibleAreaIds = new Set(input.snapshot.featureAccess.visibleAreaIds)
  const visibleTransmissionNodeIds = new Set(input.snapshot.map.visibleTransmissionNodeIds)
  const visibleCollectibleNodeIds = new Set(input.snapshot.map.visibleCollectibleNodeIds)

  const visibleAreas = input.snapshot.featureAccess.visibleAreaIds
    .map((areaId) => input.content.areas[areaId])
    .filter((area): area is NonNullable<typeof area> => Boolean(area))
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))
    .map((area) => ({
      areaId: area.areaId,
      name: area.name,
      completionPercent: Math.round(
        computeAreaCompletionRate({
          area,
          transmissionProgress: transmissionProgressById,
        }) * 100,
      ),
      bounds: computeAreaBounds(mapLogic, input.content, area.areaId),
    }))

  const areasById = Object.fromEntries(
    visibleAreas.map((area) => [area.areaId, area]),
  ) as Record<AreaId, MapAreaViewModel>

  const transmissionsById = Object.fromEntries(
    input.snapshot.map.visibleTransmissionNodeIds
      .map((nodeId) => mapLogic.transmissionNodes.find((node) => node.nodeId === nodeId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => {
        const transmission = input.content.transmissions[node.transmissionId]
        const progress = transmissionProgressById[node.transmissionId]
        return [
          node.transmissionId,
          {
            transmissionId: node.transmissionId,
            areaId: node.areaId,
            titleLabel: progress?.metadataUnlocked.title ? transmission?.title ?? "???" : "???",
            senderLabel: progress?.metadataUnlocked.sender ? transmission?.sender ?? "???" : "???",
            recipientLabel: progress?.metadataUnlocked.recipient
              ? transmission?.recipient ?? "???"
              : "???",
            restorationPercent: Math.round((progress?.archiveRestorationRate ?? 0) * 100),
          },
        ]
      }),
  ) as Record<TransmissionId, MapTransmissionViewModel>

  return {
    canvasPixelRatio: input.displayOptions.canvasPixelRatio,
    reduceMotion: input.displayOptions.reduceMotion,
    initialSelectedAreaId: input.snapshot.hud.currentAreaId,
    fogBitmap: input.snapshot.map.fogBitmap,
    worldBounds: input.renderState.worldBounds,
    playerPosition: input.snapshot.playerPosition,
    playerFacing: input.renderState.playerFacing,
    visionRadius: input.renderState.visionRadius,
    visibleAreas,
    areasById,
    transmissionsById,
    areaNodes: mapLogic.areaNodes
      .filter((node) => visibleAreaIds.has(node.areaId))
      .map((node) => ({
        areaId: node.areaId,
        x: node.x,
        y: node.y,
      })),
    collectibleNodes: mapLogic.collectibleNodes
      .filter((node) => visibleCollectibleNodeIds.has(node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        areaId: node.areaId,
        collectibleKind: node.collectibleKind,
      })),
    transmissionNodes: mapLogic.transmissionNodes
      // 未識別通信は正確な座標を map に出さず、session selector 済みの node だけを渡します。
      .filter((node) => visibleTransmissionNodeIds.has(node.nodeId))
      .map((node) => ({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        areaId: node.areaId,
        transmissionId: node.transmissionId,
        state: readTransmissionCompletionState(transmissionProgressById[node.transmissionId]),
      })),
  }
}

function resolveWorldMapLogic(content: ContentBundle) {
  const firstMapId = Object.keys(content.mapLogic)[0]
  return content.mapLogic[firstMapId]
}

function computeAreaBounds(
  mapLogic: ReturnType<typeof resolveWorldMapLogic>,
  bundle: ContentBundle,
  areaId: AreaId,
): Rect {
  const worldPosition = bundle.areas[areaId]?.worldPosition ?? { x: 0, y: 0 }
  const points = [
    worldPosition,
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
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
  return Object.fromEntries(progressRows.map((row) => [row.transmissionId, row]))
}

import {
  DEFAULT_EXPLORE_REVEAL_ASPECT,
  DEFAULT_EXPLORE_VIEWPORT_HEIGHT,
} from "@magnolia/contracts"
import type {
  AreaId,
  AreaMaster,
  AreaProgressRow,
  ContentBundle,
  FeatureAccessState,
  ProfileRow,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
  Vector2,
  WorldMapLogic,
} from "@magnolia/contracts"
import { isTransmissionIncomplete } from "./progression"
import type { Rect } from "./runtime-types"

const WORLD_CELL_SIZE = 20
// world map の拡張後も探索履歴を保持できるよう、reveal bitmap の範囲を広げます。
// 旧サイズは area2 以降の座標を十分に覆っておらず、探索済みセルが保存されませんでした。
const WORLD_BITMAP_WIDTH = 128
const WORLD_BITMAP_HEIGHT = 80
const WORLD_BITMAP_ORIGIN_X = -640
const WORLD_BITMAP_ORIGIN_Y = -520

type ExploreFeatureAccess = Pick<
  FeatureAccessState,
  "accessibleTransmissionIds" | "mapVisionUnlocked"
>

export function createEmptyBitmap(): string {
  return Array.from({ length: WORLD_BITMAP_HEIGHT }, () => "0".repeat(WORLD_BITMAP_WIDTH)).join("|")
}

export function mergeRevealBitmaps(rows: AreaProgressRow[]): string {
  const merged = Array.from({ length: WORLD_BITMAP_HEIGHT }, () =>
    Array.from({ length: WORLD_BITMAP_WIDTH }, () => "0"),
  )
  for (const row of rows) {
    normalizeBitmapRows(row.revealBitmap).forEach((line, y) => {
      line.split("").forEach((cell, x) => {
        if (cell === "1") {
          merged[y][x] = "1"
        }
      })
    })
  }
  return merged.map((line) => line.join("")).join("|")
}

export function revealAroundPosition(bitmap: string, position: Vector2, radius = 1): string {
  const rows = normalizeBitmapRows(bitmap).map((row) => row.split(""))
  const cell = worldToBitmapCell(position)
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const targetX = cell.x + dx
      const targetY = cell.y + dy
      if (targetX < 0 || targetY < 0 || targetX >= WORLD_BITMAP_WIDTH || targetY >= WORLD_BITMAP_HEIGHT) {
        continue
      }
      rows[targetY][targetX] = "1"
    }
  }
  return rows.map((row) => row.join("")).join("|")
}

export function revealViewportArea(
  bitmap: string,
  viewport: Rect,
): string {
  const rows = normalizeBitmapRows(bitmap).map((row) => row.split(""))
  const topLeft = worldToBitmapCell({ x: viewport.x, y: viewport.y })
  const bottomRight = worldToBitmapCell({
    x: viewport.x + viewport.width,
    y: viewport.y + viewport.height,
  })

  for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
    for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
      rows[y][x] = "1"
    }
  }

  return revealAroundPosition(
    rows.map((row) => row.join("")).join("|"),
    {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    },
    1,
  )
}

export function createExploreRevealViewport(playerPosition: Vector2): Rect {
  return {
    x: playerPosition.x - (DEFAULT_EXPLORE_VIEWPORT_HEIGHT * DEFAULT_EXPLORE_REVEAL_ASPECT) / 2,
    y: playerPosition.y - DEFAULT_EXPLORE_VIEWPORT_HEIGHT / 2,
    width: DEFAULT_EXPLORE_VIEWPORT_HEIGHT * DEFAULT_EXPLORE_REVEAL_ASPECT,
    height: DEFAULT_EXPLORE_VIEWPORT_HEIGHT,
  }
}

function worldToBitmapCell(position: Vector2): { x: number; y: number } {
  return {
    x: Math.max(
      0,
      Math.min(
        WORLD_BITMAP_WIDTH - 1,
        Math.floor((position.x - WORLD_BITMAP_ORIGIN_X) / WORLD_CELL_SIZE),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        WORLD_BITMAP_HEIGHT - 1,
        Math.floor((position.y - WORLD_BITMAP_ORIGIN_Y) / WORLD_CELL_SIZE),
      ),
    ),
  }
}

function normalizeBitmapRows(bitmap: string): string[] {
  const sourceRows = bitmap
    .split("|")
    .map((row) => row.trim())
    .filter(Boolean)

  return Array.from({ length: WORLD_BITMAP_HEIGHT }, (_, y) => {
    const sourceRow = sourceRows[y] ?? ""
    if (sourceRow.length >= WORLD_BITMAP_WIDTH) {
      return sourceRow.slice(0, WORLD_BITMAP_WIDTH)
    }
    return sourceRow.padEnd(WORLD_BITMAP_WIDTH, "0")
  })
}

export function computeRevealCompletionRate(bitmap: string): number {
  const cells = bitmap.replaceAll("|", "")
  const revealed = cells.split("").filter((cell) => cell === "1").length
  return cells.length === 0 ? 0 : revealed / cells.length
}

export function computeWorldBounds(mapLogic: WorldMapLogic): Rect {
  const allNodes = [
    ...mapLogic.areaNodes,
    ...mapLogic.transmissionNodes,
    ...mapLogic.warpNodes,
    ...mapLogic.collectibleNodes,
  ]
  const xs = allNodes.map((node) => node.x)
  const ys = allNodes.map((node) => node.y)
  const minX = Math.min(...xs) - 180
  const maxX = Math.max(...xs) + 180
  const minY = Math.min(...ys) - 180
  const maxY = Math.max(...ys) + 180
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function computeAreaBounds(mapLogic: WorldMapLogic, areaId: AreaId, fallback: Rect): Rect {
  const relatedNodes = [
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    // 行動制限は「現在エリアに属するノード」だけで決め、遷移先側のワープ入口では広げません。
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
  ]
  if (relatedNodes.length === 0) {
    return fallback
  }
  const xs = relatedNodes.map((node) => node.x)
  const ys = relatedNodes.map((node) => node.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  if (areaId === "area_central_tower") {
    // MAGNOLIA 入手前の制限エリアは、初期通信と初期アイテムを収めつつ、
    // 視界半径の拡張後でも窮屈になりすぎないサイズへ固定します。
    const areaNode = mapLogic.areaNodes.find((node) => node.areaId === areaId)
    const baseCenterX = areaNode?.x ?? centerX
    const baseCenterY = areaNode?.y ?? centerY
    return clampRectInsideBounds(
      {
        x: baseCenterX - 380,
        y: baseCenterY - 380,
        width: 760,
        height: 760,
      },
      fallback,
    )
  }

  // 初期制限境界は正方形とし、解除演出でも同じ矩形を使います。
  // world の外へはみ出すと camera clamp と境界描画の基準がずれるため、最後に bounds 内へ収めます。
  const paddingX = 180
  const paddingY = 150
  const halfSize = Math.max(
    (maxX - minX) / 2 + paddingX,
    (maxY - minY) / 2 + paddingY,
  )
  return clampRectInsideBounds(
    {
      x: centerX - halfSize,
      y: centerY - halfSize,
      width: halfSize * 2,
      height: halfSize * 2,
    },
    fallback,
  )
}

function computeAreaContextBounds(
  mapLogic: WorldMapLogic,
  areaId: AreaId,
): Rect | null {
  const relatedNodes = [
    ...mapLogic.areaNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.transmissionNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.warpNodes.filter((node) => node.areaId === areaId),
    ...mapLogic.collectibleNodes.filter((node) => node.areaId === areaId),
  ]
  if (relatedNodes.length === 0) {
    return null
  }

  const xs = relatedNodes.map((node) => node.x)
  const ys = relatedNodes.map((node) => node.y)
  const paddingX = 120
  const paddingY = 110

  return {
    x: Math.min(...xs) - paddingX,
    y: Math.min(...ys) - paddingY,
    width: Math.max(...xs) - Math.min(...xs) + paddingX * 2,
    height: Math.max(...ys) - Math.min(...ys) + paddingY * 2,
  }
}

function clampRectInsideBounds(rect: Rect, bounds: Rect): Rect {
  if (rect.width >= bounds.width || rect.height >= bounds.height) {
    return { ...bounds }
  }

  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - rect.width, rect.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - rect.height, rect.y)),
    width: rect.width,
    height: rect.height,
  }
}

function isPointInsideRect(point: Vector2, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function clampToRect(position: Vector2, rect: Rect): Vector2 {
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.width, position.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.height, position.y)),
  }
}

export function normalizeVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  if (length <= 0.001) {
    return { x: 0, y: 0 }
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

export function detectCurrentAreaId(
  mapLogic: WorldMapLogic,
  areas: Record<AreaId, AreaMaster>,
  playerPosition: Vector2,
  fallbackAreaId: AreaId,
): AreaId {
  const nearestArea = mapLogic.areaNodes
    .map((node) => ({
      areaId: node.areaId,
      distance: Math.hypot(node.x - playerPosition.x, node.y - playerPosition.y),
    }))
    .sort((left, right) => left.distance - right.distance)[0]
  return nearestArea && areas[nearestArea.areaId] ? nearestArea.areaId : fallbackAreaId
}

export function readDisplayArea(input: {
  mapLogic: WorldMapLogic
  areas: Record<AreaId, AreaMaster>
  playerPosition: Vector2
}): AreaMaster | undefined {
  const candidates = Object.values(input.areas)
    .map((area) => ({
      area,
      bounds: computeAreaContextBounds(input.mapLogic, area.areaId),
    }))
    .filter(
      (entry): entry is { area: AreaMaster; bounds: Rect } => entry.bounds !== null,
    )
    .filter(
      (entry) => isPointInsideRect(input.playerPosition, entry.bounds),
    )
    .sort(
      (left, right) =>
        Math.hypot(
          left.area.worldPosition.x - input.playerPosition.x,
          left.area.worldPosition.y - input.playerPosition.y,
        ) -
        Math.hypot(
          right.area.worldPosition.x - input.playerPosition.x,
          right.area.worldPosition.y - input.playerPosition.y,
        ),
    )

  return candidates[0]?.area
}

export function readExploreMoveSpeed(
  content: ContentBundle,
  featureAccess: ExploreFeatureAccess,
  dashPressed: boolean,
): number {
  if (dashPressed && featureAccess.mapVisionUnlocked) {
    return content.playerShipSpec.exploreDashSpeed
  }
  return content.playerShipSpec.baseExploreSpeed
}

export function computeNearestTransmissionStrength(input: {
  playerPosition: Vector2
  mapLogic: WorldMapLogic
  featureAccess: ExploreFeatureAccess
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): number {
  const candidates = input.mapLogic.transmissionNodes
    .filter((node) => input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId))
    // 下段の強度計は「まだ発見していない通信」だけに反応させます。
    // 既に接続履歴がある通信は、未クリアでも波形側だけで距離反応を残します。
    .filter((node) => !input.transmissionProgress[node.transmissionId])
  if (candidates.length === 0) {
    return 0
  }
  const nearestDistance = Math.min(
    ...candidates.map((node) => Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)),
  )
  return clamp01(1 - nearestDistance / 300)
}

/**
 * 全てのアクセス可能な通信ノード（クリア済みを含む）に対する近接度。
 * 波形表示用。強度バー（新規ミッション用）とは異なり、
 * 既に完了したミッションの通信にも反応する。
 */
export function computeNearestAnyTransmissionStrength(input: {
  playerPosition: Vector2
  mapLogic: WorldMapLogic
  featureAccess: ExploreFeatureAccess
}): number {
  const candidates = input.mapLogic.transmissionNodes
    .filter((node) => input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId))
  if (candidates.length === 0) {
    return 0
  }
  const nearestDistance = Math.min(
    ...candidates.map((node) => Math.hypot(node.x - input.playerPosition.x, node.y - input.playerPosition.y)),
  )
  return clamp01(1 - nearestDistance / 300)
}

export function computeCompassTargetAreaId(input: {
  profile: ProfileRow
  areas: Record<AreaId, AreaMaster>
  transmissions: Record<TransmissionId, TransmissionMaster>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): AreaId | undefined {
  const unfinishedAreas = Object.values(input.areas).filter((area) =>
    area.transmissionIds.some(
      (transmissionId) => isTransmissionIncomplete(input.transmissionProgress[transmissionId]),
    ),
  )
  if (unfinishedAreas.length === 0) {
    return undefined
  }
  return unfinishedAreas
    .sort(
      (left, right) =>
        Math.hypot(
          left.worldPosition.x - input.profile.playerPosition.x,
          left.worldPosition.y - input.profile.playerPosition.y,
        ) -
        Math.hypot(
          right.worldPosition.x - input.profile.playerPosition.x,
          right.worldPosition.y - input.profile.playerPosition.y,
        ),
    )[0]
    ?.areaId
}

export function findNearbyNode<T extends { x: number; y: number; interactionRadius: number }>(
  nodes: T[],
  playerPosition: Vector2,
): T | undefined {
  return nodes.find((node) =>
    isWithinRadius(playerPosition, { x: node.x, y: node.y }, node.interactionRadius),
  )
}

export function isWithinRadius(position: Vector2, target: Vector2, radius: number): boolean {
  return Math.hypot(position.x - target.x, position.y - target.y) <= radius
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

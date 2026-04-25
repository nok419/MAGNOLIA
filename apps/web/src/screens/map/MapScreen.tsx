import { useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
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
} from "@magnolia/game-session"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import { ActionButton } from "@/components/ActionButton"

type MapScreenProps = {
  content: ContentBundle
  profile: ProfileAggregate
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  onBack: () => void
  onWarpToArea: (areaId: AreaId) => void
  onOpenArchive: (areaId: AreaId, transmissionId: TransmissionId) => void
}

type HitTarget =
  | { type: "area"; areaId: AreaId; x: number; y: number; radius: number }
  | { type: "transmission"; areaId: AreaId; transmissionId: TransmissionId; x: number; y: number; radius: number }

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export function MapScreen({
  content,
  profile,
  snapshot,
  renderState,
  onBack,
  onWarpToArea,
  onOpenArchive,
}: MapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hitTargetsRef = useRef<HitTarget[]>([])

  const mapLogic = useMemo(() => resolveWorldMapLogic(content), [content])
  const transmissionProgressById = useMemo(
    () => toProgressRecord(profile.transmissionProgress),
    [profile.transmissionProgress],
  )

  const visibleAreas = useMemo(
    () =>
      snapshot.featureAccess.visibleAreaIds
        .map((areaId) => content.areas[areaId])
        .filter(Boolean)
        .sort((left, right) => left.name.localeCompare(right.name, "ja")),
    [content.areas, snapshot.featureAccess.visibleAreaIds],
  )

  const [selectedAreaId, setSelectedAreaId] = useState<AreaId | undefined>(
    snapshot.hud.currentAreaId,
  )
  const [selectedTransmissionId, setSelectedTransmissionId] = useState<TransmissionId | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!selectedAreaId || !visibleAreas.some((area) => area.areaId === selectedAreaId)) {
      setSelectedAreaId(snapshot.hud.currentAreaId)
    }
  }, [selectedAreaId, snapshot.hud.currentAreaId, visibleAreas])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        sizeRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        }
      }
    })

    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [])

  const selectedTransmission = selectedTransmissionId
    ? content.transmissions[selectedTransmissionId]
    : undefined
  const selectedTransmissionProgress = selectedTransmissionId
    ? transmissionProgressById[selectedTransmissionId]
    : undefined
  const focusBounds = useMemo(
    () =>
      selectedAreaId
        ? expandRect(computeAreaBounds(mapLogic, content, selectedAreaId), 120)
        : expandRect(renderState.worldBounds, 60),
    [content, mapLogic, renderState.worldBounds, selectedAreaId],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    let frameId = 0
    let running = true

    // map 上のアイコンは設計チームが動きを足しやすいように、描画ループをここで維持します。
    const drawFrame = (timeMs: number) => {
      if (!running) {
        return
      }

      const width = Math.max(320, sizeRef.current.width || canvas.clientWidth || 640)
      const height = Math.max(320, sizeRef.current.height || canvas.clientHeight || 640)
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      drawMapCanvas({
        ctx,
        width,
        height,
        timeMs,
        focusBounds,
        snapshot,
        renderState,
        content,
        mapLogic,
        selectedAreaId,
        selectedTransmissionId,
        hitTargetsRef,
        transmissionProgressById,
      })

      frameId = window.requestAnimationFrame(drawFrame)
    }

    frameId = window.requestAnimationFrame(drawFrame)
    return () => {
      running = false
      window.cancelAnimationFrame(frameId)
    }
  }, [
    content,
    focusBounds,
    mapLogic,
    renderState,
    selectedAreaId,
    selectedTransmissionId,
    snapshot,
    transmissionProgressById,
  ])

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const target = hitTargetsRef.current
      .filter((candidate) => Math.hypot(candidate.x - x, candidate.y - y) <= candidate.radius)
      .sort(
        (left, right) =>
          Math.hypot(left.x - x, left.y - y) - Math.hypot(right.x - x, right.y - y),
      )[0]

    if (!target) {
      setSelectedTransmissionId(undefined)
      return
    }

    if (target.type === "area") {
      setSelectedAreaId(target.areaId)
      setSelectedTransmissionId(undefined)
      return
    }

    setSelectedAreaId(target.areaId)
    setSelectedTransmissionId(target.transmissionId)
  }

  return (
    <main className="map-screen">
      <aside className="map-screen__list">
        <div className="map-screen__header">
          <p className="screen-shell__eyebrow">world map</p>
          <h1 className="screen-shell__title">map</h1>
          <p className="screen-shell__subtitle">
            `M` または `Escape` で閉じます。エリアを選ぶと右側の表示がその周辺に寄ります。
          </p>
        </div>

        <div className="map-screen__area-list">
          {visibleAreas.map((area) => {
            const completion = Math.round(
              computeAreaCompletionRate({
                area,
                transmissionProgress: transmissionProgressById,
              }) * 100,
            )
            const isSelected = area.areaId === selectedAreaId
            return (
              <button
                key={area.areaId}
                type="button"
                className={`map-screen__area-button ${isSelected ? "map-screen__area-button--active" : ""}`}
                onClick={() => {
                  setSelectedAreaId(area.areaId)
                  setSelectedTransmissionId(undefined)
                }}
              >
                <span>{area.name}</span>
                <span>{completion}%</span>
              </button>
            )
          })}
        </div>

        <div className="map-screen__actions">
          <ActionButton tone="ghost" onClick={onBack}>
            2dマップへ戻る
          </ActionButton>
        </div>
      </aside>

      <section className="map-screen__viewer">
        <canvas
          ref={canvasRef}
          className="map-screen__canvas"
          onClick={handleCanvasClick}
        />

        <section className="map-screen__info">
          {selectedTransmission ? (
            <>
              <p className="map-screen__info-eyebrow">transmission</p>
              <h2 className="map-screen__info-title">
                {selectedTransmissionProgress?.metadataUnlocked.title ? selectedTransmission.title : "???"}
              </h2>
              <p className="map-screen__info-text">
                発信者:
                {" "}
                {selectedTransmissionProgress?.metadataUnlocked.sender ? selectedTransmission.sender : "???"}
              </p>
              <p className="map-screen__info-text">
                宛先:
                {" "}
                {selectedTransmissionProgress?.metadataUnlocked.recipient ? selectedTransmission.recipient : "???"}
              </p>
              <p className="map-screen__info-text">
                復元率:
                {" "}
                {Math.round((selectedTransmissionProgress?.archiveRestorationRate ?? 0) * 100)}%
              </p>
              <div className="button-row">
                <ActionButton
                  onClick={() => onOpenArchive(selectedTransmission.areaId, selectedTransmission.transmissionId)}
                >
                  archive を開く
                </ActionButton>
                <ActionButton
                  tone="ghost"
                  onClick={() => onWarpToArea(selectedTransmission.areaId)}
                >
                  移動
                </ActionButton>
              </div>
            </>
          ) : selectedAreaId ? (
            <>
              <p className="map-screen__info-eyebrow">area</p>
              <h2 className="map-screen__info-title">{content.areas[selectedAreaId]?.name ?? "unknown area"}</h2>
              <p className="map-screen__info-text">
                解放率:
                {" "}
                {Math.round(
                  computeAreaCompletionRate({
                    area: content.areas[selectedAreaId],
                    transmissionProgress: transmissionProgressById,
                  }) * 100,
                )}%
              </p>
              <div className="button-row">
                <ActionButton tone="ghost" onClick={() => onWarpToArea(selectedAreaId)}>
                  移動
                </ActionButton>
              </div>
            </>
          ) : (
            <>
              <p className="map-screen__info-eyebrow">selection</p>
              <h2 className="map-screen__info-title">no target</h2>
              <p className="map-screen__info-text">
                左のエリア一覧、または右のマップ上の通信を選択してください。
              </p>
            </>
          )}
        </section>
      </section>
    </main>
  )
}

function drawMapCanvas(input: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  timeMs: number
  focusBounds: Rect
  snapshot: ExploreSnapshot
  renderState: ExploreRenderState
  content: ContentBundle
  mapLogic: WorldMapLogic
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  hitTargetsRef: MutableRefObject<HitTarget[]>
  transmissionProgressById: Record<TransmissionId, TransmissionProgressRow>
}) {
  const { ctx, width, height } = input
  const padding = 18
  const hitTargets: HitTarget[] = []

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, "#08111f")
  gradient.addColorStop(1, "#040810")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  drawMapFog(ctx, input.snapshot.map.fogBitmap, input.renderState.worldBounds, input.focusBounds, width, height, padding)
  drawMapGrid(ctx, input.focusBounds, width, height, padding)

  for (const areaNode of input.mapLogic.areaNodes) {
    if (!input.snapshot.featureAccess.visibleAreaIds.includes(areaNode.areaId)) {
      continue
    }
    const point = worldToCanvas(input.focusBounds, width, height, padding, areaNode.x, areaNode.y)
    const isSelected = areaNode.areaId === input.selectedAreaId
    drawAreaPoint(ctx, point.x, point.y, isSelected)
    hitTargets.push({
      type: "area",
      areaId: areaNode.areaId,
      x: point.x,
      y: point.y,
      radius: 16,
    })
  }

  for (const node of input.mapLogic.collectibleNodes) {
    if (!input.snapshot.map.visibleCollectibleNodeIds.includes(node.nodeId)) {
      continue
    }
    const point = worldToCanvas(input.focusBounds, width, height, padding, node.x, node.y)
    drawCollectibleMarker(ctx, {
      x: point.x,
      y: point.y,
      size: node.collectibleKind === "hiddenEquipment" ? 12 : 10,
      kind: node.collectibleKind,
      timeMs: input.timeMs,
      variant: "map",
    })
  }

  for (const node of input.mapLogic.transmissionNodes) {
    // 全体マップは探索中の視界ではなく、到達済み・接続可能な通信を一覧する画面です。
    // ここで fog 基準にすると、実装済みの通信が map 上で欠けて見えやすくなります。
    if (!input.snapshot.featureAccess.accessibleTransmissionIds.includes(node.transmissionId)) {
      continue
    }
    const point = worldToCanvas(input.focusBounds, width, height, padding, node.x, node.y)
    const state = readTransmissionCompletionState(
      input.transmissionProgressById[node.transmissionId],
    )
    const isSelected = node.transmissionId === input.selectedTransmissionId
    drawTransmissionMarker(ctx, {
      x: point.x,
      y: point.y,
      size: isSelected ? 12 : 10,
      state,
      timeMs: input.timeMs,
      variant: "map",
      selected: isSelected,
    })
    hitTargets.push({
      type: "transmission",
      areaId: node.areaId,
      transmissionId: node.transmissionId,
      x: point.x,
      y: point.y,
      radius: 18,
    })
  }

  const playerPoint = worldToCanvas(
    input.focusBounds,
    width,
    height,
    padding,
    input.snapshot.playerPosition.x,
    input.snapshot.playerPosition.y,
  )
  drawPlayerPoint(ctx, playerPoint.x, playerPoint.y)

  input.hitTargetsRef.current = hitTargets
}

function drawMapFog(
  ctx: CanvasRenderingContext2D,
  fogBitmap: string,
  worldBounds: Rect,
  focusBounds: Rect,
  width: number,
  height: number,
  padding: number,
) {
  const rows = fogBitmap.split("|")
  const bitmapHeight = rows.length
  const bitmapWidth = rows[0]?.length ?? 0
  if (bitmapHeight === 0 || bitmapWidth === 0) {
    return
  }

  const cellWidth = worldBounds.width / bitmapWidth
  const cellHeight = worldBounds.height / bitmapHeight

  ctx.save()
  for (let y = 0; y < bitmapHeight; y += 1) {
    for (let x = 0; x < bitmapWidth; x += 1) {
      if (rows[y]?.[x] === "1") {
        continue
      }
      const worldX = worldBounds.x + x * cellWidth
      const worldY = worldBounds.y + y * cellHeight
      const topLeft = worldToCanvas(focusBounds, width, height, padding, worldX, worldY)
      const bottomRight = worldToCanvas(
        focusBounds,
        width,
        height,
        padding,
        worldX + cellWidth,
        worldY + cellHeight,
      )
      ctx.fillStyle = "rgba(2, 6, 12, 0.78)"
      ctx.fillRect(
        topLeft.x,
        topLeft.y,
        Math.max(1, bottomRight.x - topLeft.x),
        Math.max(1, bottomRight.y - topLeft.y),
      )
    }
  }
  ctx.restore()
}

function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  focusBounds: Rect,
  width: number,
  height: number,
  padding: number,
) {
  ctx.save()
  ctx.strokeStyle = "rgba(93, 164, 209, 0.08)"
  ctx.lineWidth = 1
  const step = 80
  const startX = Math.floor(focusBounds.x / step) * step
  const endX = focusBounds.x + focusBounds.width
  const startY = Math.floor(focusBounds.y / step) * step
  const endY = focusBounds.y + focusBounds.height

  for (let x = startX; x <= endX; x += step) {
    const from = worldToCanvas(focusBounds, width, height, padding, x, startY)
    const to = worldToCanvas(focusBounds, width, height, padding, x, endY)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  for (let y = startY; y <= endY; y += step) {
    const from = worldToCanvas(focusBounds, width, height, padding, startX, y)
    const to = worldToCanvas(focusBounds, width, height, padding, endX, y)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawAreaPoint(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean) {
  ctx.save()
  ctx.strokeStyle = selected ? "#f7fbff" : "#5da4d1"
  ctx.fillStyle = selected ? "rgba(247, 251, 255, 0.12)" : "rgba(93, 164, 209, 0.10)"
  ctx.lineWidth = selected ? 2.6 : 1.4
  ctx.beginPath()
  ctx.arc(x, y, selected ? 12 : 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawPlayerPoint(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.fillStyle = "#f7fbff"
  ctx.strokeStyle = "#5da4d1"
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x, y - 10)
  ctx.lineTo(x + 8, y + 8)
  ctx.lineTo(x, y + 4)
  ctx.lineTo(x - 8, y + 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
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

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function worldToCanvas(bounds: Rect, width: number, height: number, padding: number, wx: number, wy: number) {
  const rx = (wx - bounds.x) / Math.max(1, bounds.width)
  const ry = (wy - bounds.y) / Math.max(1, bounds.height)
  return {
    x: padding + rx * (width - padding * 2),
    y: padding + ry * (height - padding * 2),
  }
}

function toProgressRecord(progressRows: ProfileAggregate["transmissionProgress"]) {
  return Object.fromEntries(progressRows.map((row) => [row.transmissionId, row]))
}

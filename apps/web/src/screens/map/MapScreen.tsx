import { useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import type {
  AreaId,
  TransmissionId,
} from "@magnolia/contracts"
import {
  type Rect,
  type WorldMapViewModel,
} from "@magnolia/game-session"
import {
  drawCollectibleMarker,
  drawTransmissionMarker,
} from "@/app/canvas-markers"
import type { DisplayOptions } from "@/app/display-options"
import { ActionButton } from "@/components/ActionButton"
import { seededUnit } from "@/render/shared/canvas-math"
import { worldToCanvas } from "@/render/shared/coordinates"

type MapScreenProps = {
  viewModel: WorldMapViewModel
  displayOptions: DisplayOptions
  onBack: () => void
  onWarpToArea: (areaId: AreaId) => void
  onOpenArchive: (areaId: AreaId, transmissionId: TransmissionId) => void
}

type HitTarget =
  | { type: "area"; areaId: AreaId; x: number; y: number; radius: number }
  | { type: "transmission"; areaId: AreaId; transmissionId: TransmissionId; x: number; y: number; radius: number }

export function MapScreen({
  viewModel,
  displayOptions,
  onBack,
  onWarpToArea,
  onOpenArchive,
}: MapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hitTargetsRef = useRef<HitTarget[]>([])

  const [selectedAreaId, setSelectedAreaId] = useState<AreaId | undefined>(
    viewModel.currentAreaId,
  )
  const [selectedTransmissionId, setSelectedTransmissionId] = useState<TransmissionId | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!selectedAreaId || !viewModel.visibleAreas.some((area) => area.areaId === selectedAreaId)) {
      setSelectedAreaId(viewModel.currentAreaId)
    }
  }, [selectedAreaId, viewModel.currentAreaId, viewModel.visibleAreas])

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
    ? viewModel.visibleTransmissions.find(
      (transmission) => transmission.transmissionId === selectedTransmissionId,
    )
    : undefined
  const selectedArea = selectedAreaId
    ? viewModel.visibleAreas.find((area) => area.areaId === selectedAreaId)
    : undefined
  const focusBounds = useMemo(
    () =>
      selectedArea
        ? expandRect(selectedArea.bounds, 120)
        : expandRect(viewModel.worldBounds, 60),
    [selectedArea, viewModel.worldBounds],
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
      const dpr = displayOptions.canvasPixelRatio
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
        viewModel,
        selectedAreaId,
        selectedTransmissionId,
        hitTargetsRef,
      })

      frameId = window.requestAnimationFrame(drawFrame)
    }

    frameId = window.requestAnimationFrame(drawFrame)
    return () => {
      running = false
      window.cancelAnimationFrame(frameId)
    }
  }, [
    displayOptions,
    focusBounds,
    selectedAreaId,
    selectedTransmissionId,
    viewModel,
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
          {viewModel.visibleAreas.map((area) => {
            const completion = Math.round(area.completionRate * 100)
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
                {selectedTransmission.titleUnlocked ? selectedTransmission.title : "???"}
              </h2>
              <p className="map-screen__info-text">
                発信者:
                {" "}
                {selectedTransmission.senderUnlocked ? selectedTransmission.sender : "???"}
              </p>
              <p className="map-screen__info-text">
                宛先:
                {" "}
                {selectedTransmission.recipientUnlocked ? selectedTransmission.recipient : "???"}
              </p>
              <p className="map-screen__info-text">
                復元率:
                {" "}
                {Math.round(selectedTransmission.restorationRate * 100)}%
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
          ) : selectedArea ? (
            <>
              <p className="map-screen__info-eyebrow">area</p>
              <h2 className="map-screen__info-title">{selectedArea.name}</h2>
              <p className="map-screen__info-text">
                解放率:
                {" "}
                {Math.round(selectedArea.completionRate * 100)}%
              </p>
              <div className="button-row">
                <ActionButton tone="ghost" onClick={() => onWarpToArea(selectedArea.areaId)}>
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
  viewModel: WorldMapViewModel
  selectedAreaId?: AreaId
  selectedTransmissionId?: TransmissionId
  hitTargetsRef: MutableRefObject<HitTarget[]>
}) {
  const { ctx, width, height } = input
  const padding = 18
  const hitTargets: HitTarget[] = []

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, "#08111f")
  gradient.addColorStop(1, "#040810")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  drawMapAmbientNoise(ctx, width, height, input.timeMs)

  drawMapFog(ctx, input.viewModel.fogBitmap, input.viewModel.worldBounds, input.focusBounds, width, height, padding)
  drawMapGrid(ctx, input.focusBounds, width, height, padding)

  for (const area of input.viewModel.visibleAreas) {
    const point = worldToCanvas(input.focusBounds, width, height, padding, area.position.x, area.position.y)
    const isSelected = area.areaId === input.selectedAreaId
    drawAreaPoint(ctx, point.x, point.y, isSelected)
    hitTargets.push({
      type: "area",
      areaId: area.areaId,
      x: point.x,
      y: point.y,
      radius: 16,
    })
  }

  for (const node of input.viewModel.visibleCollectibles) {
    const point = worldToCanvas(input.focusBounds, width, height, padding, node.position.x, node.position.y)
    drawCollectibleMarker(ctx, {
      x: point.x,
      y: point.y,
      size: node.collectibleKind === "hiddenEquipment" ? 12 : 10,
      kind: node.collectibleKind,
      timeMs: input.timeMs,
      variant: "map",
    })
  }

  for (const node of input.viewModel.visibleTransmissions) {
    const point = worldToCanvas(input.focusBounds, width, height, padding, node.position.x, node.position.y)
    const isSelected = node.transmissionId === input.selectedTransmissionId
    drawTransmissionMarker(ctx, {
      x: point.x,
      y: point.y,
      size: isSelected ? 12 : 10,
      state: node.state,
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
    input.viewModel.playerPosition.x,
    input.viewModel.playerPosition.y,
  )
  const playerAngle =
    Math.atan2(input.viewModel.playerFacing.y, input.viewModel.playerFacing.x) + Math.PI / 2
  const visionRadiusPx =
    (input.viewModel.visionRadius / Math.max(1, input.focusBounds.width)) * (width - padding * 2)
  drawMapVisionWave(ctx, playerPoint.x, playerPoint.y, visionRadiusPx, input.timeMs)
  drawPlayerPoint(ctx, playerPoint.x, playerPoint.y, playerAngle, input.timeMs)

  input.hitTargetsRef.current = hitTargets
}

function drawMapAmbientNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
) {
  ctx.save()
  // 全体マップの平面感を減らすため、座標固定の微細な点を低不透明度で重ねる。
  const count = Math.max(90, Math.floor((width * height) / 9000))
  for (let i = 0; i < count; i += 1) {
    const seed = i * 97
    const x = seededUnit(seed + 1) * width
    const y = seededUnit(seed + 2) * height
    const twinkle = 0.62 + 0.38 * Math.sin(timeMs * 0.0012 + seed)
    const alpha = (0.018 + seededUnit(seed + 3) * 0.032) * twinkle
    ctx.fillStyle = `rgba(140, 195, 255, ${alpha.toFixed(3)})`
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

function drawMapVisionWave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  timeMs: number,
) {
  if (radius <= 1) {
    return
  }

  ctx.save()
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0016)
  const halo = ctx.createRadialGradient(x, y, radius * 0.66, x, y, radius * 1.08)
  halo.addColorStop(0, "rgba(93, 164, 209, 0)")
  halo.addColorStop(0.62, `rgba(140, 220, 255, ${(0.026 + pulse * 0.018).toFixed(3)})`)
  halo.addColorStop(1, "rgba(93, 164, 209, 0)")
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius * 1.08, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(150, 220, 255, ${(0.12 + pulse * 0.08).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
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

function drawPlayerPoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  timeMs: number,
) {
  const pulse = 0.7 + 0.3 * Math.sin(timeMs * 0.004)
  ctx.save()
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 22)
  glow.addColorStop(0, `rgba(247, 251, 255, ${(0.2 * pulse).toFixed(3)})`)
  glow.addColorStop(0.45, `rgba(93, 164, 209, ${(0.12 * pulse).toFixed(3)})`)
  glow.addColorStop(1, "rgba(93, 164, 209, 0)")
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = "#f7fbff"
  ctx.strokeStyle = "#5da4d1"
  ctx.lineWidth = 1.6
  ctx.shadowColor = "rgba(140, 220, 255, 0.55)"
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(8, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

import { useEffect, useMemo, useRef, useState } from "react"
import type {
  AreaId,
  TransmissionId,
} from "@magnolia/contracts"
import type { DisplayOptions } from "@/app/display-options"
import { ActionButton } from "@/components/ActionButton"
import { prepareDevicePixelCanvas } from "@/render/canvas-host/device-pixel-canvas"
import { useCanvasAnimationLoop } from "@/render/canvas-host/use-canvas-animation-loop"
import { useObservedCanvasSize } from "@/render/canvas-host/use-canvas-size"
import { expandRect } from "@/render/shared/coordinates"
import type { WorldMapViewModel } from "@/view-models/map-view-model"
import { drawMapCanvas, type MapHitTarget } from "@/render/map/map-renderer"

type MapScreenProps = {
  viewModel: WorldMapViewModel
  displayOptions: DisplayOptions
  onBack: () => void
  onWarpToArea: (areaId: AreaId) => void
  onOpenArchive: (areaId: AreaId, transmissionId: TransmissionId) => void
}

export function MapScreen({
  viewModel,
  displayOptions,
  onBack,
  onWarpToArea,
  onOpenArchive,
}: MapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useObservedCanvasSize(canvasRef)
  const hitTargetsRef = useRef<MapHitTarget[]>([])

  const [selectedAreaId, setSelectedAreaId] = useState<AreaId | undefined>(
    viewModel.selectedAreaId,
  )
  const [selectedTransmissionId, setSelectedTransmissionId] = useState<TransmissionId | undefined>(
    viewModel.selectedTransmissionId,
  )

  useEffect(() => {
    if (!selectedAreaId || !viewModel.areas.some((area) => area.areaId === selectedAreaId)) {
      setSelectedAreaId(viewModel.selectedAreaId)
    }
  }, [selectedAreaId, viewModel.areas, viewModel.selectedAreaId])

  const selectedTransmission = selectedTransmissionId
    ? viewModel.transmissions.find((item) => item.transmissionId === selectedTransmissionId)
    : undefined
  const selectedArea = selectedAreaId
    ? viewModel.areas.find((item) => item.areaId === selectedAreaId)
    : undefined
  const focusBounds = useMemo(
    () =>
      selectedAreaId
        ? expandRect(
            viewModel.areas.find((area) => area.areaId === selectedAreaId)?.bounds ?? viewModel.focusBounds,
            120,
          )
        : viewModel.focusBounds,
    [selectedAreaId, viewModel.areas, viewModel.focusBounds],
  )

  useCanvasAnimationLoop((timeMs) => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const width = Math.max(320, sizeRef.current.width || canvas.clientWidth || 640)
    const height = Math.max(320, sizeRef.current.height || canvas.clientHeight || 640)
    const ctx = prepareDevicePixelCanvas({
      canvas,
      width,
      height,
      pixelRatio: displayOptions.canvasPixelRatio,
    })
    if (!ctx) {
      return
    }
    ctx.clearRect(0, 0, width, height)
    hitTargetsRef.current = drawMapCanvas({
      ctx,
      width,
      height,
      timeMs,
      focusBounds,
      viewModel,
      selectedAreaId,
      selectedTransmissionId,
      displayOptions,
    })
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
          {viewModel.areas.map((area) => {
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
                {selectedTransmission.title}
              </h2>
              <p className="map-screen__info-text">
                発信者:
                {" "}
                {selectedTransmission.sender}
              </p>
              <p className="map-screen__info-text">
                宛先:
                {" "}
                {selectedTransmission.recipient}
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

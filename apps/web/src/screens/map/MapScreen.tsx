import { useEffect, useState } from "react"
import type { AreaId, TransmissionId } from "@magnolia/contracts"
import type { MapViewModel } from "@magnolia/game-session"
import { ActionButton } from "@/components/ActionButton"
import { MapCanvas, type MapCanvasSelection } from "@/screens/map/MapCanvas"
import { MapInfoPanel } from "@/screens/map/MapInfoPanel"

type MapScreenProps = {
  viewModel: MapViewModel
  onBack: () => void
  onWarpToArea: (areaId: AreaId) => void
  onOpenArchive: (areaId: AreaId, transmissionId: TransmissionId) => void
}

export function MapScreen({
  viewModel,
  onBack,
  onWarpToArea,
  onOpenArchive,
}: MapScreenProps) {
  const [selectedAreaId, setSelectedAreaId] = useState<AreaId | undefined>(
    viewModel.initialSelectedAreaId,
  )
  const [selectedTransmissionId, setSelectedTransmissionId] = useState<TransmissionId | undefined>(
    undefined,
  )

  useEffect(() => {
    if (!selectedAreaId || !viewModel.areasById[selectedAreaId]) {
      setSelectedAreaId(viewModel.initialSelectedAreaId)
    }
  }, [selectedAreaId, viewModel.areasById, viewModel.initialSelectedAreaId])

  function handleSelectArea(areaId: AreaId) {
    setSelectedAreaId(areaId)
    setSelectedTransmissionId(undefined)
  }

  function handleSelectCanvasTarget(selection: MapCanvasSelection | undefined) {
    if (!selection) {
      setSelectedTransmissionId(undefined)
      return
    }

    // canvas の hit target は座標だけを持つため、選択状態の更新は screen 側に集約します。
    setSelectedAreaId(selection.areaId)
    setSelectedTransmissionId(
      selection.type === "transmission" ? selection.transmissionId : undefined,
    )
  }

  const selectedTransmission = selectedTransmissionId
    ? viewModel.transmissionsById[selectedTransmissionId]
    : undefined

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
            const isSelected = area.areaId === selectedAreaId
            return (
              <button
                key={area.areaId}
                type="button"
                className={`map-screen__area-button ${isSelected ? "map-screen__area-button--active" : ""}`}
                onClick={() => handleSelectArea(area.areaId)}
              >
                <span>{area.name}</span>
                <span>{area.completionPercent}%</span>
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
        <MapCanvas
          viewModel={viewModel}
          selectedAreaId={selectedAreaId}
          selectedTransmissionId={selectedTransmissionId}
          onSelectTarget={handleSelectCanvasTarget}
        />
        <MapInfoPanel
          viewModel={viewModel}
          selectedAreaId={selectedAreaId}
          selectedTransmission={selectedTransmission}
          onWarpToArea={onWarpToArea}
          onOpenArchive={onOpenArchive}
        />
      </section>
    </main>
  )
}

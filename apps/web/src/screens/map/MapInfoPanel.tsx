import type { AreaId, TransmissionId } from "@magnolia/contracts"
import type { MapTransmissionViewModel, MapViewModel } from "@magnolia/game-session"
import { ActionButton } from "@/components/ActionButton"

type MapInfoPanelProps = {
  viewModel: MapViewModel
  selectedAreaId?: AreaId
  selectedTransmission?: MapTransmissionViewModel
  onWarpToArea: (areaId: AreaId) => void
  onOpenArchive: (areaId: AreaId, transmissionId: TransmissionId) => void
}

export function MapInfoPanel({
  viewModel,
  selectedAreaId,
  selectedTransmission,
  onWarpToArea,
  onOpenArchive,
}: MapInfoPanelProps) {
  if (selectedTransmission) {
    return (
      <section className="map-screen__info">
        <p className="map-screen__info-eyebrow">transmission</p>
        <h2 className="map-screen__info-title">
          {selectedTransmission.titleLabel}
        </h2>
        <p className="map-screen__info-text">
          発信者:
          {" "}
          {selectedTransmission.senderLabel}
        </p>
        <p className="map-screen__info-text">
          宛先:
          {" "}
          {selectedTransmission.recipientLabel}
        </p>
        <p className="map-screen__info-text">
          復元率:
          {" "}
          {selectedTransmission.restorationPercent}%
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
      </section>
    )
  }

  if (selectedAreaId) {
    const selectedArea = viewModel.areasById[selectedAreaId]
    return (
      <section className="map-screen__info">
        <p className="map-screen__info-eyebrow">area</p>
        <h2 className="map-screen__info-title">{selectedArea?.name ?? "unknown area"}</h2>
        <p className="map-screen__info-text">
          解放率:
          {" "}
          {selectedArea?.completionPercent ?? 0}%
        </p>
        <div className="button-row">
          <ActionButton tone="ghost" onClick={() => onWarpToArea(selectedAreaId)}>
            移動
          </ActionButton>
        </div>
      </section>
    )
  }

  return (
    <section className="map-screen__info">
      <p className="map-screen__info-eyebrow">selection</p>
      <h2 className="map-screen__info-title">no target</h2>
      <p className="map-screen__info-text">
        左のエリア一覧、または右のマップ上の通信を選択してください。
      </p>
    </section>
  )
}

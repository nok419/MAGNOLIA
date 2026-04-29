import type { ArchiveViewModel } from "@magnolia/contracts"

export function ArchivePanel({
  viewModel,
  onSelectTransmission,
}: {
  viewModel: ArchiveViewModel
  onSelectTransmission: (areaId: string, transmissionId: string) => void
}) {
  const selected = viewModel.entries.find((entry) => entry.selected)

  return (
    <div className="two-column-layout archive-layout">
      <div className="list-stack">
        {viewModel.entries.length === 0 ? (
          <p className="muted-text">復元済みの通信はまだありません。</p>
        ) : (
          viewModel.entries.map((entry) => (
            <button
              key={entry.transmissionId}
              type="button"
              className={`list-card ${entry.selected ? "list-card--selected" : ""}`}
              onClick={() => onSelectTransmission(entry.areaId, entry.transmissionId)}
            >
              <p style={{ fontWeight: 500, fontSize: 14 }}>
                {entry.title}
              </p>
              <p className="muted-text" style={{ fontSize: 12 }}>
                {entry.areaName}
              </p>
            </button>
          ))
        )}
      </div>
      <div>
        {selected ? (
          <>
            <h3 className="detail-title">
              {selected.title}
            </h3>
            <div className="archive-log__meta">
              <p>sender: {selected.sender}</p>
              <p>recipient: {selected.recipient}</p>
              <p>sent at: {selected.sentAt}</p>
            </div>
            <div className="scroll-block archive-log__body">
              {selected.chunks.length > 0 ? (
                selected.chunks.map((chunk) => (
                  <div key={chunk.chunkId} className="archive-log__line">
                    {chunk.speakerLabel ? <p className="archive-log__speaker">{chunk.speakerLabel}</p> : null}
                    <p className={`archive-log__text ${chunk.audible ? "" : "archive-log__text--damaged"}`}>
                      {chunk.text}
                    </p>
                  </div>
                ))
              ) : (
                <p className="muted-text">この通信の本文はまだ復元されていません。</p>
              )}
            </div>
          </>
        ) : (
          <p className="muted-text">通信を選択してください。</p>
        )}
      </div>
    </div>
  )
}

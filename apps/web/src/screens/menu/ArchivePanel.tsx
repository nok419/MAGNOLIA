import type { ArchiveAccessState, AreaMaster, ProfileAggregate, TransmissionMaster } from "@magnolia/contracts"
import { hasVisibleArchiveContent } from "@magnolia/game-session"

export function ArchivePanel({
  areas,
  transmissions,
  profile,
  archiveAccess,
  selectedTransmissionId,
  onSelectTransmission,
}: {
  areas: Record<string, AreaMaster>
  transmissions: Record<string, TransmissionMaster>
  profile: ProfileAggregate
  archiveAccess: ArchiveAccessState
  selectedTransmissionId?: string
  onSelectTransmission: (areaId: string, transmissionId: string) => void
}) {
  const selected = selectedTransmissionId ? transmissions[selectedTransmissionId] : undefined
  const unlockedEntries = profile.transmissionProgress
    .filter((progress) => hasVisibleArchiveContent(progress))
    .map((progress) => ({
      progress,
      transmission: transmissions[progress.transmissionId],
      area: areas[progress.areaId],
    }))
    .filter((entry) => Boolean(entry.transmission))

  return (
    <div className="two-column-layout archive-layout">
      <div className="list-stack">
        {unlockedEntries.length === 0 ? (
          <p className="muted-text">読める通信はまだありません。戦闘中に言葉を守ると、ここに記録されます。</p>
        ) : (
          unlockedEntries.map(({ progress, transmission, area }) => {
            const isSel = transmission.transmissionId === selectedTransmissionId
            return (
              <button
                key={transmission.transmissionId}
                type="button"
                className={`list-card ${isSel ? "list-card--selected" : ""}`}
                onClick={() => onSelectTransmission(transmission.areaId, transmission.transmissionId)}
              >
                <p style={{ fontWeight: 500, fontSize: 14 }}>
                  {progress.metadataUnlocked.title ? transmission.title : "???"}
                </p>
                <p className="muted-text" style={{ fontSize: 12 }}>
                  {area?.name ?? transmission.areaId}
                </p>
              </button>
            )
          })
        )}
      </div>
      <div>
        {selected ? (
          <>
            <h3 className="detail-title">
              {archiveAccess.metadataUnlocked.title ? selected.title : "???"}
            </h3>
            <div className="archive-log__meta">
              <p>sender: {archiveAccess.metadataUnlocked.sender ? selected.sender : "???"}</p>
              <p>recipient: {archiveAccess.metadataUnlocked.recipient ? selected.recipient : "???"}</p>
              <p>sent at: {archiveAccess.metadataUnlocked.sentAt ? selected.sentAt : "???"}</p>
            </div>
            <div className="scroll-block archive-log__body">
              {archiveAccess.transcriptView.length > 0 ? (
                archiveAccess.transcriptView.map((chunk) => (
                  <div key={chunk.chunkId} className="archive-log__line">
                    {chunk.speakerLabel ? <p className="archive-log__speaker">{chunk.speakerLabel}</p> : null}
                    <p
                      className={[
                        "archive-log__text",
                        chunk.audible ? "" : "archive-log__text--damaged",
                        chunk.importance && chunk.importance !== "normal"
                          ? "archive-log__text--important"
                          : "",
                      ].filter(Boolean).join(" ")}
                    >
                      {chunk.text}
                    </p>
                  </div>
                ))
              ) : (
                <p className="muted-text">この通信の本文はまだ読めません。もう一度接続して、欠けた言葉を回収してください。</p>
              )}
            </div>
          </>
        ) : (
          <p className="muted-text">記録を選択してください。</p>
        )}
      </div>
    </div>
  )
}

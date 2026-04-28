import type { ArchiveAccessState, AreaMaster, ProfileAggregate, TransmissionMaster } from "@magnolia/contracts"
import { hasVisibleArchiveContent } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import { resolveTextSignalDistortion } from "@/app/signal-distortion"

export function ArchivePanel({
  areas,
  transmissions,
  profile,
  archiveAccess,
  selectedTransmissionId,
  onSelectTransmission,
  displayOptions,
}: {
  areas: Record<string, AreaMaster>
  transmissions: Record<string, TransmissionMaster>
  profile: ProfileAggregate
  archiveAccess: ArchiveAccessState
  selectedTransmissionId?: string
  onSelectTransmission: (areaId: string, transmissionId: string) => void
  displayOptions: DisplayOptions
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
          <p className="muted-text">復元済みの通信はまだありません。</p>
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
                    <p className={`archive-log__text ${chunk.audible ? "" : "archive-log__text--damaged"}`}>
                      {chunk.audible
                        ? chunk.text
                        : resolveArchiveTextDistortion(
                            chunk.text,
                            `${selected.transmissionId}:${chunk.chunkId}`,
                            displayOptions.reduceFlashing,
                          )}
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

function resolveArchiveTextDistortion(text: string, seed: string, reduceFlashing: boolean): string {
  return Array.from(text)
    .map((character, index) => {
      if (character.trim().length === 0) {
        return character
      }
      const distortion = resolveTextSignalDistortion({
        seed,
        index,
        severity: 0.72,
        reduceFlashing,
      })
      return distortion.visible ? distortion.replacement : character
    })
    .join("")
}

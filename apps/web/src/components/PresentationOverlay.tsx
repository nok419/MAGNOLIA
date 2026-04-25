import { useEffect, useMemo, useState } from "react"
import type {
  PresentationCueSpec,
  RebootSequencePresentationRequest,
  RebootSettlePresentationRequest,
  ReleasePresentationRequest,
  RestrictionPresentationRequest,
  SystemMessagePresentationRequest,
} from "@magnolia/contracts"

type OverlayPresentation =
  | SystemMessagePresentationRequest
  | RebootSequencePresentationRequest
  | RebootSettlePresentationRequest
  | RestrictionPresentationRequest
  | ReleasePresentationRequest

type PresentationOverlayProps = {
  presentation: OverlayPresentation
  cueSpec?: PresentationCueSpec
  onDismiss: () => void
}

/** boot console の各行のステータス表示 */
type BootLineStatus = "pending" | "active" | "done"

export function PresentationOverlay(props: PresentationOverlayProps) {
  const { presentation, cueSpec, onDismiss } = props
  // activeIndex: 今タイプ中の行 (-1 = まだ開始前)
  // completedCount: タイプ完了 + dwell 完了した行数 (この数だけ "done" 扱いになる)
  const [activeIndex, setActiveIndex] = useState(
    presentation.cueId === "system.boot.message" ? -1 : 999,
  )
  const [completedCount, setCompletedCount] = useState(
    presentation.cueId === "system.boot.message" ? 0 : 999,
  )
  const [canSkip, setCanSkip] = useState(!presentation.blocking)
  const [canDismiss, setCanDismiss] = useState(!presentation.blocking)

  // 各行の timing を事前計算。
  //   typing は文字数ベースで可変、min/dwell/initial/final を明示することで
  //   全体のリズムを「速度」ではなく「段階」で制御する。
  const bootSchedule = useMemo(() => {
    if (presentation.cueId !== "system.boot.message") {
      return {
        entries: [] as Array<{ typeStartMs: number; typeDurMs: number; cleanEndMs: number }>,
        skipReadyMs: 0,
        readyMs: 0,
      }
    }
    // boot console は雰囲気を残しつつ、入力待ちで引き延ばし過ぎない速度にします。
    // 自動完了は短めにし、さらに少し早い時点で skip を許可して先へ進めるようにします。
    const CHAR_MS = 8
    const MIN_LINE_MS = 130
    const DWELL_MS = 70
    const INITIAL_PAUSE = 100
    const FINAL_PAUSE = 160
    const EMPTY_LINE_MS = 100
    const SKIP_READY_MS = 900

    const entries: Array<{ typeStartMs: number; typeDurMs: number; cleanEndMs: number }> = []
    let cursor = INITIAL_PAUSE
    for (const text of presentation.lines) {
      const trimmed = text.trim()
      const isEmpty = trimmed.length === 0
      const typeDurMs = isEmpty
        ? EMPTY_LINE_MS
        : Math.max(MIN_LINE_MS, trimmed.length * CHAR_MS)
      const typeStartMs = cursor
      const cleanEndMs = typeStartMs + typeDurMs + (isEmpty ? 0 : DWELL_MS)
      entries.push({ typeStartMs, typeDurMs, cleanEndMs })
      cursor = cleanEndMs
    }
    return {
      entries,
      skipReadyMs: Math.min(cursor + FINAL_PAUSE, SKIP_READY_MS),
      readyMs: cursor + FINAL_PAUSE,
    }
  }, [
    presentation.cueId,
    presentation.cueId === "system.boot.message" ? presentation.lines.length : 0,
    presentation.cueId === "system.boot.message"
      ? presentation.lines.join("|")
      : "",
  ])

  // 連続的に増加する elapsedMs — progress bar はここから計算してシームレスに動かす。
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (presentation.cueId !== "system.boot.message") {
      setActiveIndex(999)
      setCompletedCount(999)
      setCanSkip(!presentation.blocking)
      setCanDismiss(!presentation.blocking)
      setElapsedMs(0)
      return
    }

    setActiveIndex(-1)
    setCompletedCount(0)
    setCanSkip(false)
    setCanDismiss(false)
    setElapsedMs(0)

    const timeoutIds: number[] = []

    bootSchedule.entries.forEach((entry, index) => {
      timeoutIds.push(
        window.setTimeout(() => setActiveIndex(index), entry.typeStartMs),
      )
      timeoutIds.push(
        window.setTimeout(() => setCompletedCount(index + 1), entry.cleanEndMs),
      )
    })

    timeoutIds.push(
      window.setTimeout(() => setCanSkip(true), bootSchedule.skipReadyMs),
    )

    timeoutIds.push(
      window.setTimeout(() => setCanDismiss(true), bootSchedule.readyMs),
    )

    // rAF ループで elapsedMs を更新 — progress bar / % 表示を毎フレーム滑らかに。
    // bootSchedule.readyMs を超えた時点でループ停止 (無駄な re-render を避ける)。
    const startAt = performance.now()
    let rafId = 0
    const tick = (now: number) => {
      const elapsed = now - startAt
      setElapsedMs(elapsed)
      if (elapsed < bootSchedule.readyMs + 120) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId)
      }
      cancelAnimationFrame(rafId)
    }
  }, [
    bootSchedule,
    presentation.blocking,
    presentation.cueId,
    presentation.requestId,
  ])

  useEffect(() => {
    const overlayReady =
      presentation.cueId === "system.boot.message"
        ? canSkip
        : canDismiss

    if (!presentation.blocking || !overlayReady) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Enter" && event.code !== "NumpadEnter" && event.code !== "Escape") {
        return
      }
      event.preventDefault()
      onDismiss()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [canDismiss, canSkip, onDismiss, presentation.blocking, presentation.cueId])

  switch (presentation.cueId) {
    case "system.boot.message": {
      // シームレスな進捗: rAF で増える elapsedMs / readyMs を直接比率化。
      // canDismiss 後は 100% で固定。アニメーションは CSS transition を使わず
      // 毎フレーム width を上書きすることで、行完了の段差なく連続的に流れる。
      const progressRatio = canDismiss
        ? 1
        : Math.min(1, elapsedMs / Math.max(1, bootSchedule.readyMs))
      const progressPct = Math.round(progressRatio * 100)
      const overlayReady = canSkip

      return (
        <div className="boot-console" role="dialog" aria-label="system reboot">
          {/* 背景レイヤ: スキャン・グリッド・ノイズ・ビネット */}
          <div className="boot-console__ambient" aria-hidden="true">
            <div className="boot-console__ambient-grid" />
            <div className="boot-console__ambient-scan" />
            <div className="boot-console__ambient-scan boot-console__ambient-scan--slow" />
            <div className="boot-console__ambient-noise" />
            <div className="boot-console__ambient-vignette" />
          </div>

          <section className="boot-console__stage">
            {/* 上部フレーム: 演出タイトル / セッション ID / 接続インジケータ */}
            <header className="boot-console__frame-top">
              <span className="boot-console__diamond">◇</span>
              <span className="boot-console__protocol">magnolia protocol</span>
              <span className="boot-console__sep">·</span>
              <span className="boot-console__phase">reboot sequence</span>
              <span className="boot-console__spacer" />
              <span className="boot-console__session">
                SESSION <span className="boot-console__session-hex">0x{sessionHex(presentation.requestId)}</span>
              </span>
            </header>

            <div className="boot-console__corner boot-console__corner--tl" />
            <div className="boot-console__corner boot-console__corner--tr" />
            <div className="boot-console__corner boot-console__corner--bl" />
            <div className="boot-console__corner boot-console__corner--br" />

            {/* ターミナル本体 */}
            <ul className="boot-console__log" role="log" aria-live="polite">
              {presentation.lines.map((line, index) => {
                // index の状態:
                //   index < completedCount → done
                //   index === activeIndex (and not yet completed) → active
                //   それ以外 → pending (未表示)
                const status: BootLineStatus =
                  index < completedCount
                    ? "done"
                    : index === activeIndex
                      ? "active"
                      : "pending"
                if (status === "pending") return null
                const isEmpty = line.trim().length === 0
                const entry = bootSchedule.entries[index]
                return (
                  <li
                    key={`${presentation.requestId}:${index}`}
                    className={`boot-console__line boot-console__line--${status}${
                      isEmpty ? " boot-console__line--spacer" : ""
                    }`}
                    style={{
                      // 行ごとに typing 時間を CSS 変数で注入。短い行は速く、長い行は
                      // ゆっくり — 一文字 24ms のペースで視線がついていける速度。
                      ["--boot-type-ms" as keyof React.CSSProperties]:
                        `${entry?.typeDurMs ?? 600}ms`,
                    } as React.CSSProperties}
                  >
                    {!isEmpty ? (
                      <>
                        <span className="boot-console__marker" aria-hidden="true">
                          {status === "done" ? "✓" : "▸"}
                        </span>
                        <span className="boot-console__text">{line}</span>
                        {status === "active" ? (
                          <span className="boot-console__cursor" aria-hidden="true">▌</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="boot-console__line-rule" aria-hidden="true" />
                    )}
                  </li>
                )
              })}
              {canDismiss ? (
                <li className="boot-console__line boot-console__line--ready">
                  <span className="boot-console__marker boot-console__marker--ready" aria-hidden="true">◆</span>
                  <span className="boot-console__text">signal acquired — ready to proceed.</span>
                </li>
              ) : null}
            </ul>

            {/* 下部フレーム: 進捗 + CTA */}
            <footer className="boot-console__frame-bottom">
              <div className="boot-console__progress">
                <span className="boot-console__progress-label">boot</span>
                <div
                  className="boot-console__progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct}
                >
                  <div
                    className="boot-console__progress-fill"
                    style={{ width: `${(progressRatio * 100).toFixed(3)}%` }}
                  />
                </div>
                <span className="boot-console__progress-val">{progressPct}%</span>
              </div>

              <button
                className={`boot-console__cta${overlayReady ? " boot-console__cta--ready" : ""}`}
                disabled={!overlayReady}
                onClick={overlayReady ? onDismiss : undefined}
                type="button"
              >
                <span className="boot-console__cta-icon" aria-hidden="true">
                  {overlayReady ? "▸" : "…"}
                </span>
                <span>
                  {canDismiss
                    ? "press ENTER to synchronize"
                    : overlayReady
                      ? "press ENTER to skip boot"
                      : "processing..."}
                </span>
              </button>
            </footer>
          </section>
        </div>
      )
    }
    case "system.reboot.sequence":
    case "system.reboot.settle":
    case "tutorial.restriction.enter":
      return null
    case "tutorial.restriction.release":
      return null
  }
}

/**
 * presentation.requestId (ランダム文字列) から 6 桁の hex ラベルを生成。
 * 演出の装飾的な "session hash" に使う (純粋に視覚用途)。
 */
function sessionHex(requestId: string): string {
  let hash = 0
  for (let i = 0; i < requestId.length; i++) {
    hash = ((hash << 5) - hash + requestId.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).toUpperCase().slice(-6).padStart(6, "0")
}

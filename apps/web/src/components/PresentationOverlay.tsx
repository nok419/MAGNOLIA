import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type {
  PresentationCueSpec,
  RebootSequencePresentationRequest,
  RebootSettlePresentationRequest,
  ReleasePresentationRequest,
  RestrictionPresentationRequest,
  SystemMessagePresentationRequest,
} from "@magnolia/contracts"
import type { DisplayOptions } from "@/app/display-options"

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
  displayOptions: DisplayOptions
}

/** boot console の各行のステータス表示 */
type BootLineStatus = "pending" | "active" | "done"

const BOOT_SCOPE_BAR_COUNT = 56

export function PresentationOverlay(props: PresentationOverlayProps) {
  const { presentation, cueSpec, onDismiss } = props
  const onDismissRef = useRef(onDismiss)
  // activeIndex: 今タイプ中の行 (-1 = まだ開始前)
  // completedCount: タイプ完了 + dwell 完了した行数 (この数だけ "done" 扱いになる)
  const [activeIndex, setActiveIndex] = useState(
    presentation.cueId === "system.boot.message" ? -1 : 999,
  )
  const [completedCount, setCompletedCount] = useState(
    presentation.cueId === "system.boot.message" ? 0 : 999,
  )
  const [canDismiss, setCanDismiss] = useState(!presentation.blocking)

  // 各行の timing を事前計算。
  //   typing は文字数ベースで可変、min/dwell/initial/final を明示することで
  //   全体のリズムを「速度」ではなく「段階」で制御する。
  const bootSchedule = useMemo(() => {
    if (presentation.cueId !== "system.boot.message") {
      return {
        entries: [] as Array<{ typeStartMs: number; typeDurMs: number; cleanEndMs: number }>,
        readyMs: 0,
      }
    }
    // boot console は短い起動確認として扱い、途中開始の待ち状態を作らず最後まで走らせます。
    const CHAR_MS = 5
    const MIN_LINE_MS = 90
    const DWELL_MS = 34
    const INITIAL_PAUSE = 60
    const FINAL_PAUSE = 110
    const EMPTY_LINE_MS = 42

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
      readyMs: cursor + FINAL_PAUSE,
    }
  }, [
    presentation.cueId,
    presentation.cueId === "system.boot.message" ? presentation.lines.length : 0,
    presentation.cueId === "system.boot.message"
      ? presentation.lines.join("|")
      : "",
  ])

  // 連続的に増加する elapsedMs — progress bar はここから計算して途切れずに動かす。
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (presentation.cueId !== "system.boot.message") {
      setActiveIndex(999)
      setCompletedCount(999)
      setCanDismiss(!presentation.blocking)
      setElapsedMs(0)
      return
    }

    setActiveIndex(-1)
    setCompletedCount(0)
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
      window.setTimeout(() => setCanDismiss(true), bootSchedule.readyMs),
    )

    // rAF ループで elapsedMs を更新 — progress bar / % 表示を毎フレーム滑らかに。
    // bootSchedule.readyMs を超えた時点でループ停止 (無駄な re-render を避ける)。
    const startAt = performance.now()
    let lastDrawAt = 0
    let rafId = 0
    const tick = (now: number) => {
      if (
        props.displayOptions.lowFrameRateMode &&
        now - lastDrawAt < props.displayOptions.targetFrameIntervalMs
      ) {
        rafId = requestAnimationFrame(tick)
        return
      }
      lastDrawAt = now
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
    props.displayOptions,
  ])

  useEffect(() => {
    const overlayReady =
      presentation.cueId === "system.boot.message"
        ? canDismiss
        : canDismiss

    if (!presentation.blocking || !overlayReady) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Enter" && event.code !== "NumpadEnter" && event.code !== "Escape") {
        return
      }
      event.preventDefault()
      onDismissRef.current()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [canDismiss, presentation.blocking, presentation.cueId])

  switch (presentation.cueId) {
    case "system.boot.message": {
      // 連続的な進捗: rAF で増える elapsedMs / readyMs を直接比率化。
      // canDismiss 後は 100% で固定。アニメーションは CSS transition を使わず
      // 毎フレーム width を上書きすることで、行完了の段差なく連続的に流れる。
      const progressRatio = canDismiss
        ? 1
        : Math.min(1, elapsedMs / Math.max(1, bootSchedule.readyMs))
      const progressPct = Math.round(progressRatio * 100)
      const overlayReady = canDismiss

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

            <div className="boot-console__instrument-panel" aria-hidden="true">
              <div className="boot-console__status-bank">
                {["core", "mem", "bus", "rf"].map((label, index) => (
                  <span
                    key={label}
                    className={`boot-console__lamp ${
                      progressRatio > (index + 1) * 0.18 ? "boot-console__lamp--on" : ""
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="boot-console__readout-grid">
                <span>prog</span><strong>37</strong>
                <span>verb</span><strong>06</strong>
                <span>noun</span><strong>41</strong>
              </div>
              <div className="boot-console__scope">
                <span className="boot-console__scope-label">carrier</span>
                <span className="boot-console__scope-baseline" />
                <span
                  className="boot-console__scope-cursor"
                  style={{
                    ["--scope-cursor-left" as keyof CSSProperties]:
                      `calc(9px + ${(progressRatio * 100).toFixed(3)}% - ${(progressRatio * 18).toFixed(3)}px)`,
                  }}
                />
                <div className="boot-console__scope-bars">
                  {Array.from({ length: BOOT_SCOPE_BAR_COUNT }, (_, index) => (
                    <span
                      key={index}
                      className="boot-console__scope-bar"
                      style={{
                        ["--scope-amp" as keyof CSSProperties]: buildBootScopeAmplitude({
                          index,
                          progressRatio,
                          elapsedMs,
                        }),
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

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
                      // 少し長く残すことで、高速でも処理の段階が読めるようにします。
                      ["--boot-type-ms" as keyof CSSProperties]:
                        `${entry?.typeDurMs ?? 600}ms`,
                    } as CSSProperties}
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
                    ? "launch MAGNOLIA"
                    : "synchronizing..."}
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

function buildBootScopeAmplitude(input: {
  index: number
  progressRatio: number
  elapsedMs: number
}): string {
  const normalizedIndex = input.index / Math.max(1, BOOT_SCOPE_BAR_COUNT - 1)
  const carrier = 0.58 + 0.36 * Math.sin(normalizedIndex * Math.PI * 5.2 + input.elapsedMs * 0.006)
  const phrase =
    0.42 + 0.36 * Math.sin(normalizedIndex * Math.PI * 2.8 - input.progressRatio * Math.PI * 1.6)
  const transient =
    0.18 * Math.pow(Math.max(0, Math.sin(input.elapsedMs * 0.013 + input.index * 0.91)), 8)
  const taper = 0.7 + 0.3 * Math.sin(Math.PI * normalizedIndex)
  const bootGain = 0.56 + input.progressRatio * 0.44
  const amplitude = Math.min(1, Math.max(0.18, (carrier * 0.58 + phrase * 0.42 + transient) * taper * bootGain))
  return amplitude.toFixed(3)
}

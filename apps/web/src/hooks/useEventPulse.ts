import { useEffect, useRef, useState } from "react"

type PulseEvent = {
  cueId: string
  startedAtMs: number
}

/**
 * 指定 cueId に該当する最新イベントの startedAtMs を「単調増加」で記録するフック。
 * - 演出再発火用のキー値を返す（イベントが消えても値は戻らない）。
 * - 戻り値が変わったタイミング = 新しいイベントが入ってきた瞬間。
 */
export function useEventPulse<TEvent extends PulseEvent>(
  events: readonly TEvent[],
  cueIds: readonly string[],
): number {
  const [pulse, setPulse] = useState<number>(0)
  const lastSeenRef = useRef<number>(0)
  const cueSet = new Set(cueIds)

  useEffect(() => {
    let maxStartedAt = lastSeenRef.current
    for (const event of events) {
      if (!cueSet.has(event.cueId)) continue
      if (event.startedAtMs > maxStartedAt) {
        maxStartedAt = event.startedAtMs
      }
    }
    if (maxStartedAt > lastSeenRef.current) {
      lastSeenRef.current = maxStartedAt
      setPulse(maxStartedAt)
    }
    // cueIds は呼び出し側で安定参照前提（変えるなら毎回フックを使い分ける想定）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  return pulse
}

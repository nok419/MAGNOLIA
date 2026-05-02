import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"
import type { SaveSlotId } from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import type { IdleAutoSaveViewModel } from "@/app/app-types"
import type { MagnoliaAppState } from "@/app/app-state"
import { selectIdleAutoSaveSlot } from "@/app/save-slot-selectors"
import { dispatchManyAndSync } from "@/app/session-command-runner"
import type { useMagnoliaInput } from "@/app/use-magnolia-input"

const IDLE_AUTO_SAVE_WARNING_AFTER_MS = 50_000
const IDLE_AUTO_SAVE_COUNTDOWN_MS = 10_000
const IDLE_AUTO_SAVE_TICK_MS = 250

type IdleAutoSaveCountdown = {
  startedAt: number
  deadlineAt: number
  targetSlotId: SaveSlotId
}

type UseIdleAutoSaveParams = {
  input: ReturnType<typeof useMagnoliaInput>
  sessionRef: RefObject<MagnoliaGameSession | null>
  stateRef: RefObject<MagnoliaAppState>
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
  setIdleAutoSave: Dispatch<SetStateAction<IdleAutoSaveViewModel | null>>
  syncFromSession(session: MagnoliaGameSession): void
}

export function useIdleAutoSave({
  input,
  sessionRef,
  stateRef,
  setState,
  setIdleAutoSave,
  syncFromSession,
}: UseIdleAutoSaveParams) {
  const idleCountdownRef = useRef<IdleAutoSaveCountdown | null>(null)
  const idleAutoSavingRef = useRef(false)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const session = sessionRef.current
      const current = stateRef.current
      const snapshot = current.snapshot

      if (
        !session ||
        !snapshot ||
        !current.profile ||
        snapshot.screen === "title" ||
        current.slotSelectMode
      ) {
        clearIdleAutoSaveCountdown()
        input.markActivity(Date.now())
        return
      }

      const now = Date.now()
      if (input.hasActiveInput()) {
        // 押しっぱなしの移動や攻撃は継続中の操作として扱い、無操作に入りません。
        input.markActivity(now)
      }

      const countdown = idleCountdownRef.current
      if (countdown) {
        if (input.getLastActivityAt() > countdown.startedAt) {
          clearIdleAutoSaveCountdown()
          return
        }
        const remainingMs = countdown.deadlineAt - now
        if (remainingMs <= 0) {
          void completeIdleAutoSave(session)
          return
        }
        setIdleAutoSave({
          status: "countdown",
          remainingSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
          targetSlotId: countdown.targetSlotId,
        })
        return
      }

      if (now - input.getLastActivityAt() >= IDLE_AUTO_SAVE_WARNING_AFTER_MS) {
        const targetSlotId = selectIdleAutoSaveSlot(snapshot.saveSlots.slots)
        idleCountdownRef.current = {
          startedAt: now,
          deadlineAt: now + IDLE_AUTO_SAVE_COUNTDOWN_MS,
          targetSlotId,
        }
        setIdleAutoSave({
          status: "countdown",
          remainingSeconds: Math.ceil(IDLE_AUTO_SAVE_COUNTDOWN_MS / 1000),
          targetSlotId,
        })
      }
    }, IDLE_AUTO_SAVE_TICK_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  function clearIdleAutoSaveCountdown() {
    idleCountdownRef.current = null
    idleAutoSavingRef.current = false
    setIdleAutoSave(null)
  }

  async function completeIdleAutoSave(session: MagnoliaGameSession) {
    const countdown = idleCountdownRef.current
    if (!countdown || idleAutoSavingRef.current) {
      return
    }

    idleAutoSavingRef.current = true
    setIdleAutoSave({
      status: "saving",
      remainingSeconds: 0,
      targetSlotId: countdown.targetSlotId,
    })

    try {
      await dispatchManyAndSync(
        session,
        [
          { type: "saveToSlot", slotId: countdown.targetSlotId },
          { type: "returnToTitle" },
        ],
        {
          syncFromSession,
          beforeSync: () => {
            idleCountdownRef.current = null
            input.markActivity(Date.now())
          },
        },
      )
    } catch (error) {
      idleCountdownRef.current = null
      setState((current) => ({
        ...current,
        errorMessage: error instanceof Error ? error.message : "自動保存に失敗しました。",
      }))
    } finally {
      idleAutoSavingRef.current = false
      setIdleAutoSave(null)
    }
  }
}

import {
  startTransition,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"
import type {
  DomainEvent,
  ExploreTransitionSourceFrame,
  PresentationRequest,
  WorldMapNodeId,
} from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import {
  createAudioEventAdapterState,
  playSessionAudioEvents,
} from "@/app/audio-event-adapter"
import { mergePresentationRequests } from "@/app/presentation/presentation-reducer"
import {
  buildCollectiblePopups,
} from "@/app/popups/item-popups"
import {
  readSeenEquipmentFromStorage,
} from "@/app/storage/seen-equipment-store"
import {
  isBattlePerformanceProfilerEnabled,
  readPerformanceNow,
  recordBattleRenderStateSample,
} from "@/app/battle-performance-profiler"
import type { MagnoliaAppState } from "@/app/app-state"
import type { useMagnoliaInput } from "@/app/use-magnolia-input"

export type ExploreInteractionContext = {
  nodeId: WorldMapNodeId
  worldPosition: { x: number; y: number }
  sourceFrame: ExploreTransitionSourceFrame
}

type SyncMagnoliaAppStateFromSessionParams = {
  session: MagnoliaGameSession
  input: ReturnType<typeof useMagnoliaInput>
  stateRef: RefObject<MagnoliaAppState>
  audioEventStateRef: RefObject<ReturnType<typeof createAudioEventAdapterState>>
  setState: Dispatch<SetStateAction<MagnoliaAppState>>
  incomingPresentationRequests?: PresentationRequest[]
  incomingEvents?: DomainEvent[]
  exploreInteractionContext?: ExploreInteractionContext
}

export function syncMagnoliaAppStateFromSession({
  session,
  input,
  stateRef,
  audioEventStateRef,
  setState,
  incomingPresentationRequests = [],
  incomingEvents = [],
  exploreInteractionContext,
}: SyncMagnoliaAppStateFromSessionParams) {
  const queuedPresentationRequests = session.drainPresentationRequests()
  const queuedDomainEvents = session.drainDomainEvents()
  const presentationRequests = attachExploreTransitionSource(
    [
      ...queuedPresentationRequests,
      ...incomingPresentationRequests,
    ],
    exploreInteractionContext,
  )
  const domainEvents = [...queuedDomainEvents, ...incomingEvents]

  const snapshot = session.getSnapshot()
  const content = session.getContentBundle()
  const profile = session.getProfileAggregate()
  const settings = session.getSettings()
  const screen = snapshot.screen
  // 探索 frame は高頻度で同期されます。現在の画面で使わない ViewModel は作らず、
  // session 側の重い selector 実行を必要な画面に限定します。
  const exploreSnapshot = screen === "explore" ? snapshot.explore ?? session.getExploreSnapshot() : null
  const exploreRenderState = screen === "explore" ? session.getExploreRenderState() : null
  const worldMapViewModel = screen === "map" ? session.getWorldMapViewModel() : null
  const shouldProfileBattle = screen === "battle" && isBattlePerformanceProfilerEnabled()
  const battleRenderStateStartedAt = shouldProfileBattle ? readPerformanceNow() : 0
  const battleRenderState = screen === "battle" ? session.getBattleRenderState() : null
  if (battleRenderState && shouldProfileBattle) {
    const projectileCounts = countBattleProjectilesBySide(battleRenderState.projectiles)
    recordBattleRenderStateSample({
      renderStateMs: readPerformanceNow() - battleRenderStateStartedAt,
      enemies: battleRenderState.enemies.length,
      projectiles: battleRenderState.projectiles.length,
      enemyProjectiles: projectileCounts.enemy,
      playerProjectiles: projectileCounts.player,
    })
  }
  const archiveSnapshot =
    screen === "archive" || screen === "equipment" || screen === "settings"
      ? session.getArchiveSnapshot()
      : null
  const parsedPopups = buildCollectiblePopups(domainEvents, content)
  const now = Date.now()

  input.syncButtonEdges(settings)
  // 音声は browser side effect なので、session ではなく Web adapter で意味イベントから変換します。
  playSessionAudioEvents({
    state: audioEventStateRef.current,
    previousSnapshot: stateRef.current.snapshot,
    nextSnapshot: snapshot,
    battleRenderState,
    presentationRequests,
    domainEvents,
  })

  startTransition(() => {
    setState((current) => {
      // プロファイル切り替え時だけ localStorage から seen 一覧を取り直す。
      // 同一プロファイル内の呼び出しでは既存 state を維持し、書き込み直後の巻き戻しを防ぎます。
      const previousProfileId = current.profile?.profile.profileId ?? null
      const nextProfileId = profile?.profile.profileId ?? null
      const seenEquipmentIds =
        previousProfileId === nextProfileId
          ? current.seenEquipmentIds
          : readSeenEquipmentFromStorage(nextProfileId)
      const equipmentGuideTargetId =
        screen === "equipment" && previousProfileId === nextProfileId
          ? current.equipmentGuideTargetId
          : null

      return {
        ...current,
        ready: true,
        errorMessage: undefined,
        snapshot,
        content,
        profile,
        settings,
        exploreSnapshot,
        exploreRenderState,
        worldMapViewModel,
        battleRenderState,
        presentation: mergePresentationRequests({
          current: current.presentation,
          requests: presentationRequests,
          content,
          now,
          battleElapsedMs: battleRenderState?.elapsedMs,
        }),
        archiveSnapshot,
        seenEquipmentIds,
        equipmentGuideTargetId,
        battleTutorialIconState: reduceBattleTutorialIconState({
          current: current.battleTutorialIconState,
          previousScreen: current.snapshot?.screen,
          previousElapsedMs: current.battleRenderState?.elapsedMs,
          nextMissionId: snapshot.battle?.missionId,
          nextElapsedMs: battleRenderState?.elapsedMs,
          domainEvents,
          screen,
        }),
        itemPopups: [
          ...current.itemPopups.filter((popup) => popup.expiresAt > Date.now()),
          ...parsedPopups.popups,
        ].slice(-3),
        // 隠し装備は通常 popup ではなく、専用 modal で内容を見せます。
        equipmentModalNodeId: parsedPopups.equipmentModalNodeId ?? current.equipmentModalNodeId,
      }
    })
  })
}

function reduceBattleTutorialIconState(input: {
  current: MagnoliaAppState["battleTutorialIconState"]
  previousScreen: ReturnType<MagnoliaGameSession["getSnapshot"]>["screen"] | undefined
  previousElapsedMs: number | undefined
  nextMissionId: NonNullable<MagnoliaAppState["battleTutorialIconState"]>["missionId"] | undefined
  nextElapsedMs: number | undefined
  domainEvents: DomainEvent[]
  screen: ReturnType<MagnoliaGameSession["getSnapshot"]>["screen"]
}): MagnoliaAppState["battleTutorialIconState"] {
  if (input.screen !== "battle" || !input.nextMissionId) {
    return null
  }

  const elapsedRewound =
    input.previousElapsedMs !== undefined &&
    input.nextElapsedMs !== undefined &&
    input.nextElapsedMs + 1 < input.previousElapsedMs
  const shouldReset =
    !input.current ||
    input.current.missionId !== input.nextMissionId ||
    input.previousScreen !== "battle" ||
    elapsedRewound
  const emptyState: NonNullable<MagnoliaAppState["battleTutorialIconState"]> = {
    missionId: input.nextMissionId,
    mainUsed: false,
    subUsed: false,
  }
  const base = shouldReset ? emptyState : input.current ?? emptyState

  return {
    missionId: input.nextMissionId,
    // main の近接派生も main 操作として扱い、実際に攻撃が出た時点で表示を閉じます。
    mainUsed: base.mainUsed || input.domainEvents.some(isBattleMainTutorialDismissEvent),
    // barrier は DomainEvent が分かれているため、sub 使用済み判定に含めます。
    subUsed: base.subUsed || input.domainEvents.some(isBattleSubTutorialDismissEvent),
  }
}

function isBattleMainTutorialDismissEvent(event: DomainEvent): boolean {
  return event.type === "playerMainWeaponFired" || event.type === "playerMainMeleeUsed"
}

function isBattleSubTutorialDismissEvent(event: DomainEvent): boolean {
  return event.type === "playerSubWeaponUsed" || event.type === "playerBarrierStarted"
}

function countBattleProjectilesBySide(
  projectiles: NonNullable<ReturnType<MagnoliaGameSession["getBattleRenderState"]>>["projectiles"],
): { enemy: number; player: number } {
  let enemy = 0
  let player = 0
  for (const projectile of projectiles) {
    if (projectile.side === "enemy") {
      enemy += 1
    } else {
      player += 1
    }
  }
  return { enemy, player }
}

function attachExploreTransitionSource(
  requests: PresentationRequest[],
  context: ExploreInteractionContext | undefined,
): PresentationRequest[] {
  if (!context) {
    return requests
  }

  return requests.map((request) => {
    if (request.channel !== "transition") {
      return request
    }
    const distance = Math.hypot(
      request.worldPosition.x - context.worldPosition.x,
      request.worldPosition.y - context.worldPosition.y,
    )
    if (distance > 1) {
      return request
    }

    // transition layer は担当範囲外ですが、探索側でクリック時の画面 anchor を渡せる形にします。
    return {
      ...request,
      sourceFrame: context.sourceFrame,
    }
  })
}

import type {
  DomainEvent,
  GameCommand,
  PresentationRequest,
} from "@magnolia/contracts"
import type { MagnoliaGameSession } from "@magnolia/game-session"
import type {
  MagnoliaAppState,
  MagnoliaAppStateSetter,
} from "@/app/app-state"
import type { ExploreInteractionContext } from "@/app/session-sync"
import {
  createExplorePopup,
  pushExplorePopup,
} from "@/app/popups/item-popups"

export type SyncFromSession = (
  session: MagnoliaGameSession,
  incomingPresentationRequests?: PresentationRequest[],
  incomingEvents?: DomainEvent[],
  exploreInteractionContext?: ExploreInteractionContext,
) => void

type DispatchAndSyncOptions = {
  syncFromSession: SyncFromSession
  setState?: MagnoliaAppStateSetter
  incomingPresentationRequests?: PresentationRequest[]
  incomingEvents?: DomainEvent[]
  exploreInteractionContext?: ExploreInteractionContext
  afterDispatch?: () => void
  beforeSync?: () => void
}

export async function dispatchAndSync(
  session: MagnoliaGameSession,
  command: GameCommand,
  options: DispatchAndSyncOptions,
): Promise<boolean> {
  if (!canRunCommand(session, command, options.setState)) {
    return false
  }

  await session.dispatch(command)
  options.afterDispatch?.()
  options.beforeSync?.()
  options.syncFromSession(
    session,
    options.incomingPresentationRequests,
    options.incomingEvents,
    options.exploreInteractionContext,
  )
  return true
}

export async function dispatchManyAndSync(
  session: MagnoliaGameSession,
  commands: GameCommand[],
  options: DispatchAndSyncOptions,
): Promise<boolean> {
  for (const command of commands) {
    if (!canRunCommand(session, command, options.setState)) {
      return false
    }
  }

  for (const command of commands) {
    await session.dispatch(command)
  }
  options.afterDispatch?.()
  options.beforeSync?.()
  options.syncFromSession(
    session,
    options.incomingPresentationRequests,
    options.incomingEvents,
    options.exploreInteractionContext,
  )
  return true
}

function canRunCommand(
  session: MagnoliaGameSession,
  command: GameCommand,
  setState: MagnoliaAppStateSetter | undefined,
): boolean {
  if (command.type !== "openMap") {
    return true
  }

  const canOpenMap = session.getExploreSnapshot()?.featureAccess.canOpenMap ?? false
  if (canOpenMap) {
    return true
  }

  // map は未解放時に session command まで進めず、探索画面の短い popup で理由を返します。
  setState?.((current: MagnoliaAppState) => ({
    ...current,
    itemPopups: pushExplorePopup(
      current.itemPopups,
      createExplorePopup("locked", "os magnolia が必要です。"),
    ),
  }))
  return false
}

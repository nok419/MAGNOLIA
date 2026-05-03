import type {
  DomainEvent,
  PresentationRequest,
  RootSnapshot,
} from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { TITLE_UI_SOUND_VOLUME, audioEvents } from "@/audio"

export type AudioEventAdapterState = {
  playedPresentationRequestIds: Set<string>
}

type PlaySessionAudioEventsInput = {
  state: AudioEventAdapterState
  previousSnapshot: RootSnapshot | null
  nextSnapshot: RootSnapshot
  battleRenderState: BattleRenderState | null
  presentationRequests: PresentationRequest[]
  domainEvents: DomainEvent[]
}

const MAX_PLAYED_PRESENTATION_REQUEST_IDS = 500

const MENU_SCREENS: ReadonlySet<RootSnapshot["screen"]> = new Set([
  "archive",
  "equipment",
  "map",
  "settings",
])

export function createAudioEventAdapterState(): AudioEventAdapterState {
  return {
    playedPresentationRequestIds: new Set(),
  }
}

export function playSessionAudioEvents(input: PlaySessionAudioEventsInput): void {
  playScreenTransitionAudio(input.previousSnapshot, input.nextSnapshot, input.domainEvents)
  syncTransmissionVoicePlayback(input.nextSnapshot, input.battleRenderState)

  for (const event of input.domainEvents) {
    playDomainAudio(event)
  }

  for (const request of input.presentationRequests) {
    // 表示側 reducer と同じ requestId を使い、再同期で同じ音が重ならないようにします。
    if (!rememberPresentationRequest(input.state, request.requestId)) {
      continue
    }
    playPresentationAudio(request)
  }
}

function syncTransmissionVoicePlayback(
  snapshot: RootSnapshot,
  renderState: BattleRenderState | null,
): void {
  const audioState = renderState?.transmissionAudio
  if (snapshot.screen !== "battle" || !audioState) {
    audioEvents.stopTransmissionVoice()
    return
  }

  if (!audioState.audioAssetId || audioState.phase === "result") {
    audioEvents.stopTransmissionVoice()
    return
  }

  // 字幕の仮想時計を正本にし、実音声は drift が出た時だけ seek して戻します。
  audioEvents.syncTransmissionVoice({
    transmissionId: audioState.transmissionId,
    audioAssetId: audioState.audioAssetId,
    audioPlaybackMs: audioState.audioPlaybackMs,
    playing: audioState.phase === "playing" && !audioState.isPaused,
  })
}

function playScreenTransitionAudio(
  previousSnapshot: RootSnapshot | null,
  nextSnapshot: RootSnapshot,
  domainEvents: DomainEvent[],
): void {
  const previousScreen = previousSnapshot?.screen
  if (!previousScreen) {
    if (nextSnapshot.screen === "title") {
      audioEvents.titleOpened()
    }
    return
  }

  if (previousScreen === nextSnapshot.screen) {
    return
  }

  const previousWasMenu = MENU_SCREENS.has(previousScreen)
  const nextIsMenu = MENU_SCREENS.has(nextSnapshot.screen)

  if (!previousWasMenu && nextIsMenu) {
    if (previousScreen === "explore" && nextSnapshot.screen === "equipment") {
      audioEvents.equipmentPanelOpen()
    } else if (previousScreen === "title") {
      audioEvents.uiOpen({ volume: TITLE_UI_SOUND_VOLUME })
    } else {
      audioEvents.uiOpen()
    }
  } else if (previousWasMenu && !nextIsMenu) {
    audioEvents.uiClose(nextSnapshot.screen === "title" ? { volume: TITLE_UI_SOUND_VOLUME } : undefined)
  }

  if (nextSnapshot.screen === "title") {
    audioEvents.titleOpened()
  }
  if (previousScreen === "title" && nextSnapshot.screen === "explore") {
    audioEvents.explorationEntered()
  }

  const startedMission = domainEvents.some((event) => event.type === "missionStarted")
  if (nextSnapshot.screen === "battle" && previousScreen !== "battle" && !startedMission) {
    audioEvents.combatEntered()
  }
  if (previousScreen === "battle" && nextSnapshot.screen !== "battle") {
    audioEvents.combatExited()
  }
}

function playDomainAudio(event: DomainEvent): void {
  switch (event.type) {
    case "collectibleCollected":
      if (event.collectibleKind === "hiddenEquipment") {
        audioEvents.equipmentPickedUp()
      } else {
        audioEvents.itemPickedUp()
      }
      break
    case "missionStarted":
      audioEvents.missionEntered(event.missionId)
      break
    case "missionCleared":
      audioEvents.missionCleared()
      break
    case "exploreScanStarted":
      audioEvents.scanStarted()
      break
    case "exploreScanHit":
      audioEvents.scanHit()
      break
    case "equipmentEquipped":
      audioEvents.equipmentSwitch()
      break
    case "equipmentUnequipped":
      audioEvents.equipmentSwitch()
      break
    case "saveWritten":
      audioEvents.saveWritten()
      break
    case "playerMainWeaponFired":
      audioEvents.playerShot()
      break
    case "playerMainMeleeUsed":
      audioEvents.playerMelee()
      break
    case "playerProjectileHit":
      audioEvents.enemyHit()
      break
    case "enemyProjectileFired":
      audioEvents.enemyShot()
      break
    case "enemyDestroyed":
      audioEvents.enemyDestroyed()
      break
    case "playerSubWeaponUsed":
      // サブ装備の汎用イベントから、専用音源があるミュートチャンバーだけを分けます。
      if (event.runtimeHandlerId === "sub.field.silent_wave") {
        audioEvents.silentWave()
      } else {
        audioEvents.equipmentUse()
      }
      break
    case "playerBarrierStarted":
      audioEvents.barrierEnabled()
      break
    case "playerBarrierStopped":
      audioEvents.barrierDisabled()
      break
    case "playerBarrierHit":
      audioEvents.barrierHit({ volume: Math.min(0.62, 0.32 + event.hitCount * 0.04) })
      break
    default:
      break
  }
}

function playPresentationAudio(request: PresentationRequest): void {
  switch (request.cueId) {
    case "battle.player.hit":
      audioEvents.playerHit()
      break
    case "battle.fragment.recovered":
      audioEvents.itemPickedUp()
      break
    case "battle.noise.peak":
      audioEvents.radioStaticStart()
      break
    case "battle.noise.clear":
      audioEvents.radioStaticStop()
      break
    default:
      break
  }
}

function rememberPresentationRequest(state: AudioEventAdapterState, requestId: string): boolean {
  if (state.playedPresentationRequestIds.has(requestId)) {
    return false
  }

  state.playedPresentationRequestIds.add(requestId)
  while (state.playedPresentationRequestIds.size > MAX_PLAYED_PRESENTATION_REQUEST_IDS) {
    const oldest = state.playedPresentationRequestIds.values().next().value
    if (!oldest) {
      break
    }
    state.playedPresentationRequestIds.delete(oldest)
  }
  return true
}

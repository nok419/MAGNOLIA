import { audioHub, type BgmOptions, type LoopOptions, type PlaySoundOptions } from './AudioHub';
import { SOUND_KEYS, type SoundKey } from './soundCatalog';

export type MenuDirection = 'up' | 'down' | 'left' | 'right';
export type EnemyShotVariant = 'default' | 'fast' | 'heavy' | 'laser';

const menuDirectionKey: Record<MenuDirection, SoundKey> = {
  up: SOUND_KEYS.UI_MENU_UP,
  down: SOUND_KEYS.UI_MENU_DOWN,
  left: SOUND_KEYS.UI_MENU_LEFT,
  right: SOUND_KEYS.UI_MENU_RIGHT,
};

const enemyShotKey: Record<EnemyShotVariant, SoundKey> = {
  default: SOUND_KEYS.COMBAT_ENEMY_SHOT,
  fast: SOUND_KEYS.COMBAT_ENEMY_SHOT_FAST,
  heavy: SOUND_KEYS.COMBAT_ENEMY_SHOT_HEAVY,
  laser: SOUND_KEYS.COMBAT_ENEMY_SHOT_LASER,
};

const missionBgmById = new Map<string, SoundKey>();
const playerHitKeys: readonly SoundKey[] = [
  SOUND_KEYS.COMBAT_PLAYER_HIT,
  SOUND_KEYS.COMBAT_PLAYER_HIT_HEAVY,
];
// タイトル確定後は 1 秒だけ暗転を見せ、音源の長さでは画面遷移を止めません。
const TITLE_CONFIRM_TRANSITION_WAIT_MS = 1000;

function selectPlayerHitKey(): SoundKey {
  // damaged_1 / damaged_2 は強弱指定ではなく連番なので、被弾の反復感を減らす用途で交互に近いランダム選択にします。
  return playerHitKeys[Math.floor(Math.random() * playerHitKeys.length)] ?? SOUND_KEYS.COMBAT_PLAYER_HIT;
}

export function initializeGameAudio(): void {
  audioHub.preload();
  audioHub.installUnlockListeners();
}

export function setMissionBgm(missionId: string, key: SoundKey): void {
  missionBgmById.set(missionId, key);
}

export function clearMissionBgm(missionId: string): void {
  missionBgmById.delete(missionId);
}

export function resolveMissionBgm(missionId?: string): SoundKey {
  if (missionId && missionBgmById.has(missionId)) {
    return missionBgmById.get(missionId) ?? SOUND_KEYS.BGM_MISSION_DEFAULT;
  }

  return SOUND_KEYS.BGM_MISSION_DEFAULT;
}

export const audioEvents = {
  titleOpened(options?: BgmOptions): void {
    audioHub.playBgm(SOUND_KEYS.BGM_TITLE, options);
  },

  newGameSelected(): Promise<void> {
    audioHub.unlock();
    const waitForConfirmCue = audioHub.playAndWait(SOUND_KEYS.TITLE_NEW_GAME, {
      minimumWaitMs: TITLE_CONFIRM_TRANSITION_WAIT_MS,
      maxWaitMs: TITLE_CONFIRM_TRANSITION_WAIT_MS,
    });
    audioHub.stopBgm(450);
    return waitForConfirmCue;
  },

  loadGameSelected(): Promise<void> {
    audioHub.unlock();
    const waitForConfirmCue = audioHub.playAndWait(SOUND_KEYS.TITLE_LOAD_GAME, {
      minimumWaitMs: TITLE_CONFIRM_TRANSITION_WAIT_MS,
      maxWaitMs: TITLE_CONFIRM_TRANSITION_WAIT_MS,
    });
    audioHub.stopBgm(450);
    return waitForConfirmCue;
  },

  menuMove(direction: MenuDirection = 'down'): void {
    audioHub.play(menuDirectionKey[direction]);
  },

  menuConfirm(): void {
    audioHub.unlock();
    audioHub.play(SOUND_KEYS.UI_CONFIRM);
  },

  menuCancel(): void {
    audioHub.play(SOUND_KEYS.UI_CANCEL);
  },

  uiOpen(): void {
    audioHub.play(SOUND_KEYS.UI_OPEN);
  },

  equipmentPanelOpen(): void {
    // E キーで開く装備画面は探索操作からの遷移なので、通常の panel open より明瞭に鳴らします。
    audioHub.play(SOUND_KEYS.UI_OPEN, { volume: 0.5 });
  },

  uiClose(): void {
    audioHub.play(SOUND_KEYS.UI_CLOSE);
  },

  uiError(): void {
    audioHub.play(SOUND_KEYS.UI_ERROR);
  },

  saveWritten(): void {
    audioHub.play(SOUND_KEYS.SYSTEM_SAVE_LOAD);
  },

  explorationEntered(options?: BgmOptions): void {
    audioHub.playBgm(SOUND_KEYS.BGM_EXPLORATION, options ?? { fadeMs: 700 });
  },

  explorationStep(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.EXPLORE_STEP, options);
  },

  explorationMoveStart(options?: LoopOptions): void {
    audioHub.playLoop(SOUND_KEYS.EXPLORE_MOVE, 'explore.move', options ?? { fadeMs: 140 });
  },

  explorationMoveStop(fadeMs = 320): void {
    audioHub.stopLoop('explore.move', fadeMs);
  },

  scanStarted(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_SCAN);
  },

  scanHit(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_SCAN_HIT);
  },

  itemPickedUp(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_ITEM_PICKUP);
  },

  equipmentPickedUp(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_EQUIPMENT_PICKUP);
  },

  doorOpened(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_DOOR_OPEN);
  },

  doorLocked(): void {
    audioHub.play(SOUND_KEYS.EXPLORE_DOOR_LOCKED);
  },

  missionEntered(missionId?: string): void {
    audioHub.play(SOUND_KEYS.MISSION_IN);
    audioHub.play(SOUND_KEYS.VOICE_RADIO_BLIP);
    audioHub.playBgm(resolveMissionBgm(missionId), { fadeMs: 650 });
  },

  missionObjectiveUpdated(): void {
    audioHub.play(SOUND_KEYS.MISSION_OBJECTIVE_UPDATE);
    audioHub.play(SOUND_KEYS.VOICE_OBJECTIVE);
  },

  missionCleared(): void {
    audioHub.play(SOUND_KEYS.MISSION_CLEAR);
    audioHub.stopLoop('noise.radioStatic', 250);
    audioHub.stopLoop('noise.lowHp', 250);
  },

  missionFailed(): void {
    audioHub.play(SOUND_KEYS.MISSION_FAIL);
    audioHub.stopLoop('noise.radioStatic', 250);
    audioHub.stopLoop('noise.lowHp', 250);
  },

  missionBgm(missionId?: string, options?: BgmOptions): void {
    audioHub.playBgm(resolveMissionBgm(missionId), options ?? { fadeMs: 650 });
  },

  combatEntered(options?: BgmOptions): void {
    audioHub.playBgm(SOUND_KEYS.BGM_COMBAT, options ?? { fadeMs: 350 });
  },

  combatExited(options?: BgmOptions): void {
    audioHub.playBgm(SOUND_KEYS.BGM_EXPLORATION, options ?? { fadeMs: 650 });
  },

  playerShot(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.COMBAT_PLAYER_SHOT, options);
  },

  enemyShot(variant: EnemyShotVariant = 'default', options?: PlaySoundOptions): void {
    audioHub.play(enemyShotKey[variant], options);
  },

  playerHit(options?: PlaySoundOptions): void {
    audioHub.play(selectPlayerHitKey(), options);
  },

  enemyHit(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.COMBAT_ENEMY_HIT, options);
  },

  enemyDestroyed(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.COMBAT_ENEMY_DESTROYED, options);
  },

  reload(): void {
    audioHub.play(SOUND_KEYS.COMBAT_RELOAD);
  },

  noAmmo(): void {
    audioHub.play(SOUND_KEYS.COMBAT_NO_AMMO);
  },

  explosion(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.COMBAT_EXPLOSION, options);
  },

  equipmentSwitch(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_SWITCH);
  },

  equipmentArchiveCategorySelect(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_ARCHIVE_CATEGORY_SELECT);
  },

  equipmentArchiveDetailSelect(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_ARCHIVE_DETAIL_SELECT);
  },

  equipmentArchiveDetailDecision(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_SWITCH);
  },

  equipmentUpgrade(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_UPGRADE);
  },

  equipmentUse(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_USE);
  },

  silentWave(): void {
    audioHub.play(SOUND_KEYS.EQUIPMENT_SILENT_WAVE);
  },

  barrierEnabled(): void {
    audioHub.play(SOUND_KEYS.BARRIER_UP);
    audioHub.playLoop(SOUND_KEYS.BARRIER_LOOP, 'barrier.player', { fadeMs: 180 });
  },

  barrierDisabled(): void {
    audioHub.stopLoop('barrier.player', 180);
    audioHub.play(SOUND_KEYS.BARRIER_DOWN);
  },

  barrierHit(options?: PlaySoundOptions): void {
    audioHub.play(SOUND_KEYS.BARRIER_HIT, options);
  },

  barrierBroken(): void {
    audioHub.play(SOUND_KEYS.BARRIER_BREAK);
    audioHub.stopLoop('barrier.player', 80);
  },

  radioStaticStart(options?: LoopOptions): void {
    audioHub.playLoop(SOUND_KEYS.NOISE_RADIO_STATIC, 'noise.radioStatic', options ?? { fadeMs: 400 });
  },

  radioStaticStop(): void {
    audioHub.stopLoop('noise.radioStatic', 400);
  },

  syncTransmissionVoice(input: {
    transmissionId: string;
    audioAssetId: string;
    audioPlaybackMs: number;
    playing: boolean;
  }): void {
    audioHub.syncTransmissionVoice({
      transmissionId: input.transmissionId,
      assetId: input.audioAssetId,
      playbackMs: input.audioPlaybackMs,
      playing: input.playing,
      driftToleranceMs: 160,
    });
  },

  pauseTransmissionVoice(): void {
    audioHub.pauseTransmissionVoice();
  },

  stopTransmissionVoice(fadeMs = 120): void {
    audioHub.stopTransmissionVoice(fadeMs);
  },

  lowHpStart(options?: LoopOptions): void {
    audioHub.playLoop(SOUND_KEYS.NOISE_LOW_HP, 'noise.lowHp', options ?? { fadeMs: 350 });
  },

  lowHpStop(): void {
    audioHub.stopLoop('noise.lowHp', 350);
  },
};

export function playSound(key: SoundKey, options?: PlaySoundOptions): boolean {
  return audioHub.play(key, options);
}

export function withSound<TArgs extends unknown[], TResult>(
  key: SoundKey,
  fn: (...args: TArgs) => TResult,
  options?: PlaySoundOptions,
): (...args: TArgs) => TResult {
  return (...args: TArgs): TResult => {
    audioHub.play(key, options);
    return fn(...args);
  };
}

import {
  SOUND_ASSET_BY_ID,
  SOUND_ASSETS,
  SOUND_EVENT_BY_KEY,
  SOUND_EVENTS,
  type SoundAssetDefinition,
  type SoundAssetId,
  type SoundChannel,
  type SoundEventDefinition,
  type SoundKey,
  type SoundPriority,
} from './soundCatalog';

export type AudioMixerGains = Record<SoundChannel, number> & {
  muted: boolean;
};

export type PlaySoundOptions = {
  /**
   * イベント発火時だけ使う音源倍率の上書きです。
   * 未指定なら soundCatalog.ts の sourceGain を使い、ユーザー設定倍率は別途掛け合わせます。
   */
  volume?: number;
  rate?: number;
  detune?: number;
  loop?: boolean;
  cooldownMs?: number;
  polyphony?: number;
  ignoreMute?: boolean;
};

export type PlaySoundAndWaitOptions = PlaySoundOptions & {
  minimumWaitMs?: number;
  maxWaitMs?: number;
};

export type BgmOptions = {
  volume?: number;
  fadeMs?: number;
};

export type TransmissionVoiceSyncOptions = {
  transmissionId: string;
  assetId: string;
  playbackMs: number;
  playing: boolean;
  driftToleranceMs?: number;
  volume?: number;
};

export type LoopOptions = PlaySoundOptions & {
  fadeMs?: number;
};

export const DEFAULT_AUDIO_MIXER_GAINS: AudioMixerGains = {
  master: 1,
  bgm: 1,
  sfx: 1,
  ui: 1,
  voice: 1,
  noise: 1,
  muted: false,
};

type LoopState = {
  key: SoundKey;
  audio: HTMLAudioElement;
};

type TransmissionVoiceState = {
  transmissionId: string;
  assetId: SoundAssetId;
  audio: HTMLAudioElement;
  sourceGain: number;
};

type PlaybackFailureHandler = (error: unknown) => void;

type SoundPlaybackStartResult = {
  started: boolean;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const readPositiveGain = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
};

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const detuneToPlaybackRate = (detuneCents: number): number => 2 ** (detuneCents / 1200);

export class AudioHub {
  private mixerGains: AudioMixerGains = { ...DEFAULT_AUDIO_MIXER_GAINS };
  private assetCache = new Map<SoundAssetId, HTMLAudioElement>();
  private activeByKey = new Map<SoundKey, Set<HTMLAudioElement>>();
  private lastPlayedAt = new Map<SoundKey, number>();
  private loops = new Map<string, LoopState>();
  private currentBgm?: LoopState;
  private transmissionVoice?: TransmissionVoiceState;
  private pendingBgm?: { key: SoundKey; options?: BgmOptions };
  private warnedMissingEvents = new Set<SoundKey>();
  private warnedMissingAssets = new Set<string>();
  private warnedPlaybackFailures = new Set<string>();
  private unavailableAssetIds = new Set<SoundAssetId>();
  private unlockListenersInstalled = false;
  private unlocked = false;

  preload(): void {
    if (typeof Audio === 'undefined') return;

    for (const asset of SOUND_ASSETS) {
      if (asset.optional) {
        continue;
      }
      this.getOrCreateBaseAudio(asset.id);
    }
  }

  installUnlockListeners(target?: Window | Document): void {
    if (this.unlockListenersInstalled || typeof window === 'undefined') return;

    const eventTarget = target ?? window;
    this.unlockListenersInstalled = true;
    const unlock = (): void => {
      this.unlock();
    };

    eventTarget.addEventListener('pointerdown', unlock, { once: true, capture: true });
    eventTarget.addEventListener('keydown', unlock, { once: true, capture: true });
    eventTarget.addEventListener('touchstart', unlock, { once: true, capture: true });
  }

  unlock(): boolean {
    this.unlocked = true;
    this.preload();

    const firstAsset = SOUND_ASSETS.find((asset) => !asset.optional) ?? SOUND_ASSETS[0];
    if (!firstAsset) {
      this.flushPendingBgmWhenPossible();
      return true;
    }

    const audio = this.createPlayableAudio(firstAsset.id);
    if (!audio) {
      this.flushPendingBgmWhenPossible();
      return false;
    }

    audio.muted = true;
    audio.volume = 0;

    try {
      const playResult = audio.play();
      if (typeof playResult?.then === 'function') {
        void playResult
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            this.flushPendingBgmWhenPossible();
          })
          .catch(() => {
            this.flushPendingBgmWhenPossible();
          });
      } else {
        this.flushPendingBgmWhenPossible();
      }
    } catch {
      this.flushPendingBgmWhenPossible();
    }

    return true;
  }

  play(key: SoundKey, options: PlaySoundOptions = {}): boolean {
    return this.startOneShotSound(key, options).started;
  }

  playAndWait(key: SoundKey, options: PlaySoundAndWaitOptions = {}): Promise<void> {
    const minimumWaitMs = Math.max(0, options.minimumWaitMs ?? 0);
    const maxWaitMs = Math.max(minimumWaitMs, options.maxWaitMs ?? 0);
    const startedAt = now();

    return new Promise((resolve) => {
      let resolved = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      let minimumTimer: ReturnType<typeof setTimeout> | undefined;

      const resolveOnce = (): void => {
        if (resolved) return;
        resolved = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (minimumTimer) clearTimeout(minimumTimer);
        resolve();
      };

      const finishAfterMinimumWait = (): void => {
        const remainingMs = Math.max(0, minimumWaitMs - (now() - startedAt));
        if (remainingMs > 0) {
          minimumTimer = setTimeout(resolveOnce, remainingMs);
          return;
        }
        resolveOnce();
      };

      if (maxWaitMs > 0) {
        // 音源が長い場合や ended が来ない場合でも、呼び出し側の待機時間を固定するための上限です。
        fallbackTimer = setTimeout(finishAfterMinimumWait, maxWaitMs);
      }

      const result = this.startOneShotSound(key, options, finishAfterMinimumWait);
      if (!result.started) {
        finishAfterMinimumWait();
      }
    });
  }

  private startOneShotSound(
    key: SoundKey,
    options: PlaySoundOptions = {},
    onComplete?: () => void,
  ): SoundPlaybackStartResult {
    const definition = this.getPlayableDefinition(key);
    if (!definition) return { started: false };
    if (this.isOutputMuted() && !options.ignoreMute) return { started: false };

    const cooldownMs = options.cooldownMs ?? definition.cooldownMs ?? 0;
    const currentTime = now();
    const previousTime = this.lastPlayedAt.get(key) ?? Number.NEGATIVE_INFINITY;
    if (cooldownMs > 0 && currentTime - previousTime < cooldownMs) {
      return { started: false };
    }

    const volume = this.resolveEventVolume(definition, options.volume);
    if (volume <= 0 && !options.loop) return { started: false };

    const polyphony = Math.max(1, Math.floor(options.polyphony ?? definition.polyphony ?? 4));
    const activeSounds = this.getActiveSounds(key);
    if (activeSounds.size >= polyphony) {
      const oldest = activeSounds.values().next().value;
      this.stopAndRelease(oldest);
    }

    const audio = this.createPlayableAudio(definition.assetId);
    if (!audio) return { started: false };

    this.applyPlaybackOptions(audio, definition, {
      ...options,
      volume,
      loop: options.loop ?? definition.loop ?? false,
    });

    activeSounds.add(audio);
    let completed = false;
    const cleanup = (): void => {
      activeSounds.delete(audio);
      audio.removeEventListener('ended', complete);
      audio.removeEventListener('pause', complete);
    };
    const complete = (): void => {
      if (completed) return;
      completed = true;
      cleanup();
      onComplete?.();
    };
    audio.addEventListener('ended', complete, { once: true });
    audio.addEventListener('pause', complete, { once: true });
    const started = this.tryPlayAudio(audio, (error) => {
      complete();
      this.handlePlaybackFailure(definition, error);
    });
    if (!started) {
      return { started: false };
    }

    this.lastPlayedAt.set(key, currentTime);
    return { started: true };
  }

  playLoop(key: SoundKey, loopId: string = key, options: LoopOptions = {}): boolean {
    if (this.loops.has(loopId)) return true;

    const definition = this.getPlayableDefinition(key);
    if (!definition) return false;
    if (this.isOutputMuted() && !options.ignoreMute) return false;

    const targetVolume = this.resolveEventVolume(definition, options.volume);
    if (targetVolume <= 0) return false;
    const fadeMs = options.fadeMs ?? 120;
    const audio = this.createPlayableAudio(definition.assetId);
    if (!audio) return false;

    this.applyPlaybackOptions(audio, definition, {
      ...options,
      loop: true,
      volume: fadeMs > 0 ? 0 : targetVolume,
    });
    const started = this.tryPlayAudio(audio, (error) => {
      this.loops.delete(loopId);
      this.stopAndRelease(audio);
      this.handlePlaybackFailure(definition, error);
    });
    if (!started) {
      return false;
    }

    this.loops.set(loopId, { key, audio });
    if (fadeMs > 0) {
      this.fadeAudio(audio, targetVolume, fadeMs);
    }

    return true;
  }

  stopLoop(loopId: string, fadeMs = 160): void {
    const loop = this.loops.get(loopId);
    if (!loop) return;

    this.loops.delete(loopId);
    this.fadeAudio(loop.audio, 0, fadeMs, () => this.stopAndRelease(loop.audio));
  }

  playBgm(key: SoundKey, options: BgmOptions = {}): boolean {
    const definition = this.getPlayableDefinition(key);
    if (!definition || definition.category !== 'bgm') return false;
    if (this.isOutputMuted()) return false;

    if (!this.unlocked) {
      this.pendingBgm = { key, options };
      this.installUnlockListeners();
      return false;
    }

    const fadeMs = options.fadeMs ?? 600;
    const targetVolume = this.resolveEventVolume(definition, options.volume);
    if (targetVolume <= 0) return false;

    if (this.currentBgm?.key === key) {
      this.fadeAudio(this.currentBgm.audio, targetVolume, fadeMs);
      return true;
    }

    const previousBgm = this.currentBgm;
    if (previousBgm) {
      this.fadeAudio(previousBgm.audio, 0, fadeMs, () => this.stopAndRelease(previousBgm.audio));
    }

    const audio = this.createPlayableAudio(definition.assetId);
    if (!audio) return false;

    this.applyPlaybackOptions(audio, definition, {
      loop: true,
      volume: fadeMs > 0 ? 0 : targetVolume,
    });
    const started = this.tryPlayAudio(audio, (error) => {
      if (this.currentBgm?.audio === audio) {
        this.currentBgm = undefined;
      }
      this.stopAndRelease(audio);
      this.handlePlaybackFailure(definition, error);
    });
    if (!started) {
      return false;
    }

    this.currentBgm = { key, audio };
    this.fadeAudio(audio, targetVolume, fadeMs);
    return true;
  }

  stopBgm(fadeMs = 500): void {
    const bgm = this.currentBgm;
    if (!bgm) return;

    this.currentBgm = undefined;
    this.fadeAudio(bgm.audio, 0, fadeMs, () => this.stopAndRelease(bgm.audio));
  }

  syncTransmissionVoice(options: TransmissionVoiceSyncOptions): boolean {
    const assetId = options.assetId as SoundAssetId;
    const asset = SOUND_ASSET_BY_ID[assetId];
    if (!asset) {
      this.warnMissingAssetOnce(options.assetId);
      this.stopTransmissionVoice(0);
      return false;
    }

    if (!this.unlocked) {
      this.installUnlockListeners();
      return false;
    }

    const sourceGain = readPositiveGain(options.volume ?? 1);
    const targetTime = Math.max(0, options.playbackMs / 1000);
    const driftToleranceSeconds = Math.max(0.03, (options.driftToleranceMs ?? 160) / 1000);
    let voice = this.transmissionVoice;
    if (
      !voice ||
      voice.transmissionId !== options.transmissionId ||
      voice.assetId !== assetId
    ) {
      this.stopTransmissionVoice(0);
      const audio = this.createPlayableAudio(assetId);
      if (!audio) return false;
      audio.loop = false;
      voice = {
        transmissionId: options.transmissionId,
        assetId,
        audio,
        sourceGain,
      };
      this.transmissionVoice = voice;
    }

    voice.sourceGain = sourceGain;
    voice.audio.volume = this.resolveChannelVolume('voice', voice.sourceGain);
    voice.audio.muted = this.isOutputMuted();
    if (Math.abs(voice.audio.currentTime - targetTime) > driftToleranceSeconds) {
      voice.audio.currentTime = targetTime;
    }

    if (!options.playing || this.isOutputMuted()) {
      voice.audio.pause();
      return true;
    }

    if (voice.audio.paused) {
      return this.tryPlayAudio(voice.audio, (error) => {
        this.stopTransmissionVoice(0);
        this.handleAssetPlaybackFailure(asset, `transmission voice ${options.transmissionId}`, error);
      });
    }
    return true;
  }

  pauseTransmissionVoice(): void {
    this.transmissionVoice?.audio.pause();
  }

  stopTransmissionVoice(fadeMs = 120): void {
    const voice = this.transmissionVoice;
    if (!voice) return;

    this.transmissionVoice = undefined;
    this.fadeAudio(voice.audio, 0, fadeMs, () => this.stopAndRelease(voice.audio));
  }

  applyMixerGains(gains: AudioMixerGains): void {
    const nextGains = normalizeMixerGains(gains);
    if (areMixerGainsEqual(this.mixerGains, nextGains)) {
      return;
    }

    this.mixerGains = nextGains;
    this.updateLongRunningAudioState();
  }

  getMixerGains(): AudioMixerGains {
    return { ...this.mixerGains };
  }

  getMissingSounds(priority?: SoundPriority): SoundEventDefinition[] {
    return SOUND_EVENTS.filter((definition) => definition.status === 'missing' && (!priority || definition.priority === priority));
  }

  getPlaceholderSounds(): SoundEventDefinition[] {
    return SOUND_EVENTS.filter((definition) => definition.status === 'placeholder');
  }

  private flushPendingBgmWhenPossible(): void {
    if (!this.pendingBgm || !this.unlocked) return;

    const pending = this.pendingBgm;
    this.pendingBgm = undefined;
    this.playBgm(pending.key, pending.options);
  }

  private getPlayableDefinition(key: SoundKey): (SoundEventDefinition & { assetId: SoundAssetId }) | undefined {
    const definition = SOUND_EVENT_BY_KEY[key];
    if (!definition) {
      this.warnMissingEventOnce(key, 'sound event is not registered');
      return undefined;
    }

    if (!definition.assetId) {
      this.warnMissingEventOnce(key, 'sound event has no asset yet');
      return undefined;
    }

    if (!SOUND_ASSET_BY_ID[definition.assetId]) {
      this.warnMissingAssetOnce(definition.assetId);
      return undefined;
    }

    if (this.unavailableAssetIds.has(definition.assetId)) {
      return undefined;
    }

    return definition as SoundEventDefinition & { assetId: SoundAssetId };
  }

  private getOrCreateBaseAudio(assetId: SoundAssetId): HTMLAudioElement | undefined {
    const cached = this.assetCache.get(assetId);
    if (cached) return cached;

    if (typeof Audio === 'undefined') return undefined;
    if (this.unavailableAssetIds.has(assetId)) return undefined;

    const asset = SOUND_ASSET_BY_ID[assetId];
    if (!asset) {
      this.warnMissingAssetOnce(assetId);
      return undefined;
    }

    const audio = new Audio(asset.url);
    audio.preload = asset.optional ? 'none' : 'auto';
    if (!asset.optional) {
      try {
        audio.load();
      } catch (error) {
        this.handleAssetLoadFailure(asset, error);
      }
    }
    this.assetCache.set(assetId, audio);
    return audio;
  }

  private createPlayableAudio(assetId: SoundAssetId): HTMLAudioElement | undefined {
    const baseAudio = this.getOrCreateBaseAudio(assetId);
    if (!baseAudio) return undefined;

    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.preload = 'auto';
    audio.muted = this.isOutputMuted();
    return audio;
  }

  private applyPlaybackOptions(audio: HTMLAudioElement, definition: SoundEventDefinition, options: PlaySoundOptions): void {
    const detune = options.detune ?? this.randomDetune(definition.detuneRange);
    audio.volume = clamp01(options.volume ?? this.resolveEventVolume(definition));
    audio.loop = options.loop ?? definition.loop ?? false;
    audio.muted = this.isOutputMuted() && !options.ignoreMute;
    audio.playbackRate = typeof options.rate === 'number' ? options.rate : detuneToPlaybackRate(detune ?? 0);
  }

  private resolveEventVolume(definition: SoundEventDefinition, eventVolumeOverride?: number): number {
    const sourceGain = readPositiveGain(eventVolumeOverride ?? definition.sourceGain);
    return this.resolveChannelVolume(definition.category, sourceGain);
  }

  private resolveChannelVolume(channel: SoundChannel, sourceGain: number): number {
    const masterVolume = clamp01(this.mixerGains.master);
    const channelVolume = clamp01(this.mixerGains[channel]);
    // HTMLAudioElement.volume は 0..1 のため最終出力だけを丸めます。
    // 1 を超える実増幅が必要になった場合は Web Audio API の GainNode へ移行します。
    return clamp01(sourceGain * masterVolume * channelVolume);
  }

  private updateLongRunningAudioState(): void {
    if (this.currentBgm) {
      const definition = SOUND_EVENT_BY_KEY[this.currentBgm.key];
      if (definition) {
        this.currentBgm.audio.volume = this.resolveEventVolume(definition);
        this.currentBgm.audio.muted = this.isOutputMuted();
      }
    }

    for (const loop of this.loops.values()) {
      const definition = SOUND_EVENT_BY_KEY[loop.key];
      if (definition) {
        loop.audio.volume = this.resolveEventVolume(definition);
        loop.audio.muted = this.isOutputMuted();
      }
    }

    if (this.transmissionVoice) {
      this.transmissionVoice.audio.volume = this.resolveChannelVolume('voice', this.transmissionVoice.sourceGain);
      this.transmissionVoice.audio.muted = this.isOutputMuted();
    }
  }

  private isOutputMuted(): boolean {
    return this.mixerGains.muted || this.mixerGains.master <= 0;
  }

  private fadeAudio(audio: HTMLAudioElement, targetVolume: number, durationMs: number, onComplete?: () => void): void {
    const finalVolume = clamp01(targetVolume);
    if (durationMs <= 0 || typeof requestAnimationFrame === 'undefined') {
      audio.volume = finalVolume;
      onComplete?.();
      return;
    }

    const startedAt = now();
    const initialVolume = audio.volume;

    const tick = (): void => {
      const elapsed = now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      audio.volume = initialVolume + (finalVolume - initialVolume) * progress;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        audio.volume = finalVolume;
        onComplete?.();
      }
    };

    requestAnimationFrame(tick);
  }

  private stopAndRelease(audio: HTMLAudioElement | undefined): void {
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    audio.src = '';
  }

  private getActiveSounds(key: SoundKey): Set<HTMLAudioElement> {
    const activeSounds = this.activeByKey.get(key);
    if (activeSounds) return activeSounds;

    const next = new Set<HTMLAudioElement>();
    this.activeByKey.set(key, next);
    return next;
  }

  private randomDetune(range?: number): number | undefined {
    if (!range || range <= 0) return undefined;
    return Math.round((Math.random() * 2 - 1) * range);
  }

  private tryPlayAudio(audio: HTMLAudioElement, onFailure: PlaybackFailureHandler): boolean {
    try {
      const playResult = audio.play();
      if (typeof playResult?.then === 'function') {
        void playResult.catch(onFailure);
      }
      return true;
    } catch (error) {
      onFailure(error);
      return false;
    }
  }

  private handlePlaybackFailure(definition: SoundEventDefinition & { assetId: SoundAssetId }, error: unknown): void {
    const asset = SOUND_ASSET_BY_ID[definition.assetId];
    if (asset?.optional && !isAutoplayError(error)) {
      this.markOptionalAssetUnavailable(asset);
      this.warnPlaybackFailureOnce(definition, asset, '音源ファイルがまだ配置されていない可能性があります');
      return;
    }

    this.warnPlaybackFailureOnce(definition, asset, 'ブラウザが再生を許可しませんでした');
  }

  private handleAssetLoadFailure(asset: SoundAssetDefinition, error: unknown): void {
    if (asset.optional) {
      this.markOptionalAssetUnavailable(asset);
    }
    const key = `load:${asset.id}`;
    if (this.warnedPlaybackFailures.has(key)) return;
    const reason = error instanceof Error ? error.message : 'unknown reason';
    console.warn(`[AudioHub] audio asset load skipped: ${asset.url} (${reason})`);
    this.warnedPlaybackFailures.add(key);
  }

  private handleAssetPlaybackFailure(asset: SoundAssetDefinition, label: string, error: unknown): void {
    if (asset.optional && !isAutoplayError(error)) {
      this.markOptionalAssetUnavailable(asset);
    }
    const key = `asset:${label}:${asset.id}`;
    if (this.warnedPlaybackFailures.has(key)) return;
    const reason = error instanceof Error ? error.message : 'unknown reason';
    console.warn(`[AudioHub] ${label} playback failed: ${asset.url} (${reason})`);
    this.warnedPlaybackFailures.add(key);
  }

  private markOptionalAssetUnavailable(asset: SoundAssetDefinition): void {
    if (!asset.optional) return;
    this.unavailableAssetIds.add(asset.id);
    this.assetCache.delete(asset.id);
  }

  private warnPlaybackFailureOnce(
    definition: SoundEventDefinition & { assetId: SoundAssetId },
    asset: SoundAssetDefinition | undefined,
    reason: string,
  ): void {
    const key = `play:${definition.key}`;
    if (this.warnedPlaybackFailures.has(key)) return;

    const url = asset?.url ?? definition.assetId;
    console.warn(`[AudioHub] ${reason}: ${definition.key} -> ${url}。音無しで続行します。`);
    this.warnedPlaybackFailures.add(key);
  }

  private warnMissingEventOnce(key: SoundKey, reason: string): void {
    if (this.warnedMissingEvents.has(key)) return;

    console.warn(`[AudioHub] ${reason}: ${key}. soundCatalog.ts に専用 assetId を追加すると鳴ります。`);
    this.warnedMissingEvents.add(key);
  }

  private warnMissingAssetOnce(assetId: string): void {
    if (this.warnedMissingAssets.has(assetId)) return;

    console.warn(`[AudioHub] audio asset is not registered: ${assetId}. soundCatalog.ts の SOUND_ASSETS を確認してください。`);
    this.warnedMissingAssets.add(assetId);
  }
}

export const audioHub = new AudioHub();

function normalizeMixerGains(gains: AudioMixerGains): AudioMixerGains {
  return {
    master: clamp01(gains.master),
    bgm: clamp01(gains.bgm),
    sfx: clamp01(gains.sfx),
    ui: clamp01(gains.ui),
    voice: clamp01(gains.voice),
    noise: clamp01(gains.noise),
    muted: Boolean(gains.muted),
  };
}

function areMixerGainsEqual(left: AudioMixerGains, right: AudioMixerGains): boolean {
  return (
    left.master === right.master &&
    left.bgm === right.bgm &&
    left.sfx === right.sfx &&
    left.ui === right.ui &&
    left.voice === right.voice &&
    left.noise === right.noise &&
    left.muted === right.muted
  );
}

function isAutoplayError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

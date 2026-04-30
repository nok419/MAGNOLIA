import {
  SOUND_ASSET_BY_ID,
  SOUND_ASSETS,
  SOUND_EVENT_BY_KEY,
  SOUND_EVENTS,
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
  volume?: number;
  rate?: number;
  detune?: number;
  loop?: boolean;
  cooldownMs?: number;
  polyphony?: number;
  ignoreMute?: boolean;
};

export type BgmOptions = {
  volume?: number;
  fadeMs?: number;
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

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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
  private pendingBgm?: { key: SoundKey; options?: BgmOptions };
  private warnedMissingEvents = new Set<SoundKey>();
  private warnedMissingAssets = new Set<string>();
  private unlockListenersInstalled = false;
  private unlocked = false;

  preload(): void {
    if (typeof Audio === 'undefined') return;

    for (const asset of SOUND_ASSETS) {
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

    const firstAsset = SOUND_ASSETS[0];
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

    return true;
  }

  play(key: SoundKey, options: PlaySoundOptions = {}): boolean {
    const definition = this.getPlayableDefinition(key);
    if (!definition) return false;
    if (this.isOutputMuted() && !options.ignoreMute) return false;

    const cooldownMs = options.cooldownMs ?? definition.cooldownMs ?? 0;
    const currentTime = now();
    const previousTime = this.lastPlayedAt.get(key) ?? Number.NEGATIVE_INFINITY;
    if (cooldownMs > 0 && currentTime - previousTime < cooldownMs) {
      return false;
    }

    const volume = this.resolveEventVolume(definition, options.volume);
    if (volume <= 0 && !options.loop) return false;

    const polyphony = Math.max(1, Math.floor(options.polyphony ?? definition.polyphony ?? 4));
    const activeSounds = this.getActiveSounds(key);
    if (activeSounds.size >= polyphony) {
      const oldest = activeSounds.values().next().value;
      this.stopAndRelease(oldest);
    }

    const audio = this.createPlayableAudio(definition.assetId);
    if (!audio) return false;

    this.applyPlaybackOptions(audio, definition, {
      ...options,
      volume,
      loop: options.loop ?? definition.loop ?? false,
    });

    activeSounds.add(audio);
    const cleanup = (): void => {
      activeSounds.delete(audio);
      audio.removeEventListener('ended', cleanup);
      audio.removeEventListener('pause', cleanup);
    };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('pause', cleanup, { once: true });

    const playResult = audio.play();
    if (typeof playResult?.then === 'function') {
      void playResult.catch((error) => {
        cleanup();
        console.warn(`[AudioHub] sound play failed: ${definition.key}`, error);
      });
    }

    this.lastPlayedAt.set(key, currentTime);
    return true;
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

    const playResult = audio.play();
    if (typeof playResult?.then === 'function') {
      void playResult.catch((error) => console.warn(`[AudioHub] loop play failed: ${definition.key}`, error));
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

    const playResult = audio.play();
    if (typeof playResult?.then === 'function') {
      void playResult.catch((error) => console.warn(`[AudioHub] bgm play failed: ${definition.key}`, error));
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

    return definition as SoundEventDefinition & { assetId: SoundAssetId };
  }

  private getOrCreateBaseAudio(assetId: SoundAssetId): HTMLAudioElement | undefined {
    const cached = this.assetCache.get(assetId);
    if (cached) return cached;

    if (typeof Audio === 'undefined') return undefined;

    const asset = SOUND_ASSET_BY_ID[assetId];
    if (!asset) {
      this.warnMissingAssetOnce(assetId);
      return undefined;
    }

    const audio = new Audio(asset.url);
    audio.preload = 'auto';
    audio.load();
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
    const eventVolume = clamp01(eventVolumeOverride ?? definition.defaultVolume);
    const masterVolume = clamp01(this.mixerGains.master);
    const channelVolume = clamp01(this.mixerGains[definition.category]);
    return eventVolume * masterVolume * channelVolume;
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

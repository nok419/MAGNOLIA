import {
  SETTINGS_VOLUME_STEPS,
  type SettingsRow,
} from "@magnolia/contracts"
import { audioHub, type AudioMixerGains } from "@/audio"

export type AudioChannel = keyof SettingsRow["volumes"]

export type AudioGainState = {
  master: number
  bgm: number
  se: number
  voice: number
}

export type MagnoliaAudioSettingsChangeEvent = CustomEvent<AudioGainState>

function volumeLevelToGain(level: SettingsRow["volumes"][AudioChannel]): number {
  const normalized = (level - 1) / (SETTINGS_VOLUME_STEPS - 1)
  const minimumGain = 0.06
  // 既存 UI には mute がないため、最小段階でも小さく鳴らします。
  return Number((minimumGain + (1 - minimumGain) * Math.pow(normalized, 1.55)).toFixed(4))
}

export function createAudioGainState(settings: SettingsRow): AudioGainState {
  const master = volumeLevelToGain(settings.volumes.master)
  return {
    master,
    bgm: Number((master * volumeLevelToGain(settings.volumes.bgm)).toFixed(4)),
    se: Number((master * volumeLevelToGain(settings.volumes.se)).toFixed(4)),
    voice: Number((master * volumeLevelToGain(settings.volumes.voice)).toFixed(4)),
  }
}

export function createAudioMixerGains(settings: SettingsRow): AudioMixerGains {
  return {
    master: volumeLevelToGain(settings.volumes.master),
    bgm: volumeLevelToGain(settings.volumes.bgm),
    sfx: volumeLevelToGain(settings.volumes.se),
    ui: volumeLevelToGain(settings.volumes.se),
    voice: volumeLevelToGain(settings.volumes.voice),
    noise: volumeLevelToGain(settings.volumes.se),
    muted: false,
  }
}

export function applyAudioSettings(settings: SettingsRow): AudioGainState {
  const gains = createAudioGainState(settings)
  audioHub.applyMixerGains(createAudioMixerGains(settings))
  const root = document.documentElement
  root.style.setProperty("--magnolia-audio-master-gain", gains.master.toString())
  root.style.setProperty("--magnolia-audio-bgm-gain", gains.bgm.toString())
  root.style.setProperty("--magnolia-audio-se-gain", gains.se.toString())
  root.style.setProperty("--magnolia-audio-voice-gain", gains.voice.toString())
  window.dispatchEvent(
    new CustomEvent<AudioGainState>("magnolia:audio-settings-change", {
      detail: gains,
    }),
  )
  return gains
}

import type { SettingsRow } from "@magnolia/contracts"

export type AudioChannel = keyof SettingsRow["volumes"]

export type AudioGainState = {
  master: number
  bgm: number
  se: number
  voice: number
}

export type MagnoliaAudioSettingsChangeEvent = CustomEvent<AudioGainState>

function volumeLevelToGain(level: SettingsRow["volumes"][AudioChannel]): number {
  const normalized = (level - 1) / 6
  // 小さい段階でも完全な無音へ落とさず、実音源接続後に微調整できる曲線にします。
  return Number(Math.pow(normalized, 1.55).toFixed(4))
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

export function applyAudioSettings(settings: SettingsRow): AudioGainState {
  const gains = createAudioGainState(settings)
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

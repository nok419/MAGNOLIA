import type { SettingsRow } from "@magnolia/contracts"

export const FRAME_INTERVAL_MS = 1000 / 60
export const LOW_FRAME_INTERVAL_MS = 1000 / 30

export function readTargetFrameIntervalMs(settings: SettingsRow): number {
  return settings.lowFrameRateMode ? LOW_FRAME_INTERVAL_MS : FRAME_INTERVAL_MS
}

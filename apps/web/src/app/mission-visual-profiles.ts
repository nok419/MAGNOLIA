import type { MissionVisualProfile as ContentMissionVisualProfile } from "@magnolia/contracts"
import { seededChoice } from "@/app/visual-seed"

export type MissionVisualMotif =
  | "sparse-carrier-wave"
  | "interrupted-arc"
  | "compression-band"

export type MissionVisualProfile = {
  missionId: string
  motif: MissionVisualMotif
  particleDensity: "sparse" | "normal" | "dense"
  carrierDensity: number
  memoryTone: number
  dangerTone: number
  backgroundSink: number
}

const DEFAULT_PROFILE: MissionVisualProfile = {
  missionId: "default",
  motif: "sparse-carrier-wave",
  particleDensity: "sparse",
  carrierDensity: 8,
  memoryTone: 0.08,
  dangerTone: 0.1,
  backgroundSink: 0.82,
}

const FALLBACK_MOTIFS: readonly MissionVisualMotif[] = [
  "sparse-carrier-wave",
  "interrupted-arc",
  "compression-band",
]

export function resolveMissionVisualProfile(
  profile: ContentMissionVisualProfile | undefined,
  fallbackMissionId: string | undefined,
): MissionVisualProfile {
  if (profile) {
    return {
      missionId: profile.missionIds[0] ?? fallbackMissionId ?? DEFAULT_PROFILE.missionId,
      motif: profile.motif,
      particleDensity: profile.particleDensity,
      carrierDensity: profile.carrierDensity,
      memoryTone: profile.memoryTone,
      dangerTone: profile.dangerTone,
      backgroundSink: profile.backgroundSink,
    }
  }

  if (!fallbackMissionId) {
    return DEFAULT_PROFILE
  }

  return {
    ...DEFAULT_PROFILE,
    missionId: fallbackMissionId,
    motif: seededChoice(fallbackMissionId, FALLBACK_MOTIFS),
  }
}

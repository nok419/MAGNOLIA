import { normalizeSettings } from "@magnolia/contracts"
import type {
  ContentBundle,
  ProfileAggregate,
  SaveSlotId,
  SettingsRow,
} from "@magnolia/contracts"
import { normalizePersistedMissionRun } from "./mission-runs"
import { normalizeMissionRuns } from "./mission-runs"
import { normalizeAreaProgressRows, normalizeTransmissionProgressRows } from "./progress"
import { normalizeProfileRow, normalizeSaveSlotRow, readInitialAreaId } from "./profile"
import { readProfileId } from "./primitives"
export { parseImportedAggregate } from "./import-export"
export { normalizePersistedMissionRun } from "./mission-runs"

export function normalizePersistedSettings(settings: SettingsRow | null | undefined): SettingsRow {
  return normalizeSettings(settings)
}

export function normalizePersistedAggregate(input: {
  slotId: SaveSlotId
  aggregate: ProfileAggregate
  content?: ContentBundle
  rebindProfileId?: boolean
}): ProfileAggregate {
  const now = new Date().toISOString()
  const initialAreaId = readInitialAreaId(input.content, input.aggregate?.profile?.currentAreaId)
  // load / save / import の入口はここに限定し、各対象の正規化は小 module に委譲します。
  const nextProfileId = input.rebindProfileId
    ? `profile_${input.slotId}_${Date.now()}`
    : readProfileId(input.aggregate?.profile?.profileId, input.slotId)

  const profile = normalizeProfileRow({
    profile: input.aggregate?.profile,
    profileId: nextProfileId,
    slotId: input.slotId,
    now,
    initialAreaId,
    content: input.content,
  })

  const saveSlot = normalizeSaveSlotRow({
    slotId: input.slotId,
    saveSlot: input.aggregate?.saveSlot,
    profile,
    now,
  })

  return {
    profile,
    saveSlot,
    areaProgress: normalizeAreaProgressRows({
      rows: input.aggregate?.areaProgress ?? [],
      profileId: profile.profileId,
      content: input.content,
      now,
    }),
    transmissionProgress: normalizeTransmissionProgressRows({
      rows: input.aggregate?.transmissionProgress ?? [],
      profileId: profile.profileId,
      content: input.content,
      rebindRunIds: Boolean(input.rebindProfileId),
    }),
    missionRuns: normalizeMissionRuns({
      rows: input.aggregate?.missionRuns ?? [],
      profileId: profile.profileId,
      content: input.content,
      now,
      resetIds: Boolean(input.rebindProfileId),
    }),
  }
}

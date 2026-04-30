import type {
  AreaProgressRow,
  MissionRunRow,
  ProfileAggregate,
  ProfileRow,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import { isRecord } from "./primitives"

export function parseImportedAggregate(serialized: string): ProfileAggregate {
  const parsed = JSON.parse(serialized) as unknown
  if (!isRecord(parsed)) {
    throw new Error("Invalid profile export: expected an object.")
  }

  const profile = isRecord(parsed.profile) ? parsed.profile : {}
  const saveSlot = isRecord(parsed.saveSlot) ? parsed.saveSlot : {}
  const areaProgress = Array.isArray(parsed.areaProgress) ? parsed.areaProgress : []
  const transmissionProgress = Array.isArray(parsed.transmissionProgress)
    ? parsed.transmissionProgress
    : []
  const missionRuns = Array.isArray(parsed.missionRuns) ? parsed.missionRuns : []

  return {
    profile: profile as ProfileRow,
    saveSlot: saveSlot as ProfileAggregate["saveSlot"],
    areaProgress: areaProgress as AreaProgressRow[],
    transmissionProgress: transmissionProgress as TransmissionProgressRow[],
    missionRuns: missionRuns as MissionRunRow[],
  }
}

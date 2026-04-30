import type {
  Difficulty,
  ProfileId,
  SaveSlotId,
  Vector2,
} from "@magnolia/contracts"

export function readProfileId(profileId: unknown, slotId: SaveSlotId): ProfileId {
  if (typeof profileId === "string" && profileId.length > 0) {
    return profileId
  }
  return createProfileId(slotId)
}

export function createProfileId(slotId: SaveSlotId): ProfileId {
  return `profile_${slotId}_${Date.now()}`
}

export function readDifficulty(value: unknown): Difficulty {
  return value === "terminal" ? "terminal" : "calm"
}

export function normalizeVector(value: unknown, fallback: Vector2): Vector2 {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  return {
    x: readNumber(value.x, fallback.x),
    y: readNumber(value.y, fallback.y),
  }
}

export function clampRate(value: unknown): number {
  return Math.min(1, Math.max(0, readNumber(value, 0)))
}

export function normalizeOptionalRate(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return clampRate(value)
}

export function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function readTimestamp(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value))) {
    return value
  }
  if (fallback) {
    return fallback
  }
  return new Date().toISOString()
}

export function readNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

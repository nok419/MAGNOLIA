import type {
  ContentBundle,
  MetaRow,
  MissionRunRow,
  ProfileAggregate,
  ProfileId,
  SaveRepository,
  SaveSlotId,
} from "@magnolia/contracts"
import { DEFAULT_DB_NAME, createDefaultMetaRows, createDefaultSaveSlots, createDefaultSettings } from "../defaults"
import {
  normalizePersistedAggregate,
  normalizePersistedMissionRun,
  normalizePersistedSettings,
  parseImportedAggregate,
} from "../save-normalizer"
import { MagnoliaDexie } from "./magnolia-db"

export function createDexieSaveRepository(options?: {
  dbName?: string
  content?: ContentBundle
}): SaveRepository {
  const db = new MagnoliaDexie(options?.dbName ?? DEFAULT_DB_NAME)
  const content = options?.content
  const ensureReady = createInitializationGuard(db)
  const loadProfileBySlotInternal = async (slotId: SaveSlotId) => {
    await ensureReady()
    const slot = await db.saveSlots.get(slotId)
    if (!slot?.profileId) {
      return null
    }

    return loadProfileAggregate(db, slot.profileId, content)
  }

  return {
    async listSaveSlots() {
      await ensureReady()
      return normalizeListedSaveSlots(db)
    },

    async loadProfile(profileId) {
      await ensureReady()
      return loadProfileAggregate(db, profileId, content)
    },

    async loadProfileBySlot(slotId) {
      return loadProfileBySlotInternal(slotId)
    },

    async createProfileAtSlot(slotId, aggregate) {
      await ensureReady()
      await persistProfileAggregate(db, slotId, aggregate, content, {
        rebindProfileId: false,
      })
    },

    async saveProfileToSlot(slotId, aggregate) {
      await ensureReady()
      await persistProfileAggregate(db, slotId, aggregate, content, {
        // 別スロット保存は現在進行の複製として扱い、既存スロットの continue 導線を壊しません。
        rebindProfileId: aggregate.profile.slotId !== slotId,
      })
    },

    async saveMissionRun(run) {
      await ensureReady()
      await db.missionRuns.put(normalizePersistedMissionRun({ run, content }))
    },

    async loadSettings() {
      await ensureReady()
      return normalizePersistedSettings(
        (await db.settings.get("default")) ?? createDefaultSettings(),
      )
    },

    async saveSettings(settings) {
      await ensureReady()
      await db.settings.put(normalizePersistedSettings(settings))
    },

    async loadMeta(key) {
      await ensureReady()
      return (await db.meta.get(key)) ?? null
    },

    async saveMeta(row) {
      await ensureReady()
      await db.meta.put(row)
    },

    async exportProfile(slotId) {
      await ensureReady()
      const aggregate = await loadProfileBySlotInternal(slotId)
      if (!aggregate) {
        throw new Error(`Save slot ${slotId} does not contain a profile.`)
      }

      return JSON.stringify(aggregate)
    },

    async importProfile(slotId, serialized) {
      await ensureReady()
      const parsed = parseImportedAggregate(serialized)
      const rebound = normalizePersistedAggregate({
        slotId,
        aggregate: parsed,
        content,
        rebindProfileId: true,
      })
      await persistProfileAggregate(db, slotId, rebound, content, {
        rebindProfileId: false,
      })
      return rebound.profile.profileId
    },
  }
}

async function normalizeListedSaveSlots(db: MagnoliaDexie) {
  const slots = await db.saveSlots.orderBy("slotId").toArray()
  const defaults = createDefaultSaveSlots()
  const seenProfileIds = new Set<ProfileId>()
  let changed = false

  const normalized = await Promise.all(
    slots.map(async (slot) => {
      if (!slot.profileId) {
        return slot
      }

      // 並行変更や旧 save の import で、欠損 profile や重複参照が残ることがあります。
      // slot 一覧の段階で既知の既定値へ戻し、title UI が壊れた参照を拾わないようにします。
      const profileExists = Boolean(await db.profiles.get(slot.profileId))
      if (!profileExists || seenProfileIds.has(slot.profileId)) {
        changed = true
        return defaults.find((candidate) => candidate.slotId === slot.slotId) ?? slot
      }

      seenProfileIds.add(slot.profileId)
      return slot
    }),
  )

  if (changed) {
    await db.saveSlots.bulkPut(normalized)
  }

  return normalized
}

function createInitializationGuard(db: MagnoliaDexie): () => Promise<void> {
  let initialized: Promise<void> | null = null

  return async () => {
    if (!initialized) {
      initialized = ensureDefaults(db)
    }
    await initialized
  }
}

async function ensureDefaults(db: MagnoliaDexie): Promise<void> {
  await db.open()

  if ((await db.saveSlots.count()) === 0) {
    await db.saveSlots.bulkAdd(createDefaultSaveSlots())
  }

  if ((await db.settings.count()) === 0) {
    await db.settings.put(createDefaultSettings())
  }

  for (const row of createDefaultMetaRows()) {
    if (!(await db.meta.get(row.key))) {
      await db.meta.put(row)
    }
  }
}

async function loadProfileAggregate(
  db: MagnoliaDexie,
  profileId: ProfileId,
  content?: ContentBundle,
): Promise<ProfileAggregate | null> {
  const profile = await db.profiles.get(profileId)
  if (!profile) {
    return null
  }

  const saveSlot =
    (await db.saveSlots.get(profile.slotId)) ??
    createDefaultSaveSlots().find((slot) => slot.slotId === profile.slotId)!

  const [areaProgress, transmissionProgress, missionRuns] = await Promise.all([
    db.areaProgress.where("profileId").equals(profileId).toArray(),
    db.transmissionProgress.where("profileId").equals(profileId).toArray(),
    db.missionRuns.where("profileId").equals(profileId).sortBy("startedAt"),
  ])

  return normalizePersistedAggregate({
    slotId: profile.slotId,
    aggregate: {
      profile,
      saveSlot,
      areaProgress,
      transmissionProgress,
      missionRuns,
    },
    content,
  })
}

async function persistProfileAggregate(
  db: MagnoliaDexie,
  slotId: SaveSlotId,
  aggregate: ProfileAggregate,
  content?: ContentBundle,
  options?: {
    rebindProfileId?: boolean
  },
): Promise<void> {
  const normalized = normalizePersistedAggregate({
    slotId,
    aggregate,
    content,
    rebindProfileId: options?.rebindProfileId,
  })

  await db.transaction(
    "rw",
    [db.saveSlots, db.profiles, db.areaProgress, db.transmissionProgress, db.missionRuns],
    async () => {
      const currentTargetSlot = await db.saveSlots.get(slotId)
      if (
        currentTargetSlot?.profileId &&
        currentTargetSlot.profileId !== normalized.profile.profileId
      ) {
        await deleteProfileAggregateIfUnreferenced(db, currentTargetSlot.profileId, slotId)
      }

      await detachProfileFromOtherSlots(db, normalized.profile.profileId, slotId)
      await db.saveSlots.put(normalized.saveSlot)
      await db.profiles.put(normalized.profile)

      await replaceProfileRows(db.areaProgress, normalized.profile.profileId, normalized.areaProgress)
      await replaceProfileRows(
        db.transmissionProgress,
        normalized.profile.profileId,
        normalized.transmissionProgress,
      )
      await replaceMissionRuns(db, normalized.profile.profileId, normalized.missionRuns)
    },
  )
}

async function replaceProfileRows<
  Row extends { profileId: ProfileId },
  Key,
>(
  table: {
    where(index: "profileId"): { equals(value: ProfileId): { delete(): Promise<number> } }
    bulkPut(rows: Row[]): Promise<Key>
  },
  profileId: ProfileId,
  rows: Row[],
): Promise<void> {
  await table.where("profileId").equals(profileId).delete()
  if (rows.length > 0) {
    await table.bulkPut(rows)
  }
}

async function replaceMissionRuns(
  db: MagnoliaDexie,
  profileId: ProfileId,
  missionRuns: MissionRunRow[],
): Promise<void> {
  await db.missionRuns.where("profileId").equals(profileId).delete()
  if (missionRuns.length === 0) {
    return
  }

  // export/import 後も履歴を維持したいため、既存 id があれば bulkPut で尊重します。
  await db.missionRuns.bulkPut(missionRuns)
}

async function detachProfileFromOtherSlots(
  db: MagnoliaDexie,
  profileId: ProfileId,
  keepSlotId: SaveSlotId,
): Promise<void> {
  const slots = await db.saveSlots.where("profileId").equals(profileId).toArray()
  const defaults = createDefaultSaveSlots()

  for (const slot of slots) {
    if (slot.slotId === keepSlotId) {
      continue
    }

    // 1 つの profile を複数 slot から指す状態を残すと、保存先 UI と実データの対応が崩れます。
    // 保存先以外は既定状態へ戻し、「別スロット保存は複製」という前提を維持します。
    const fallback = defaults.find((candidate) => candidate.slotId === slot.slotId)
    if (!fallback) {
      continue
    }

    await db.saveSlots.put(fallback)
  }
}

async function deleteProfileAggregate(
  db: MagnoliaDexie,
  profileId: ProfileId,
): Promise<void> {
  await db.profiles.delete(profileId)
  await db.areaProgress.where("profileId").equals(profileId).delete()
  await db.transmissionProgress.where("profileId").equals(profileId).delete()
  await db.missionRuns.where("profileId").equals(profileId).delete()
}

async function deleteProfileAggregateIfUnreferenced(
  db: MagnoliaDexie,
  profileId: ProfileId,
  overwrittenSlotId: SaveSlotId,
): Promise<void> {
  const slots = await db.saveSlots.where("profileId").equals(profileId).toArray()
  const stillReferenced = slots.some((slot) => slot.slotId !== overwrittenSlotId)
  if (stillReferenced) {
    return
  }

  await deleteProfileAggregate(db, profileId)
}

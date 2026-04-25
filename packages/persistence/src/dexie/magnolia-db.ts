import Dexie, { type Table } from "dexie"
import type {
  AreaProgressRow,
  MetaRow,
  MissionRunRow,
  ProfileRow,
  SaveSlotId,
  SaveSlotRow,
  SettingsRow,
  TransmissionProgressRow,
} from "@magnolia/contracts"
import {
  createDefaultMetaRows,
  createDefaultSaveSlots,
  createDefaultSettings,
} from "../defaults"

export class MagnoliaDexie extends Dexie {
  saveSlots!: Table<SaveSlotRow, SaveSlotId>
  profiles!: Table<ProfileRow, ProfileRow["profileId"]>
  areaProgress!: Table<AreaProgressRow, [AreaProgressRow["profileId"], AreaProgressRow["areaId"]]>
  transmissionProgress!: Table<
    TransmissionProgressRow,
    [TransmissionProgressRow["profileId"], TransmissionProgressRow["transmissionId"]]
  >
  missionRuns!: Table<MissionRunRow, MissionRunRow["id"]>
  settings!: Table<SettingsRow, SettingsRow["id"]>
  meta!: Table<MetaRow, MetaRow["key"]>

  constructor(name: string) {
    super(name)

    this.version(1).stores({
      saveSlots: "slotId, profileId, updatedAt, currentAreaId",
      profiles: "profileId, slotId, updatedAt, currentAreaId",
      areaProgress: "[profileId+areaId], profileId, areaId",
      transmissionProgress: "[profileId+transmissionId], profileId, transmissionId, areaId",
      missionRuns: "++id, profileId, missionId, transmissionId, startedAt, finishedAt",
      settings: "id",
      meta: "key",
    })

    this.on("populate", async () => {
      // 初回起動で UI と save 管理が空配列にならないよう、既定行を先に入れます。
      await this.saveSlots.bulkAdd(createDefaultSaveSlots())
      await this.settings.add(createDefaultSettings())
      await this.meta.bulkAdd(createDefaultMetaRows())
    })
  }
}

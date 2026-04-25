import type {
  Difficulty,
  SaveSlotRow,
  SettingsRow,
  ShipVariant,
  VolumeLevel,
} from "./game-types"

export type VolumeChannel = keyof SettingsRow["volumes"]
export type SettingsTogglePath = "reduceFlashing" | "lowFrameRateMode"
export type SettingsPath =
  | `volumes.${VolumeChannel}`
  | SettingsTogglePath
  | "difficulty"
  | "shipVariant"
export type SettingsValue =
  | VolumeLevel
  | SettingsRow[SettingsTogglePath]
  | Difficulty
  | ShipVariant

/** 許容される自機バリアント値。外部から受け取った値のバリデーションに使用する。 */
export const SHIP_VARIANTS = ["solid", "art"] as const

export function isShipVariant(value: unknown): value is ShipVariant {
  return value === "solid" || value === "art"
}

export const SETTINGS_VOLUME_STEPS = 7

export const DEFAULT_KEYBINDINGS: SettingsRow["keybindings"] = {
  moveUp: "KeyW",
  moveDown: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  fireMain: "MouseLeft",
  fireSub: "MouseRight",
  interact: "Enter",
  dash: "ShiftLeft",
  openMap: "KeyM",
  openArchive: "Digit1",
  openEquipment: "KeyE",
  openSettings: "Escape",
}

export function clampVolumeLevel(value: number): VolumeLevel {
  if (!Number.isFinite(value)) {
    return 4
  }

  return Math.min(SETTINGS_VOLUME_STEPS, Math.max(1, Math.round(value))) as VolumeLevel
}

export function createDefaultSaveSlots(): SaveSlotRow[] {
  return [
    { slotId: 1, label: "SLOT 1", playTimeMs: 0 },
    { slotId: 2, label: "SLOT 2", playTimeMs: 0 },
    { slotId: 3, label: "SLOT 3", playTimeMs: 0 },
  ]
}

export function createDefaultSettings(): SettingsRow {
  return {
    id: "default",
    difficulty: "calm",
    volumes: {
      master: 4,
      bgm: 4,
      se: 4,
      voice: 4,
    },
    keybindings: {
      ...DEFAULT_KEYBINDINGS,
    },
    reduceFlashing: false,
    lowFrameRateMode: false,
    shipVariant: "solid",
  }
}

export function normalizeSettings(settings: SettingsRow | null | undefined): SettingsRow {
  const defaults = createDefaultSettings()
  const source = settings ?? defaults
  const current = {
    ...DEFAULT_KEYBINDINGS,
    ...(source.keybindings ?? {}),
  }

  // 旧既定値では E が通信接続、Digit2 が装備画面でした。
  // 現行仕様では Enter で接続、E で装備画面、M で全体マップです。
  const usesLegacyDefaultLayout =
    current.interact === "KeyE" &&
    current.openEquipment === "Digit2" &&
    current.openMap === "KeyM"

  const keybindings = usesLegacyDefaultLayout
    ? {
        ...current,
        interact: DEFAULT_KEYBINDINGS.interact,
        openEquipment: DEFAULT_KEYBINDINGS.openEquipment,
      }
    : current

  const normalized: SettingsRow = {
    ...defaults,
    ...source,
    difficulty: source.difficulty === "terminal" ? "terminal" : "calm",
    volumes: {
      master: clampVolumeLevel(source.volumes?.master ?? defaults.volumes.master),
      bgm: clampVolumeLevel(source.volumes?.bgm ?? defaults.volumes.bgm),
      se: clampVolumeLevel(source.volumes?.se ?? defaults.volumes.se),
      voice: clampVolumeLevel(source.volumes?.voice ?? defaults.volumes.voice),
    },
    keybindings,
    reduceFlashing: Boolean(source.reduceFlashing),
    lowFrameRateMode: Boolean(source.lowFrameRateMode),
    shipVariant: isShipVariant(source.shipVariant) ? source.shipVariant : defaults.shipVariant,
  }

  if (!settings) {
    return normalized
  }

  const unchanged =
    normalized.difficulty === settings.difficulty &&
    normalized.reduceFlashing === settings.reduceFlashing &&
    normalized.lowFrameRateMode === settings.lowFrameRateMode &&
    normalized.shipVariant === settings.shipVariant &&
    normalized.volumes.master === settings.volumes.master &&
    normalized.volumes.bgm === settings.volumes.bgm &&
    normalized.volumes.se === settings.volumes.se &&
    normalized.volumes.voice === settings.volumes.voice &&
    Object.entries(normalized.keybindings).every(
      ([key, value]) => settings.keybindings[key as keyof SettingsRow["keybindings"]] === value,
    )

  return unchanged ? settings : normalized
}

export function applySettingChange(
  settings: SettingsRow,
  path: SettingsPath,
  value: SettingsValue,
): SettingsRow {
  switch (path) {
    case "difficulty":
      return {
        ...settings,
        difficulty: value === "terminal" ? "terminal" : "calm",
      }
    case "reduceFlashing":
    case "lowFrameRateMode":
      return {
        ...settings,
        [path]: Boolean(value),
      }
    case "shipVariant":
      return {
        ...settings,
        shipVariant: isShipVariant(value) ? value : settings.shipVariant,
      }
    default: {
      const channel = path.replace("volumes.", "") as VolumeChannel
      return {
        ...settings,
        volumes: {
          ...settings.volumes,
          [channel]: clampVolumeLevel(Number(value)),
        },
      }
    }
  }
}

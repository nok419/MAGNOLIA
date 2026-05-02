import type {
  DifficultyModifiers,
  MetaRow,
  PlayerShipSpec,
  PresentationCueSpec,
  ThemeId,
  UiThemePreset,
} from "@magnolia/contracts"
import {
  createDefaultSaveSlots as createSharedDefaultSaveSlots,
  createDefaultSettings as createSharedDefaultSettings,
} from "@magnolia/contracts"

export const DEFAULT_DB_NAME = "magnolia-demo"
export const DEFAULT_CONTENT_REVISION = "content-2026-03-14"

export function createDefaultSaveSlots() {
  return createSharedDefaultSaveSlots()
}

export function createDefaultSettings() {
  return createSharedDefaultSettings()
}

export function createDefaultMetaRows(): MetaRow[] {
  return [
    { key: "dbSchemaVersion", value: "1" },
    { key: "contentRevision", value: DEFAULT_CONTENT_REVISION },
  ]
}

export function createDefaultPlayerShipSpec(): PlayerShipSpec {
  return {
    baseMoveSpeed: 240,
    focusMoveSpeed: 140,
    hitboxPresetId: "hitbox_player_core",
    invincibilityMs: 800,
    meleeInvincibilityMs: 300,
    hearingThreshold: 0.72,
    noiseDecayRate: 0.12,
    baseExploreSpeed: 120,
    exploreDashSpeed: 180,
  }
}

export function createDefaultDifficultyModifiers(): Record<
  DifficultyModifiers["difficulty"],
  DifficultyModifiers
> {
  return {
    calm: {
      difficulty: "calm",
      enemyHpMultiplier: 1,
      enemySpawnCountMultiplier: 1,
      enemyNoiseDamageMultiplier: 0.92,
      enemyCadenceMultiplier: 1.08,
      enemyProjectileSpeedMultiplier: 1,
      enemyPatternBurstBonus: 0,
      enemyPatternSpreadMultiplier: 1,
      magneticDisasterFrequencyMultiplier: 1,
      noiseDecayRateMultiplier: 1.15,
      hearingThresholdOffset: 0.08,
      selfRepairPointMultiplier: 1,
      scoreMultiplier: 1,
    },
    terminal: {
      difficulty: "terminal",
      enemyHpMultiplier: 1.15,
      enemySpawnCountMultiplier: 1.25,
      enemyNoiseDamageMultiplier: 1.15,
      enemyCadenceMultiplier: 0.88,
      enemyProjectileSpeedMultiplier: 1.08,
      enemyPatternBurstBonus: 1,
      enemyPatternSpreadMultiplier: 1.15,
      magneticDisasterFrequencyMultiplier: 1.5,
      noiseDecayRateMultiplier: 0.9,
      hearingThresholdOffset: -0.08,
      selfRepairPointMultiplier: 1.25,
      scoreMultiplier: 1.3,
    },
  }
}

export function createDefaultThemes(themeIds: ThemeId[]): Record<ThemeId, UiThemePreset> {
  return Object.fromEntries(
    themeIds.map((themeId) => [
      themeId,
      {
        themeId,
        backgroundColor:
          themeId === "theme_broadcast_facility" ? "#122033" : "#111827",
        panelColor: themeId === "theme_broadcast_facility" ? "#1f3352" : "#1c2b45",
        accentColor:
          themeId === "theme_broadcast_facility" ? "#e4f1ff" : "#9ed7ff",
        fontFamily: "\"IBM Plex Sans JP\", sans-serif",
      },
    ]),
  )
}

export function createDefaultPresentationCues(): Record<string, PresentationCueSpec> {
  const cues: PresentationCueSpec[] = [
    {
      id: "system.boot.message",
      channel: "overlay",
      renderer: "react",
      blocking: true,
      skippable: false,
      defaultDurationMs: 1800,
    },
    {
      id: "system.reboot.sequence",
      channel: "overlay",
      renderer: "shared",
      blocking: true,
      skippable: false,
      // ブートログ短縮後の本編として、再構築の各段階が読める長さを確保します。
      defaultDurationMs: 5200,
    },
    {
      id: "system.reboot.settle",
      channel: "overlay",
      renderer: "shared",
      blocking: true,
      skippable: false,
      // 完成した自機を残し、探索 HUD と視界を短く立ち上げる受け渡し区間です。
      defaultDurationMs: 2200,
    },
    {
      id: "tutorial.restriction.enter",
      channel: "overlay",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 1200,
    },
    {
      id: "tutorial.restriction.release",
      channel: "overlay",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 6200,
    },
    {
      id: "explore.player.trail",
      channel: "explore",
      renderer: "phaser",
      blocking: false,
      skippable: true,
      defaultDurationMs: 300,
    },
    {
      id: "transmission.connect.sequence",
      channel: "transition",
      renderer: "shared",
      blocking: true,
      skippable: true,
      defaultDurationMs: 1400,
    },
    {
      id: "warp.transition.sequence",
      channel: "transition",
      renderer: "shared",
      blocking: true,
      skippable: true,
      defaultDurationMs: 1000,
    },
    {
      id: "battle.player.hit",
      channel: "battle",
      renderer: "phaser",
      blocking: false,
      skippable: true,
      defaultDurationMs: 250,
    },
    {
      id: "battle.subtitle.damage",
      channel: "battle",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 320,
    },
    {
      id: "battle.noise.peak",
      channel: "battle",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 350,
    },
    {
      id: "battle.noise.clear",
      channel: "battle",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 350,
    },
    {
      id: "battle.invincible.start",
      channel: "battle",
      renderer: "phaser",
      blocking: false,
      skippable: true,
      defaultDurationMs: 400,
    },
    {
      id: "battle.mission.beat",
      channel: "battle",
      renderer: "shared",
      blocking: false,
      skippable: true,
      defaultDurationMs: 600,
    },
  ]

  return Object.fromEntries(cues.map((cue) => [cue.id, cue]))
}

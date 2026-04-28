import type {
  DifficultyModifiers,
  HitboxPreset,
  MetaRow,
  PlayerShipSpec,
  PresentationCueSpec,
  ThemeId,
  UiThemePreset,
  VisualPreset,
  VisualPresetId,
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
      enemyNoiseDamageMultiplier: 0.92,
      enemyCadenceMultiplier: 1.08,
      noiseDecayRateMultiplier: 1.15,
      hearingThresholdOffset: 0.08,
      selfRepairPointMultiplier: 1,
      scoreMultiplier: 1,
    },
    terminal: {
      difficulty: "terminal",
      enemyHpMultiplier: 1.15,
      enemyNoiseDamageMultiplier: 1.15,
      enemyCadenceMultiplier: 0.88,
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
          themeId === "theme_broadcast_facility" ? "var(--mg-deep)" : "var(--mg-void)",
        panelColor: themeId === "theme_broadcast_facility" ? "var(--mg-panel-raised)" : "var(--mg-panel-solid)",
        accentColor:
          themeId === "theme_broadcast_facility" ? "var(--mg-signal-bright)" : "var(--mg-signal)",
        fontFamily: "\"IBM Plex Sans JP\", sans-serif",
      },
    ]),
  )
}

export function createDefaultVisuals(
  ids: readonly VisualPresetId[],
): Record<VisualPresetId, VisualPreset> {
  return Object.fromEntries(ids.map((id) => [id, createVisualPreset(id)]))
}

export function createDefaultHitboxes(): Record<string, HitboxPreset> {
  return {
    hitbox_player_core: {
      hitboxPresetId: "hitbox_player_core",
      shape: "circle",
      radius: 6,
    },
    hitbox_enemy_small: {
      hitboxPresetId: "hitbox_enemy_small",
      shape: "circle",
      radius: 12,
    },
    hitbox_enemy_medium: {
      hitboxPresetId: "hitbox_enemy_medium",
      shape: "circle",
      radius: 18,
    },
    hitbox_enemy_large: {
      hitboxPresetId: "hitbox_enemy_large",
      shape: "circle",
      radius: 24,
    },
    hitbox_bullet_small: {
      hitboxPresetId: "hitbox_bullet_small",
      shape: "circle",
      radius: 5,
    },
    hitbox_bullet_medium: {
      hitboxPresetId: "hitbox_bullet_medium",
      shape: "circle",
      radius: 9,
    },
    hitbox_bullet_thin: {
      hitboxPresetId: "hitbox_bullet_thin",
      shape: "ellipse",
      radiusX: 4,
      radiusY: 12,
    },
  }
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
  ]

  return Object.fromEntries(cues.map((cue) => [cue.id, cue]))
}

function createVisualPreset(id: VisualPresetId): VisualPreset {
  if (id.startsWith("vis_enemy_")) {
    return {
      visualPresetId: id,
      coreRadius: id === "vis_enemy_heavy" ? 18 : id === "vis_enemy_standard" ? 14 : 10,
      orbit1Radius: id === "vis_enemy_heavy" ? 28 : id === "vis_enemy_standard" ? 22 : 16,
      orbit2Radius: id === "vis_enemy_heavy" ? 38 : id === "vis_enemy_standard" ? 30 : 22,
      orbit1Width: 4,
      orbit2Width: 3,
      orbit1ArcStart: 0,
      orbit1ArcEnd: Math.PI,
      orbit2ArcStart: 0,
      orbit2ArcEnd: Math.PI * 1.5,
      orbit1AngularSpeed: 0.8,
      orbit2AngularSpeed: -0.6,
      iconType: "dot",
      iconAngle: 0,
      iconGapAngle: 0.35,
      glowStrength: 0.6,
    }
  }

  if (id.startsWith("vis_bullet_")) {
    return {
      visualPresetId: id,
      bodyType: id.includes("enemy") ? "noiseCluster" : "diamondCluster",
      trailType: id.includes("carrier") ? "trailC" : "trailA",
      seedBucket: 1,
      scale: id.includes("melee") ? 1.25 : 1,
      glowStrength: 0.55,
    }
  }

  if (id.startsWith("hazard_magnetic_disaster_")) {
    return {
      visualPresetId: id,
      kind: "magneticDisaster",
      telegraphColor: id.endsWith("gentle") ? "var(--mg-danger-bright)" : "var(--mg-danger)",
      activeColor: id.endsWith("gentle") ? "var(--mg-danger)" : "var(--mg-danger-bright)",
      telegraphFlashHz: id.endsWith("gentle") ? 2 : 2.8,
      noiseScrollSpeed: id.endsWith("gentle") ? 0.16 : 0.22,
      edgeFeather: 18,
      telegraphOpacity: 0.24,
      activeOpacity: 0.38,
    }
  }

  // 背景 preset は専用 contract が未追加のため、当面は描画側が id で扱えるよう
  // 最小の placeholder preset として登録します。
  return {
    visualPresetId: id,
    bodyWidth: 0,
    bodyHeight: 0,
    wingLength: 0,
    wingOffsetX: 0,
    wingOffsetY: 0,
    glowStrength: 0,
  }
}

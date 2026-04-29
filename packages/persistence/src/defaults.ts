import type {
  DifficultyModifiers,
  HitboxPreset,
  MetaRow,
  PlayerShipSpec,
  PresentationCueSpec,
  BulletVisualPreset,
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
          themeId === "theme_broadcast_facility" ? "#122033" : "#111827",
        panelColor: themeId === "theme_broadcast_facility" ? "#1f3352" : "#1c2b45",
        accentColor:
          themeId === "theme_broadcast_facility" ? "#e4f1ff" : "#9ed7ff",
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
    const isBoss = id.endsWith("_b1") || id.endsWith("_c1")
    const isHeavy = id.endsWith("_heavy") || isBoss
    const isStandard = id.endsWith("_standard") || id.endsWith("_a2")
    // content 側の visualPresetId は旧 ID を含むため、ここで rendererKind と配色へ正規化する。
    // Web renderer はこの解決済み contract を見ればよく、enemyId 分岐を持たない。
    return {
      visualPresetId: id,
      rendererKind: isBoss ? "orbitalBoss" : "orbital",
      paletteRole: "dangerNoise",
      accentColor: isBoss ? "#ff7d72" : isHeavy ? "#ff8f66" : isStandard ? "#ff9d72" : "#ffb08a",
      secondaryColor: isBoss ? "#ffd2aa" : "#ffe0c4",
      glowColor: isBoss
        ? "rgba(255, 96, 86, 0.88)"
        : isHeavy
          ? "rgba(255, 112, 86, 0.74)"
          : "rgba(255, 128, 100, 0.64)",
      seedBucket: id.endsWith("_b1")
        ? 211
        : id.endsWith("_c1")
          ? 101
          : isHeavy
            ? 37
            : isStandard
              ? 23
              : 11,
      coreRadius: isHeavy ? 18 : isStandard ? 14 : 10,
      orbit1Radius: isHeavy ? 28 : isStandard ? 22 : 16,
      orbit2Radius: isHeavy ? 38 : isStandard ? 30 : 22,
      orbit1Width: isBoss ? 4.4 : 4,
      orbit2Width: isBoss ? 3.4 : 3,
      orbit1ArcStart: 0,
      orbit1ArcEnd: Math.PI * 1.2,
      orbit2ArcStart: 25 * (Math.PI / 180),
      orbit2ArcEnd: Math.PI * 2 - 25 * (Math.PI / 180),
      orbit1AngularSpeed: isBoss ? 0.62 : 0.82,
      orbit2AngularSpeed: isBoss ? -0.46 : -0.58,
      iconType: "dot",
      iconAngle: Math.PI,
      iconGapAngle: isBoss ? 0.38 : 0.44,
      glowStrength: isBoss ? 0.82 : isHeavy ? 0.72 : 0.58,
    }
  }

  if (id.startsWith("vis_bullet_")) {
    // projectile renderer の差し替えは rendererKind で表す。
    // 旧 content ID はここで互換的に解釈し、Canvas core へ伝播させない。
    const rendererKind = readBulletRendererKind(id)
    const isPlayer = id.includes("_player_")
    const isDanger = !isPlayer
    return {
      visualPresetId: id,
      rendererKind,
      paletteRole: isDanger ? "dangerNoise" : "normalSignal",
      accentColor: isDanger ? "#ff6d7f" : "#7cdcff",
      secondaryColor: isDanger ? "#ffd0a8" : "#e2fbff",
      glowColor: isDanger ? "rgba(255, 90, 110, 0.68)" : "rgba(93, 164, 209, 0.76)",
      radiusScale: rendererKind === "playerMelee" ? 1.25 : rendererKind === "bossCore" ? 1.16 : 1,
      auraKind: "none",
      bodyType: id.includes("enemy") ? "noiseCluster" : "diamondCluster",
      trailType: rendererKind === "playerCarrier" || rendererKind === "playerCarrierBlast"
        ? "trailC"
        : rendererKind === "enemyLance"
          ? "trailB"
          : "trailA",
      seedBucket: id.includes("geo") ? 17 : id.includes("lance") ? 29 : id.includes("core") ? 41 : 1,
      scale: rendererKind === "playerMelee" ? 1.25 : 1,
      glowStrength: isDanger ? 0.62 : 0.58,
    }
  }

  if (id.startsWith("hazard_magnetic_disaster_")) {
    return {
      visualPresetId: id,
      kind: "magneticDisaster",
      telegraphColor: id.endsWith("gentle") ? "#ff6b7d" : "#ff3b5a",
      activeColor: id.endsWith("gentle") ? "#ff4f6d" : "#ff2248",
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

function readBulletRendererKind(id: VisualPresetId): BulletVisualPreset["rendererKind"] {
  if (id.includes("carrier_blast")) return "playerCarrierBlast"
  if (id.includes("carrier")) return "playerCarrier"
  if (id.includes("melee")) return "playerMelee"
  if (id.includes("geo")) return "geoDiamond"
  if (id.includes("lance")) return "enemyLance"
  if (id.includes("core")) return "bossCore"
  if (id.includes("petal")) return "signalShard"
  if (id.includes("player")) return "playerPulse"
  return "noiseOrb"
}

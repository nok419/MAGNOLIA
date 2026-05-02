import {
  createEmptyMetadataUnlocked,
} from "@magnolia/contracts"
import type {
  ArchiveAccessState,
  ArchiveViewModel,
  AreaId,
  AreaMaster,
  AreaProgressRow,
  ConditionId,
  ConditionSpec,
  ContentBundle,
  EffectSpec,
  EquipmentId,
  EquipmentCatalogViewModel,
  EquipmentMaster,
  EquipmentSlot,
  FeatureAccessState,
  MenuViewModel,
  MissionId,
  MissionMaster,
  MissionReplaySeed,
  MissionState,
  ProfileAggregate,
  ProfileRow,
  ProjectileSpec,
  SubsystemIndex,
  TranscriptChunk,
  TranscriptSpan,
  TransmissionId,
  TransmissionMaster,
  TransmissionProgressRow,
  WorldMapLogic,
  WorldMapNodeId,
  WorldMapVisibilityState,
  ExploreMapViewModel,
} from "@magnolia/contracts"
import { evaluateCondition } from "./conditions"
import type { ResolvedEquipmentBinding, ResolvedLoadout } from "./equipment-runtime"
import {
  hasUnlockedTransmissionMetadata,
  hasVisibleArchiveContent,
  isTransmissionSignalIdentified,
  mergeRanges,
  mergeTranscriptSpans,
  readTranscriptChunkRestorationRatio,
  transcriptSpansFromTimeRanges,
} from "./progression"
import {
  DEFAULT_EXPLORE_SCAN_RADIUS,
  DEFAULT_EXPLORE_VISION_RADIUS,
  EXPLORE_SCAN_COOLDOWN_MS,
} from "./explore/explore-session-runtime"

const WORLD_CELL_SIZE = 20
const WORLD_BITMAP_ORIGIN_X = -640
const WORLD_BITMAP_ORIGIN_Y = -520

type EquipmentStatGroupViewModel = EquipmentCatalogViewModel["items"][number]["statGroups"][number]

export type EquipmentHintSelection = {
  unseenEquipmentIds: EquipmentId[]
  shouldShowEquipmentTutorialIcon: boolean
  equipmentGuideTargetId: EquipmentId | null
}

export function selectEquipmentHint(input: {
  content: ContentBundle | null
  profile: ProfileAggregate | null
  seenEquipmentIds: readonly string[]
}): EquipmentHintSelection {
  const profile = input.profile?.profile
  if (!profile) {
    return {
      unseenEquipmentIds: [],
      shouldShowEquipmentTutorialIcon: false,
      equipmentGuideTargetId: null,
    }
  }

  const seenEquipmentSet = new Set(input.seenEquipmentIds)
  const unseenEquipmentIds = profile.ownedEquipmentIds.filter(
    (equipmentId) => !seenEquipmentSet.has(equipmentId),
  )
  if (!input.content || unseenEquipmentIds.length === 0) {
    return {
      unseenEquipmentIds,
      shouldShowEquipmentTutorialIcon: false,
      equipmentGuideTargetId: null,
    }
  }

  const equippedIds = new Set(
    [
      profile.equipped.main,
      profile.equipped.sub,
      profile.equipped.os,
      ...profile.equipped.subsystems,
    ].filter(isEquipmentId),
  )
  const clearedMissionIds = new Set(profile.clearedMissionIds)
  let equipmentGuideTargetId: EquipmentId | null = null
  const shouldShowEquipmentTutorialIcon = unseenEquipmentIds.some((equipmentId) => {
    if (equippedIds.has(equipmentId)) {
      return false
    }

    const equipment = input.content?.equipment[equipmentId]
    if (!equipment || equipment.unlockSource.kind !== "transmissionReward") {
      return false
    }

    const transmission = input.content?.transmissions[equipment.unlockSource.transmissionId]
    // 機体追従の E は、初回 reward の OS 換装を案内するチュートリアルアイコンです。
    // 後続の未確認装備はメニュー内の NEW 表示に任せ、探索中の E を再点灯させません。
    const shouldGuide =
      equipment.slot === "os" &&
      transmission &&
      clearedMissionIds.has(transmission.missionId)
    if (shouldGuide) {
      equipmentGuideTargetId = equipmentId
    }
    return shouldGuide
  })

  return { unseenEquipmentIds, shouldShowEquipmentTutorialIcon, equipmentGuideTargetId }
}

function isEquipmentId(value: EquipmentId | null | undefined): value is EquipmentId {
  return typeof value === "string" && value.length > 0
}

export type EquipmentAvailabilityInput = {
  equipmentId: EquipmentId
  equipment?: EquipmentMaster
  profile: ProfileRow | null
  featureAccess: FeatureAccessState
}

export function resolveEquipmentPurchaseState(input: EquipmentAvailabilityInput): {
  canPurchase: boolean
  purchaseCost?: number
  lockedReasonLabel?: string
} {
  const equipment = input.equipment
  const profile = input.profile
  if (!profile) {
    return { canPurchase: false, lockedReasonLabel: "プロファイルが読み込まれていません" }
  }
  if (!equipment) {
    return { canPurchase: false, lockedReasonLabel: "装備定義がありません" }
  }
  if (equipment.unlockSource.kind !== "purchase") {
    return { canPurchase: false, lockedReasonLabel: "購入対象ではありません" }
  }

  const purchaseCost = equipment.unlockSource.selfRepairPointCost
  if (!input.featureAccess.visibleEquipmentIds.includes(input.equipmentId)) {
    return { canPurchase: false, purchaseCost, lockedReasonLabel: "まだ表示条件を満たしていません" }
  }
  if (profile.ownedEquipmentIds.includes(input.equipmentId)) {
    return { canPurchase: false, purchaseCost, lockedReasonLabel: "入手済みです" }
  }
  if (profile.selfRepairPoints < purchaseCost) {
    return { canPurchase: false, purchaseCost, lockedReasonLabel: "自己修復ポイントが不足しています" }
  }
  return { canPurchase: true, purchaseCost }
}

export function resolveEquipmentUpgradeState(input: EquipmentAvailabilityInput): {
  canUpgrade: boolean
  upgradeCost?: number
  lockedReasonLabel?: string
} {
  const equipment = input.equipment
  const profile = input.profile
  if (!profile) {
    return { canUpgrade: false, lockedReasonLabel: "プロファイルが読み込まれていません" }
  }
  if (!equipment) {
    return { canUpgrade: false, lockedReasonLabel: "装備定義がありません" }
  }
  if (!profile.ownedEquipmentIds.includes(input.equipmentId)) {
    return { canUpgrade: false, lockedReasonLabel: "未入手です" }
  }

  const currentLevel = profile.equipmentLevels[input.equipmentId] ?? 0
  if (currentLevel < 1) {
    return { canUpgrade: false, lockedReasonLabel: "装備レベルが未初期化です" }
  }
  if (currentLevel >= equipment.maxLevel) {
    return { canUpgrade: false, lockedReasonLabel: "最大レベルです" }
  }

  const nextParams = equipment.levelParams.find((level) => level.level === currentLevel + 1)
  const upgradeCost = nextParams?.selfRepairPointCost
  if (!nextParams || upgradeCost === undefined) {
    return { canUpgrade: false, lockedReasonLabel: "次レベルの定義がありません" }
  }
  if (profile.selfRepairPoints < upgradeCost) {
    return { canUpgrade: false, upgradeCost, lockedReasonLabel: "自己修復ポイントが不足しています" }
  }
  return { canUpgrade: true, upgradeCost }
}

export function resolveEquipmentEquipState(input: {
  equipmentId: EquipmentId
  slot: EquipmentSlot
  subsystemIndex?: SubsystemIndex
  equipment?: EquipmentMaster
  profile: ProfileRow | null
}): {
  canEquip: boolean
  lockedReasonLabel?: string
} {
  const equipment = input.equipment
  const profile = input.profile
  if (!profile) {
    return { canEquip: false, lockedReasonLabel: "プロファイルが読み込まれていません" }
  }
  if (!equipment) {
    return { canEquip: false, lockedReasonLabel: "装備定義がありません" }
  }
  if (!profile.ownedEquipmentIds.includes(input.equipmentId)) {
    return { canEquip: false, lockedReasonLabel: "未入手です" }
  }
  if (equipment.slot !== input.slot) {
    return { canEquip: false, lockedReasonLabel: "装備スロットが一致しません" }
  }
  if (input.slot === "subsystem") {
    if (input.subsystemIndex !== 0 && input.subsystemIndex !== 1) {
      return { canEquip: false, lockedReasonLabel: "サブシステム枠が不正です" }
    }
    if (profile.equipped.subsystems[input.subsystemIndex] === input.equipmentId) {
      return { canEquip: false, lockedReasonLabel: "装備中です" }
    }
    // サブシステムは二枠ありますが、同じ装備を二重に動かすと hook が重複実行されます。
    // そのため、別枠で装備中のものはターゲット枠側でも装着不可にします。
    const occupiedSubsystemIndex = profile.equipped.subsystems.findIndex(
      (equipmentId) => equipmentId === input.equipmentId,
    )
    if (occupiedSubsystemIndex === 0 || occupiedSubsystemIndex === 1) {
      return { canEquip: false, lockedReasonLabel: "もう一方のサブシステム枠で装備中です" }
    }
    return { canEquip: true }
  }
  if (profile.equipped[input.slot] === input.equipmentId) {
    return { canEquip: false, lockedReasonLabel: "装備中です" }
  }
  return { canEquip: true }
}

export function buildEquipmentCatalogViewModel(input: {
  equipment: Record<EquipmentId, EquipmentMaster>
  effects: Record<string, EffectSpec>
  projectiles: Record<string, ProjectileSpec>
  profile: ProfileRow | null
  featureAccess: FeatureAccessState
}): EquipmentCatalogViewModel {
  const profile = input.profile
  const equipped = profile?.equipped ?? {
    main: undefined,
    sub: undefined,
    os: undefined,
    subsystems: [null, null],
  }
  const ownedIds = new Set(profile?.ownedEquipmentIds ?? [])

  return {
    screen: "equipment",
    selfRepairPoints: profile?.selfRepairPoints ?? 0,
    equipped,
    items: Object.values(input.equipment)
      .filter((equipment) => input.featureAccess.visibleEquipmentIds.includes(equipment.equipmentId))
      .sort((left, right) => left.slot.localeCompare(right.slot) || left.name.localeCompare(right.name, "ja"))
      .map((equipment) => {
        const owned = ownedIds.has(equipment.equipmentId)
        const masked = !owned && equipment.unlockSource.kind !== "purchase"
        const purchase = resolveEquipmentPurchaseState({
          equipmentId: equipment.equipmentId,
          equipment,
          profile,
          featureAccess: input.featureAccess,
        })
        const upgrade = resolveEquipmentUpgradeState({
          equipmentId: equipment.equipmentId,
          equipment,
          profile,
          featureAccess: input.featureAccess,
        })
        const equippedState = readEquippedSlot(equipped, equipment.equipmentId)
        const equipTargets = buildEquipTargets({
          equipmentId: equipment.equipmentId,
          slot: equipment.slot,
          equipped,
          equipment,
          profile,
        })
        const currentLevel = profile?.equipmentLevels[equipment.equipmentId] ?? 0
        return {
          equipmentId: equipment.equipmentId,
          slot: equipment.slot,
          visibleName: masked ? "???" : equipment.name,
          visibleDescription: masked ? "詳細不明" : equipment.description,
          flavorText: masked ? undefined : equipment.flavorText,
          statGroups: masked
            ? []
            : buildEquipmentStatGroups({
                equipment,
                effects: input.effects,
                projectiles: input.projectiles,
                level: Math.max(1, currentLevel),
              }),
          upgradePreview: masked
            ? undefined
            : buildEquipmentUpgradePreview(equipment, currentLevel),
          masked,
          owned,
          equippedSlot: equippedState.slot,
          subsystemIndex: equippedState.subsystemIndex,
          currentLevel,
          maxLevel: equipment.maxLevel,
          canPurchase: purchase.canPurchase,
          purchaseCost: purchase.purchaseCost,
          canUpgrade: upgrade.canUpgrade,
          upgradeCost: upgrade.upgradeCost,
          canEquip: equipTargets.some((target) => target.canEquip),
          equipTargets,
          lockedReasonLabel: readFirstReason([
            purchase.lockedReasonLabel,
            upgrade.lockedReasonLabel,
            ...equipTargets.map((target) => target.lockedReasonLabel),
          ]),
        }
      }),
  }
}

function buildEquipmentStatGroups(input: {
  equipment: EquipmentMaster
  effects: Record<string, EffectSpec>
  projectiles: Record<string, ProjectileSpec>
  level: number
}): EquipmentStatGroupViewModel[] {
  const levelOverrides = resolveEquipmentLevelOverrides(input.equipment, input.level)
  const effects = [...input.equipment.activeEffectIds, ...input.equipment.passiveEffectIds]
    .map((effectId) => input.effects[effectId])
    .filter((effect): effect is EffectSpec => Boolean(effect))
    .map((effect) => ({
      ...effect,
      params: {
        ...(effect.params ?? {}),
        ...levelOverrides,
      },
    }))

  return effects
    .flatMap((effect) => buildEffectStatGroups(effect, input.projectiles))
    .filter((group) => group.stats.length > 0)
}

function buildEffectStatGroups(
  effect: EffectSpec,
  projectiles: Record<string, ProjectileSpec>,
): EquipmentStatGroupViewModel[] {
  const params = effect.params ?? {}
  if (effect.runtimeHandlerId === "weapon.main.pulse") {
    return buildPulseStatGroups(params, projectiles)
  }
  if (effect.runtimeHandlerId === "weapon.main.carrier") {
    return buildCarrierStatGroups(params, projectiles)
  }
  if (effect.runtimeHandlerId === "sub.barrier.noise_canceller") {
    return [
      compactStatGroup("バリア", [
        stat("範囲", formatDistance(readNumber(params, "radius", 48))),
        stat("最大持続", formatMs(readNumber(params, "maxDurationMs", 1200))),
        stat("移動速度", formatMultiplier(readNumber(params, "moveSpeedMultiplier", 0.8))),
        stat("敵弾消去", formatEnabled(readBoolean(params, "blocksEnemyBullets"))),
        stat("攻撃継続", formatEnabled(readBoolean(params, "allowAttackDuringUse"))),
      ]),
      compactStatGroup("リキャスト", [
        stat("クールタイム", formatMs(readNumber(params, "cooldownMs", 3000))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "sub.field.silent_wave") {
    return [
      compactStatGroup("フィールド", [
        stat("範囲", formatDistance(readNumber(params, "radius", 60))),
        stat("持続", formatMs(readNumber(params, "durationMs", 5000))),
        stat("効果量", readNumber(params, "dpsInField", 0) > 0
          ? `${formatNumber(readNumber(params, "dpsInField", 0), 1)}/秒`
          : "なし"),
        stat("敵弾消去", formatEnabled(readBoolean(params, "blocksEnemyBullets"))),
        stat("磁気災害", readBoolean(params, "blocksMagneticDisaster") ? "無効化" : "影響あり"),
      ]),
      compactStatGroup("リキャスト", [
        stat("クールタイム", formatMs(readNumber(params, "cooldownMs", 12000))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "subsystem.shot.modifier.burn") {
    return [
      compactStatGroup("付与効果", [
        stat("継続ダメージ", `${formatNumber(readNumber(params, "burnDamagePerSec", 0), 1)}/秒`),
        stat("持続", formatMs(readNumber(params, "burnDurationMs", 0))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "subsystem.shot.modifier.homing") {
    return [
      compactStatGroup("誘導", [
        stat("追従精度", formatNumber(readNumber(params, "homingStrength", 0), 2)),
        stat("追従範囲", formatDistance(readNumber(params, "homingRange", 0))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "subsystem.analysis.ramp") {
    return [
      compactStatGroup("解析", [
        stat("増加量", `${formatNumber(readNumber(params, "analysisDeltaPerStep", 0) * 100, 2)}%/step`),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "subsystem.noise.gate") {
    return [
      compactStatGroup("防御", [
        stat("ノイズ軽減", formatPercent(readNumber(params, "noiseReduction", 0))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "subsystem.movement.focus") {
    return [
      compactStatGroup("操作", [
        stat("低速移動", formatEnabled(readBoolean(params, "enableFocusMovement"))),
        stat("低速倍率", formatMultiplier(readNumber(params, "focusSpeedMultiplier", 0.5))),
      ]),
    ]
  }
  if (effect.runtimeHandlerId === "os.magnolia.core") {
    const scanCooldownMultiplier = readNumber(params, "exploreScanCooldownMultiplier", 1)
    const exploreSpeedMultiplier = readNumber(params, "exploreSpeedMultiplier", 1)
    return [
      compactStatGroup("OS", [
        stat("UI解放", readBoolean(params, "unlocksHud") ? "基本HUD" : "なし"),
        stat(
          "視界",
          formatDistance(DEFAULT_EXPLORE_VISION_RADIUS + readNumber(params, "exploreVisionBonus", 0)),
        ),
        stat(
          "スキャン範囲",
          formatDistance(DEFAULT_EXPLORE_SCAN_RADIUS + readNumber(params, "exploreScanRadiusBonus", 0)),
        ),
        stat("スキャンクールタイム", formatMs(EXPLORE_SCAN_COOLDOWN_MS * scanCooldownMultiplier)),
        stat("探索移動", formatMultiplier(exploreSpeedMultiplier)),
      ]),
    ]
  }
  return []
}

function buildPulseStatGroups(
  params: Record<string, number | string | boolean>,
  projectiles: Record<string, ProjectileSpec>,
): EquipmentStatGroupViewModel[] {
  const projectile = projectiles[readString(params, "projectileId", "")]
  const speed = readNumber(params, "projectileSpeed", projectile?.speed ?? 920)
  const lifetimeMs = readNumber(params, "lifetimeMs", projectile?.lifetimeMs ?? 0)
  return [
    compactStatGroup("弾丸", [
      stat("威力", formatNumber(readNumber(params, "damage", projectile?.damage ?? 0), 1)),
      stat("発射間隔", formatMs(readNumber(params, "cadenceMs", 120))),
      stat("弾数", `${formatNumber(readNumber(params, "shotCount", 1), 0)}発`),
      stat("射角", `${formatNumber(readNumber(params, "spreadDeg", 0), 0)}度`),
      stat(
        "射程",
        lifetimeMs > 0 ? formatDistance((speed * lifetimeMs) / 1000) : undefined,
      ),
      stat(
        "追加弾",
        readNumber(params, "extraSideShotCount", 0) > 0
          ? `${formatNumber(readNumber(params, "extraSideShotCount", 0), 0)}発 / 威力${formatNumber(readNumber(params, "extraSideShotDamage", 0), 1)}`
          : "なし",
      ),
    ]),
    compactStatGroup("近接", [
      stat("威力", formatNumber(readNumber(params, "meleeDamage", 0), 1)),
      stat("範囲", formatDistance(readNumber(params, "meleeCollisionRange", readNumber(params, "meleeRange", 0)))),
      stat("角度", `${formatNumber(readNumber(params, "meleeSpreadDeg", 0), 0)}度`),
      stat("クールタイム", formatMs(readNumber(params, "meleeCooldownMs", 0))),
    ]),
  ]
}

function buildCarrierStatGroups(
  params: Record<string, number | string | boolean>,
  projectiles: Record<string, ProjectileSpec>,
): EquipmentStatGroupViewModel[] {
  const projectile = projectiles[readString(params, "projectileId", "")]
  const speed = readNumber(params, "projectileSpeed", projectile?.speed ?? 760)
  const lifetimeMs = readNumber(params, "lifetimeMs", projectile?.lifetimeMs ?? 1800)
  const damage = readNumber(params, "damage", projectile?.damage ?? 0)
  const explosionMultiplier = readNumber(params, "explosionDamageMultiplier", 1)
  return [
    compactStatGroup("弾丸", [
      stat("威力", formatNumber(damage, 1)),
      stat("発射間隔", formatMs(readNumber(params, "cadenceMs", 360))),
      stat("弾数", `${formatNumber(readNumber(params, "shotCount", 1), 0)}発`),
      stat("射程", formatDistance((speed * lifetimeMs) / 1000)),
    ]),
    compactStatGroup("爆発", [
      stat("威力", formatNumber(damage * explosionMultiplier, 1)),
      stat("半径", formatDistance(readNumber(params, "explosionRadius", 30))),
      stat("発生間隔", formatMs(readNumber(params, "trailExplosionIntervalMs", 190))),
      stat("持続", formatMs(readNumber(params, "explosionAreaDamageDurationMs", 0))),
      stat("敵弾消去", formatEnabled(readBoolean(params, "explosionClearsEnemyProjectiles"))),
    ]),
  ]
}

function buildEquipmentUpgradePreview(
  equipment: EquipmentMaster,
  currentLevel: number,
): EquipmentCatalogViewModel["items"][number]["upgradePreview"] {
  if (currentLevel < 1 || currentLevel >= equipment.maxLevel) {
    return undefined
  }
  const nextParams = equipment.levelParams.find((params) => params.level === currentLevel + 1)
  if (!nextParams?.upgradeSummary) {
    return undefined
  }
  return {
    fromLevel: currentLevel,
    toLevel: currentLevel + 1,
    summary: nextParams.upgradeSummary,
  }
}

function resolveEquipmentLevelOverrides(
  equipment: EquipmentMaster,
  level: number,
): Record<string, number> {
  const overrides: Record<string, number> = {}
  for (const levelParams of equipment.levelParams) {
    if (levelParams.level > level) {
      continue
    }
    Object.assign(overrides, levelParams.effectOverrides)
  }
  return overrides
}

function compactStatGroup(
  label: string,
  stats: Array<{ label: string; value?: string; note?: string }>,
): EquipmentStatGroupViewModel {
  return {
    label,
    stats: stats.filter((entry): entry is { label: string; value: string; note?: string } =>
      typeof entry.value === "string" && entry.value.length > 0,
    ),
  }
}

function stat(label: string, value: string | undefined, note?: string): {
  label: string
  value?: string
  note?: string
} {
  return { label, value, note }
}

function readNumber(
  params: Record<string, number | string | boolean>,
  key: string,
  fallback: number,
): number {
  const value = params[key]
  return typeof value === "number" ? value : fallback
}

function readString(
  params: Record<string, number | string | boolean>,
  key: string,
  fallback: string,
): string {
  const value = params[key]
  return typeof value === "string" ? value : fallback
}

function readBoolean(
  params: Record<string, number | string | boolean>,
  key: string,
): boolean {
  return params[key] === true
}

function formatNumber(value: number, fractionDigits: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(0)
  }
  return value.toFixed(fractionDigits).replace(/\.?0+$/, "")
}

function formatDistance(value: number): string {
  return `${formatNumber(value, value >= 10 ? 0 : 1)} px`
}

function formatMs(value: number): string {
  if (value >= 1000) {
    return `${formatNumber(value / 1000, 1)}秒`
  }
  return `${formatNumber(value, 0)}ms`
}

function formatEnabled(value: boolean): string {
  return value ? "有効" : "なし"
}

function formatMultiplier(value: number): string {
  return `x${formatNumber(value, 2)}`
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`
}

function buildEquipTargets(input: {
  equipmentId: EquipmentId
  slot: EquipmentSlot
  equipped: ProfileRow["equipped"]
  equipment: EquipmentMaster
  profile: ProfileRow | null
}): EquipmentCatalogViewModel["items"][number]["equipTargets"] {
  if (input.slot === "subsystem") {
    return ([0, 1] as const).map((subsystemIndex) => {
      const state = resolveEquipmentEquipState({
        equipmentId: input.equipmentId,
        slot: input.slot,
        subsystemIndex,
        equipment: input.equipment,
        profile: input.profile,
      })
      return {
        slot: input.slot,
        subsystemIndex,
        label: `subsystem ${subsystemIndex + 1}`,
        equipped: input.equipped.subsystems[subsystemIndex] === input.equipmentId,
        canEquip: state.canEquip,
        lockedReasonLabel: state.lockedReasonLabel,
      }
    })
  }

  const state = resolveEquipmentEquipState({
    equipmentId: input.equipmentId,
    slot: input.slot,
    equipment: input.equipment,
    profile: input.profile,
  })
  return [{
    slot: input.slot,
    label: input.slot,
    equipped: input.equipped[input.slot] === input.equipmentId,
    canEquip: state.canEquip,
    lockedReasonLabel: state.lockedReasonLabel,
  }]
}

export function buildMenuViewModel(input: {
  profile: ProfileRow | null
  featureAccess: FeatureAccessState
  unreadEquipmentCount: number
  unreadArchiveCount: number
}): MenuViewModel {
  const hasProfile = Boolean(input.profile)
  return {
    screen: "menu",
    canSave: hasProfile,
    canReturnToTitle: true,
    tabs: [
      {
        tab: "equipment",
        available: hasProfile && input.featureAccess.canOpenEquipment,
        badgeCount: input.unreadEquipmentCount,
        unread: input.unreadEquipmentCount > 0,
      },
      {
        tab: "archive",
        available: hasProfile && input.featureAccess.canOpenArchive,
        badgeCount: input.unreadArchiveCount,
        unread: input.unreadArchiveCount > 0,
      },
      {
        tab: "settings",
        available: true,
        badgeCount: 0,
        unread: false,
      },
    ],
  }
}

export function buildFeatureAccessState(input: {
  profile: ProfileRow
  loadout: ResolvedLoadout
  areas: Record<AreaId, AreaMaster>
  transmissions: Record<TransmissionId, TransmissionMaster>
  missions: Record<MissionId, MissionMaster>
  equipment: Record<EquipmentId, EquipmentMaster>
  conditions: Record<ConditionId, ConditionSpec>
  areaProgress: Record<AreaId, AreaProgressRow>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): FeatureAccessState {
  const visibleAreaIds = Object.values(input.areas)
    .filter((area) => isVisible(area.visibilityConditionId, input))
    .filter(
      (area) =>
        isVisible(area.unlockConditionId, input) ||
        isAreaDiscovered(input.areaProgress[area.areaId]),
    )
    .map((area) => area.areaId)

  const visibleTransmissionIds = Object.values(input.transmissions)
    .filter((transmission) => visibleAreaIds.includes(transmission.areaId))
    .filter((transmission) => isVisible(transmission.visibilityConditionId, input))
    .filter(
      (transmission) =>
        isVisible(transmission.unlockConditionId, input) ||
        Boolean(input.transmissionProgress[transmission.transmissionId]),
    )
    .map((transmission) => transmission.transmissionId)

  const accessibleTransmissionIds = Object.values(input.transmissions)
    .filter((transmission) => visibleTransmissionIds.includes(transmission.transmissionId))
    .filter((transmission) => isVisible(transmission.accessConditionId, input))
    .map((transmission) => transmission.transmissionId)

  const visibleEquipmentIds = Object.values(input.equipment)
    .filter((equipment) => isVisible(equipment.visibilityConditionId, input))
    .map((equipment) => equipment.equipmentId)

  const visibleMissionIds = Object.values(input.missions)
    .filter((mission) => {
      const transmission = mission.transmissionId
        ? input.transmissions[mission.transmissionId]
        : undefined
      return transmission ? visibleAreaIds.includes(transmission.areaId) : true
    })
    .filter((mission) => isVisible(mission.visibilityConditionId, input))
    .map((mission) => mission.missionId)

  const startableMissionIds = Object.values(input.missions)
    .filter((mission) => visibleMissionIds.includes(mission.missionId))
    .filter((mission) => isVisible(mission.startConditionId, input))
    .map((mission) => mission.missionId)

  const passiveEffects = collectPassiveEffects(input.loadout)
  const mapUiUnlocked =
    input.profile.unlockedFlags.includes("ui.map.enabled") ||
    hasVisibilityUnlock(passiveEffects, "unlocksAreaVision")
  // アーカイブは最初から開ける前提にし、未開放通信は selector 側で空として返します。
  const archiveUiUnlocked = true
  // 装備画面はチュートリアル前から開ける前提にし、初期OS「破損」から MAGNOLIA へ換装できるようにします。
  const equipmentUiUnlocked = true
  const hudEnabled = hasVisibilityUnlock(passiveEffects, "unlocksHud")
  const minimapEnabled = hasVisibilityUnlock(passiveEffects, "unlocksMinimapDisplay")
  const strengthMeterEnabled = hasVisibilityUnlock(
    passiveEffects,
    "unlocksStrengthMeter",
  )
  const infoPanelEnabled = hasVisibilityUnlock(passiveEffects, "unlocksInfoPanel")

  return {
    canOpenMap: mapUiUnlocked,
    canOpenArchive: archiveUiUnlocked,
    canOpenEquipment: equipmentUiUnlocked,
    mapVisionUnlocked:
      mapUiUnlocked ||
      hasEffectKind(passiveEffects, "mapReveal") ||
      hasEffectKind(passiveEffects, "conditionalVision"),
    compassEnabled: hasEffectKind(passiveEffects, "compass"),
    hudEnabled,
    minimapEnabled,
    strengthMeterEnabled,
    infoPanelEnabled,
    visibleAreaIds,
    visibleTransmissionIds,
    accessibleTransmissionIds,
    visibleEquipmentIds,
    visibleMissionIds,
    startableMissionIds,
  }
}

export function buildWorldMapVisibilityState(input: {
  revealBitmap: string
  mapLogic: WorldMapLogic
  loadout: ResolvedLoadout
  featureAccess: FeatureAccessState
  profile: ProfileRow
  conditions: Record<ConditionId, ConditionSpec>
  areaProgress: Record<AreaId, AreaProgressRow>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
}): WorldMapVisibilityState {
  const decoded = decodeRevealBitmap(input.revealBitmap)
  const effectDrivenVision = collectVisionOverrides(input.loadout)
  const visibleCellKeys = applyVisionRadius(
    decoded.visibleCellKeys,
    decoded.width,
    decoded.height,
    effectDrivenVision.extraRadius,
  )
  const visibleCellSet = new Set(visibleCellKeys)
  const extraNodeIds = effectDrivenVision.extraNodeIds

  // 未探索座標や未到達ノードを UI に渡さないため、ここで可視セルと可視 node を確定します。
  const visibleAreaNodeIds = input.mapLogic.areaNodes
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) || extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleTransmissionNodeIds = input.mapLogic.transmissionNodes
    .filter((node) =>
      input.featureAccess.accessibleTransmissionIds.includes(node.transmissionId),
    )
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter((node) => isWorldNodeVisible(node.accessConditionId, input))
    .filter(
      (node) =>
        // 視界内の mission icon は scan 識別に依存させません。
        // scan は遠距離の方向と信頼度を示す補助で、近距離の発見を塞ぐ条件にはしません。
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) ||
        extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleWarpNodeIds = input.mapLogic.warpNodes
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.warpTargetAreaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter((node) => isWorldNodeVisible(node.accessConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) || extraNodeIds.has(node.nodeId),
    )
    .map((node) => node.nodeId)

  const visibleCollectibleNodeIds = input.mapLogic.collectibleNodes
    .filter((node) => !input.profile.collectedNodeIds.includes(node.nodeId))
    .filter((node) => input.featureAccess.visibleAreaIds.includes(node.areaId))
    .filter((node) => isWorldNodeVisible(node.visibilityConditionId, input))
    .filter(
      (node) =>
        visibleCellSet.has(toWorldCellKey(node.x, node.y)) ||
        extraNodeIds.has(node.nodeId) ||
        input.profile.identifiedNodeIds.includes(node.nodeId),
    )
    .map((node) => node.nodeId)

  return {
    fogBitmap: encodeFogBitmap(decoded.width, decoded.height, visibleCellSet),
    visibleCellKeys: Array.from(visibleCellSet).sort(),
    visibleAreaNodeIds,
    visibleTransmissionNodeIds,
    visibleWarpNodeIds,
    visibleCollectibleNodeIds,
  }
}

export function selectVisibleWorldMapSnapshot(input: {
  mapState: WorldMapVisibilityState
  playerPosition: { x: number; y: number }
  mapLogic: WorldMapLogic
}): ExploreMapViewModel {
  // UI には selector 済みの node id 群しか渡さず、全ノード一覧を参照させません。
  void input.mapLogic

  return {
    playerPosition: input.playerPosition,
    visibleAreaNodeIds: input.mapState.visibleAreaNodeIds,
    visibleTransmissionNodeIds: input.mapState.visibleTransmissionNodeIds,
    visibleWarpNodeIds: input.mapState.visibleWarpNodeIds,
    visibleCollectibleNodeIds: input.mapState.visibleCollectibleNodeIds,
    fogBitmap: input.mapState.fogBitmap,
  }
}

export function buildArchiveAccessState(input: {
  areaId: AreaId
  transmissionId: TransmissionId
  profile: ProfileRow
  transmission: TransmissionMaster
  transmissionProgress: TransmissionProgressRow | null
  chunks: TranscriptChunk[]
}): ArchiveAccessState {
  void input.profile
  void input.transmission

  const progress =
    input.transmissionProgress ??
    createEmptyTransmissionProgress(
      input.profile.profileId,
      input.areaId,
      input.transmissionId,
    )
  const restoredSpans = readRestoredTranscriptSpans(input.chunks, progress)
  const hasTranscriptProgress = restoredSpans.length > 0 || progress.heardRanges.length > 0
  // いったん本文を一部でも復元した通信は、欠けた本文として全体像を返します。
  // UI 側は content を直接読まず、ここで伏せ字化済みの text だけを表示します。
  const transcriptView = hasTranscriptProgress
    ? buildTranscriptViewChunks(input.chunks, restoredSpans)
    : []

  return {
    visibleAreaIds:
      hasTranscriptProgress || hasUnlockedTransmissionMetadata(progress)
        ? [input.areaId]
        : [],
    visibleTransmissionIds:
      hasTranscriptProgress || hasUnlockedTransmissionMetadata(progress)
        ? [input.transmissionId]
        : [],
    metadataUnlocked: progress.metadataUnlocked,
    transcriptView,
  }
}

export function buildArchiveViewModel(input: {
  areas: Record<AreaId, AreaMaster>
  transmissions: Record<TransmissionId, TransmissionMaster>
  transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  transcriptChunks: Record<TranscriptChunk["chunkId"], TranscriptChunk>
  selectedTransmissionId?: TransmissionId
}): ArchiveViewModel {
  const entries = Object.values(input.transmissions)
    .flatMap((transmission) => {
      const progress = input.transmissionProgress[transmission.transmissionId]
      if (!progress || !hasVisibleArchiveContent(progress)) {
        return []
      }
      const chunks = transmission.transcriptChunkIds
        .map((chunkId) => input.transcriptChunks[chunkId])
        .filter((chunk): chunk is TranscriptChunk => Boolean(chunk))
      const access = buildArchiveAccessState({
        areaId: transmission.areaId,
        transmissionId: transmission.transmissionId,
        profile: {
          profileId: progress.profileId,
          slotId: 1,
          schemaVersion: 1,
          createdAt: "",
          updatedAt: "",
          difficulty: "calm",
          currentAreaId: transmission.areaId,
          playerPosition: { x: 0, y: 0 },
          equipped: { subsystems: [null, null] },
          ownedEquipmentIds: [],
          equipmentLevels: {},
          selfRepairPoints: 0,
          collectedNodeIds: [],
          identifiedNodeIds: [],
          unlockedFlags: [],
          clearedMissionIds: [],
        },
        transmission,
        transmissionProgress: progress,
        chunks,
      })
      const metadata = access.metadataUnlocked
      const area = input.areas[transmission.areaId]
      return [{
        areaId: transmission.areaId,
        areaName: area?.name ?? transmission.areaId,
        transmissionId: transmission.transmissionId,
        title: metadata.title ? transmission.title : "???",
        sender: metadata.sender ? transmission.sender : "???",
        recipient: metadata.recipient ? transmission.recipient : "???",
        sentAt: metadata.sentAt ? transmission.sentAt : "???",
        metadataUnlocked: metadata,
        unread: false,
        selected: input.selectedTransmissionId === transmission.transmissionId,
        chunks: access.transcriptView,
      }]
    })
    .sort((left, right) => left.areaName.localeCompare(right.areaName, "ja") || left.title.localeCompare(right.title, "ja"))

  return {
    screen: "archive",
    selectedTransmissionId: input.selectedTransmissionId,
    entries,
  }
}

export function buildTranscriptViewChunks(
  chunks: TranscriptChunk[],
  restoredSpans: TranscriptSpan[],
) {
  return [...chunks]
    .sort((left, right) => left.startMs - right.startMs || left.chunkId.localeCompare(right.chunkId))
    .map((chunk) => {
      const chunkSpans = restoredSpans.filter((span) => span.chunkId === chunk.chunkId)
      const restorationRatio = readTranscriptChunkRestorationRatio(chunk, chunkSpans)
      return {
        ...chunk,
        text: maskTranscriptChunkText(chunk.text, chunkSpans, restorationRatio),
        audible: restorationRatio >= 0.85,
        restorationRatio,
        restoredSpans: chunkSpans,
      }
    })
}

function readRestoredTranscriptSpans(
  chunks: TranscriptChunk[],
  progress: TransmissionProgressRow,
): TranscriptSpan[] {
  if (progress.transcriptSpans.length > 0) {
    return mergeTranscriptSpans(progress.transcriptSpans)
  }
  return transcriptSpansFromTimeRanges(chunks, progress.heardRanges)
}

function maskTranscriptChunkText(
  text: string,
  spans: TranscriptSpan[],
  restorationRatio: number,
): string {
  if (restorationRatio >= 0.85) {
    return text
  }
  const glyphs = splitGraphemes(text)
  if (glyphs.length === 0) {
    return text
  }
  const mergedSpans = mergeTranscriptSpans(spans)
  return glyphs
    .map((glyph, index) => {
      if (/\s/u.test(glyph)) {
        return glyph
      }
      const ratio = (index + 0.5) / glyphs.length
      return mergedSpans.some((span) => ratio >= span.startRatio && ratio <= span.endRatio)
        ? glyph
        : "█"
    })
    .join("")
}

function splitGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string, options: { granularity: "grapheme" }) => {
      segment(input: string): Iterable<{ segment: string }>
    }
  }).Segmenter
  if (!Segmenter) {
    return Array.from(text)
  }
  return Array.from(new Segmenter("ja", { granularity: "grapheme" }).segment(text), (part) => part.segment)
}

function readEquippedSlot(
  equipped: {
    main?: EquipmentId
    sub?: EquipmentId
    os?: EquipmentId
    subsystems: [EquipmentId | null, EquipmentId | null]
  },
  equipmentId: EquipmentId,
): { slot?: EquipmentSlot; subsystemIndex?: SubsystemIndex } {
  if (equipped.main === equipmentId) {
    return { slot: "main" }
  }
  if (equipped.sub === equipmentId) {
    return { slot: "sub" }
  }
  if (equipped.os === equipmentId) {
    return { slot: "os" }
  }
  const subsystemIndex = equipped.subsystems.findIndex((id) => id === equipmentId)
  if (subsystemIndex === 0 || subsystemIndex === 1) {
    return { slot: "subsystem", subsystemIndex: subsystemIndex as SubsystemIndex }
  }
  return {}
}

function readFirstReason(reasons: Array<string | undefined>): string | undefined {
  return reasons.find((reason) => typeof reason === "string" && reason.length > 0)
}

export function createMissionReplaySeed(input: {
  transmissionProgress: TransmissionProgressRow | null
}): MissionReplaySeed {
  const progress = input.transmissionProgress
  return {
    seededHeardRanges: mergeRanges(progress?.heardRanges ?? []),
    seededRestorationRate: progress?.archiveRestorationRate ?? 0,
  }
}

export function seedMissionStateWithReplayProgress(input: {
  missionState: MissionState
  replaySeed: MissionReplaySeed
}): MissionState {
  return {
    ...input.missionState,
    // 再挑戦では過去に確保した区間を失わず、今回分だけを上乗せできる形にします。
    heardRanges: mergeRanges([
      ...input.replaySeed.seededHeardRanges,
      ...input.missionState.heardRanges,
    ]),
    seededHeardRanges: mergeRanges([
      ...input.missionState.seededHeardRanges,
      ...input.replaySeed.seededHeardRanges,
    ]),
    restorationRate: Math.max(
      input.missionState.restorationRate,
      input.replaySeed.seededRestorationRate,
    ),
  }
}

function isVisible(
  conditionId: ConditionId | undefined,
  input: {
    profile: ProfileRow
    loadout: ResolvedLoadout
    conditions: Record<ConditionId, ConditionSpec>
    areaProgress: Record<AreaId, AreaProgressRow>
    transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  },
): boolean {
  if (!conditionId) {
    return true
  }

  return evaluateCondition({
    conditionId,
    conditions: input.conditions,
    profile: input.profile,
    areaProgress: input.areaProgress,
    transmissionProgress: input.transmissionProgress,
    resolvedLoadout: input.loadout,
  })
}

function isWorldNodeVisible(
  conditionId: ConditionId | undefined,
  input: {
    loadout: ResolvedLoadout
    profile: ProfileRow
    conditions: Record<ConditionId, ConditionSpec>
    areaProgress: Record<AreaId, AreaProgressRow>
    transmissionProgress: Record<TransmissionId, TransmissionProgressRow>
  },
): boolean {
  if (!conditionId) {
    return true
  }

  return evaluateCondition({
    conditionId,
    conditions: input.conditions,
    profile: input.profile,
    areaProgress: input.areaProgress,
    transmissionProgress: input.transmissionProgress,
    resolvedLoadout: input.loadout,
  })
}

function collectPassiveEffects(loadout: ResolvedLoadout): EffectSpec[] {
  return [loadout.main, loadout.sub, loadout.os, ...loadout.subsystems]
    .filter((binding): binding is ResolvedEquipmentBinding => Boolean(binding))
    .flatMap((binding) => binding.passiveEffects)
}

function hasEffectKind(
  effects: EffectSpec[],
  targetKind: EffectSpec["effectKind"],
): boolean {
  return effects.some((effect) => effect.effectKind === targetKind)
}

function hasVisibilityUnlock(
  effects: EffectSpec[],
  key:
    | "unlocksAreaVision"
    | "unlocksArchiveAccess"
    | "unlocksEquipmentAccess"
    | "unlocksHud"
    | "unlocksMinimapDisplay"
    | "unlocksStrengthMeter"
    | "unlocksInfoPanel",
): boolean {
  return effects.some((effect) => effect.params?.[key] === true)
}

function collectVisionOverrides(loadout: ResolvedLoadout): {
  extraRadius: number
  extraNodeIds: Set<WorldMapNodeId>
} {
  const passiveEffects = collectPassiveEffects(loadout)
  let extraRadius = 0
  const extraNodeIds = new Set<WorldMapNodeId>()

  for (const effect of passiveEffects) {
    if (effect.effectKind !== "mapReveal" && effect.effectKind !== "conditionalVision") {
      continue
    }

    const radius = effect.params?.extraRadius
    if (typeof radius === "number" && radius > extraRadius) {
      extraRadius = radius
    }

    const nodeIds = effect.params?.nodeIds
    if (typeof nodeIds === "string") {
      for (const nodeId of nodeIds.split(",").map((value) => value.trim()).filter(Boolean)) {
        extraNodeIds.add(nodeId)
      }
    }
  }

  return { extraRadius, extraNodeIds }
}

function isAreaDiscovered(progress: AreaProgressRow | undefined): boolean {
  return Boolean(progress?.discoveredAt)
}

function decodeRevealBitmap(bitmap: string): {
  width: number
  height: number
  visibleCellKeys: string[]
} {
  const rows = bitmap
    .trim()
    .split(/\r?\n|\|/)
    .map((row) => row.trim())
    .filter(Boolean)

  const width = rows[0]?.length ?? 0
  const visibleCellKeys: string[] = []

  rows.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "1") {
        visibleCellKeys.push(toCellKey(x, y))
      }
    })
  })

  return {
    width,
    height: rows.length,
    visibleCellKeys,
  }
}

function applyVisionRadius(
  baseVisibleCellKeys: string[],
  width: number,
  height: number,
  extraRadius: number,
): string[] {
  const visibleCellSet = new Set(baseVisibleCellKeys)
  if (extraRadius <= 0) {
    return Array.from(visibleCellSet)
  }

  for (const key of baseVisibleCellKeys) {
    const [x, y] = fromCellKey(key)
    for (let dy = -extraRadius; dy <= extraRadius; dy += 1) {
      for (let dx = -extraRadius; dx <= extraRadius; dx += 1) {
        const nextX = x + dx
        const nextY = y + dy
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue
        }
        visibleCellSet.add(toCellKey(nextX, nextY))
      }
    }
  }

  return Array.from(visibleCellSet)
}

function encodeFogBitmap(
  width: number,
  height: number,
  visibleCellKeys: Set<string>,
): string {
  const rows: string[] = []

  for (let y = 0; y < height; y += 1) {
    let row = ""
    for (let x = 0; x < width; x += 1) {
      row += visibleCellKeys.has(toCellKey(x, y)) ? "1" : "0"
    }
    rows.push(row)
  }

  return rows.join("|")
}

function toCellKey(x: number, y: number): string {
  return `${x},${y}`
}

function toWorldCellKey(worldX: number, worldY: number): string {
  // revealBitmap はセル座標で保存しているため、world map 上の node 座標も同じセル系へ写して判定します。
  const x = Math.max(0, Math.floor((worldX - WORLD_BITMAP_ORIGIN_X) / WORLD_CELL_SIZE))
  const y = Math.max(0, Math.floor((worldY - WORLD_BITMAP_ORIGIN_Y) / WORLD_CELL_SIZE))
  return toCellKey(x, y)
}

function fromCellKey(key: string): [number, number] {
  const [x, y] = key.split(",").map((value) => Number(value))
  return [x, y]
}

function createEmptyTransmissionProgress(
  profileId: ProfileRow["profileId"],
  areaId: AreaId,
  transmissionId: TransmissionId,
): TransmissionProgressRow {
  return {
    profileId,
    transmissionId,
    areaId,
    clearCount: 0,
    bestAnalysisRate: 0,
    bestRunRestorationRate: 0,
    archiveRestorationRate: 0,
    heardRanges: [],
    transcriptSpans: [],
    metadataUnlocked: createEmptyMetadataUnlocked(),
  }
}

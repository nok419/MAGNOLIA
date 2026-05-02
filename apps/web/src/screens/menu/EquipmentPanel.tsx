import { useEffect, useRef } from "react"
import type {
  EquipmentCatalogItemViewModel,
  EquipmentPanelViewModel,
  ShipVariant,
} from "@magnolia/contracts"
import { ActionButton } from "@/components/ActionButton"
import { PanelFrame } from "@/components/common"
import { audioEvents } from "@/audio"
import { ShipStatusPanel } from "@/screens/menu/ShipStatusPanel"
import {
  readEquipmentCategorySlot,
  readEquipmentCategorySubsystemIndex,
  type EquipmentCategoryKey,
} from "@/screens/menu/equipment-category"

const SLOT_CATEGORIES: { key: EquipmentCategoryKey; label: string }[] = [
  { key: "main", label: "main" },
  { key: "sub", label: "sub" },
  { key: "os", label: "os" },
  { key: "subsystem1", label: "subsystem 1" },
  { key: "subsystem2", label: "subsystem 2" },
]

/**
 * equipmentId から表示用の 4 桁 16 進フラグメントを生成する。
 * 詳細パネル・エントリ番号ラベルに使用する (純粋ビジュアル用途)。
 */
function equipmentIdFragment(equipmentId: string): string {
  let hash = 0
  for (let i = 0; i < equipmentId.length; i++) {
    hash = ((hash << 5) - hash + equipmentId.charCodeAt(i)) | 0
  }
  return (hash >>> 0)
    .toString(16)
    .toUpperCase()
    .slice(-4)
    .padStart(4, "0")
}

function readEquipmentListState(eq: EquipmentCatalogItemViewModel): {
  cardClassName: string
  badgeLabel: string | null
  badgeClassName: string
} {
  if (!eq.owned) {
    return {
      cardClassName: "list-card--unowned",
      badgeLabel: "未入手",
      badgeClassName: "equip-badge equip-badge--locked",
    }
  }
  if (eq.canUpgrade) {
    return {
      cardClassName: "list-card--upgrade-ready",
      badgeLabel: "強化可能",
      badgeClassName: "equip-badge equip-badge--upgrade-ready",
    }
  }
  if (eq.upgradeCost !== undefined) {
    return {
      cardClassName: "list-card--upgrade-short",
      badgeLabel: "ポイント不足",
      badgeClassName: "equip-badge equip-badge--upgrade-short",
    }
  }
  if (eq.currentLevel >= eq.maxLevel) {
    return {
      cardClassName: "list-card--maxed",
      badgeLabel: "最大LV",
      badgeClassName: "equip-badge equip-badge--maxed",
    }
  }
  return {
    cardClassName: "list-card--owned",
    badgeLabel: null,
    badgeClassName: "equip-badge",
  }
}

function readGuideCategoryForSlot(
  slot: EquipmentCatalogItemViewModel["slot"],
): EquipmentCategoryKey | null {
  if (slot === "main" || slot === "sub" || slot === "os") {
    return slot
  }
  if (slot === "subsystem") {
    return "subsystem1"
  }
  return null
}

function readEquipActionClassName(input: {
  ready: boolean
  guided: boolean
}): string | undefined {
  if (!input.ready) {
    return undefined
  }
  return [
    "equip-detail__equip-action",
    input.guided ? "equip-detail__equip-action--guide" : "",
  ].filter(Boolean).join(" ")
}

function ProcurementPanel({
  mode,
  cost,
  balance,
  canAct,
  onAction,
  levelInfo,
}: {
  mode: "purchase" | "upgrade"
  cost: number
  balance: number
  canAct: boolean
  onAction: () => void
  levelInfo?: { current: number; next: number; max: number }
}) {
  const shortage = Math.max(0, cost - balance)
  // 進捗バーは「残高 / 必要コスト」の比率 (最大 100%)。コスト 0 の場合は 100% 扱い。
  const progress = cost > 0 ? Math.min(1, balance / cost) : 1

  const eyebrow = mode === "purchase" ? "ACQUIRE" : "UPGRADE"
  const ctaReady = mode === "purchase" ? "取得する" : "アップグレード実行"
  const ctaShort = `−${shortage} pts 不足`

  return (
    <section
      className={`procurement procurement--${mode} ${
        canAct ? "procurement--ready" : "procurement--short"
      }`}
      aria-label={mode === "purchase" ? "装備の取得" : "装備のアップグレード"}
    >
      <header className="procurement__header">
        <span className="procurement__eyebrow">
          <span className="procurement__diamond">◇</span>
          {eyebrow}
        </span>
        {mode === "upgrade" && levelInfo ? (
          <span className="procurement__level-track">
            <span className="procurement__level-current">LV.{levelInfo.current}</span>
            <span className="procurement__level-arrow">▸</span>
            <span className="procurement__level-next">LV.{levelInfo.next}</span>
            <span className="procurement__level-max">/ {levelInfo.max}</span>
          </span>
        ) : null}
      </header>

      <div className="procurement__rows">
        <div className="procurement__row">
          <span className="procurement__key">cost</span>
          <span className="procurement__value procurement__value--cost">
            <span className="procurement__num">{cost.toLocaleString()}</span>
            <span className="procurement__unit">pts</span>
          </span>
        </div>
        <div className="procurement__row">
          <span className="procurement__key">balance</span>
          <span
            className={`procurement__value ${
              canAct ? "procurement__value--ok" : "procurement__value--short"
            }`}
          >
            <span className="procurement__num">{balance.toLocaleString()}</span>
            <span className="procurement__unit">pts</span>
          </span>
        </div>
      </div>

      {/* 進捗バー: 残高が必要コストに対してどの位置か。マーカーが 100% 地点。 */}
      <div
        className="procurement__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cost}
        aria-valuenow={Math.min(balance, cost)}
        aria-label="balance vs cost"
      >
        <div
          className="procurement__bar-fill"
          style={{ width: `${(progress * 100).toFixed(1)}%` }}
        />
        <div className="procurement__bar-cap" aria-hidden="true" />
      </div>

      {!canAct && shortage > 0 ? (
        <p className="procurement__shortage-note">
          あと <span>{shortage.toLocaleString()}</span> pts で
          {mode === "purchase" ? "取得" : "強化"}可能です
        </p>
      ) : null}

      <button
        type="button"
        className={`procurement__cta ${
          canAct ? "procurement__cta--ready" : "procurement__cta--locked"
        }`}
        disabled={!canAct}
        onClick={() => {
          if (canAct) onAction()
        }}
      >
        <span className="procurement__cta-label">
          {canAct ? ctaReady : ctaShort}
        </span>
        {canAct ? (
          <span className="procurement__cta-cost">−{cost.toLocaleString()} pts</span>
        ) : null}
      </button>
    </section>
  )
}

/* ============================================================
   EQUIPMENT PANEL — 4-column: ship status | categories | items | detail
   ============================================================ */
export function EquipmentPanel({
  viewModel,
  selectedCategory,
  selectedEquipmentId,
  onSelectCategory,
  onSelectEquipment,
  onEquip,
  onUnequip,
  onPurchase,
  onUpgrade,
  shipVariant,
  onSelectShipVariant,
  unseenEquipmentIds,
  equipmentGuideTargetId,
  onMarkEquipmentSeen,
}: {
  viewModel: EquipmentPanelViewModel
  selectedCategory: EquipmentCategoryKey
  selectedEquipmentId: string | null
  onSelectCategory: (slot: EquipmentCategoryKey) => void
  onSelectEquipment: (id: string | null) => void
  onEquip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onUnequip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (id: string) => void
  onUpgrade: (id: string) => void
  shipVariant: ShipVariant
  onSelectShipVariant: (variant: ShipVariant) => void
  unseenEquipmentIds: string[]
  equipmentGuideTargetId: string | null
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
}) {
  const catalog = viewModel.catalog
  const equipped = catalog.equipped
  const selectedSlot = readEquipmentCategorySlot(selectedCategory)
  const selectedSubsystemIndex = readEquipmentCategorySubsystemIndex(selectedCategory)
  const filteredItems = catalog.items.filter((eq) => eq.slot === selectedSlot)
  const guidedEquipment = equipmentGuideTargetId
    ? catalog.items.find((eq) => eq.equipmentId === equipmentGuideTargetId)
    : undefined
  const guidedCategory = guidedEquipment
    ? readGuideCategoryForSlot(guidedEquipment.slot)
    : null

  // カテゴリ毎の未確認装備を数え、タブ上の NEW バッジ表示に使う。
  // 既所持かつ seen 未登録のものだけが対象。
  const unseenSet = new Set(unseenEquipmentIds)
  const unseenCountBySlot = new Map<string, number>()
  for (const equipmentId of unseenEquipmentIds) {
    const equipment = catalog.items.find((item) => item.equipmentId === equipmentId)
    if (!equipment) continue
    unseenCountBySlot.set(
      equipment.slot,
      (unseenCountBySlot.get(equipment.slot) ?? 0) + 1,
    )
  }

  // 項目クリックで初めて確認済みへ移す。
  // カテゴリタブ側の NEW は「中に未確認あり」、項目側の NEW は「この装備が未確認」。
  // 両方が同じ seen 状態を見ることで、クリックに追従してバッジが段階的に消える。
  const handleSelectEquipment = (id: string | null) => {
    if (id && unseenSet.has(id)) {
      onMarkEquipmentSeen([id])
    }
    if (id && id !== selectedEquipmentId) {
      audioEvents.equipmentArchiveDetailSelect()
    }
    onSelectEquipment(id)
  }

  const selected = selectedEquipmentId
    ? catalog.items.find((item) => item.equipmentId === selectedEquipmentId)
    : undefined
  const isSelectedGuideTarget = selected?.equipmentId === equipmentGuideTargetId
  const isSelectedOwned = Boolean(selected?.owned)
  const isSelectedMasked = Boolean(selected?.masked)
  const currentLevel = selected?.currentLevel ?? 0

  const handleSelectCategory = (category: EquipmentCategoryKey) => {
    if (category !== selectedCategory) {
      audioEvents.equipmentArchiveCategorySelect()
    }
    onSelectCategory(category)
    onSelectEquipment(null)
  }

  return (
    <div className="equip-4col">
      {/* ship status */}
      <ShipStatusPanel
        viewModel={viewModel}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        shipVariant={shipVariant}
        onSelectShipVariant={onSelectShipVariant}
      />

      {/* categories */}
      <div className="equip-categories">
        {SLOT_CATEGORIES.map((cat) => {
          const isActive = cat.key === selectedCategory
          const unseenCount = unseenCountBySlot.get(readEquipmentCategorySlot(cat.key)) ?? 0
          const hasUnseen = unseenCount > 0 && !isActive
          const isGuided = cat.key === guidedCategory
          return (
            <button
              key={cat.key}
              type="button"
              className={`equip-cat ${isActive ? "equip-cat--active" : ""}${hasUnseen ? " equip-cat--has-new" : ""}${isGuided ? " equip-cat--guide" : ""}`}
              onClick={() => handleSelectCategory(cat.key)}
            >
              <span className="equip-cat__label">
                {isActive ? "▸ " : ""}{cat.label}
              </span>
              {hasUnseen ? (
                <span className="equip-cat__new-badge" aria-label={`${unseenCount} 件の未確認装備`}>
                  NEW
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* items list (arc layout) */}
      <EquipmentArcList
        items={filteredItems}
        equipped={equipped}
        selectedEquipmentId={selectedEquipmentId}
        onSelectEquipment={handleSelectEquipment}
        unseenEquipmentIds={unseenSet}
        equipmentGuideTargetId={equipmentGuideTargetId}
        selectedSubsystemIndex={selectedSubsystemIndex}
      />

      {/* detail */}
      <PanelFrame className="equip-detail" bodyClassName="equip-detail__surface">
        <div className="equip-detail__decorator equip-detail__decorator--tl" />
        <div className="equip-detail__decorator equip-detail__decorator--tr" />
        <div className="equip-detail__decorator equip-detail__decorator--bl" />
        <div className="equip-detail__decorator equip-detail__decorator--br" />
        <div className="equip-detail__scanline" aria-hidden="true" />
        <div className="equip-detail__edge" aria-hidden="true" />

        {selected ? (
          isSelectedMasked ? (
            <div className="equip-detail__content fade-in">
              <header className="equip-detail__header">
                <span className="equip-detail__eyebrow">
                  <span className="equip-detail__diamond">◇</span>
                  catalog // undocumented
                </span>
                <span className="equip-detail__id">0x----</span>
              </header>
              <div className="equip-detail__rule" aria-hidden="true" />
              <h3 className="detail-title">???</h3>
              <div className="equip-detail__meta">
                <span className="equip-detail__slot-chip equip-detail__slot-chip--muted">
                  {selected.slot}
                </span>
                <span className="equip-detail__level" aria-label="level locked">
                  <span className="equip-detail__level-label">LV</span>
                  <span className="equip-detail__level-dots">
                    {Array.from({ length: Math.max(1, selected.maxLevel) }).map((_, idx) => (
                      <span key={idx} className="equip-detail__level-dot" />
                    ))}
                  </span>
                </span>
              </div>
              <p className="muted-text equip-detail__desc">詳細不明</p>
              <p className="equip-detail__footer-note">// ENTRY.SEALED</p>
            </div>
          ) : (
            <div className="equip-detail__content fade-in">
              <header className="equip-detail__header">
                <span className="equip-detail__eyebrow">
                  <span className="equip-detail__diamond">◇</span>
                  catalog // {selected.slot}-class
                </span>
                <span className="equip-detail__id">0x{equipmentIdFragment(selected.equipmentId)}</span>
              </header>
              <div className="equip-detail__rule" aria-hidden="true" />
              <h3 className="detail-title">{selected.visibleName}</h3>
              <div className="equip-detail__meta">
                <span className="equip-detail__slot-chip">{selected.slot}</span>
                <span
                  className="equip-detail__level"
                  aria-label={`level ${currentLevel} of ${selected.maxLevel}`}
                >
                  <span className="equip-detail__level-label">LV</span>
                  <span className="equip-detail__level-dots">
                    {Array.from({ length: selected.maxLevel }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`equip-detail__level-dot${idx < currentLevel ? " equip-detail__level-dot--on" : ""}`}
                      />
                    ))}
                  </span>
                  <span className="equip-detail__level-val">
                    {currentLevel}/{selected.maxLevel}
                  </span>
                </span>
              </div>
              <p className="equip-detail__desc">{selected.visibleDescription}</p>
              {selected.statGroups.length > 0 ? (
                <div className="equip-detail__stat-groups" aria-label="装備性能">
                  {selected.statGroups.map((group) => (
                    <section className="equip-detail__stat-group" key={group.label}>
                      <h4 className="equip-detail__stat-heading">{group.label}</h4>
                      <dl className="equip-detail__stat-list">
                        {group.stats.map((stat) => (
                          <div className="equip-detail__stat-row" key={`${group.label}-${stat.label}`}>
                            <dt>{stat.label}</dt>
                            <dd>
                              <span>{stat.value}</span>
                              {stat.note ? <small>{stat.note}</small> : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
              ) : null}
              {selected.upgradePreview ? (
                <div className="equip-detail__upgrade-preview" aria-label="次のレベルアップ効果">
                  <span className="equip-detail__upgrade-track">
                    LV.{selected.upgradePreview.fromLevel} ▸ LV.{selected.upgradePreview.toLevel}
                  </span>
                  <span>{selected.upgradePreview.summary}</span>
                </div>
              ) : null}
              <blockquote className="equip-detail__flavor">
                <span className="equip-detail__flavor-mark" aria-hidden="true" />
                <span>{selected.flavorText ?? ""}</span>
              </blockquote>
              <div className="equip-detail__actions">
                {/* 装備切替セクション: 既所持のみ表示 */}
                {isSelectedOwned ? (
                  <div className="button-row">
                    {selected.slot === "subsystem" ? (
                      (() => {
                        // カテゴリ選択時点で subsystem 1 / 2 を決めるため、詳細では対象枠だけを操作します。
                        const target = selected.equipTargets.find(
                          (nextTarget) => nextTarget.subsystemIndex === selectedSubsystemIndex,
                        )
                        if (!target) {
                          return null
                        }
                        const alreadyEquippedAtTarget = target.equipped
	                        return (
	                          <div className="button-row" key={target.subsystemIndex ?? target.label}>
	                            <ActionButton
	                              tone={alreadyEquippedAtTarget ? "ghost" : "primary"}
	                              className={readEquipActionClassName({
	                                ready: !alreadyEquippedAtTarget && target.canEquip,
	                                guided: Boolean(isSelectedGuideTarget && !alreadyEquippedAtTarget && target.canEquip),
	                              })}
	                              disabled={!target.canEquip}
	                              onClick={() =>
	                                onEquip(selected.equipmentId, target.slot, target.subsystemIndex)
	                              }
	                            >
                              {alreadyEquippedAtTarget
                                ? `${target.label} 装備中`
                                : target.canEquip
                                  ? `装備する ${target.label}`
                                  : (target.lockedReasonLabel ?? "装備不可")}
                            </ActionButton>
                            {alreadyEquippedAtTarget ? (
                              <ActionButton
                                tone="danger"
                                onClick={() =>
                                  onUnequip(selected.equipmentId, target.slot, target.subsystemIndex)
                                }
                                style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
                              >
                                解除
                              </ActionButton>
                            ) : null}
                          </div>
                        )
                      })()
                    ) : (
                      selected.equipTargets.map((target) => (
                        <div className="button-row" key={target.label}>
                          <ActionButton
                            tone={target.equipped ? "ghost" : "primary"}
                            className={readEquipActionClassName({
                              ready: !target.equipped && target.canEquip,
                              guided: Boolean(isSelectedGuideTarget && !target.equipped && target.canEquip),
                            })}
                            disabled={!target.canEquip}
                            onClick={() => onEquip(selected.equipmentId, target.slot)}
                          >
                            {target.equipped ? "装備中" : "装備する"}
                          </ActionButton>
                          {target.equipped ? (
                            <ActionButton
                              tone="danger"
                              onClick={() => onUnequip(selected.equipmentId, target.slot)}
                              style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
                            >
                              解除
                            </ActionButton>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                {/* 購入パネル: 未所持 + 購入対象のみ */}
                {!isSelectedOwned && selected.purchaseCost !== undefined ? (
                  <ProcurementPanel
                    mode="purchase"
                    cost={selected.purchaseCost}
                    balance={catalog.selfRepairPoints}
                    canAct={selected.canPurchase}
                    onAction={() => onPurchase(selected.equipmentId)}
                  />
                ) : null}

                {/* アップグレードパネル: 既所持 + 次レベルがある */}
                {selected.upgradeCost !== undefined ? (
                  <ProcurementPanel
                    mode="upgrade"
                    cost={selected.upgradeCost ?? 0}
                    balance={catalog.selfRepairPoints}
                    canAct={selected.canUpgrade}
                    levelInfo={{
                      current: currentLevel,
                      next: currentLevel + 1,
                      max: selected.maxLevel,
                    }}
                    onAction={() => onUpgrade(selected.equipmentId)}
                  />
                ) : null}

                {/* ロック中: 未所持かつ購入以外のアンロック条件 */}
                {!isSelectedOwned && selected.purchaseCost === undefined ? (
                  <div className="equip-detail__locked-note">
                    <span className="equip-detail__locked-mark">▲</span>
                    <span>{selected.lockedReasonLabel ?? "ロック中です"}</span>
                  </div>
                ) : null}

                {/* アップグレード上限 */}
                {isSelectedOwned && selected && currentLevel >= selected.maxLevel ? (
                  <div className="equip-detail__max-note">
                    <span className="equip-detail__max-mark">◆</span>
                    <span>最大レベル到達 (Lv.{selected.maxLevel})</span>
                  </div>
                ) : null}
              </div>
              <p className="equip-detail__footer-note">
                // ENTRY.0x{equipmentIdFragment(selected.equipmentId)}
              </p>
            </div>
          )
        ) : (
          <div className="equip-empty-state fade-in">
            <div className="equip-empty-state__circle" />
            <p className="equip-empty-state__text">// AWAITING SELECTION</p>
          </div>
        )}
      </PanelFrame>
    </div>
  )
}

/* ============================================================
   EQUIPMENT LIST
   通常はフラットな縦並び。選択項目のみが前方へ軽く突き出し、
   アクセントカラーの側線と影で他から切り出される。
   ============================================================ */
function EquipmentArcList({
  items,
  equipped,
  selectedEquipmentId,
  onSelectEquipment,
  unseenEquipmentIds,
  equipmentGuideTargetId,
  selectedSubsystemIndex,
}: {
  items: EquipmentCatalogItemViewModel[]
  equipped: EquipmentPanelViewModel["equipped"]
  selectedEquipmentId: string | null
  onSelectEquipment: (id: string | null) => void
  unseenEquipmentIds: Set<string>
  equipmentGuideTargetId: string | null
  selectedSubsystemIndex?: 0 | 1
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 選択項目を可視領域中央へ誘導する (キーボード/外部遷移のため)。
  useEffect(() => {
    if (!selectedEquipmentId) return
    const container = scrollRef.current
    if (!container) return
    const idx = items.findIndex((eq) => eq.equipmentId === selectedEquipmentId)
    if (idx < 0) return
    const target = container.children[idx] as HTMLElement | undefined
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [items, selectedEquipmentId])

  if (items.length === 0) {
    return (
      <div className="equip-list equip-list--plain">
        <p className="muted-text">この分類の装備はありません</p>
      </div>
    )
  }

  return (
    <div className="equip-list equip-list--plain" ref={scrollRef}>
      {items.map((eq) => {
        const equippedLabel = readEquippedLabel(eq, equipped)
        const isEq = equippedLabel !== null
        const isSel = eq.equipmentId === selectedEquipmentId
        const isNew = unseenEquipmentIds.has(eq.equipmentId)
        const isGuided = eq.equipmentId === equipmentGuideTargetId
        // 一覧の状態表示は ViewModel の所持・強化可否だけで決める。
        // 表示層で profile や cost を再計算しないため、detail と判定がずれない。
        const listState = readEquipmentListState(eq)

        return (
          <button
            key={eq.equipmentId}
            type="button"
            className={`list-card ${listState.cardClassName}${isSel ? " list-card--selected" : ""}${isNew ? " list-card--new" : ""}${isGuided ? " list-card--guide" : ""}`}
            onClick={() => onSelectEquipment(eq.equipmentId)}
          >
            {isNew ? (
              <span className="equip-item-new" aria-label="未確認の装備">
                NEW
              </span>
            ) : null}
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>
              {eq.visibleName}
              {isEq ? <span className="equip-badge">{equippedLabel}</span> : null}
              {eq.slot === "subsystem" && selectedSubsystemIndex !== undefined && isEquippedInOtherSubsystem(eq, equipped, selectedSubsystemIndex) ? (
                <span className="equip-badge equip-badge--locked">他枠で使用中</span>
              ) : null}
              {listState.badgeLabel ? (
                <span className={listState.badgeClassName}>{listState.badgeLabel}</span>
              ) : null}
            </p>
            <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
              {eq.visibleDescription}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function readEquippedLabel(
  eq: EquipmentCatalogItemViewModel,
  equipped: EquipmentPanelViewModel["equipped"],
): string | null {
  if (equipped.main === eq.equipmentId) return "MAIN装備中"
  if (equipped.sub === eq.equipmentId) return "SUB装備中"
  if (equipped.os === eq.equipmentId) return "OS装備中"
  const subsystemIndex = equipped.subsystems.findIndex((equipmentId) => equipmentId === eq.equipmentId)
  if (subsystemIndex === 0 || subsystemIndex === 1) {
    return `SYS-${subsystemIndex + 1}装備中`
  }
  return null
}

function isEquippedInOtherSubsystem(
  eq: EquipmentCatalogItemViewModel,
  equipped: EquipmentPanelViewModel["equipped"],
  selectedSubsystemIndex: 0 | 1,
): boolean {
  if (eq.slot !== "subsystem") {
    return false
  }
  const equippedIndex = equipped.subsystems.findIndex((equipmentId) => equipmentId === eq.equipmentId)
  return (equippedIndex === 0 || equippedIndex === 1) && equippedIndex !== selectedSubsystemIndex
}

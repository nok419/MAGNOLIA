import { useEffect, useRef } from "react"
import type { ContentBundle, EquipmentMaster, EquipmentSlot, ProfileAggregate, ShipVariant } from "@magnolia/contracts"
import { ActionButton } from "@/components/ActionButton"
import { ShipStatusPanel } from "@/screens/menu/ShipStatusPanel"

const SLOT_CATEGORIES: { key: EquipmentSlot; label: string }[] = [
  { key: "main", label: "main" },
  { key: "sub", label: "sub" },
  { key: "os", label: "os" },
  { key: "subsystem", label: "subsystem" },
]

function shouldMaskEquipmentInfo(equipment: EquipmentMaster, owned: boolean): boolean {
  return !owned && equipment.unlockSource.kind !== "purchase"
}

/**
 * アップグレード cost を解決する。
 * 次レベル (currentLevel + 1) の `levelParams` を探し、`selfRepairPointCost` を返す。
 * 見つからない場合は 0 (セッション側で同様のフォールバックをする)。
 */
function resolveUpgradeCost(equipment: EquipmentMaster, currentLevel: number): number {
  const nextLevel = currentLevel + 1
  const params = equipment.levelParams.find((p) => p.level === nextLevel)
  return params?.selfRepairPointCost ?? 0
}

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

function ProcurementPanel({
  mode,
  cost,
  balance,
  onAction,
  levelInfo,
}: {
  mode: "purchase" | "upgrade"
  cost: number
  balance: number
  onAction: () => void
  levelInfo?: { current: number; next: number; max: number }
}) {
  const affordable = balance >= cost
  const shortage = Math.max(0, cost - balance)
  // 進捗バーは「残高 / 必要コスト」の比率 (最大 100%)。コスト 0 の場合は 100% 扱い。
  const progress = cost > 0 ? Math.min(1, balance / cost) : 1

  const eyebrow = mode === "purchase" ? "ACQUIRE" : "UPGRADE"
  const ctaReady = mode === "purchase" ? "取得する" : "アップグレード実行"
  const ctaShort = `−${shortage} pts 不足`

  return (
    <section
      className={`procurement procurement--${mode} ${
        affordable ? "procurement--ready" : "procurement--short"
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
              affordable ? "procurement__value--ok" : "procurement__value--short"
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

      {!affordable ? (
        <p className="procurement__shortage-note">
          あと <strong>{shortage.toLocaleString()}</strong> pts で取得可能です
        </p>
      ) : null}

      <button
        type="button"
        className={`procurement__cta ${
          affordable ? "procurement__cta--ready" : "procurement__cta--locked"
        }`}
        disabled={!affordable}
        onClick={() => {
          if (affordable) onAction()
        }}
      >
        <span className="procurement__cta-label">
          {affordable ? ctaReady : ctaShort}
        </span>
        {affordable ? (
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
  content,
  profile,
  selectedCategory,
  selectedEquipmentId,
  onSelectCategory,
  onSelectEquipment,
  onEquip,
  onPurchase,
  onUpgrade,
  shipVariant,
  onSelectShipVariant,
  unseenEquipmentIds,
  onMarkEquipmentSeen,
}: {
  content: ContentBundle
  profile: ProfileAggregate
  selectedCategory: EquipmentSlot
  selectedEquipmentId: string | null
  onSelectCategory: (slot: EquipmentSlot) => void
  onSelectEquipment: (id: string | null) => void
  onEquip: (id: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (id: string) => void
  onUpgrade: (id: string) => void
  shipVariant: ShipVariant
  onSelectShipVariant: (variant: ShipVariant) => void
  unseenEquipmentIds: string[]
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
}) {
  const owned = new Set(profile.profile.ownedEquipmentIds)
  const equipped = profile.profile.equipped
  const filteredItems = Object.values(content.equipment).filter(
    (eq) => eq.slot === selectedCategory,
  )

  // カテゴリ毎の未確認装備を数え、タブ上の NEW バッジ表示に使う。
  // 既所持かつ seen 未登録のものだけが対象。
  const unseenSet = new Set(unseenEquipmentIds)
  const unseenCountByCategory = new Map<EquipmentSlot, number>()
  for (const equipmentId of unseenEquipmentIds) {
    const equipment = content.equipment[equipmentId]
    if (!equipment) continue
    unseenCountByCategory.set(
      equipment.slot,
      (unseenCountByCategory.get(equipment.slot) ?? 0) + 1,
    )
  }

  // 項目クリックで初めて確認済みへ移す。
  // カテゴリタブ側の NEW は「中に未確認あり」、項目側の NEW は「この装備が未確認」。
  // 両方が同じ seen 状態を見ることで、クリックに追従してバッジが段階的に消える。
  const handleSelectEquipment = (id: string | null) => {
    if (id && unseenSet.has(id)) {
      onMarkEquipmentSeen([id])
    }
    onSelectEquipment(id)
  }

  const selected = selectedEquipmentId ? content.equipment[selectedEquipmentId] : undefined
  const isSelectedOwned = selectedEquipmentId ? owned.has(selectedEquipmentId) : false
  const isSelectedMasked = selected ? shouldMaskEquipmentInfo(selected, isSelectedOwned) : false
  const isSelectedEquipped = selectedEquipmentId
    ? equipped.main === selectedEquipmentId ||
      equipped.sub === selectedEquipmentId ||
      equipped.os === selectedEquipmentId ||
      equipped.subsystems.includes(selectedEquipmentId)
    : false
  const currentLevel = selectedEquipmentId
    ? profile.profile.equipmentLevels?.[selectedEquipmentId] ?? 0
    : 0
  const canUpgrade = selected && isSelectedOwned && currentLevel < selected.maxLevel
  return (
    <div className="equip-4col">
      {/* ship status */}
      <ShipStatusPanel
        content={content}
        profile={profile}
        selectedCategory={selectedCategory}
        onSelectCategory={(slot) => { onSelectCategory(slot); onSelectEquipment(null) }}
        shipVariant={shipVariant}
        onSelectShipVariant={onSelectShipVariant}
      />

      {/* categories */}
      <div className="equip-categories">
        {SLOT_CATEGORIES.map((cat) => {
          const isActive = cat.key === selectedCategory
          const unseenCount = unseenCountByCategory.get(cat.key) ?? 0
          const hasUnseen = unseenCount > 0 && !isActive
          return (
            <button
              key={cat.key}
              type="button"
              className={`equip-cat ${isActive ? "equip-cat--active" : ""}${hasUnseen ? " equip-cat--has-new" : ""}`}
              onClick={() => { onSelectCategory(cat.key); onSelectEquipment(null) }}
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
        owned={owned}
        equipped={equipped}
        selectedEquipmentId={selectedEquipmentId}
        onSelectEquipment={handleSelectEquipment}
        unseenEquipmentIds={unseenSet}
      />

      {/* detail */}
      <div className="equip-detail">
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
              <h3 className="detail-title">{selected.name}</h3>
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
              <p className="equip-detail__desc">{selected.description}</p>
              <blockquote className="equip-detail__flavor">
                <span className="equip-detail__flavor-mark" aria-hidden="true" />
                <span>{selected.flavorText}</span>
              </blockquote>
              <div className="equip-detail__actions">
                {/* 装備切替セクション: 既所持のみ表示 */}
                {isSelectedOwned ? (
                  <div className="button-row">
                    {selected.slot === "subsystem" ? (
                      <>
                        {[0, 1].map((subsystemIndex) => {
                          const alreadyEquippedAtTarget =
                            equipped.subsystems[subsystemIndex] === selected.equipmentId
                          return (
                            <ActionButton
                              key={subsystemIndex}
                              tone={alreadyEquippedAtTarget ? "ghost" : "primary"}
                              disabled={alreadyEquippedAtTarget}
                              onClick={() =>
                                onEquip(selected.equipmentId, selected.slot, subsystemIndex as 0 | 1)
                              }
                              style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
                            >
                              {alreadyEquippedAtTarget ? `subsystem ${subsystemIndex + 1}` : `equip s${subsystemIndex + 1}`}
                            </ActionButton>
                          )
                        })}
                      </>
                    ) : (
                      <ActionButton
                        tone={isSelectedEquipped ? "ghost" : "primary"}
                        disabled={isSelectedEquipped}
                        onClick={() => onEquip(selected.equipmentId, selected.slot)}
                        style={{ fontSize: 12, padding: "6px 16px", minHeight: 0 }}
                      >
                        {isSelectedEquipped ? "装備中" : "装備する"}
                      </ActionButton>
                    )}
                  </div>
                ) : null}

                {/* 購入パネル: 未所持 + 購入対象のみ */}
                {!isSelectedOwned && selected.unlockSource?.kind === "purchase" ? (
                  <ProcurementPanel
                    mode="purchase"
                    cost={selected.unlockSource.selfRepairPointCost}
                    balance={profile.profile.selfRepairPoints}
                    onAction={() => onPurchase(selected.equipmentId)}
                  />
                ) : null}

                {/* アップグレードパネル: 既所持 + 次レベルがある */}
                {canUpgrade && selected ? (
                  <ProcurementPanel
                    mode="upgrade"
                    cost={resolveUpgradeCost(selected, currentLevel)}
                    balance={profile.profile.selfRepairPoints}
                    levelInfo={{
                      current: currentLevel,
                      next: currentLevel + 1,
                      max: selected.maxLevel,
                    }}
                    onAction={() => onUpgrade(selected.equipmentId)}
                  />
                ) : null}

                {/* ロック中: 未所持かつ購入以外のアンロック条件 */}
                {!isSelectedOwned && selected.unlockSource?.kind !== "purchase" ? (
                  <div className="equip-detail__locked-note">
                    <span className="equip-detail__locked-mark">▲</span>
                    <span>ロック中 — 条件を満たすと解放されます</span>
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
      </div>
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
  owned,
  equipped,
  selectedEquipmentId,
  onSelectEquipment,
  unseenEquipmentIds,
}: {
  items: EquipmentMaster[]
  owned: Set<string>
  equipped: ProfileAggregate["profile"]["equipped"]
  selectedEquipmentId: string | null
  onSelectEquipment: (id: string | null) => void
  unseenEquipmentIds: Set<string>
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
        const isOwn = owned.has(eq.equipmentId)
        const isMasked = shouldMaskEquipmentInfo(eq, isOwn)
        const isEq =
          equipped.main === eq.equipmentId ||
          equipped.sub === eq.equipmentId ||
          equipped.os === eq.equipmentId ||
          equipped.subsystems.includes(eq.equipmentId)
        const isSel = eq.equipmentId === selectedEquipmentId
        const isNew = unseenEquipmentIds.has(eq.equipmentId)

        return (
          <button
            key={eq.equipmentId}
            type="button"
            className={`list-card${isSel ? " list-card--selected" : ""}${isNew ? " list-card--new" : ""}`}
            onClick={() => onSelectEquipment(eq.equipmentId)}
          >
            {isNew ? (
              <span className="equip-item-new" aria-label="未確認の装備">
                NEW
              </span>
            ) : null}
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>
              {isMasked ? "???" : eq.name}
              {isEq ? <span className="equip-badge">装備中</span> : null}
              {!isOwn ? <span className="equip-badge equip-badge--locked">未入手</span> : null}
            </p>
            <p className="muted-text" style={{ fontSize: 12, margin: 0 }}>
              {isMasked ? "詳細不明" : eq.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

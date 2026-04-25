import { useState, useEffect, useRef } from "react"
import type {
  ContentBundle,
  EquipmentMaster,
  EquipmentSlot,
  ProfileAggregate,
  ArchiveAccessState,
  AreaMaster,
  TransmissionMaster,
  SettingsRow,
  SaveSlotRow,
  SaveSlotId,
  FeatureAccessState,
  ShipVariant,
} from "@magnolia/contracts"
import { SETTINGS_VOLUME_STEPS, SHIP_VARIANTS } from "@magnolia/contracts"
import { hasVisibleArchiveContent } from "@magnolia/game-session"
import { formatTimestamp } from "@/app/display-helpers"
import { ActionButton } from "@/components/ActionButton"
import { KeyVisualModal } from "@/components/KeyVisualModal"
import { drawShip } from "@/app/ship-renderer"

const TAU = Math.PI * 2

type MenuTab = "equipment" | "archive" | "settings"

type MenuScreenProps = {
  content: ContentBundle
  profile: ProfileAggregate | null
  settings: SettingsRow
  saveSlots: SaveSlotRow[]
  featureAccess: FeatureAccessState
  archiveAccess?: ArchiveAccessState
  selectedTransmissionId?: string
  initialTab?: MenuTab
  unseenEquipmentIds: string[]
  onMarkEquipmentSeen: (equipmentIds: string[]) => void
  onEquip: (equipmentId: string, slot: string, subsystemIndex?: 0 | 1) => void
  onPurchase: (equipmentId: string) => void
  onUpgrade: (equipmentId: string) => void
  onSelectTransmission: (areaId: string, transmissionId: string) => void
  onSetVolume: (channel: keyof SettingsRow["volumes"], value: SettingsRow["volumes"][keyof SettingsRow["volumes"]]) => void
  onSetDifficulty: (difficulty: SettingsRow["difficulty"]) => void
  onToggleSwitch: (path: "reduceFlashing" | "lowFrameRateMode", value: boolean) => void
  onSetShipVariant: (variant: ShipVariant) => void
  onSaveCurrent: () => void
  onSaveToSlot: (slotId: SaveSlotId) => void
  onReturnToTitle: () => void
  onBack: () => void
}

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

/* ============================================================
   SHIP STATUS — diagnostic display drawn on Canvas
   ============================================================ */

/**
 * 装備画面 UNIT STATUS パネルのダイアグラム描画。
 * 機体本体は共通レンダラ (`apps/web/src/app/ship-renderer.ts`) に委譲し、
 * ここでは周囲の診断フレーム (グリッド・リング・十字・走査線) のみ描く。
 */
function drawStatusShip(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  variant: ShipVariant,
) {
  const cx = W / 2
  const cy = H / 2 - 2

  // ── background grid ──
  ctx.strokeStyle = "rgba(93, 164, 209, 0.05)"
  ctx.lineWidth = 0.5
  const g = 14
  for (let x = g; x < W; x += g) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = g; y < H; y += g) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // ── diagnostic rings ──
  ctx.strokeStyle = "rgba(93, 164, 209, 0.08)"
  for (const r of [26, 52]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke()
  }

  // ── crosshair ──
  ctx.strokeStyle = "rgba(93, 164, 209, 0.1)"
  ctx.beginPath(); ctx.moveTo(cx - 68, cy); ctx.lineTo(cx + 68, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - 68); ctx.lineTo(cx, cy + 68); ctx.stroke()

  // ── outer ring with tick marks ──
  const outerR = 66
  ctx.strokeStyle = "rgba(93, 164, 209, 0.12)"
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU
    const inner = i % 6 === 0 ? outerR - 7 : outerR - 3
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
    ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR)
    ctx.stroke()
  }
  ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, TAU); ctx.stroke()

  // ── sweep scan line ──
  const scanY = cy - 66 + ((t * 0.018) % 132)
  ctx.strokeStyle = "rgba(93, 164, 209, 0.1)"
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - 62, scanY); ctx.lineTo(cx + 62, scanY); ctx.stroke()

  // ── ship (共通レンダラへ委譲) ──
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.003)
  drawShip(ctx, {
    variant,
    center: { x: cx, y: cy },
    scale: 3.0,
    stroke: "#e8f4ff",
    fill: "rgba(180, 220, 255, 0.07)",
    lineWidth: 1.5,
    glow: { color: "rgba(93, 164, 209, 0.5)", blur: 14 },
    core: {
      color: `rgba(93, 164, 209, ${0.6 + 0.4 * pulse})`,
      glowColor: "rgba(93, 164, 209, 0.7)",
      glowBlur: 12 + 8 * pulse,
      radius: 3.5,
      pulse,
    },
    engineExhaust: {
      color: "rgba(93, 164, 209, 0.15)",
      blur: 10,
      jitter: 3,
    },
    timeMs: t,
    artDetailStrength: 1,
  })
}

/** Ship status panel: diagnostic display + equipped items + appearance picker */
function ShipStatusPanel({
  content,
  profile,
  selectedCategory,
  onSelectCategory,
  shipVariant,
  onSelectShipVariant,
}: {
  content: ContentBundle
  profile: ProfileAggregate
  selectedCategory: EquipmentSlot
  onSelectCategory: (slot: EquipmentSlot) => void
  shipVariant: ShipVariant
  onSelectShipVariant: (variant: ShipVariant) => void
}) {
  const shipCanvasRef = useRef<HTMLCanvasElement>(null)
  const equipped = profile.profile.equipped

  // 最新のバリアントを ref で保持し、rAF ループ内から参照する。
  // variant の切替時にループを作り直すとチラつきが出るため、参照を書き換える方式にしている。
  const variantRef = useRef(shipVariant)
  useEffect(() => {
    variantRef.current = shipVariant
  }, [shipVariant])

  useEffect(() => {
    const canvas = shipCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = 180
    const H = 180
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`

    let animId: number
    function draw(t: number) {
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      drawStatusShip(ctx, W, H, t, variantRef.current)
      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [])

  const SLOTS: { key: EquipmentSlot; label: string; id: string | null | undefined }[] = [
    { key: "main", label: "MAIN", id: equipped.main },
    { key: "sub", label: "SUB", id: equipped.sub },
    { key: "os", label: "OS", id: equipped.os },
    { key: "subsystem", label: "SYS-1", id: equipped.subsystems[0] },
    { key: "subsystem", label: "SYS-2", id: equipped.subsystems[1] },
  ]

  return (
    <div className="equip-ship-status">
      <p className="equip-ship-status__title">UNIT STATUS</p>
      <div className="equip-ship-status__canvas-wrap">
        <canvas ref={shipCanvasRef} />
      </div>
      <div className="equip-ship-status__slots">
        {SLOTS.map((s) => {
          const eqName = s.id ? (content.equipment[s.id]?.name ?? "---") : "---"
          const isActive = s.key === selectedCategory
          return (
            <button
              key={s.label}
              type="button"
              className={`equip-ship-slot${isActive ? " equip-ship-slot--active" : ""}${s.id ? "" : " equip-ship-slot--empty"}`}
              onClick={() => onSelectCategory(s.key)}
            >
              <span className="equip-ship-slot__label">{s.label}</span>
              <span className="equip-ship-slot__name">{eqName}</span>
            </button>
          )
        })}
      </div>

      {/* 自機見た目バリアント選択。戦闘挙動には影響しない純ビジュアル設定。 */}
      <div className="equip-ship-appearance" role="radiogroup" aria-label="self unit appearance">
        <p className="equip-ship-appearance__label">APPEARANCE</p>
        <div className="equip-ship-appearance__options">
          {SHIP_VARIANTS.map((v) => {
            const isActive = v === shipVariant
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`equip-ship-appearance__option${isActive ? " equip-ship-appearance__option--active" : ""}`}
                onClick={() => onSelectShipVariant(v)}
              >
                {v}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MenuScreen({
  content,
  profile,
  settings,
  saveSlots,
  featureAccess,
  archiveAccess,
  selectedTransmissionId,
  initialTab,
  unseenEquipmentIds,
  onMarkEquipmentSeen,
  onEquip,
  onPurchase,
  onUpgrade,
  onSelectTransmission,
  onSetVolume,
  onSetDifficulty,
  onToggleSwitch,
  onSetShipVariant,
  onSaveCurrent,
  onSaveToSlot,
  onReturnToTitle,
  onBack,
}: MenuScreenProps) {
  // この画面は UI 合成だけを担当し、装備判定や保存判定は props で受け取った結果をそのまま使います。
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hasEquipment = Boolean(profile) && featureAccess.canOpenEquipment
  const hasArchive = Boolean(profile) && featureAccess.canOpenArchive

  const tabs: MenuTab[] = []
  if (hasEquipment) tabs.push("equipment")
  if (hasArchive) tabs.push("archive")
  tabs.push("settings")

  const defaultTab = initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]
  const [activeTab, setActiveTab] = useState<MenuTab>(defaultTab)
  const [selectedCategory, setSelectedCategory] = useState<EquipmentSlot>("main")
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  // key visual
  const [keyVisualVariant, setKeyVisualVariant] = useState<"fullscreen" | "windowed" | null>(null)

  useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (keyVisualVariant) {
        return
      }
      if (event.repeat) {
        return
      }
      if (event.code === "Escape" || (activeTab === "equipment" && event.code === "KeyE")) {
        event.preventDefault()
        onBack()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [keyVisualVariant, activeTab, onBack])

  // background particle canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let animId: number
    const dpr = window.devicePixelRatio || 1

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    resize()

    type P = { x: number; y: number; vx: number; vy: number; a: number; r: number; phase: number }
    const pts: P[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.05 - Math.random() * 0.15,
      a: 0.05 + Math.random() * 0.15,
      r: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2
    }))

    function step(t: number) {
      if (!ctx || !canvas) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      
      // subtle gradient overlay
      const grad = ctx.createLinearGradient(0, window.innerHeight, 0, 0)
      grad.addColorStop(0, "rgba(93, 164, 209, 0.04)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      for (const p of pts) {
        p.x += p.vx
        p.y += p.vy
        if (p.y < -10) { p.y = window.innerHeight + 10; p.x = Math.random() * window.innerWidth }
        if (p.x < -10) p.x = window.innerWidth + 10
        if (p.x > window.innerWidth + 10) p.x = -10
        
        const flicker = 0.6 + 0.4 * Math.sin(t * 0.001 + p.phase)
        ctx.fillStyle = `rgba(140, 200, 255, ${p.a * flicker})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      animId = requestAnimationFrame(step)
    }
    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <main className="menu-screen">
      <canvas ref={canvasRef} className="menu-screen__bg" />

      {/* tab bar */}
      <nav className="menu-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`menu-tab ${activeTab === tab ? "menu-tab--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="menu-tab menu-tab--back" onClick={onBack}>
          esc: close
        </button>
      </nav>

      {/* tab content */}
      <div className="menu-content">
        {activeTab === "equipment" && profile ? (
          <EquipmentPanel
            content={content}
            profile={profile}
            selectedCategory={selectedCategory}
            selectedEquipmentId={selectedEquipmentId}
            onSelectCategory={setSelectedCategory}
            onSelectEquipment={setSelectedEquipmentId}
            onEquip={onEquip}
            onPurchase={onPurchase}
            onUpgrade={onUpgrade}
            shipVariant={settings.shipVariant}
            onSelectShipVariant={onSetShipVariant}
            unseenEquipmentIds={unseenEquipmentIds}
            onMarkEquipmentSeen={onMarkEquipmentSeen}
          />
        ) : activeTab === "archive" && profile && archiveAccess ? (
          <ArchivePanel
            areas={content.areas}
            transmissions={content.transmissions}
            profile={profile}
            archiveAccess={archiveAccess}
            selectedTransmissionId={selectedTransmissionId}
            onSelectTransmission={onSelectTransmission}
          />
        ) : (
          <SettingsPanel
            settings={settings}
            saveSlots={saveSlots}
            canSave={Boolean(profile)}
            onOpenKeyVisual={(variant) => setKeyVisualVariant(variant)}
            onSetVolume={onSetVolume}
            onSetDifficulty={onSetDifficulty}
            onToggleSwitch={onToggleSwitch}
            onSaveCurrent={onSaveCurrent}
            onSaveToSlot={onSaveToSlot}
            onReturnToTitle={onReturnToTitle}
          />
        )}
      </div>
      {keyVisualVariant && <KeyVisualModal variant={keyVisualVariant} onClose={() => setKeyVisualVariant(null)} />}
    </main>
  )
}

/* ============================================================
   PROCUREMENT PANEL
   購入・アップグレードの両方を扱う統一 UI。
   - コスト / 現残高 / 不足額を明示
   - 充足・不足で視覚的にモードが切り替わる (色・アイコン・CTA 文言)
   - 充足時は CTA を前面 / アクセントカラー / glow で明示的に
   - 不足時は進捗バー + 不足量を赤で強調し、CTA は disabled
   ============================================================ */
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
function EquipmentPanel({
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

/* ============================================================
   ARCHIVE PANEL
   ============================================================ */
function ArchivePanel({
  areas,
  transmissions,
  profile,
  archiveAccess,
  selectedTransmissionId,
  onSelectTransmission,
}: {
  areas: Record<string, AreaMaster>
  transmissions: Record<string, TransmissionMaster>
  profile: ProfileAggregate
  archiveAccess: ArchiveAccessState
  selectedTransmissionId?: string
  onSelectTransmission: (areaId: string, transmissionId: string) => void
}) {
  const selected = selectedTransmissionId ? transmissions[selectedTransmissionId] : undefined
  const unlockedEntries = profile.transmissionProgress
    .filter((progress) => hasVisibleArchiveContent(progress))
    .map((progress) => ({
      progress,
      transmission: transmissions[progress.transmissionId],
      area: areas[progress.areaId],
    }))
    .filter((entry) => Boolean(entry.transmission))

  return (
    <div className="two-column-layout archive-layout">
      <div className="list-stack">
        {unlockedEntries.length === 0 ? (
          <p className="muted-text">復元済みの通信はまだありません。</p>
        ) : (
          unlockedEntries.map(({ progress, transmission, area }) => {
            const isSel = transmission.transmissionId === selectedTransmissionId
            return (
              <button
                key={transmission.transmissionId}
                type="button"
                className={`list-card ${isSel ? "list-card--selected" : ""}`}
                onClick={() => onSelectTransmission(transmission.areaId, transmission.transmissionId)}
              >
                <p style={{ fontWeight: 500, fontSize: 14 }}>
                  {progress.metadataUnlocked.title ? transmission.title : "???"}
                </p>
                <p className="muted-text" style={{ fontSize: 12 }}>
                  {area?.name ?? transmission.areaId}
                </p>
              </button>
            )
          })
        )}
      </div>
      <div>
        {selected ? (
          <>
            <h3 className="detail-title">
              {archiveAccess.metadataUnlocked.title ? selected.title : "???"}
            </h3>
            <div className="archive-log__meta">
              <p>sender: {archiveAccess.metadataUnlocked.sender ? selected.sender : "???"}</p>
              <p>recipient: {archiveAccess.metadataUnlocked.recipient ? selected.recipient : "???"}</p>
              <p>sent at: {archiveAccess.metadataUnlocked.sentAt ? selected.sentAt : "???"}</p>
            </div>
            <div className="scroll-block archive-log__body">
              {archiveAccess.transcriptView.length > 0 ? (
                archiveAccess.transcriptView.map((chunk) => (
                  <div key={chunk.chunkId} className="archive-log__line">
                    {chunk.speakerLabel ? <p className="archive-log__speaker">{chunk.speakerLabel}</p> : null}
                    <p className="archive-log__text">{chunk.text}</p>
                  </div>
                ))
              ) : (
                <p className="muted-text">この通信の本文はまだ復元されていません。</p>
              )}
            </div>
          </>
        ) : (
          <p className="muted-text">通信を選択してください。</p>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   SETTINGS PANEL
   ============================================================ */
type VolumeChannel = keyof SettingsRow["volumes"]

type SettingsPanelProps = {
  settings: SettingsRow
  saveSlots: SaveSlotRow[]
  canSave: boolean
  onOpenKeyVisual: (variant: "fullscreen" | "windowed") => void
  onSetVolume: (channel: keyof SettingsRow["volumes"], value: SettingsRow["volumes"][keyof SettingsRow["volumes"]]) => void
  onSetDifficulty: (difficulty: SettingsRow["difficulty"]) => void
  onToggleSwitch: (path: "reduceFlashing" | "lowFrameRateMode", value: boolean) => void
  onSaveCurrent: () => void
  onSaveToSlot: (slotId: SaveSlotId) => void
  onReturnToTitle: () => void
}

function SettingsPanel({
  settings,
  saveSlots,
  canSave,
  onOpenKeyVisual,
  onSetVolume,
  onSetDifficulty,
  onToggleSwitch,
  onSaveCurrent,
  onSaveToSlot,
  onReturnToTitle,
}: SettingsPanelProps) {
  const activeVolumePointerIdRef = useRef<number | null>(null)

  function clampVolumeStep(step: number): SettingsRow["volumes"][VolumeChannel] {
    return Math.min(SETTINGS_VOLUME_STEPS, Math.max(1, step)) as SettingsRow["volumes"][VolumeChannel]
  }

  function readVolumeStepFromPointer(
    container: HTMLDivElement,
    clientX: number,
  ): SettingsRow["volumes"][VolumeChannel] {
    const rect = container.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const ratio = rect.width <= 0 ? 0 : relativeX / rect.width
    const step = Math.floor(ratio * SETTINGS_VOLUME_STEPS) + 1
    return clampVolumeStep(step)
  }

  function renderVolumeBar(label: string, current: number, channel: VolumeChannel) {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">{label}</p>
          <p className="settings-row__desc">
            {channel === "master" && "全体の音量を調整します。"}
            {channel === "bgm" && "BGM の音量を調整します。"}
            {channel === "se" && "環境音や効果音の音量を調整します。"}
            {channel === "voice" && "通信音声や読み上げの音量を調整します。"}
          </p>
        </div>
        <div
          className="volume-segments"
          onPointerDown={(event) => {
            const container = event.currentTarget
            // 分割表示は残したまま、外側コンテナで pointer を捕まえて
            // 左右スライドでも値を更新できるようにします。
            activeVolumePointerIdRef.current = event.pointerId
            container.setPointerCapture(event.pointerId)
            onSetVolume(channel, readVolumeStepFromPointer(container, event.clientX))
          }}
          onPointerMove={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            onSetVolume(
              channel,
              readVolumeStepFromPointer(event.currentTarget, event.clientX),
            )
          }}
          onPointerUp={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            activeVolumePointerIdRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (activeVolumePointerIdRef.current !== event.pointerId) {
              return
            }
            activeVolumePointerIdRef.current = null
          }}
        >
          {Array.from({ length: SETTINGS_VOLUME_STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`volume-segment ${i < current ? "volume-segment--active" : ""}`}
              onClick={() => onSetVolume(channel, (i + 1) as SettingsRow["volumes"][keyof SettingsRow["volumes"]])}
              aria-label={`set ${label} to ${i + 1}`}
            />
          ))}
        </div>
      </div>
    )
  }

  function renderDifficulty() {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">DIFFICULTY</p>
          <p className="settings-row__desc">新規開始と現在のゲーム進行に使う難易度です。</p>
        </div>
        <div className="toggle-pill-group" role="group" aria-label="difficulty">
          {(["calm", "terminal"] as const).map((difficulty) => {
            const active = settings.difficulty === difficulty
            const label = difficulty === "calm" ? "CALM" : "TERMINAL"
            return (
              <button
                key={difficulty}
                type="button"
                className={`toggle-pill ${active ? "toggle-pill--active" : ""}`}
                onClick={() => onSetDifficulty(difficulty)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderToggle(label: string, desc: string, value: boolean, path: "reduceFlashing" | "lowFrameRateMode") {
    return (
      <div className="settings-row">
        <div className="settings-row__info">
          <p className="settings-row__label">{label}</p>
          <p className="settings-row__desc">{desc}</p>
        </div>
        <button
          type="button"
          className={`toggle-switch ${value ? "toggle-switch--on" : ""}`}
          onClick={() => onToggleSwitch(path, !value)}
          aria-label={`toggle ${label}`}
        >
          <div className="toggle-switch__knob" />
        </button>
      </div>
    )
  }

  return (
    <div className="settings-dashboard">
      <div className="settings-dashboard-col">
        <section className="settings-section">
          <h3 className="settings-section__title">audio setup</h3>
          <div className="settings-section__content">
            {renderVolumeBar("MASTER VOLUME", settings.volumes.master, "master")}
            {renderVolumeBar("BACKGROUND", settings.volumes.bgm, "bgm")}
            {renderVolumeBar("SOUND EFFECTS", settings.volumes.se, "se")}
            {renderVolumeBar("VOICE", settings.volumes.voice, "voice")}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section__title">display options</h3>
          <div className="settings-section__content">
            {renderDifficulty()}
            {renderToggle("REDUCE FLASHING", "強い光の点滅表現や画面揺れを軽減します。", settings.reduceFlashing, "reduceFlashing")}
            {renderToggle("LOW FRAME RATE", "描画負荷を下げ、バッテリー消費を抑えます。", settings.lowFrameRateMode, "lowFrameRateMode")}
          </div>
        </section>
      </div>

      <div className="settings-dashboard-col">
        <section className="settings-section">
          <h3 className="settings-section__title">key visual</h3>
          <div className="settings-section__content settings-section__content--compact">
            <div className="kv-launcher-group">
              <button
                type="button"
                className="kv-launcher"
                onClick={() => onOpenKeyVisual("fullscreen")}
              >
                <div className="kv-launcher__content">
                  <span className="kv-launcher__icon">◇</span>
                  <span className="kv-launcher__text">FULLSCREEN</span>
                  <span className="kv-launcher__sub">immersive</span>
                </div>
              </button>
              <button
                type="button"
                className="kv-launcher"
                onClick={() => onOpenKeyVisual("windowed")}
              >
                <div className="kv-launcher__content">
                  <span className="kv-launcher__icon">◇</span>
                  <span className="kv-launcher__text">500 × 500</span>
                  <span className="kv-launcher__sub">windowed</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section settings-section--danger">
          <h3 className="settings-section__title">system operation</h3>
          <div className="settings-section__content settings-section__content--compact">
            <div className="settings-row">
              <div className="settings-row__info">
                <p className="settings-row__label">QUICK SAVE</p>
              </div>
              {canSave ? (
                <ActionButton tone="primary" onClick={onSaveCurrent}>
                  quick save
                </ActionButton>
              ) : (
                <p className="muted-text" style={{ fontSize: 13, alignSelf: "center", margin: 0 }}>
                  ゲーム開始後に保存できます。
                </p>
              )}
            </div>
            
            <div className="settings-save-slots settings-save-slots--compact">
              <p className="muted-text" style={{ margin: "0 0 8px", fontSize: 12 }}>
                別スロットへの保存は、現在の進行を複製して書き込みます。
              </p>
              <div className="save-slots-grid">
                {saveSlots.map((slot) => (
                  <div key={slot.slotId} className="save-slot-card">
                    <div className="save-slot-card__info">
                      <p className="save-slot-card__id">SLOT {String(slot.slotId).padStart(2, "0")}</p>
                      <p className="save-slot-card__meta">
                        {formatTimestamp(slot.updatedAt) ?? "NO DATA"}
                      </p>
                    </div>
                    <ActionButton
                      tone={slot.updatedAt ? "danger" : "ghost"}
                      disabled={!canSave}
                      onClick={() => onSaveToSlot(slot.slotId)}
                    >
                      {slot.updatedAt ? "overwrite" : "save"}
                    </ActionButton>
                  </div>
                ))}
              </div>
            </div>

            <div className="button-row">
              <ActionButton tone="ghost" onClick={onReturnToTitle}>
                back title
              </ActionButton>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

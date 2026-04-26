import { useEffect, useRef } from "react"
import type {
  ContentBundle,
  EquipmentSlot,
  ProfileAggregate,
  ShipVariant,
} from "@magnolia/contracts"
import { SHIP_VARIANTS } from "@magnolia/contracts"
import { drawShip } from "@/app/ship-renderer"

const TAU = Math.PI * 2

type ShipStatusPanelProps = {
  content: ContentBundle
  profile: ProfileAggregate
  selectedCategory: EquipmentSlot
  onSelectCategory: (slot: EquipmentSlot) => void
  shipVariant: ShipVariant
  onSelectShipVariant: (variant: ShipVariant) => void
}

/**
 * 装備画面 UNIT STATUS パネルのダイアグラム描画。
 * 機体本体は共通レンダラへ委譲し、ここでは診断フレームだけを描きます。
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

  ctx.strokeStyle = "rgba(93, 164, 209, 0.05)"
  ctx.lineWidth = 0.5
  const g = 14
  for (let x = g; x < W; x += g) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = g; y < H; y += g) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  ctx.strokeStyle = "rgba(93, 164, 209, 0.08)"
  for (const r of [26, 52]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke()
  }

  ctx.strokeStyle = "rgba(93, 164, 209, 0.1)"
  ctx.beginPath(); ctx.moveTo(cx - 68, cy); ctx.lineTo(cx + 68, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - 68); ctx.lineTo(cx, cy + 68); ctx.stroke()

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

  const scanY = cy - 66 + ((t * 0.018) % 132)
  ctx.strokeStyle = "rgba(93, 164, 209, 0.1)"
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - 62, scanY); ctx.lineTo(cx + 62, scanY); ctx.stroke()

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

export function ShipStatusPanel({
  content,
  profile,
  selectedCategory,
  onSelectCategory,
  shipVariant,
  onSelectShipVariant,
}: ShipStatusPanelProps) {
  const shipCanvasRef = useRef<HTMLCanvasElement>(null)
  const equipped = profile.profile.equipped

  // 最新のバリアントを ref で保持し、rAF ループを作り直さず描画だけ更新します。
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

  const slots: { key: EquipmentSlot; label: string; id: string | null | undefined }[] = [
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
        {slots.map((slot) => {
          const eqName = slot.id ? (content.equipment[slot.id]?.name ?? "---") : "---"
          const isActive = slot.key === selectedCategory
          return (
            <button
              key={slot.label}
              type="button"
              className={`equip-ship-slot${isActive ? " equip-ship-slot--active" : ""}${slot.id ? "" : " equip-ship-slot--empty"}`}
              onClick={() => onSelectCategory(slot.key)}
            >
              <span className="equip-ship-slot__label">{slot.label}</span>
              <span className="equip-ship-slot__name">{eqName}</span>
            </button>
          )
        })}
      </div>

      <div className="equip-ship-appearance" role="radiogroup" aria-label="self unit appearance">
        <p className="equip-ship-appearance__label">APPEARANCE</p>
        <div className="equip-ship-appearance__options">
          {SHIP_VARIANTS.map((variant) => {
            const isActive = variant === shipVariant
            return (
              <button
                key={variant}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`equip-ship-appearance__option${isActive ? " equip-ship-appearance__option--active" : ""}`}
                onClick={() => onSelectShipVariant(variant)}
              >
                {variant}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from "react"
import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH, drawBattleFrame } from "@/components/battle-renderer"

type BattleCanvasProps = {
  renderState: BattleRenderState
  /** true にすると背景を描画せず、下レイヤー (SignalBackdropCanvas 等) を透過する */
  transparentBg?: boolean
  /** 自機見た目バリアント。詳細は ship-renderer を参照。 */
  shipVariant: ShipVariant
}

export function BattleCanvas({ renderState, transparentBg, shipVariant }: BattleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = BATTLE_CANVAS_WIDTH * dpr
    canvas.height = BATTLE_CANVAS_HEIGHT * dpr
    // 表示サイズは CSS 側で親レイアウトに追従させ、ここでは描画座標系だけを固定します。
    canvas.style.width = ""
    canvas.style.height = ""
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    drawBattleFrame(context, {
      renderState,
      transparentBg,
      shipVariant,
    })
  }, [renderState, shipVariant])

  return <canvas ref={canvasRef} className="play-canvas play-canvas--battle" />
}

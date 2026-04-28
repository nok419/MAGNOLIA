import { useEffect, useRef } from "react"
import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH, drawBattleFrame } from "@/render/battle/draw-battle-frame"

type BattleCanvasProps = {
  renderState: BattleRenderState
  battleEvents?: TimedPresentationRequest<BattlePresentationRequest>[]
  /** true にすると背景を描画せず、下レイヤー (SignalBackdropCanvas 等) を透過する */
  transparentBg?: boolean
  /** 自機見た目バリアント。詳細は ship-renderer を参照。 */
  shipVariant: ShipVariant
  displayOptions: DisplayOptions
}

export function BattleCanvas({ renderState, battleEvents = [], transparentBg, shipVariant, displayOptions }: BattleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const dpr = displayOptions.canvasPixelRatio
    canvas.width = BATTLE_CANVAS_WIDTH * dpr
    canvas.height = BATTLE_CANVAS_HEIGHT * dpr
    // 表示サイズは CSS 側で親レイアウトに追従させ、ここでは描画座標系だけを固定します。
    canvas.style.width = ""
    canvas.style.height = ""
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    drawBattleFrame(context, {
      renderState,
      battleEvents,
      transparentBg,
      shipVariant,
      reduceFlashing: displayOptions.reduceFlashing,
    })
  }, [battleEvents, displayOptions, renderState, shipVariant])

  return <canvas ref={canvasRef} className="play-canvas play-canvas--battle" />
}

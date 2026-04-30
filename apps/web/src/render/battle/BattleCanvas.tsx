import { useEffect, useRef } from "react"
import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH, drawBattleFrame } from "@/render/battle/draw-battle-frame"
import { prepareDevicePixelCanvas } from "@/render/canvas-host/device-pixel-canvas"

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
    const context = prepareDevicePixelCanvas({
      canvas,
      width: BATTLE_CANVAS_WIDTH,
      height: BATTLE_CANVAS_HEIGHT,
      pixelRatio: displayOptions.canvasPixelRatio,
    })
    if (!context) return

    // 表示サイズは CSS 側で親レイアウトに追従させるため、固定値は内部描画座標だけに使います。
    canvas.style.width = ""
    canvas.style.height = ""

    drawBattleFrame(context, {
      renderState,
      battleEvents,
      transparentBg,
      shipVariant,
      reduceFlashing: displayOptions.reduceFlashing,
      lowFrameRateMode: displayOptions.lowFrameRateMode,
    })
  }, [battleEvents, displayOptions, renderState, shipVariant])

  return <canvas ref={canvasRef} className="play-canvas play-canvas--battle" />
}

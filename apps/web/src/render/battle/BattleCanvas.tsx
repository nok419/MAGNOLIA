import { useEffect, useRef } from "react"
import type { ShipVariant } from "@magnolia/contracts"
import type { BattleRenderState } from "@magnolia/game-session"
import { shouldDrawVisualFrame, type DisplayOptions } from "@/app/display-options"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"
import { BATTLE_CANVAS_HEIGHT, BATTLE_CANVAS_WIDTH, drawBattleFrame } from "@/render/battle/draw-battle-frame"
import { prepareDevicePixelCanvas } from "@/render/canvas-host/device-pixel-canvas"
import {
  isBattlePerformanceProfilerEnabled,
  readPerformanceNow,
  recordBattleDrawSample,
} from "@/app/battle-performance-profiler"

const BATTLE_CANVAS_PIXEL_RATIO_MAX = 1

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
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const lastDrawAtRef = useRef(0)
  const battlePixelRatio = readBattleCanvasPixelRatio(displayOptions)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    contextRef.current = prepareDevicePixelCanvas({
      canvas,
      width: BATTLE_CANVAS_WIDTH,
      height: BATTLE_CANVAS_HEIGHT,
      pixelRatio: battlePixelRatio,
      applyCssSize: false,
    })
  }, [battlePixelRatio])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const now = performance.now()
    if (
      lastDrawAtRef.current > 0 &&
      !shouldDrawVisualFrame({
        now,
        lastDrawAt: lastDrawAtRef.current,
        options: displayOptions,
      })
    ) {
      return
    }
    const context = contextRef.current ?? prepareDevicePixelCanvas({
      canvas,
      width: BATTLE_CANVAS_WIDTH,
      height: BATTLE_CANVAS_HEIGHT,
      pixelRatio: battlePixelRatio,
      applyCssSize: false,
    })
    if (!context) return
    contextRef.current = context
    lastDrawAtRef.current = now

    // 表示サイズは CSS 側で親レイアウトに追従させ、描画用の内部解像度だけをここで揃えます。
    const shouldProfileBattle = isBattlePerformanceProfilerEnabled()
    const drawStartedAt = shouldProfileBattle ? readPerformanceNow() : 0
    drawBattleFrame(context, {
      renderState,
      battleEvents,
      transparentBg,
      shipVariant,
      reduceFlashing: displayOptions.reduceFlashing,
      lowFrameRateMode: displayOptions.lowFrameRateMode,
    })
    if (shouldProfileBattle) {
      recordBattleDrawSample({ drawMs: readPerformanceNow() - drawStartedAt })
    }
  }, [battleEvents, battlePixelRatio, displayOptions, renderState, shipVariant, transparentBg])

  return <canvas ref={canvasRef} className="play-canvas play-canvas--battle" />
}

function readBattleCanvasPixelRatio(displayOptions: DisplayOptions): number {
  // 戦闘中は描画対象が多いため、内部解像度を 1x に固定して処理ピクセル数を抑えます。
  // 見た目の要素数や当たり判定は変えず、Canvas の backing store だけを制限します。
  return Math.min(displayOptions.canvasPixelRatio, BATTLE_CANVAS_PIXEL_RATIO_MAX)
}

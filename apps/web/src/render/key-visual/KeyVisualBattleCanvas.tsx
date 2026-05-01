import type { BattleRenderState } from "@magnolia/game-session"
import type { DisplayOptions } from "@/app/display-options"
import { BattleCanvas } from "@/render/battle/BattleCanvas"

type KeyVisualBattleCanvasProps = {
  renderState: BattleRenderState
  displayOptions: DisplayOptions
}

export function KeyVisualBattleCanvas({ renderState, displayOptions }: KeyVisualBattleCanvasProps) {
  // key visual は battle renderer を再利用するだけに留め、poster 固有の構図は key-visual 側へ閉じます。
  return (
    <BattleCanvas
      renderState={renderState}
      transparentBg
      shipVariant="art"
      displayOptions={displayOptions}
    />
  )
}

import type { BattleRenderState } from "@magnolia/game-session"
import type {
  BattlePresentationRequest,
  TimedPresentationRequest,
} from "@/app/presentation/presentation-state"

type PresentationLayerInput = {
  renderState: BattleRenderState
  battleEvents: TimedPresentationRequest<BattlePresentationRequest>[]
  reduceFlashing: boolean
}

const TAU = Math.PI * 2

export function drawBattlePresentationLayer(
  ctx: CanvasRenderingContext2D,
  input: PresentationLayerInput,
): void {
  for (const event of input.battleEvents) {
    const durationMs = Math.max(1, event.expiresAtMs - event.startedAtMs)
    const progress = Math.max(0, Math.min(1, (input.renderState.elapsedMs - event.startedAtMs) / durationMs))
    if (progress < 0 || progress > 1) {
      continue
    }

    switch (event.cueId) {
      case "battle.player.hit":
        drawPlayerHit(ctx, {
          x: event.worldPosition?.x ?? input.renderState.player.position.x,
          y: event.worldPosition?.y ?? input.renderState.player.position.y,
          player: input.renderState.player.position,
          progress,
          reduceFlashing: input.reduceFlashing,
        })
        break
      case "battle.noise.peak":
        drawNoisePeak(ctx, { progress, reduceFlashing: input.reduceFlashing })
        break
      case "battle.noise.clear":
        drawNoiseClear(ctx, {
          x: input.renderState.player.position.x,
          y: input.renderState.player.position.y,
          progress,
        })
        break
      case "battle.fragment.recovered":
        drawFragmentRecovered(ctx, { progress })
        break
      case "battle.noiseSource.clear":
        drawNoiseSourceClear(ctx, {
          x: event.worldPosition.x,
          y: event.worldPosition.y,
          progress,
          noiseBandKind: event.noiseBandKind,
        })
        break
      case "battle.invincible.start":
        break
    }
  }
}

function drawPlayerHit(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    player: { x: number; y: number }
    progress: number
    reduceFlashing: boolean
  },
) {
  const fade = 1 - input.progress
  const tear = 10 + input.progress * 34
  const angle = Math.atan2(input.player.y - input.y, input.player.x - input.x)
  const alpha = input.reduceFlashing ? 0.22 * fade : 0.34 * fade

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = `rgba(255, 214, 164, ${alpha})`
  ctx.lineWidth = 1.2
  ctx.shadowColor = "rgba(255, 178, 116, 0.42)"
  ctx.shadowBlur = input.reduceFlashing ? 4 : 9
  for (let index = -2; index <= 2; index += 1) {
    const offset = index * 5
    ctx.beginPath()
    ctx.moveTo(
      input.x + Math.cos(angle + Math.PI / 2) * offset,
      input.y + Math.sin(angle + Math.PI / 2) * offset,
    )
    ctx.lineTo(
      input.x + Math.cos(angle) * tear + Math.cos(angle + Math.PI / 2) * (offset + index * 3),
      input.y + Math.sin(angle) * tear + Math.sin(angle + Math.PI / 2) * (offset + index * 3),
    )
    ctx.stroke()
  }
  ctx.restore()
}

function drawNoisePeak(
  ctx: CanvasRenderingContext2D,
  input: { progress: number; reduceFlashing: boolean },
) {
  const fade = 1 - input.progress
  const scanAlpha = input.reduceFlashing ? 0.07 * fade : 0.12 * fade

  ctx.save()
  ctx.fillStyle = `rgba(24, 7, 14, ${0.2 * fade})`
  ctx.fillRect(0, 0, 480, 520)
  ctx.strokeStyle = `rgba(255, 156, 176, ${scanAlpha})`
  ctx.lineWidth = 1
  for (let y = 18; y < 520; y += input.reduceFlashing ? 28 : 18) {
    ctx.beginPath()
    ctx.moveTo(0, y + input.progress * 16)
    ctx.lineTo(480, y + input.progress * 6)
    ctx.stroke()
  }
  ctx.restore()
}

function drawNoiseClear(
  ctx: CanvasRenderingContext2D,
  input: { x: number; y: number; progress: number },
) {
  const fade = 1 - input.progress
  const radius = 28 + input.progress * 180
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = `rgba(174, 236, 255, ${0.24 * fade})`
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(input.x, input.y, radius, -Math.PI * 0.18, Math.PI * 1.2)
  ctx.stroke()
  ctx.strokeStyle = `rgba(210, 248, 255, ${0.16 * fade})`
  ctx.beginPath()
  ctx.moveTo(72, 82)
  ctx.quadraticCurveTo(180, 68 - input.progress * 12, 300, 82)
  ctx.quadraticCurveTo(380, 92 + input.progress * 8, 448, 80)
  ctx.stroke()
  ctx.restore()
}

function drawFragmentRecovered(ctx: CanvasRenderingContext2D, input: { progress: number }) {
  const fade = 1 - input.progress
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.strokeStyle = `rgba(255, 236, 190, ${0.24 * fade})`
  ctx.lineWidth = 1.2
  for (let index = 0; index < 4; index += 1) {
    const y = 78 + index * 8
    ctx.beginPath()
    ctx.moveTo(64, y)
    ctx.lineTo(64 + input.progress * 340, y + Math.sin(input.progress * TAU + index) * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawNoiseSourceClear(
  ctx: CanvasRenderingContext2D,
  input: {
    x: number
    y: number
    progress: number
    noiseBandKind?: "subtitle" | "speaker" | "metadata" | "fragment" | "waveform"
  },
) {
  const fade = 1 - input.progress
  const target = readNoiseBandTarget(input.noiseBandKind)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  const grad = ctx.createLinearGradient(input.x, input.y, target.x, target.y)
  grad.addColorStop(0, `rgba(255, 214, 164, ${0.3 * fade})`)
  grad.addColorStop(1, `rgba(174, 236, 255, ${0.2 * fade})`)
  ctx.strokeStyle = grad
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(input.x, input.y)
  ctx.quadraticCurveTo((input.x + target.x) / 2, input.y - 42, target.x, target.y)
  ctx.stroke()
  ctx.fillStyle = `rgba(174, 236, 255, ${0.16 * fade})`
  ctx.beginPath()
  ctx.arc(target.x, target.y, 7 + input.progress * 18, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function readNoiseBandTarget(
  kind: "subtitle" | "speaker" | "metadata" | "fragment" | "waveform" | undefined,
) {
  switch (kind) {
    case "speaker":
      return { x: 92, y: 92 }
    case "metadata":
      return { x: 390, y: 96 }
    case "fragment":
      return { x: 240, y: 250 }
    case "waveform":
      return { x: 330, y: 86 }
    case "subtitle":
    default:
      return { x: 240, y: 84 }
  }
}

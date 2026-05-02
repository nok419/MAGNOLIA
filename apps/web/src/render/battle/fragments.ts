import type { BattleRenderState } from "@magnolia/game-session"
import { clamp01, easeOutCubic, hashRenderString } from "@/render/battle/battle-renderer-utils"
import { rgba } from "@/render/shared/canvas-palette"
import { readCachedCanvasPath } from "@/render/shared/canvas-path-cache"

export type BattleFragmentMotion = {
  originX?: number
  originY?: number
  createdAtMs?: number
}

export function drawBattleFragment(
  ctx: CanvasRenderingContext2D,
  fragment: BattleRenderState["fragments"][number],
  t: number,
  options: { reduceFlashing: boolean; lowFrameRateMode: boolean },
) {
  const x = fragment.x
  const y = fragment.y
  const birthProgress = fragment.createdAtMs === undefined
    ? 1
    : clamp01((t - fragment.createdAtMs) / 420)
  const originX = fragment.originX ?? x
  const originY = fragment.originY ?? y
  const drawX = originX + (x - originX) * easeOutCubic(birthProgress)
  const drawY = originY + (y - originY) * easeOutCubic(birthProgress)
  const lifeMs = Math.max(0, fragment.expiresAtMs - t)
  const fade = Math.min(1, lifeMs / 700)
  const pulse = options.reduceFlashing ? 0.86 : 0.78 + Math.sin(t * 0.011 + fragment.x * 0.03) * 0.18
  const size = 8 + fragment.strength * 4
  const outerPath = readFragmentDiamondPath(size * 2.2, "fragment-outer", options)
  const innerPath = readFragmentInnerPath(size, options)

  ctx.save()
  ctx.globalAlpha = 0.34 * fade * (1 - birthProgress)
  ctx.strokeStyle = rgba("playerSignal", 0.68)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(originX, originY)
  ctx.quadraticCurveTo((originX + x) / 2, originY - 22, drawX, drawY)
  ctx.stroke()

  ctx.translate(drawX, drawY)
  ctx.rotate((hashRenderString(fragment.fragmentId) % 360) * (Math.PI / 180))
  ctx.shadowColor = rgba("playerSignal", 0.74)
  ctx.shadowBlur = 16 * pulse

  ctx.globalAlpha = 0.16 * fade
  ctx.fillStyle = rgba("playerSignal", 0.75)
  ctx.fill(outerPath)

  ctx.globalAlpha = 0.88 * fade
  ctx.strokeStyle = rgba("signalReadable", 0.92)
  ctx.lineWidth = 1.15
  ctx.stroke(innerPath)

  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.55 * fade
  ctx.strokeStyle = rgba("signalReadable", 0.62)
  ctx.lineWidth = 0.65
  ctx.beginPath()
  ctx.moveTo(-size * 0.42, -size * 0.24)
  ctx.lineTo(size * 0.44, size * 0.2)
  ctx.moveTo(-size * 0.2, size * 0.46)
  ctx.lineTo(size * 0.24, -size * 0.54)
  ctx.stroke()

  ctx.rotate(-((hashRenderString(fragment.fragmentId) % 360) * (Math.PI / 180)))
  ctx.globalAlpha = 0.72 * fade
  ctx.fillStyle = rgba("signalReadable", 0.82)
  ctx.font = "10px monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("▧", 0, 0)

  ctx.globalAlpha = 0.22 * fade
  ctx.strokeStyle = rgba("playerSignal", 0.72)
  ctx.lineWidth = 0.75
  for (let offset = -8; offset <= 8; offset += 4) {
    ctx.beginPath()
    ctx.moveTo(-size * 1.5, offset)
    ctx.lineTo(size * 1.5, offset + Math.sin(t * 0.003 + offset) * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function readFragmentDiamondPath(
  size: number,
  shape: string,
  options: { reduceFlashing: boolean; lowFrameRateMode: boolean },
): Path2D {
  return readCachedCanvasPath(
    {
      rendererKind: "fragment",
      visualPresetId: "battle-fragment",
      paletteRole: "playerSignal",
      shape,
      shapeParams: [size],
      reduceFlashing: options.reduceFlashing,
      lowFrameRateMode: options.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.moveTo(0, -size)
      path.lineTo(size * 0.72, 0)
      path.lineTo(0, size)
      path.lineTo(-size * 0.72, 0)
      path.closePath()
      return path
    },
  )
}

function readFragmentInnerPath(
  size: number,
  options: { reduceFlashing: boolean; lowFrameRateMode: boolean },
): Path2D {
  return readCachedCanvasPath(
    {
      rendererKind: "fragment",
      visualPresetId: "battle-fragment",
      paletteRole: "signalReadable",
      shape: "fragment-inner",
      shapeParams: [size],
      reduceFlashing: options.reduceFlashing,
      lowFrameRateMode: options.lowFrameRateMode,
    },
    () => {
      const path = new Path2D()
      path.moveTo(0, -size)
      path.lineTo(size * 0.76, -size * 0.08)
      path.lineTo(size * 0.22, size * 0.82)
      path.lineTo(-size * 0.88, size * 0.18)
      path.closePath()
      return path
    },
  )
}

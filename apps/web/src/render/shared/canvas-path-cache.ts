export type CanvasPathCacheInput = {
  rendererKind: string
  visualPresetId: string
  paletteRole: string
  shape: string
  shapeParams: readonly (string | number | boolean | undefined)[]
  reduceFlashing: boolean
  lowFrameRateMode: boolean
}

const pathCache = new Map<string, Path2D>()
const MAX_PATH_CACHE_ENTRIES = 256

export function readCachedCanvasPath(input: CanvasPathCacheInput, build: () => Path2D): Path2D {
  const key = createCanvasPathCacheKey(input)
  const cached = pathCache.get(key)
  if (cached) {
    return cached
  }

  const path = build()
  // Cache は preset 変更の取りこぼしを避けるため、描画種別と表示設定を key に含めて固定します。
  if (pathCache.size >= MAX_PATH_CACHE_ENTRIES) {
    pathCache.clear()
  }
  pathCache.set(key, path)
  return path
}

function createCanvasPathCacheKey(input: CanvasPathCacheInput): string {
  return [
    input.rendererKind,
    input.visualPresetId,
    input.paletteRole,
    input.shape,
    input.reduceFlashing ? "reduce" : "standard",
    input.lowFrameRateMode ? "low" : "full",
    ...input.shapeParams.map((value) => String(value ?? "")),
  ].join("|")
}

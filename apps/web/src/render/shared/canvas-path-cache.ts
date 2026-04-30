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
    pathCache.delete(key)
    pathCache.set(key, cached)
    return cached
  }

  const path = build()
  // LRU で古い shape だけを落とし、frame 中の全消去による Path2D 再生成を避けます。
  if (pathCache.size >= MAX_PATH_CACHE_ENTRIES) {
    const oldestKey = pathCache.keys().next().value
    if (oldestKey) {
      pathCache.delete(oldestKey)
    }
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

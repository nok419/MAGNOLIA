export function prepareDevicePixelCanvas(input: {
  canvas: HTMLCanvasElement
  width: number
  height: number
  pixelRatio: number
  applyCssSize?: boolean
}): CanvasRenderingContext2D | null {
  const context = input.canvas.getContext("2d")
  if (!context) {
    return null
  }

  // Canvas の内部解像度と CSS 表示サイズを同じ入口で設定し、dpr 処理の分散を避けます。
  const pixelWidth = Math.max(1, Math.round(input.width * input.pixelRatio))
  const pixelHeight = Math.max(1, Math.round(input.height * input.pixelRatio))
  const applyCssSize = input.applyCssSize ?? true
  const cssWidth = `${input.width}px`
  const cssHeight = `${input.height}px`
  if (input.canvas.width !== pixelWidth) {
    input.canvas.width = pixelWidth
  }
  if (input.canvas.height !== pixelHeight) {
    input.canvas.height = pixelHeight
  }
  if (applyCssSize && input.canvas.style.width !== cssWidth) {
    input.canvas.style.width = cssWidth
  }
  if (applyCssSize && input.canvas.style.height !== cssHeight) {
    input.canvas.style.height = cssHeight
  }
  context.setTransform(input.pixelRatio, 0, 0, input.pixelRatio, 0, 0)
  return context
}

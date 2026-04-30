export function prepareDevicePixelCanvas(input: {
  canvas: HTMLCanvasElement
  width: number
  height: number
  pixelRatio: number
}): CanvasRenderingContext2D | null {
  const context = input.canvas.getContext("2d")
  if (!context) {
    return null
  }

  // Canvas の内部解像度と CSS 表示サイズを同じ入口で設定し、dpr 処理の分散を避けます。
  input.canvas.width = input.width * input.pixelRatio
  input.canvas.height = input.height * input.pixelRatio
  input.canvas.style.width = `${input.width}px`
  input.canvas.style.height = `${input.height}px`
  context.setTransform(input.pixelRatio, 0, 0, input.pixelRatio, 0, 0)
  return context
}

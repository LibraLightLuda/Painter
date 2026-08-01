import type { BackgroundImageState, DrawingLayer, ShapeTool, Stroke, ViewTransform, WordGuide } from './types'

export function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  context?.clearRect(0, 0, canvas.width, canvas.height)
}

function strokePath(context: CanvasRenderingContext2D, points: Stroke['points']): void {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y)
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index]
      const next = points[index + 1]
      context.quadraticCurveTo(
        point.x,
        point.y,
        (point.x + next.x) / 2,
        (point.y + next.y) / 2,
      )
    }
    context.lineTo(points.at(-1)!.x, points.at(-1)!.y)
  }
}

function seededRandom(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized.padEnd(6, '0').slice(0, 6)
  return [
    Number.parseInt(value.slice(0, 2), 16) || 0,
    Number.parseInt(value.slice(2, 4), 16) || 0,
    Number.parseInt(value.slice(4, 6), 16) || 0,
  ]
}

function pointPressure(point: Stroke['points'][number], stroke: Stroke): number {
  if (stroke.pressure === false) return 1
  const pressure = point.pressure ?? 1
  return Math.min(1, Math.max(0.18, pressure || 1))
}

function forEachDab(
  stroke: Stroke,
  callback: (x: number, y: number, pressure: number) => void,
): void {
  forEachDabRange(stroke, 0, callback)
}

function forEachDabRange(
  stroke: Stroke,
  renderedPointCount: number,
  callback: (x: number, y: number, pressure: number) => void,
): void {
  const points = stroke.points
  if (points.length === 0 || renderedPointCount >= points.length) return
  const step = Math.max(0.6, stroke.size * Math.min(1, Math.max(0.04, stroke.spacing ?? 0.12)))
  if (renderedPointCount === 0) {
    callback(points[0].x, points[0].y, pointPressure(points[0], stroke))
  }
  for (let index = Math.max(1, renderedPointCount); index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const count = Math.max(1, Math.ceil(distance / step))
    for (let dab = 1; dab <= count; dab += 1) {
      const ratio = dab / count
      callback(
        previous.x + (point.x - previous.x) * ratio,
        previous.y + (point.y - previous.y) * ratio,
        pointPressure(previous, stroke) + (pointPressure(point, stroke) - pointPressure(previous, stroke)) * ratio,
      )
    }
  }
}

function drawDab(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  x: number,
  y: number,
  pressure: number,
  color: string,
): void {
  const radius = Math.max(0.5, stroke.size * pressure * 0.5)
  const hardness = Math.min(1, Math.max(0.02, stroke.hardness ?? 0.9))
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  if (hardness >= 0.98) {
    context.fillStyle = color
  } else {
    const [red, green, blue] = hexToRgb(color)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 1)`)
    gradient.addColorStop(hardness, `rgba(${red}, ${green}, ${blue}, 1)`)
    gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`)
    context.fillStyle = gradient
  }
  context.fill()
}

function drawDabStroke(context: CanvasRenderingContext2D, stroke: Stroke, color: string): void {
  forEachDab(stroke, (x, y, pressure) => drawDab(context, stroke, x, y, pressure, color))
}

function hasNearlyConstantPressure(stroke: Stroke): boolean {
  const first = pointPressure(stroke.points[0], stroke)
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (Math.abs(pointPressure(stroke.points[index], stroke) - first) > 0.015) return false
  }
  return true
}

function canUseFastPenPath(stroke: Stroke): boolean {
  return (stroke.tool === 'pen' || stroke.tool === 'eraser')
    && (stroke.hardness ?? 0.9) >= 0.9
    && (stroke.spacing ?? 0.12) <= 0.15
    && hasNearlyConstantPressure(stroke)
}

export function supportsIncrementalPreview(stroke: Stroke): boolean {
  return stroke.tool === 'pen'
    || stroke.tool === 'pencil'
    || stroke.tool === 'eraser'
    || stroke.tool === 'brush'
    || stroke.tool === 'marker'
    || stroke.tool === 'highlighter'
}

export function drawStrokeIncrement(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  renderedPointCount: number,
  eraserPreviewColor?: string,
  variableBrushWidth = stroke.size,
): number {
  if (!supportsIncrementalPreview(stroke) || renderedPointCount >= stroke.points.length) {
    return variableBrushWidth
  }

  context.save()
  context.globalAlpha = stroke.opacity * (stroke.flow ?? 1)
  if (stroke.tool === 'eraser' && !eraserPreviewColor) {
    context.globalCompositeOperation = 'destination-out'
    context.globalAlpha = 1
  }
  const color = stroke.tool === 'eraser' ? (eraserPreviewColor ?? '#000000') : stroke.color
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = stroke.size
  context.lineCap = stroke.tool === 'marker' || stroke.tool === 'highlighter' ? 'square' : 'round'
  context.lineJoin = 'round'

  if (canUseFastPenPath(stroke)) {
    context.lineWidth = stroke.size * pointPressure(stroke.points[0], stroke)
    if (renderedPointCount === 0) {
      context.beginPath()
      context.arc(
        stroke.points[0].x,
        stroke.points[0].y,
        context.lineWidth / 2,
        0,
        Math.PI * 2,
      )
      context.fill()
    }
    const firstNewPoint = Math.max(1, renderedPointCount)
    if (firstNewPoint < stroke.points.length) {
      context.beginPath()
      context.moveTo(stroke.points[firstNewPoint - 1].x, stroke.points[firstNewPoint - 1].y)
      for (let index = firstNewPoint; index < stroke.points.length; index += 1) {
        context.lineTo(stroke.points[index].x, stroke.points[index].y)
      }
      context.stroke()
    }
  } else if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'eraser') {
    forEachDabRange(
      stroke,
      renderedPointCount,
      (x, y, pressure) => drawDab(context, stroke, x, y, pressure, color),
    )
  } else if (stroke.tool === 'brush') {
    context.shadowColor = color
    context.shadowBlur = stroke.size * (1 - (stroke.hardness ?? 0.75)) * 0.25
    if (renderedPointCount === 0 && stroke.points.length === 1) {
      context.beginPath()
      context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size * 0.55, 0, Math.PI * 2)
      context.fill()
    }
    for (let index = Math.max(1, renderedPointCount); index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1]
      const point = stroke.points[index]
      const elapsed = Math.max(1, point.time - previous.time)
      const speed = Math.hypot(point.x - previous.x, point.y - previous.y) / elapsed
      const target = stroke.size * pointPressure(point, stroke)
        * Math.min(1.2, Math.max(0.45, 1.2 - speed * 0.7))
      variableBrushWidth = variableBrushWidth * 0.72 + target * 0.28
      context.lineWidth = variableBrushWidth
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }
  } else {
    if (renderedPointCount === 0 && stroke.points.length === 1) {
      context.beginPath()
      context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2)
      context.fill()
    }
    for (let index = Math.max(1, renderedPointCount); index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1]
      const point = stroke.points[index]
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }
  }
  context.restore()
  return variableBrushWidth
}

function isShapeTool(tool: Stroke['tool']): tool is ShapeTool {
  return tool === 'line' || tool === 'rectangle' || tool === 'ellipse' || tool === 'arrow'
}

function drawShape(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const start = stroke.points[0]
  const end = stroke.points.at(-1) ?? start
  context.lineWidth = stroke.size * pointPressure(end, stroke)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  if (stroke.tool === 'line' || stroke.tool === 'arrow') {
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
  } else if (stroke.tool === 'rectangle') {
    context.rect(start.x, start.y, end.x - start.x, end.y - start.y)
  } else {
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.abs(end.x - start.x) / 2,
      Math.abs(end.y - start.y) / 2,
      0,
      0,
      Math.PI * 2,
    )
  }
  if (stroke.shapeFill && stroke.tool !== 'line' && stroke.tool !== 'arrow') context.fill()
  else context.stroke()

  if (stroke.tool === 'arrow') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const head = Math.max(stroke.size * 3, 14)
    context.beginPath()
    context.moveTo(end.x, end.y)
    context.lineTo(end.x - Math.cos(angle - Math.PI / 6) * head, end.y - Math.sin(angle - Math.PI / 6) * head)
    context.moveTo(end.x, end.y)
    context.lineTo(end.x - Math.cos(angle + Math.PI / 6) * head, end.y - Math.sin(angle + Math.PI / 6) * head)
    context.stroke()
  }
}

export function floodFillImageData(
  image: ImageData,
  x: number,
  y: number,
  color: string,
  alpha: number,
  tolerance: number,
): ImageData {
  const width = image.width
  const height = image.height
  const startX = Math.min(width - 1, Math.max(0, Math.round(x)))
  const startY = Math.min(height - 1, Math.max(0, Math.round(y)))
  const startIndex = (startY * width + startX) * 4
  const target = [
    image.data[startIndex], image.data[startIndex + 1], image.data[startIndex + 2], image.data[startIndex + 3],
  ]
  const [red, green, blue] = hexToRgb(color)
  const nextAlpha = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  if (target[0] === red && target[1] === green && target[2] === blue && target[3] === nextAlpha) return image

  const pixelCount = width * height
  const queue = new Int32Array(pixelCount)
  const visited = new Uint8Array(pixelCount)
  let head = 0
  let tail = 0
  const startPixel = startY * width + startX
  queue[tail++] = startPixel
  visited[startPixel] = 1
  const threshold = Math.min(255, Math.max(0, tolerance))
  const matches = (offset: number) =>
    Math.max(
      Math.abs(image.data[offset] - target[0]),
      Math.abs(image.data[offset + 1] - target[1]),
      Math.abs(image.data[offset + 2] - target[2]),
      Math.abs(image.data[offset + 3] - target[3]),
    ) <= threshold

  while (head < tail) {
    const pixel = queue[head++]
    const offset = pixel * 4
    if (!matches(offset)) continue
    image.data[offset] = red
    image.data[offset + 1] = green
    image.data[offset + 2] = blue
    image.data[offset + 3] = nextAlpha
    const px = pixel % width
    const py = Math.floor(pixel / width)
    const enqueue = (next: number) => {
      if (visited[next]) return
      visited[next] = 1
      queue[tail++] = next
    }
    if (px > 0) enqueue(pixel - 1)
    if (px + 1 < width) enqueue(pixel + 1)
    if (py > 0) enqueue(pixel - width)
    if (py + 1 < height) enqueue(pixel + width)
  }
  return image
}

function drawFill(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const point = stroke.points[0]
  const image = context.getImageData(0, 0, context.canvas.width, context.canvas.height)
  floodFillImageData(
    image,
    point.x,
    point.y,
    stroke.color,
    stroke.opacity * (stroke.flow ?? 1),
    stroke.tolerance ?? 24,
  )
  context.putImageData(image, 0, 0)
}

function drawSpray(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const random = seededRandom(stroke.seed ?? 1)
  const radius = stroke.size / 2
  const spacing = Math.max(2, radius * Math.max(0.08, stroke.spacing ?? 0.3))
  const samples: Array<{ x: number; y: number }> = []
  for (let index = 0; index < stroke.points.length; index += 1) {
    const point = stroke.points[index]
    const previous = stroke.points[index - 1]
    if (!previous) {
      samples.push(point)
      continue
    }
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const steps = Math.max(1, Math.ceil(distance / spacing))
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps
      samples.push({
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
      })
      if (samples.length >= 320) break
    }
    if (samples.length >= 320) break
  }

  const particles = Math.min(22, Math.max(8, Math.round(radius * 0.65)))
  context.globalAlpha *= 0.42 * (stroke.flow ?? 1)
  for (const sample of samples) {
    for (let particle = 0; particle < particles; particle += 1) {
      const angle = random() * Math.PI * 2
      const distance = Math.sqrt(random()) * radius
      const dot = Math.max(0.65, Math.min(1.8, stroke.size * (0.025 + random() * 0.025)))
      context.beginPath()
      context.arc(
        sample.x + Math.cos(angle) * distance,
        sample.y + Math.sin(angle) * distance,
        dot,
        0,
        Math.PI * 2,
      )
      context.fill()
    }
  }
}

function drawVariableBrush(context: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 1) {
    context.beginPath()
    context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size * 0.55, 0, Math.PI * 2)
    context.fill()
    return
  }
  let width = stroke.size
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1]
    const point = stroke.points[index]
    const elapsed = Math.max(1, point.time - previous.time)
    const speed = Math.hypot(point.x - previous.x, point.y - previous.y) / elapsed
    const target = stroke.size * pointPressure(point, stroke) * Math.min(1.2, Math.max(0.45, 1.2 - speed * 0.7))
    width = width * 0.72 + target * 0.28
    context.lineWidth = width
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(point.x, point.y)
    context.stroke()
  }
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  eraserPreviewColor?: string,
): void {
  const points = stroke.points
  if (points.length === 0) return

  if (stroke.tool === 'fill') {
    drawFill(context, stroke)
    return
  }
  if (stroke.tool === 'eyedropper') return

  context.save()
  context.globalAlpha = stroke.opacity * (stroke.flow ?? 1)
  if (stroke.tool === 'eraser' && !eraserPreviewColor) {
    context.globalCompositeOperation = 'destination-out'
    context.globalAlpha = 1
  }
  const color = stroke.tool === 'eraser' ? (eraserPreviewColor ?? '#000000') : stroke.color
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = stroke.size
  context.lineCap = stroke.tool === 'marker' || stroke.tool === 'highlighter' ? 'square' : 'round'
  context.lineJoin = 'round'

  if (isShapeTool(stroke.tool)) {
    drawShape(context, stroke)
    context.restore()
    return
  }

  if (stroke.tool === 'spray') {
    drawSpray(context, stroke)
    context.restore()
    return
  }

  if (stroke.tool === 'brush') {
    context.shadowColor = color
    context.shadowBlur = stroke.size * (1 - (stroke.hardness ?? 0.75)) * 0.25
    drawVariableBrush(context, stroke)
    context.restore()
    return
  }

  if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'eraser') {
    if (canUseFastPenPath(stroke)) {
      context.lineWidth = stroke.size * pointPressure(points[0], stroke)
      if (points.length === 1) {
        context.beginPath()
        context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2)
        context.fill()
      } else {
        strokePath(context, points)
        context.stroke()
      }
    } else {
      drawDabStroke(context, stroke, color)
    }
    if (stroke.tool === 'pencil') {
      const random = seededRandom(stroke.seed ?? 1)
      context.globalAlpha *= 0.24
      const count = Math.min(180, points.length * 3)
      for (let index = 0; index < count; index += 1) {
        const point = points[Math.floor(random() * points.length)]
        const spread = stroke.size * 0.7
        context.fillRect(point.x + (random() - 0.5) * spread, point.y + (random() - 0.5) * spread, 0.7, 0.7)
      }
    }
    context.restore()
    return
  }

  if (stroke.tool === 'marker') {
    context.shadowColor = color
    context.shadowBlur = stroke.size * (1 - (stroke.hardness ?? 0.7)) * 0.25
  }

  if (points.length === 1) {
    context.beginPath()
    context.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2)
    context.fill()
    context.restore()
    return
  }

  strokePath(context, points)
  context.stroke()

  context.restore()
}

function drawLayeredStrokes(
  context: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  layers?: readonly DrawingLayer[],
): void {
  if (!layers?.length) {
    for (const stroke of strokes) drawStroke(context, stroke)
    return
  }
  const fallbackId = layers[0].id
  for (const layer of layers) {
    if (!layer.visible) continue
    const layerCanvas = document.createElement('canvas')
    layerCanvas.width = context.canvas.width
    layerCanvas.height = context.canvas.height
    const layerContext = layerCanvas.getContext('2d', { alpha: true })
    if (!layerContext) continue
    for (const stroke of strokes) {
      if ((stroke.layerId ?? fallbackId) === layer.id) drawStroke(layerContext, stroke)
    }
    context.save()
    context.globalAlpha = layer.opacity
    context.drawImage(layerCanvas, 0, 0)
    context.restore()
  }
}

export function replayStrokes(
  canvas: HTMLCanvasElement,
  strokes: readonly Stroke[],
  layers?: readonly DrawingLayer[],
): void {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawLayeredStrokes(context, strokes, layers)
}

export function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  state: BackgroundImageState,
): void {
  const rotated = state.rotation === 90 || state.rotation === 270
  const sourceWidth = rotated ? state.height : state.width
  const sourceHeight = rotated ? state.width : state.height
  const scale = state.mode === 'fill'
    ? Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    : Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)

  context.save()
  context.translate(canvasWidth / 2, canvasHeight / 2)
  context.rotate((state.rotation * Math.PI) / 180)
  context.drawImage(
    image,
    (-state.width * scale) / 2,
    (-state.height * scale) / 2,
    state.width * scale,
    state.height * scale,
  )
  context.restore()
}

const wordFontFamilies: Record<WordGuide['language'], string> = {
  en: 'Arial, Helvetica, sans-serif',
  ko: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  ja: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
  zh: '"PingFang SC", "Microsoft YaHei", sans-serif',
}

export function drawWordGuide(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  guide?: WordGuide,
): void {
  if (!guide?.text) return
  const family = wordFontFamilies[guide.language]
  const maximumWidth = width * 0.88
  const maximumHeight = height * 0.66
  let low = 24
  let high = Math.max(low, height * 0.82)
  for (let index = 0; index < 12; index += 1) {
    const size = (low + high) / 2
    context.font = `800 ${size}px ${family}`
    if (context.measureText(guide.text).width <= maximumWidth && size <= maximumHeight) low = size
    else high = size
  }

  context.save()
  context.font = `800 ${low}px ${family}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.strokeStyle = 'rgba(82, 82, 76, 0.42)'
  context.lineWidth = Math.max(5, low * 0.018)
  context.strokeText(guide.text, width / 2, height / 2, maximumWidth)
  context.restore()
}

export function drawViewport(
  display: HTMLCanvasElement,
  committed: HTMLCanvasElement,
  preview: HTMLCanvasElement,
  view: ViewTransform,
  background: string,
  dpr: number,
  backgroundImage?: CanvasImageSource | null,
  backgroundImageState?: BackgroundImageState,
  wordGuide?: WordGuide,
  showShadow = true,
): void {
  const context = display.getContext('2d')
  if (!context) return
  const cssWidth = display.width / dpr
  const cssHeight = display.height / dpr

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, cssWidth, cssHeight)
  context.save()
  context.translate(view.offsetX, view.offsetY)
  context.scale(view.scale, view.scale)
  context.shadowColor = showShadow ? 'rgba(25, 27, 24, 0.20)' : 'transparent'
  context.shadowBlur = showShadow ? 22 / view.scale : 0
  context.shadowOffsetY = showShadow ? 8 / view.scale : 0
  context.fillStyle = background
  context.fillRect(0, 0, committed.width, committed.height)
  if (backgroundImage && backgroundImageState) {
    drawBackgroundImage(
      context,
      backgroundImage,
      committed.width,
      committed.height,
      backgroundImageState,
    )
  }
  context.shadowColor = 'transparent'
  drawWordGuide(context, committed.width, committed.height, wordGuide)
  context.drawImage(committed, 0, 0)
  context.drawImage(preview, 0, 0)
  context.restore()
}

export function renderFullCanvas(
  width: number,
  height: number,
  background: string,
  strokes: readonly Stroke[],
  backgroundImage?: CanvasImageSource | null,
  backgroundImageState?: BackgroundImageState,
  scale = 1,
  layers?: readonly DrawingLayer[],
  wordGuide?: WordGuide,
): HTMLCanvasElement {
  const artwork = document.createElement('canvas')
  artwork.width = width
  artwork.height = height
  const artworkContext = artwork.getContext('2d', { alpha: true })
  if (!artworkContext) throw new Error('Canvas 2D를 사용할 수 없습니다.')
  drawLayeredStrokes(artworkContext, strokes, layers)

  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(width * scale))
  output.height = Math.max(1, Math.round(height * scale))
  const context = output.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D를 사용할 수 없습니다.')
  context.fillStyle = background
  context.fillRect(0, 0, output.width, output.height)
  context.save()
  context.scale(scale, scale)
  if (backgroundImage && backgroundImageState) {
    drawBackgroundImage(context, backgroundImage, width, height, backgroundImageState)
  }
  drawWordGuide(context, width, height, wordGuide)
  context.drawImage(artwork, 0, 0)
  context.restore()
  return output
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('이미지 Blob을 만들지 못했습니다.'))
    }, type, quality)
  })
}

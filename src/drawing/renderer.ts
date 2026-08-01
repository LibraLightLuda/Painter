import type { BackgroundImageState, DrawingLayer, Stroke, ViewTransform } from './types'

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

function drawSpray(context: CanvasRenderingContext2D, stroke: Stroke): void {
  const random = seededRandom(stroke.seed ?? 1)
  const radius = stroke.size / 2
  const spacing = Math.max(2, radius * 0.3)
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
  context.globalAlpha *= 0.42
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
    const target = stroke.size * Math.min(1.2, Math.max(0.45, 1.2 - speed * 0.7))
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

  context.save()
  context.globalAlpha = stroke.opacity
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

  if (stroke.tool === 'spray') {
    drawSpray(context, stroke)
    context.restore()
    return
  }

  if (stroke.tool === 'brush') {
    context.shadowColor = color
    context.shadowBlur = stroke.size * 0.08
    drawVariableBrush(context, stroke)
    context.restore()
    return
  }

  if (stroke.tool === 'marker') {
    context.shadowColor = color
    context.shadowBlur = stroke.size * 0.12
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

  if (stroke.tool === 'pencil') {
    const random = seededRandom(stroke.seed ?? 1)
    context.globalAlpha *= 0.24
    const count = Math.min(180, points.length * 3)
    for (let index = 0; index < count; index += 1) {
      const point = points[Math.floor(random() * points.length)]
      const spread = stroke.size * 0.7
      context.fillRect(
        point.x + (random() - 0.5) * spread,
        point.y + (random() - 0.5) * spread,
        0.7,
        0.7,
      )
    }
  }
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
    context.save()
    context.globalAlpha = layer.opacity
    for (const stroke of strokes) {
      if ((stroke.layerId ?? fallbackId) === layer.id) drawStroke(context, stroke)
    }
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

export function drawViewport(
  display: HTMLCanvasElement,
  committed: HTMLCanvasElement,
  preview: HTMLCanvasElement,
  view: ViewTransform,
  background: string,
  dpr: number,
  backgroundImage?: CanvasImageSource | null,
  backgroundImageState?: BackgroundImageState,
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
  context.shadowColor = 'rgba(25, 27, 24, 0.20)'
  context.shadowBlur = 22 / view.scale
  context.shadowOffsetY = 8 / view.scale
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

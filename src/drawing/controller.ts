import {
  fitTransform,
  persistView,
  preserveCenterOnResize,
  restoreView,
  screenToCanvas,
  viewAroundGesture,
} from './coordinates'
import { StrokeHistory } from './history'
import { GESTURE, InputMachine, type InputAction } from './inputMachine'
import {
  canvasToBlob,
  clearCanvas,
  drawStroke,
  drawViewport,
  renderFullCanvas,
  replayStrokes,
} from './renderer'
import {
  PROJECT_SCHEMA_VERSION,
  type BackgroundImageState,
  type BrushSettings,
  type DrawingLayer,
  type Point,
  type ProjectSnapshot,
  type ScreenPoint,
  type Stroke,
  type ViewTransform,
} from './types'

export interface DrawingState {
  canUndo: boolean
  canRedo: boolean
  scale: number
  inputMode: string
  brush: BrushSettings
  layers: DrawingLayer[]
  activeLayerId: string
}

export interface DrawingChange {
  kind: 'content' | 'view' | 'state'
  state: DrawingState
}

interface DrawingControllerOptions {
  width: number
  height: number
  background: string
  onChange: (change: DrawingChange) => void
}

function uniquePoints(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (!previous || previous.x !== point.x || previous.y !== point.y || previous.time !== point.time) {
      result.push(point)
    }
  }
  return result
}

export class DrawingController {
  private readonly history = new StrokeHistory(50)
  private readonly input = new InputMachine()
  private readonly committed = document.createElement('canvas')
  private readonly preview = document.createElement('canvas')
  private view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 }
  private viewportWidth = 0
  private viewportHeight = 0
  private dpr = 1
  private currentStroke: Stroke | null = null
  private gestureStartView: ViewTransform | null = null
  private interruptedStrokeId: string | null = null
  private frameId: number | null = null
  private settleTimer: number | null = null
  private disposed = false
  private hasLoadedView = false
  private documentWidth: number
  private documentHeight: number
  private documentBackground: string
  private documentId = 'active-canvas'
  private brush: BrushSettings = {
    tool: 'pen',
    color: '#1e1f1d',
    size: 4,
    opacity: 1,
  }
  private backgroundAsset: Blob | null = null
  private backgroundImage: CanvasImageSource | null = null
  private backgroundImageState: BackgroundImageState | undefined
  private layers: DrawingLayer[] = [
    { id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 },
  ]
  private activeLayerId = 'layer-1'

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const activeLayer = this.layers.find((layer) => layer.id === this.activeLayerId)
    if (activeLayer && !activeLayer.visible) {
      activeLayer.visible = true
      this.replayLayers()
      this.emit('content')
    }
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is an optimization; lifecycle recovery still handles failure.
    }
    this.process(this.input.pointerDown(this.eventPoint(event)))
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.input.hasPointer(event.pointerId)) return
    event.preventDefault()
    const coalesced = event.getCoalescedEvents?.()
    const samples = coalesced?.length ? coalesced : [event]
    const points = samples.map((sample) => this.eventPoint(sample))
    this.process(this.input.pointerMove(event.pointerId, points))
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.input.hasPointer(event.pointerId)) return
    event.preventDefault()
    this.process(this.input.pointerUp(this.eventPoint(event)))
    try {
      this.canvas.releasePointerCapture(event.pointerId)
    } catch {
      // Capture may already be released by the browser.
    }
  }

  private readonly onPointerCancel = (event: PointerEvent) => {
    if (!this.input.hasPointer(event.pointerId)) return
    event.preventDefault()
    this.process(this.input.cancel())
  }

  private readonly onLostPointerCapture = (event: PointerEvent) => {
    if (this.input.hasPointer(event.pointerId)) this.process(this.input.cancel())
  }

  private readonly onContextMenu = (event: MouseEvent) => event.preventDefault()

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      time: event.timeStamp,
    }
    this.zoomBy(Math.exp(-event.deltaY * 0.0015), anchor)
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: DrawingControllerOptions,
  ) {
    this.documentWidth = options.width
    this.documentHeight = options.height
    this.documentBackground = options.background
    this.configureDocument(options.width, options.height, options.background)
    this.attach()
  }

  private attach(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture)
    this.canvas.addEventListener('contextmenu', this.onContextMenu)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    const oldWidth = this.viewportWidth
    const oldHeight = this.viewportHeight
    this.viewportWidth = width
    this.viewportHeight = height
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(height * this.dpr))

    if (!oldWidth || !oldHeight) {
      if (!this.hasLoadedView) {
        this.view = fitTransform(this.documentWidth, this.documentHeight, width, height)
      }
    } else {
      this.view = preserveCenterOnResize(this.view, oldWidth, oldHeight, width, height)
    }
    this.requestRender()
  }

  async load(snapshot: ProjectSnapshot, backgroundAsset?: Blob): Promise<void> {
    if (snapshot.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      throw new Error('지원하지 않는 작업 데이터 버전입니다.')
    }
    this.configureDocument(snapshot.width, snapshot.height, snapshot.background)
    this.documentId = snapshot.id
    await this.replaceBackgroundImage(backgroundAsset ?? null, snapshot.backgroundImage)
    this.layers = snapshot.layers?.length
      ? structuredClone(snapshot.layers)
      : [{ id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }]
    this.activeLayerId = this.layers.some((layer) => layer.id === snapshot.activeLayerId)
      ? snapshot.activeLayerId!
      : this.layers[0].id
    this.history.restore(snapshot.history)
    this.replayLayers()
    clearCanvas(this.preview)
    if (this.viewportWidth && this.viewportHeight) {
      this.view = restoreView(snapshot.view, this.viewportWidth, this.viewportHeight)
      this.hasLoadedView = true
    }
    this.requestRender()
    this.emit('state')
  }

  fitToScreen(): void {
    this.cancelActive()
    this.view = fitTransform(
      this.documentWidth,
      this.documentHeight,
      this.viewportWidth,
      this.viewportHeight,
    )
    this.requestRender()
    this.emit('view')
  }

  zoomBy(factor: number, anchor?: Point): void {
    this.cancelActive()
    const focus = anchor ?? {
      x: this.viewportWidth / 2,
      y: this.viewportHeight / 2,
      time: performance.now(),
    }
    this.view = viewAroundGesture(this.view, focus, focus, factor)
    this.requestRender()
    this.emit('view')
  }

  setBrush(next: Partial<BrushSettings>): void {
    this.cancelActive()
    if (this.input.mode === 'settling') this.input.finishSettling()
    this.brush = {
      ...this.brush,
      ...next,
      size: Math.min(160, Math.max(1, next.size ?? this.brush.size)),
      opacity: Math.min(1, Math.max(0.05, next.opacity ?? this.brush.opacity)),
    }
    this.emit('state')
  }

  startNew(snapshot: ProjectSnapshot): void {
    this.cancelActive()
    if (this.input.mode === 'settling') this.input.finishSettling()
    this.configureDocument(snapshot.width, snapshot.height, snapshot.background)
    this.documentId = snapshot.id
    this.releaseBackgroundImage()
    this.backgroundAsset = null
    this.backgroundImageState = undefined
    this.history.clear()
    this.layers = snapshot.layers?.length
      ? structuredClone(snapshot.layers)
      : [{ id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }]
    this.activeLayerId = snapshot.activeLayerId ?? this.layers[0].id
    this.currentStroke = null
    clearCanvas(this.committed)
    clearCanvas(this.preview)
    this.hasLoadedView = false
    this.fitToScreen()
    this.emit('content')
  }

  undo(): void {
    this.cancelActive()
    if (!this.history.undo()) return
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  redo(): void {
    this.cancelActive()
    const stroke = this.history.redo()
    if (!stroke) return
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  cancelActive(): void {
    if (this.input.mode !== 'idle' && this.input.mode !== 'settling') {
      this.process(this.input.cancel())
    }
  }

  serialize(title: string): ProjectSnapshot {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: this.documentId,
      title,
      width: this.documentWidth,
      height: this.documentHeight,
      background: this.documentBackground,
      backgroundImage: this.backgroundImageState ? { ...this.backgroundImageState } : undefined,
      layers: structuredClone(this.layers),
      activeLayerId: this.activeLayerId,
      history: this.history.serialize(),
      view: persistView(this.view, this.viewportWidth, this.viewportHeight),
      updatedAt: Date.now(),
    }
  }

  async createCheckpointBlob(): Promise<Blob> {
    return canvasToBlob(this.renderOutput())
  }

  async createExportBlob(
    type: 'image/png' | 'image/jpeg' = 'image/png',
    scale = 1,
    quality = 0.9,
  ): Promise<Blob> {
    this.cancelActive()
    return canvasToBlob(this.renderOutput(scale), type, quality)
  }

  async setBackgroundImage(blob: Blob, state: BackgroundImageState): Promise<void> {
    this.cancelActive()
    await this.replaceBackgroundImage(blob, state)
    this.requestRender()
    this.emit('content')
  }

  removeBackgroundImage(): void {
    this.cancelActive()
    this.releaseBackgroundImage()
    this.backgroundAsset = null
    this.backgroundImageState = undefined
    this.requestRender()
    this.emit('content')
  }

  getBackgroundAsset(): Blob | undefined {
    return this.backgroundAsset ?? undefined
  }

  getState(): DrawingState {
    return {
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      scale: this.view.scale,
      inputMode: this.input.mode,
      brush: { ...this.brush },
      layers: structuredClone(this.layers),
      activeLayerId: this.activeLayerId,
    }
  }

  private renderOutput(scale = 1): HTMLCanvasElement {
    return renderFullCanvas(
      this.documentWidth,
      this.documentHeight,
      this.documentBackground,
      this.history.getStrokes(),
      this.backgroundImage,
      this.backgroundImageState,
      scale,
      this.layers,
    )
  }

  private eventPoint(event: PointerEvent): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect()
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      time: event.timeStamp,
    }
  }

  private process(actions: InputAction[]): void {
    let committedId: string | null = null
    for (const action of actions) {
      switch (action.type) {
        case 'begin-stroke': {
          const point = screenToCanvas(action.point, this.view)
          this.currentStroke = {
            id: crypto.randomUUID(),
            ...this.brush,
            seed: Math.floor(Math.random() * 0x7fffffff),
            layerId: this.activeLayerId,
            points: [point],
          }
          this.requestRender()
          break
        }
        case 'append-stroke': {
          if (!this.currentStroke) break
          const next = action.points.map((point) => screenToCanvas(point, this.view))
          this.currentStroke.points = uniquePoints([...this.currentStroke.points, ...next])
          this.requestRender()
          break
        }
        case 'commit-stroke': {
          committedId = this.commitStroke()
          break
        }
        case 'begin-gesture': {
          this.gestureStartView = { ...this.view }
          this.interruptedStrokeId = committedId
          break
        }
        case 'update-gesture': {
          if (!this.gestureStartView) break
          this.view = viewAroundGesture(
            this.gestureStartView,
            action.initialCentroid,
            action.currentCentroid,
            action.scaleFactor,
          )
          this.requestRender()
          this.emit('view')
          break
        }
        case 'undo-gesture': {
          this.history.discardLastIf(this.interruptedStrokeId)
          this.interruptedStrokeId = null
          this.history.undo()
          this.replayLayers()
          this.requestRender()
          this.emit('content')
          break
        }
        case 'settle': {
          this.gestureStartView = null
          this.interruptedStrokeId = null
          if (this.settleTimer !== null) window.clearTimeout(this.settleTimer)
          this.settleTimer = window.setTimeout(() => {
            this.input.finishSettling()
            this.emit('state')
          }, GESTURE.settleMs)
          break
        }
      }
    }
  }

  private commitStroke(): string | null {
    const stroke = this.currentStroke
    this.currentStroke = null
    clearCanvas(this.preview)
    if (!stroke || stroke.points.length === 0) return null
    this.history.add(stroke)
    this.replayLayers()
    this.requestRender()
    this.emit('content')
    return stroke.id
  }

  private render(): void {
    this.frameId = null
    if (this.disposed) return
    const previewContext = this.preview.getContext('2d')
    if (previewContext) {
      previewContext.clearRect(0, 0, this.preview.width, this.preview.height)
      if (this.currentStroke) {
        const layerOpacity = this.layers.find((layer) => layer.id === this.activeLayerId)?.opacity ?? 1
        drawStroke(
          previewContext,
          { ...this.currentStroke, opacity: this.currentStroke.opacity * layerOpacity },
          this.documentBackground,
        )
      }
    }
    drawViewport(
      this.canvas,
      this.committed,
      this.preview,
      this.view,
      this.documentBackground,
      this.dpr,
      this.backgroundImage,
      this.backgroundImageState,
    )
  }

  private requestRender(): void {
    if (this.frameId === null) this.frameId = requestAnimationFrame(() => this.render())
  }

  private emit(kind: DrawingChange['kind']): void {
    this.options.onChange({ kind, state: this.getState() })
  }

  addLayer(): void {
    if (this.layers.length >= 8) return
    const layer: DrawingLayer = {
      id: crypto.randomUUID(),
      name: `그리기 ${this.layers.length + 1}`,
      visible: true,
      opacity: 1,
    }
    this.layers.push(layer)
    this.activeLayerId = layer.id
    this.requestRender()
    this.emit('content')
  }

  duplicateLayer(layerId: string): void {
    if (this.layers.length >= 8) return
    const index = this.layers.findIndex((layer) => layer.id === layerId)
    if (index < 0) return
    const source = this.layers[index]
    const layer: DrawingLayer = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} 복사본`,
    }
    this.layers.splice(index + 1, 0, layer)
    this.history.duplicateLayer(source.id, layer.id)
    this.activeLayerId = layer.id
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  deleteLayer(layerId: string): void {
    if (this.layers.length <= 1) return
    const index = this.layers.findIndex((layer) => layer.id === layerId)
    if (index < 0) return
    this.layers.splice(index, 1)
    this.history.removeLayer(layerId)
    if (this.activeLayerId === layerId) {
      this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)].id
    }
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  selectLayer(layerId: string): void {
    if (!this.layers.some((layer) => layer.id === layerId)) return
    this.activeLayerId = layerId
    this.emit('state')
  }

  toggleLayer(layerId: string): void {
    const layer = this.layers.find((item) => item.id === layerId)
    if (!layer) return
    layer.visible = !layer.visible
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    const layer = this.layers.find((item) => item.id === layerId)
    if (!layer) return
    layer.opacity = Math.min(1, Math.max(0.05, opacity))
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  moveLayer(layerId: string, direction: -1 | 1): void {
    const index = this.layers.findIndex((layer) => layer.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= this.layers.length) return
    const [layer] = this.layers.splice(index, 1)
    this.layers.splice(target, 0, layer)
    this.replayLayers()
    this.requestRender()
    this.emit('content')
  }

  private replayLayers(): void {
    replayStrokes(this.committed, this.history.getStrokes(), this.layers)
  }

  private configureDocument(width: number, height: number, background: string): void {
    this.documentWidth = width
    this.documentHeight = height
    this.documentBackground = background
    if (this.committed.width !== width) this.committed.width = width
    if (this.committed.height !== height) this.committed.height = height
    if (this.preview.width !== width) this.preview.width = width
    if (this.preview.height !== height) this.preview.height = height
  }

  private async replaceBackgroundImage(
    blob: Blob | null,
    state?: BackgroundImageState,
  ): Promise<void> {
    this.releaseBackgroundImage()
    this.backgroundAsset = blob
    this.backgroundImageState = blob && state ? { ...state } : undefined
    if (!blob || !state) return
    if ('createImageBitmap' in window) {
      this.backgroundImage = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return
    }
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      await image.decode()
      this.backgroundImage = image
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  private releaseBackgroundImage(): void {
    if (typeof ImageBitmap !== 'undefined' && this.backgroundImage instanceof ImageBitmap) {
      this.backgroundImage.close()
    }
    this.backgroundImage = null
  }

  dispose(): void {
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('wheel', this.onWheel)
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer)
    clearCanvas(this.preview)
    this.releaseBackgroundImage()
  }
}

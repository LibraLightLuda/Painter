import {
  fitTransform,
  persistView,
  preserveCenterOnResize,
  screenToCanvas,
  viewAroundGesture,
} from './coordinates'
import { StrokeHistory } from './history'
import { GESTURE, InputMachine, type InputAction } from './inputMachine'
import {
  canvasToBlob,
  clearCanvas,
  drawStroke,
  drawStrokeIncrement,
  drawViewport,
  renderFullCanvas,
  replayStrokes,
  supportsIncrementalPreview,
} from './renderer'
import { getCanvasPerformanceProfile } from './performanceProfile'
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
  type WordGuide,
} from './types'
import { normalizeWordGuide } from '../words/randomWord'
import { decodeImageBlob } from '../images/decodeImage'

export interface DrawingState {
  canUndo: boolean
  canRedo: boolean
  scale: number
  inputMode: string
  brush: BrushSettings
  layers: DrawingLayer[]
  activeLayerId: string
  wordGuide?: WordGuide
}

export interface DrawingChange {
  kind: 'content' | 'view' | 'state'
  state: DrawingState
  source?: 'user' | 'automatic'
}

interface DrawingControllerOptions {
  width: number
  height: number
  background: string
  onChange: (change: DrawingChange) => void
}

function stabilizedPoint(previous: Point, next: Point, amount: number): Point {
  const strength = Math.min(0.92, Math.max(0, amount) * 0.92)
  const ratio = 1 - strength
  return {
    ...next,
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio,
    pressure: (previous.pressure ?? 1) + ((next.pressure ?? 1) - (previous.pressure ?? 1)) * ratio,
  }
}

function adaptiveFitPadding(width: number, height: number): number {
  return Math.min(32, Math.max(8, Math.min(width, height) * 0.025))
}

export class DrawingController {
  private readonly history = new StrokeHistory(50)
  private readonly input = new InputMachine()
  private readonly committed = document.createElement('canvas')
  private readonly preview = document.createElement('canvas')
  private readonly performanceProfile = getCanvasPerformanceProfile()
  private view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 }
  private viewportWidth = 0
  private viewportHeight = 0
  private dpr = 1
  private currentStroke: Stroke | null = null
  private previewRenderedPointCount = 0
  private previewBrushWidth = 0
  private pointerOrigin: { left: number; top: number } | null = null
  private gestureStartView: ViewTransform | null = null
  private interruptedStrokeId: string | null = null
  private frameId: number | null = null
  private fullRenderRequested = false
  private settleTimer: number | null = null
  private disposed = false
  private autoFitView = true
  private documentWidth: number
  private documentHeight: number
  private documentBackground: string
  private documentId = 'active-canvas'
  private brush: BrushSettings = {
    tool: 'pen',
    color: '#1e1f1d',
    size: 4,
    opacity: 1,
    flow: 1,
    hardness: 0.95,
    spacing: 0.1,
    stabilization: 0.35,
    pressure: true,
    shapeFill: false,
    tolerance: 24,
  }
  private previousDrawingTool: BrushSettings['tool'] = 'pen'
  private backgroundAsset: Blob | null = null
  private backgroundImage: CanvasImageSource | null = null
  private backgroundImageRelease: (() => void) | null = null
  private backgroundImageState: BackgroundImageState | undefined
  private wordGuide: WordGuide | undefined
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
    const rect = this.canvas.getBoundingClientRect()
    this.pointerOrigin = { left: rect.left, top: rect.top }
    this.process(this.input.pointerDown(this.eventPoint(event, this.pointerOrigin)))
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.input.hasPointer(event.pointerId)) return
    event.preventDefault()
    const coalesced = event.getCoalescedEvents?.()
    const samples = coalesced?.length ? coalesced : [event]
    const origin = this.pointerOrigin ?? this.canvas.getBoundingClientRect()
    const points = samples.map((sample) => this.eventPoint(sample, origin))
    this.process(this.input.pointerMove(event.pointerId, points))
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.input.hasPointer(event.pointerId)) return
    event.preventDefault()
    const origin = this.pointerOrigin ?? this.canvas.getBoundingClientRect()
    this.process(this.input.pointerUp(this.eventPoint(event, origin)))
    if (this.input.mode === 'settling') this.pointerOrigin = null
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
    this.pointerOrigin = null
  }

  private readonly onLostPointerCapture = (event: PointerEvent) => {
    if (this.input.hasPointer(event.pointerId)) {
      this.process(this.input.cancel())
      this.pointerOrigin = null
    }
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
    document.documentElement.classList.toggle('performance-lite', this.performanceProfile.reducedEffects)
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
    this.dpr = Math.min(window.devicePixelRatio || 1, this.performanceProfile.maxPixelRatio)
    const pixelWidth = Math.max(1, Math.round(width * this.dpr))
    const pixelHeight = Math.max(1, Math.round(height * this.dpr))
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight

    if (!oldWidth || !oldHeight || this.autoFitView) {
      this.view = fitTransform(
        this.documentWidth,
        this.documentHeight,
        width,
        height,
        adaptiveFitPadding(width, height),
      )
    } else {
      this.view = preserveCenterOnResize(this.view, oldWidth, oldHeight, width, height)
    }
    this.requestRender()
    this.emit('view', 'automatic')
  }

  async load(snapshot: ProjectSnapshot, backgroundAsset?: Blob): Promise<void> {
    if (snapshot.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      throw new Error('지원하지 않는 작업 데이터 버전입니다.')
    }
    this.configureDocument(snapshot.width, snapshot.height, snapshot.background)
    this.documentId = snapshot.id
    await this.replaceBackgroundImage(backgroundAsset ?? null, snapshot.backgroundImage)
    this.wordGuide = normalizeWordGuide(snapshot.wordGuide)
    this.layers = snapshot.layers?.length
      ? structuredClone(snapshot.layers)
      : [{ id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }]
    this.activeLayerId = this.layers.some((layer) => layer.id === snapshot.activeLayerId)
      ? snapshot.activeLayerId!
      : this.layers[0].id
    this.history.restore(snapshot.history)
    this.replayLayers()
    clearCanvas(this.preview)
    this.autoFitView = true
    if (this.viewportWidth && this.viewportHeight) this.fitToScreen(false)
    this.requestRender()
    this.emit('state')
  }

  fitToScreen(userInitiated = false): void {
    this.cancelActive()
    this.autoFitView = true
    this.view = fitTransform(
      this.documentWidth,
      this.documentHeight,
      this.viewportWidth,
      this.viewportHeight,
      adaptiveFitPadding(this.viewportWidth, this.viewportHeight),
    )
    this.requestRender()
    this.emit('view', userInitiated ? 'user' : 'automatic')
  }

  zoomBy(factor: number, anchor?: Point): void {
    this.cancelActive()
    this.autoFitView = false
    const focus = anchor ?? {
      x: this.viewportWidth / 2,
      y: this.viewportHeight / 2,
      time: performance.now(),
    }
    this.view = viewAroundGesture(this.view, focus, focus, factor)
    this.requestRender()
    this.emit('view', 'user')
  }

  setBrush(next: Partial<BrushSettings>): void {
    this.cancelActive()
    if (this.input.mode === 'settling') this.input.finishSettling()
    this.brush = {
      ...this.brush,
      ...next,
      size: Math.min(160, Math.max(1, next.size ?? this.brush.size)),
      opacity: Math.min(1, Math.max(0.05, next.opacity ?? this.brush.opacity)),
      flow: Math.min(1, Math.max(0.05, next.flow ?? this.brush.flow)),
      hardness: Math.min(1, Math.max(0.02, next.hardness ?? this.brush.hardness)),
      spacing: Math.min(1, Math.max(0.04, next.spacing ?? this.brush.spacing)),
      stabilization: Math.min(1, Math.max(0, next.stabilization ?? this.brush.stabilization)),
      tolerance: Math.min(255, Math.max(0, next.tolerance ?? this.brush.tolerance)),
    }
    if (next.tool && next.tool !== 'eyedropper') this.previousDrawingTool = next.tool
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
    this.wordGuide = normalizeWordGuide(snapshot.wordGuide)
    this.history.clear()
    this.layers = snapshot.layers?.length
      ? structuredClone(snapshot.layers)
      : [{ id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }]
    this.activeLayerId = snapshot.activeLayerId ?? this.layers[0].id
    this.currentStroke = null
    clearCanvas(this.committed)
    clearCanvas(this.preview)
    this.autoFitView = true
    this.fitToScreen(false)
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
      wordGuide: this.wordGuide ? { ...this.wordGuide } : undefined,
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

  async setBackgroundImage(blob: Blob, state: BackgroundImageState, clearWordGuide = false): Promise<void> {
    this.cancelActive()
    if (clearWordGuide) this.wordGuide = undefined
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

  setWordGuide(guide: WordGuide): void {
    this.cancelActive()
    this.wordGuide = normalizeWordGuide(guide)
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
      wordGuide: this.wordGuide ? { ...this.wordGuide } : undefined,
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
      this.wordGuide,
    )
  }

  private eventPoint(event: PointerEvent, rect: Pick<DOMRect, 'left' | 'top'>): ScreenPoint {
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      time: event.timeStamp,
      pressure: event.pointerType === 'mouse' ? 1 : (event.pressure > 0 ? event.pressure : 1),
      tiltX: event.tiltX,
      tiltY: event.tiltY,
    }
  }

  private process(actions: InputAction[]): void {
    let committedId: string | null = null
    for (const action of actions) {
      switch (action.type) {
        case 'begin-stroke': {
          const point = screenToCanvas(action.point, this.view)
          if (this.brush.tool === 'eyedropper') {
            this.brush = {
              ...this.brush,
              color: this.sampleColor(point),
              tool: this.previousDrawingTool,
            }
            this.emit('state')
            break
          }
          this.currentStroke = {
            id: crypto.randomUUID(),
            ...this.brush,
            seed: Math.floor(Math.random() * 0x7fffffff),
            layerId: this.activeLayerId,
            points: [point],
          }
          this.clearPreview()
          this.requestStrokeRender()
          break
        }
        case 'append-stroke': {
          if (!this.currentStroke) break
          const next = action.points.map((point) => screenToCanvas(point, this.view))
          if (
            this.currentStroke.tool === 'line' ||
            this.currentStroke.tool === 'rectangle' ||
            this.currentStroke.tool === 'ellipse' ||
            this.currentStroke.tool === 'arrow'
          ) {
            this.currentStroke.points = [this.currentStroke.points[0], next.at(-1)!]
          } else {
            const stabilized = this.currentStroke.points
            for (const point of next) {
              const previous = stabilized.at(-1)!
              const candidate = stabilizedPoint(previous, point, this.currentStroke.stabilization ?? 0)
              if (
                candidate.x !== previous.x
                || candidate.y !== previous.y
                || candidate.pressure !== previous.pressure
              ) {
                stabilized.push(candidate)
              }
            }
          }
          this.requestStrokeRender()
          break
        }
        case 'commit-stroke': {
          committedId = this.commitStroke()
          break
        }
        case 'begin-gesture': {
          this.autoFitView = false
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
          this.emit('view', 'user')
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
    this.clearPreview()
    if (!stroke || stroke.points.length === 0) return null
    this.history.add(stroke)
    if (this.canAppendToCommitted(stroke)) {
      const context = this.committed.getContext('2d', { alpha: true })
      if (context) drawStroke(context, stroke)
      else this.replayLayers()
    } else {
      this.replayLayers()
    }
    this.requestRender()
    this.emit('content')
    return stroke.id
  }

  private sampleColor(point: Point): string {
    const output = this.renderOutput()
    const context = output.getContext('2d')
    if (!context) return this.brush.color
    const x = Math.min(output.width - 1, Math.max(0, Math.floor(point.x)))
    const y = Math.min(output.height - 1, Math.max(0, Math.floor(point.y)))
    const [red, green, blue] = context.getImageData(x, y, 1, 1).data
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
  }

  private render(): void {
    this.frameId = null
    if (this.disposed) return
    const fullRender = this.fullRenderRequested
    this.fullRenderRequested = false
    if (
      !fullRender
      && this.currentStroke
      && this.currentStroke.tool !== 'fill'
      && supportsIncrementalPreview(this.currentStroke)
    ) {
      this.renderStrokeDirectlyToDisplay(this.currentStroke)
      return
    }

    const previewContext = this.preview.getContext('2d')
    if (previewContext) {
      previewContext.clearRect(0, 0, this.preview.width, this.preview.height)
      if (this.currentStroke && this.currentStroke.tool !== 'fill') {
        const layerOpacity = this.layers.find((layer) => layer.id === this.activeLayerId)?.opacity ?? 1
        const previewStroke = {
          ...this.currentStroke,
          opacity: this.currentStroke.opacity * layerOpacity,
        }
        drawStroke(previewContext, previewStroke, this.documentBackground)
        this.previewRenderedPointCount = previewStroke.points.length
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
      this.wordGuide,
      !this.performanceProfile.reducedEffects
        && this.currentStroke === null
        && this.input.mode !== 'gesture',
    )
  }

  private renderStrokeDirectlyToDisplay(stroke: Stroke): void {
    const context = this.canvas.getContext('2d')
    if (!context) return
    const layerOpacity = this.layers.find((layer) => layer.id === this.activeLayerId)?.opacity ?? 1
    const previewStroke = { ...stroke, opacity: stroke.opacity * layerOpacity }
    const pixelScale = this.dpr * this.view.scale

    context.save()
    context.setTransform(
      pixelScale,
      0,
      0,
      pixelScale,
      this.dpr * this.view.offsetX,
      this.dpr * this.view.offsetY,
    )
    context.beginPath()
    context.rect(0, 0, this.documentWidth, this.documentHeight)
    context.clip()
    this.previewBrushWidth = drawStrokeIncrement(
      context,
      previewStroke,
      this.previewRenderedPointCount,
      this.documentBackground,
      this.previewBrushWidth || previewStroke.size,
    )
    context.restore()
    this.previewRenderedPointCount = previewStroke.points.length
  }

  private requestStrokeRender(): void {
    this.requestRender(false)
  }

  private requestRender(full = true): void {
    if (full) this.fullRenderRequested = true
    if (this.frameId === null) this.frameId = requestAnimationFrame(() => this.render())
  }

  private emit(kind: DrawingChange['kind'], source?: DrawingChange['source']): void {
    this.options.onChange({ kind, state: this.getState(), source })
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

  private canAppendToCommitted(stroke: Stroke): boolean {
    if (this.layers.length !== 1) return false
    const layer = this.layers[0]
    return layer.visible && layer.opacity === 1 && (stroke.layerId ?? layer.id) === layer.id
  }

  private clearPreview(): void {
    clearCanvas(this.preview)
    this.previewRenderedPointCount = 0
    this.previewBrushWidth = 0
  }

  private configureDocument(width: number, height: number, background: string): void {
    this.documentWidth = width
    this.documentHeight = height
    this.documentBackground = background
    if (this.committed.width !== width) this.committed.width = width
    if (this.committed.height !== height) this.committed.height = height
    if (this.preview.width !== width) this.preview.width = width
    if (this.preview.height !== height) this.preview.height = height
    this.previewRenderedPointCount = 0
    this.previewBrushWidth = 0
  }

  private async replaceBackgroundImage(
    blob: Blob | null,
    state?: BackgroundImageState,
  ): Promise<void> {
    this.releaseBackgroundImage()
    this.backgroundAsset = null
    this.backgroundImageState = undefined
    if (!blob || !state) return
    const decoded = await decodeImageBlob(blob)
    this.backgroundAsset = blob
    this.backgroundImageState = { ...state }
    this.backgroundImage = decoded.source
    this.backgroundImageRelease = decoded.release
  }

  private releaseBackgroundImage(): void {
    this.backgroundImageRelease?.()
    this.backgroundImageRelease = null
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

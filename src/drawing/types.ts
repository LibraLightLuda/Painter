export const PROJECT_SCHEMA_VERSION = 1
export const DEFAULT_PROJECT_ID = 'active-canvas'
export const DEFAULT_CANVAS = { width: 1080, height: 1080 } as const

export type BrushTool =
  | 'pen'
  | 'pencil'
  | 'marker'
  | 'brush'
  | 'highlighter'
  | 'spray'
  | 'eraser'
  | 'eyedropper'
  | 'fill'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'

export type ShapeTool = 'line' | 'rectangle' | 'ellipse' | 'arrow'

export interface BrushSettings {
  tool: BrushTool
  color: string
  size: number
  opacity: number
  flow: number
  hardness: number
  spacing: number
  stabilization: number
  pressure: boolean
  shapeFill: boolean
  tolerance: number
}

export interface DrawingLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
}

export interface Point {
  x: number
  y: number
  time: number
  pressure?: number
  tiltX?: number
  tiltY?: number
}

export interface ScreenPoint extends Point {
  pointerId: number
  pointerType: string
}

export interface Stroke {
  id: string
  tool: BrushTool
  color: string
  size: number
  opacity: number
  flow?: number
  hardness?: number
  spacing?: number
  stabilization?: number
  pressure?: boolean
  shapeFill?: boolean
  tolerance?: number
  seed?: number
  layerId?: string
  points: Point[]
}

export interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export interface PersistedView {
  scale: number
  centerX: number
  centerY: number
}

export interface BackgroundImageState {
  mimeType: string
  width: number
  height: number
  mode: 'fit' | 'fill'
  rotation: 0 | 90 | 180 | 270
}

export interface HistorySnapshot {
  done: Stroke[]
  undone: Stroke[]
  baseCount: number
}

export interface ProjectSnapshot {
  schemaVersion: number
  id: string
  title: string
  width: number
  height: number
  background: string
  backgroundImage?: BackgroundImageState
  layers?: DrawingLayer[]
  activeLayerId?: string
  history: HistorySnapshot
  view: PersistedView
  updatedAt: number
}

export interface ProjectRevision {
  key: string
  projectId: string
  status: 'pending' | 'complete'
  createdAt: number
  payload: ProjectSnapshot
  checkpoint: Blob
  backgroundAsset?: Blob
}

export interface ProjectMeta {
  id: string
  title: string
  width: number
  height: number
  background: string
  activeRevisionKey: string | null
  previousRevisionKey: string | null
  updatedAt: number
  schemaVersion: number
  deletedAt?: number
}

export type SaveStatus = 'loading' | 'unsaved' | 'saving' | 'saved' | 'error'

export function createEmptySnapshot(now = Date.now(), id = DEFAULT_PROJECT_ID): ProjectSnapshot {
  const layer: DrawingLayer = { id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    title: '새 그림',
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    background: '#ffffff',
    layers: [layer],
    activeLayerId: layer.id,
    history: { done: [], undone: [], baseCount: 0 },
    view: { scale: 1, centerX: DEFAULT_CANVAS.width / 2, centerY: DEFAULT_CANVAS.height / 2 },
    updatedAt: now,
  }
}

import type { Point, ScreenPoint } from './types'

export const GESTURE = {
  tapDurationMs: 220,
  moveThresholdPx: 12,
  pinchThreshold: 0.03,
  settleMs: 50,
} as const

export type InputMode = 'idle' | 'stroke' | 'gesture' | 'settling'

export type InputAction =
  | { type: 'begin-stroke'; point: ScreenPoint }
  | { type: 'append-stroke'; points: ScreenPoint[] }
  | { type: 'commit-stroke' }
  | { type: 'begin-gesture'; initialCentroid: Point; initialDistance: number }
  | {
      type: 'update-gesture'
      initialCentroid: Point
      currentCentroid: Point
      scaleFactor: number
    }
  | { type: 'undo-gesture' }
  | { type: 'settle' }

interface GestureState {
  startedAt: number
  initial: Map<number, ScreenPoint>
  initialCentroid: Point
  initialDistance: number
  maxMove: number
  activated: boolean
  pointerCount: number
}

function centroid(points: ScreenPoint[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    time: Math.max(...points.map((point) => point.time)),
  }
}

function distance(points: ScreenPoint[]): number {
  if (points.length < 2) return 0
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
}

export class InputMachine {
  mode: InputMode = 'idle'
  private pointers = new Map<number, ScreenPoint>()
  private gesture: GestureState | null = null

  pointerDown(point: ScreenPoint): InputAction[] {
    if (this.mode === 'settling') return []
    this.pointers.set(point.pointerId, point)

    if (this.mode === 'idle' && this.pointers.size === 1) {
      this.mode = 'stroke'
      return [{ type: 'begin-stroke', point }]
    }

    if (this.mode === 'stroke' && this.pointers.size === 2) {
      const points = [...this.pointers.values()]
      const initialCentroid = centroid(points)
      const initialDistance = distance(points)
      this.gesture = {
        startedAt: Math.min(...points.map((item) => item.time)),
        initial: new Map(points.map((item) => [item.pointerId, { ...item }])),
        initialCentroid,
        initialDistance,
        maxMove: 0,
        activated: false,
        pointerCount: 2,
      }
      this.mode = 'gesture'
      return [
        { type: 'commit-stroke' },
        { type: 'begin-gesture', initialCentroid, initialDistance },
      ]
    }

    if (this.mode === 'gesture' && this.gesture) {
      this.gesture.pointerCount = Math.max(this.gesture.pointerCount, this.pointers.size)
    }
    return []
  }

  pointerMove(pointerId: number, points: ScreenPoint[]): InputAction[] {
    if (!this.pointers.has(pointerId) || points.length === 0) return []
    const latest = points.at(-1)!
    this.pointers.set(pointerId, latest)

    if (this.mode === 'stroke') return [{ type: 'append-stroke', points }]
    if (this.mode !== 'gesture' || !this.gesture || this.pointers.size < 2) return []

    for (const point of this.pointers.values()) {
      const initial = this.gesture.initial.get(point.pointerId) ?? point
      this.gesture.maxMove = Math.max(
        this.gesture.maxMove,
        Math.hypot(point.x - initial.x, point.y - initial.y),
      )
    }

    const currentPoints = [...this.pointers.values()].slice(0, 2)
    const currentDistance = distance(currentPoints)
    const scaleFactor = this.gesture.initialDistance
      ? currentDistance / this.gesture.initialDistance
      : 1
    const pinchChange = Math.abs(scaleFactor - 1)
    if (
      !this.gesture.activated &&
      (this.gesture.maxMove > GESTURE.moveThresholdPx || pinchChange > GESTURE.pinchThreshold)
    ) {
      this.gesture.activated = true
    }

    if (!this.gesture.activated) return []
    return [
      {
        type: 'update-gesture',
        initialCentroid: this.gesture.initialCentroid,
        currentCentroid: centroid(currentPoints),
        scaleFactor,
      },
    ]
  }

  pointerUp(point: ScreenPoint): InputAction[] {
    if (!this.pointers.has(point.pointerId)) return []
    this.pointers.set(point.pointerId, point)

    if (this.mode === 'stroke') {
      this.pointers.delete(point.pointerId)
      this.mode = 'settling'
      return [
        { type: 'append-stroke', points: [point] },
        { type: 'commit-stroke' },
        { type: 'settle' },
      ]
    }

    if (this.mode === 'gesture') {
      this.pointers.delete(point.pointerId)
      if (this.pointers.size > 0) return []

      const gesture = this.gesture
      this.gesture = null
      this.mode = 'settling'
      const isTap =
        gesture !== null &&
        gesture.pointerCount === 2 &&
        !gesture.activated &&
        point.time - gesture.startedAt <= GESTURE.tapDurationMs &&
        gesture.maxMove <= GESTURE.moveThresholdPx
      return isTap ? [{ type: 'undo-gesture' }, { type: 'settle' }] : [{ type: 'settle' }]
    }

    this.pointers.delete(point.pointerId)
    return []
  }

  cancel(): InputAction[] {
    const shouldCommit = this.mode === 'stroke'
    this.pointers.clear()
    this.gesture = null
    this.mode = 'settling'
    return shouldCommit ? [{ type: 'commit-stroke' }, { type: 'settle' }] : [{ type: 'settle' }]
  }

  finishSettling(): void {
    if (this.mode === 'settling') this.mode = 'idle'
  }

  hasPointer(pointerId: number): boolean {
    return this.pointers.has(pointerId)
  }
}

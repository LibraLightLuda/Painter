import type { PersistedView, Point, ViewTransform } from './types'

export const MIN_SCALE = 0.05
export const MAX_SCALE = 8

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function fitTransform(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 16,
): ViewTransform {
  const usableWidth = Math.max(1, viewportWidth - padding * 2)
  const usableHeight = Math.max(1, viewportHeight - padding * 2)
  const scale = clampScale(Math.min(usableWidth / canvasWidth, usableHeight / canvasHeight))
  return {
    scale,
    offsetX: (viewportWidth - canvasWidth * scale) / 2,
    offsetY: (viewportHeight - canvasHeight * scale) / 2,
  }
}

export function screenToCanvas(point: Point, view: ViewTransform): Point {
  return {
    ...point,
    x: (point.x - view.offsetX) / view.scale,
    y: (point.y - view.offsetY) / view.scale,
  }
}

export function canvasToScreen(point: Point, view: ViewTransform): Point {
  return {
    ...point,
    x: point.x * view.scale + view.offsetX,
    y: point.y * view.scale + view.offsetY,
  }
}

export function viewAroundGesture(
  start: ViewTransform,
  initialCentroid: Point,
  currentCentroid: Point,
  scaleFactor: number,
): ViewTransform {
  const scale = clampScale(start.scale * scaleFactor)
  const ratio = scale / start.scale
  return {
    scale,
    offsetX: currentCentroid.x - (initialCentroid.x - start.offsetX) * ratio,
    offsetY: currentCentroid.y - (initialCentroid.y - start.offsetY) * ratio,
  }
}

export function persistView(
  view: ViewTransform,
  viewportWidth: number,
  viewportHeight: number,
): PersistedView {
  return {
    scale: view.scale,
    centerX: (viewportWidth / 2 - view.offsetX) / view.scale,
    centerY: (viewportHeight / 2 - view.offsetY) / view.scale,
  }
}

export function restoreView(
  persisted: PersistedView,
  viewportWidth: number,
  viewportHeight: number,
): ViewTransform {
  const scale = clampScale(persisted.scale)
  return {
    scale,
    offsetX: viewportWidth / 2 - persisted.centerX * scale,
    offsetY: viewportHeight / 2 - persisted.centerY * scale,
  }
}

export function preserveCenterOnResize(
  view: ViewTransform,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): ViewTransform {
  if (!oldWidth || !oldHeight) return view
  const centerX = (oldWidth / 2 - view.offsetX) / view.scale
  const centerY = (oldHeight / 2 - view.offsetY) / view.scale
  return {
    ...view,
    offsetX: newWidth / 2 - centerX * view.scale,
    offsetY: newHeight / 2 - centerY * view.scale,
  }
}

import type { HistorySnapshot, Stroke } from './types'

export class StrokeHistory {
  private done: Stroke[] = []
  private undone: Stroke[] = []
  private baseCount = 0

  constructor(private readonly limit = 50) {}

  add(stroke: Stroke): void {
    this.done.push(stroke)
    this.undone = []
    if (this.done.length - this.baseCount > this.limit) this.baseCount += 1
  }

  undo(): Stroke | null {
    if (!this.canUndo()) return null
    const stroke = this.done.pop() ?? null
    if (stroke) this.undone.push(stroke)
    return stroke
  }

  redo(): Stroke | null {
    const stroke = this.undone.pop() ?? null
    if (stroke) this.done.push(stroke)
    return stroke
  }

  discardLastIf(id: string | null): boolean {
    if (!id || this.done.at(-1)?.id !== id) return false
    this.done.pop()
    this.baseCount = Math.min(this.baseCount, this.done.length)
    return true
  }

  canUndo(): boolean {
    return this.done.length > this.baseCount
  }

  canRedo(): boolean {
    return this.undone.length > 0
  }

  getStrokes(): readonly Stroke[] {
    return this.done
  }

  clear(): void {
    this.done = []
    this.undone = []
    this.baseCount = 0
  }

  removeLayer(layerId: string): void {
    this.done = this.done.filter((stroke) => stroke.layerId !== layerId)
    this.undone = this.undone.filter((stroke) => stroke.layerId !== layerId)
    this.baseCount = Math.min(this.baseCount, this.done.length)
  }

  duplicateLayer(sourceId: string, targetId: string): void {
    const copies = this.done
      .filter((stroke) => stroke.layerId === sourceId)
      .map((stroke) => ({
        ...structuredClone(stroke),
        id: crypto.randomUUID(),
        layerId: targetId,
      }))
    for (const stroke of copies) this.add(stroke)
  }

  serialize(): HistorySnapshot {
    return {
      done: structuredClone(this.done),
      undone: structuredClone(this.undone),
      baseCount: this.baseCount,
    }
  }

  restore(snapshot: HistorySnapshot): void {
    this.done = structuredClone(snapshot.done)
    this.undone = structuredClone(snapshot.undone)
    this.baseCount = Math.min(Math.max(0, snapshot.baseCount), this.done.length)
  }
}

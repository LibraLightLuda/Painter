import { StrokeHistory } from '../src/drawing/history'
import type { Stroke } from '../src/drawing/types'

function stroke(id: string): Stroke {
  return {
    id,
    tool: 'pen',
    color: '#000000',
    size: 4,
    opacity: 1,
    points: [{ x: 0, y: 0, time: 0 }],
  }
}

describe('StrokeHistory', () => {
  it('supports undo and redo and clears redo after new work', () => {
    const history = new StrokeHistory(50)
    history.add(stroke('a'))
    history.add(stroke('b'))
    expect(history.undo()?.id).toBe('b')
    expect(history.canRedo()).toBe(true)
    history.add(stroke('c'))
    expect(history.canRedo()).toBe(false)
    expect(history.getStrokes().map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('limits undo depth without deleting project strokes', () => {
    const history = new StrokeHistory(2)
    history.add(stroke('a'))
    history.add(stroke('b'))
    history.add(stroke('c'))
    expect(history.getStrokes()).toHaveLength(3)
    expect(history.undo()?.id).toBe('c')
    expect(history.undo()?.id).toBe('b')
    expect(history.undo()).toBeNull()
    expect(history.getStrokes().map((item) => item.id)).toEqual(['a'])
  })

  it('restores redo state and the undo floor', () => {
    const history = new StrokeHistory(2)
    history.restore({ done: [stroke('a'), stroke('b')], undone: [stroke('c')], baseCount: 1 })
    expect(history.undo()?.id).toBe('b')
    expect(history.undo()).toBeNull()
    expect(history.redo()?.id).toBe('b')
  })

  it('clears all work for a new drawing', () => {
    const history = new StrokeHistory(50)
    history.add(stroke('a'))
    history.undo()
    history.clear()
    expect(history.getStrokes()).toHaveLength(0)
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
  })
})

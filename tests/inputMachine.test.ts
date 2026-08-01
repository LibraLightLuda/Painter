import { GESTURE, InputMachine } from '../src/drawing/inputMachine'
import type { ScreenPoint } from '../src/drawing/types'

function point(pointerId: number, x: number, y: number, time: number): ScreenPoint {
  return { pointerId, pointerType: 'touch', x, y, time }
}

describe('InputMachine', () => {
  it('commits a stroke when the second pointer enters and stops brush samples', () => {
    const machine = new InputMachine()
    expect(machine.pointerDown(point(1, 10, 10, 0))[0].type).toBe('begin-stroke')
    expect(machine.pointerDown(point(2, 30, 10, 20)).map((action) => action.type)).toEqual([
      'commit-stroke',
      'begin-gesture',
    ])
    expect(machine.pointerMove(1, [point(1, 14, 10, 30)]).some((action) => action.type === 'append-stroke')).toBe(false)
    expect(machine.mode).toBe('gesture')
  })

  it('recognizes a two-finger tap as undo', () => {
    const machine = new InputMachine()
    machine.pointerDown(point(1, 10, 10, 0))
    machine.pointerDown(point(2, 30, 10, 20))
    expect(machine.pointerUp(point(1, 10, 10, 100))).toEqual([])
    expect(machine.pointerUp(point(2, 30, 10, 120)).map((action) => action.type)).toEqual([
      'undo-gesture',
      'settle',
    ])
  })

  it('does not turn a pinch into undo', () => {
    const machine = new InputMachine()
    machine.pointerDown(point(1, 10, 10, 0))
    machine.pointerDown(point(2, 110, 10, 10))
    const actions = machine.pointerMove(2, [point(2, 130, 10, 30)])
    expect(actions[0].type).toBe('update-gesture')
    machine.pointerUp(point(1, 10, 10, 80))
    expect(machine.pointerUp(point(2, 130, 10, 100)).map((action) => action.type)).toEqual(['settle'])
  })

  it('uses the documented gesture thresholds', () => {
    expect(GESTURE.tapDurationMs).toBe(220)
    expect(GESTURE.moveThresholdPx).toBe(12)
    expect(GESTURE.pinchThreshold).toBe(0.03)
    expect(GESTURE.settleMs).toBe(50)
  })

  it('commits visible work on cancellation and recovers to idle', () => {
    const machine = new InputMachine()
    machine.pointerDown(point(1, 10, 10, 0))
    expect(machine.cancel().map((action) => action.type)).toEqual(['commit-stroke', 'settle'])
    machine.finishSettling()
    expect(machine.mode).toBe('idle')
  })
})

import { describe, expect, it } from 'vitest'
import {
  circledStepNumber,
  createHangulSyllableGuides,
  createWritingSteps,
  decomposeHangul,
  getJamoStrokeGuide,
} from '../src/words/strokeOrder'

describe('word stroke order guide', () => {
  it('decomposes Hangul syllables in initial, medial and final order', () => {
    expect(decomposeHangul('한')).toEqual(['ㅎ', 'ㅏ', 'ㄴ'])
    expect(decomposeHangul('가')).toEqual(['ㄱ', 'ㅏ'])
  })

  it('creates numbered writing steps for every visible character', () => {
    expect(createWritingSteps({ language: 'ko', text: '한글' })).toEqual([
      { character: '한', components: ['ㅎ', 'ㅏ', 'ㄴ'] },
      { character: '글', components: ['ㄱ', 'ㅡ', 'ㄹ'] },
    ])
    expect(circledStepNumber(0)).toBe('①')
    expect(circledStepNumber(11)).toBe('⑫')
  })

  it('guides 책상 from syllables to jamo and each directional stroke', () => {
    const [book, desk] = createHangulSyllableGuides('책상')
    expect(book.components.map(({ role, jamo }) => [role, jamo])).toEqual([
      ['초성', 'ㅊ'], ['중성', 'ㅐ'], ['받침', 'ㄱ'],
    ])
    expect(book.components[0].strokes.map(({ direction }) => direction)).toEqual(['→', '→', '↘', '↙'])
    expect(book.components[1]).toMatchObject({ jamo: 'ㅐ', parts: ['ㅏ', 'ㅣ'] })
    expect(book.components[1].strokes.map(({ direction }) => direction)).toEqual(['↓', '→', '↓'])
    expect(book.components[2].strokes.map(({ direction }) => direction)).toEqual(['→', '↓'])
    expect(desk.components.map(({ jamo }) => jamo)).toEqual(['ㅅ', 'ㅏ', 'ㅇ'])
  })

  it('expands double and compound jamo before numbering their strokes', () => {
    const compoundFinal = getJamoStrokeGuide('ㅄ')
    expect(compoundFinal.parts).toEqual(['ㅂ', 'ㅅ'])
    expect(compoundFinal.strokes).toHaveLength(6)
    expect(compoundFinal.strokes.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(getJamoStrokeGuide('ㅙ').parts).toEqual(['ㅗ', 'ㅏ', 'ㅣ'])
  })
})

import { describe, expect, it } from 'vitest'
import { circledStepNumber, createWritingSteps, decomposeHangul } from '../src/words/strokeOrder'

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
})

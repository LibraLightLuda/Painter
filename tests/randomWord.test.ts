import { describe, expect, it } from 'vitest'
import { createRandomWordGuide, normalizeWordGuide, WORDS } from '../src/words/randomWord'

function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 0
}

describe('random word guides', () => {
  it('selects a word from each language using an injectable random source', () => {
    expect(createRandomWordGuide(sequence(0, 0))).toEqual({ language: 'en', text: WORDS.en[0] })
    expect(createRandomWordGuide(sequence(0.26, 0))).toEqual({ language: 'ko', text: WORDS.ko[0] })
    expect(createRandomWordGuide(sequence(0.51, 0))).toEqual({ language: 'ja', text: WORDS.ja[0] })
    expect(createRandomWordGuide(sequence(0.99, 0.99))).toEqual({ language: 'zh', text: WORDS.zh.at(-1) })
  })

  it('normalizes saved guides and rejects invalid project data', () => {
    expect(normalizeWordGuide({ language: 'ko', text: '  행복  ' })).toEqual({ language: 'ko', text: '행복' })
    expect(normalizeWordGuide({ language: 'unknown', text: 'hello' })).toBeUndefined()
    expect(normalizeWordGuide({ language: 'en', text: '' })).toBeUndefined()
  })
})

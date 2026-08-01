import type { WordGuide, WordLanguage } from '../drawing/types'

export const WORD_LANGUAGE_LABELS: Record<WordLanguage, string> = {
  en: '영어',
  ko: '한글',
  ja: '일본어',
  zh: '중국어',
}

export const WORDS: Record<WordLanguage, readonly string[]> = {
  en: ['APPLE', 'SMILE', 'DREAM', 'HAPPY', 'LOVE', 'STAR', 'CLOUD', 'FLOWER'],
  ko: ['사랑', '미소', '하늘', '바다', '나무', '구름', '친구', '행복'],
  ja: ['さくら', 'えがお', 'そら', 'うみ', 'ひかり', 'ともだち', 'ゆめ', 'こころ'],
  zh: ['你好', '朋友', '快乐', '梦想', '天空', '大海', '花朵', '阳光'],
}

const languages = Object.keys(WORDS) as WordLanguage[]

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)))
}

export function createRandomWordGuide(random: () => number = Math.random): WordGuide {
  const language = languages[randomIndex(languages.length, random)]
  const words = WORDS[language]
  return { language, text: words[randomIndex(words.length, random)] }
}

export function normalizeWordGuide(value: unknown): WordGuide | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<WordGuide>
  if (!languages.includes(candidate.language as WordLanguage)) return undefined
  if (typeof candidate.text !== 'string') return undefined
  const text = candidate.text.trim().slice(0, 12)
  if (!text) return undefined
  return { language: candidate.language as WordLanguage, text }
}

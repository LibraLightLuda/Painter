import type { WordGuide, WordLanguage } from '../drawing/types'

export const WORD_LANGUAGE_LABELS: Record<WordLanguage, string> = {
  en: '영어',
  ko: '한글',
  ja: '일본어',
  zh: '중국어',
}

export const WORDS: Record<WordLanguage, readonly string[]> = {
  en: [
    'APPLE', 'SMILE', 'DREAM', 'HAPPY', 'LOVE', 'STAR', 'CLOUD', 'FLOWER',
    'FRIEND', 'FAMILY', 'SUN', 'MOON', 'SKY', 'OCEAN', 'TREE', 'RAINBOW',
    'BUTTERFLY', 'HEART', 'HOUSE', 'SCHOOL', 'BOOK', 'PENCIL', 'MUSIC', 'DANCE',
    'SONG', 'GARDEN', 'RIVER', 'MOUNTAIN', 'FOREST', 'BIRD', 'CAT', 'DOG',
    'RABBIT', 'BEAR', 'LION', 'TIGER', 'WHALE', 'DOLPHIN', 'TURTLE', 'FISH',
    'HORSE', 'PANDA', 'KOALA', 'MONKEY', 'ELEPHANT', 'TRAIN', 'ROCKET', 'PLANET',
    'COOKIE', 'CAKE', 'BREAD', 'MILK', 'WATER', 'JUICE', 'ORANGE', 'BANANA',
    'GRAPE', 'PEACH', 'CHERRY', 'LEMON', 'GREEN', 'BLUE', 'YELLOW', 'PURPLE',
  ],
  ko: [
    '사랑', '미소', '하늘', '바다', '나무', '구름', '친구', '행복',
    '가족', '햇살', '달빛', '별빛', '무지개', '꽃', '마음', '꿈',
    '희망', '용기', '감사', '기쁨', '학교', '책', '연필', '음악',
    '노래', '춤', '정원', '강물', '산', '숲', '새', '고양이',
    '강아지', '토끼', '곰', '사자', '호랑이', '고래', '돌고래', '거북이',
    '물고기', '말', '판다', '코알라', '원숭이', '코끼리', '기차', '로켓',
    '행성', '과자', '케이크', '빵', '우유', '물', '주스', '사과',
    '바나나', '포도', '복숭아', '딸기', '레몬', '초록', '파랑', '노랑', '책상',
  ],
  ja: [
    'さくら', 'えがお', 'そら', 'うみ', 'ひかり', 'ともだち', 'ゆめ', 'こころ',
    'かぞく', 'たいよう', 'つき', 'ほし', 'にじ', 'はな', 'あい', 'きぼう',
    'ゆうき', 'ありがとう', 'しあわせ', 'よろこび', 'がっこう', 'ほん', 'えんぴつ', 'おんがく',
    'うた', 'おどり', 'にわ', 'かわ', 'やま', 'もり', 'とり', 'ねこ',
    'いぬ', 'うさぎ', 'くま', 'らいおん', 'とら', 'くじら', 'いるか', 'かめ',
    'さかな', 'うま', 'ぱんだ', 'こあら', 'さる', 'ぞう', 'でんしゃ', 'ろけっと',
    'わくせい', 'くっきー', 'けーき', 'ぱん', 'ぎゅうにゅう', 'みず', 'じゅーす', 'りんご',
    'ばなな', 'ぶどう', 'もも', 'いちご', 'れもん', 'みどり', 'あお', 'きいろ',
  ],
  zh: [
    '你好', '朋友', '快乐', '梦想', '天空', '大海', '花朵', '阳光',
    '家人', '月亮', '星星', '彩虹', '大树', '爱心', '希望', '勇气',
    '谢谢', '喜悦', '学校', '书本', '铅笔', '音乐', '歌曲', '舞蹈',
    '花园', '河流', '高山', '森林', '小鸟', '小猫', '小狗', '兔子',
    '熊猫', '狮子', '老虎', '鲸鱼', '海豚', '乌龟', '小鱼', '马儿',
    '考拉', '猴子', '大象', '火车', '火箭', '星球', '饼干', '蛋糕',
    '面包', '牛奶', '清水', '果汁', '苹果', '香蕉', '葡萄', '桃子',
    '樱桃', '草莓', '柠檬', '绿色', '蓝色', '黄色', '紫色', '红色',
  ],
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
  return {
    language: candidate.language as WordLanguage,
    text,
    ...(candidate.showStrokeOrder === true ? { showStrokeOrder: true } : {}),
  }
}

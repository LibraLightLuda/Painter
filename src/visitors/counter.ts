export interface VisitorCounts {
  today: number
  total: number
}

interface CounterResponse {
  count?: unknown
}

interface VisitorCounterOptions {
  fetcher?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  now?: Date
}

const API_ROOT = 'https://api.counterapi.dev/v1/libralightluda-painter'
const VISIT_MARKER_PREFIX = 'fingertip-visitor-counted'

function koreanDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function readOrIncrementCounter(
  name: string,
  marker: string,
  fetcher: typeof fetch,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Promise<number> {
  const shouldIncrement = storage.getItem(marker) !== '1'
  const action = shouldIncrement ? '/up' : ''
  const response = await fetcher(`${API_ROOT}/${encodeURIComponent(name)}${action}`, {
    headers: { Accept: 'application/json' },
    mode: 'cors',
  })
  if (!response.ok) throw new Error(`Visitor counter request failed: ${response.status}`)

  const data = await response.json() as CounterResponse
  if (typeof data.count !== 'number' || !Number.isFinite(data.count)) {
    throw new Error('Visitor counter returned an invalid count')
  }
  if (shouldIncrement) storage.setItem(marker, '1')
  return data.count
}

export function isVisitorCounterHost(hostname: string): boolean {
  return hostname === 'libralightluda.github.io'
}

export async function countVisitor(options: VisitorCounterOptions = {}): Promise<VisitorCounts> {
  const fetcher = options.fetcher ?? fetch
  const storage = options.storage ?? localStorage
  const dateKey = koreanDateKey(options.now ?? new Date())

  const [today, total] = await Promise.all([
    readOrIncrementCounter(
      `visitors-${dateKey}`,
      `${VISIT_MARKER_PREFIX}:today:${dateKey}`,
      fetcher,
      storage,
    ),
    readOrIncrementCounter(
      'visitors-total',
      `${VISIT_MARKER_PREFIX}:total:${dateKey}`,
      fetcher,
      storage,
    ),
  ])

  return { today, total }
}

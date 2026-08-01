const imageModules = import.meta.glob('../../sampleImg/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const thumbnailModules = import.meta.glob('../../sampleImg-thumbs/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const labels: Record<string, string> = {
  '01-flower-teapot': '꽃 찻주전자',
  '02-greenhouse-cat': '온실 고양이',
  '03-hanging-planters': '행잉 화분',
  '04-wheelbarrow-flowers': '꽃 손수레',
  '05-watering-can-flowers': '꽃 물뿌리개',
  '06-garden-shed': '정원 오두막',
  '07-flower-bicycle': '꽃 자전거',
  '08-flower-market-cart': '꽃시장 수레',
  '09-picnic-basket': '피크닉 바구니',
  '10-woodland-fairy-garden': '숲속 요정 정원',
  '11-cat-windowsill': '창가의 고양이',
  '12-city-cafe-street': '도시 카페 거리',
  '13-dog-park-walk': '공원 산책',
  '14-reading-at-home': '집에서 독서',
  '15-balcony-watering': '발코니 물주기',
  '16-cozy-fireplace': '아늑한 벽난로',
  '17-garden-tea-party': '정원 티파티',
  '18-sleeping-dog': '잠자는 강아지',
  '19-window-flowers': '창가의 꽃',
  '20-vintage-desk': '빈티지 책상',
  '21-birdhouse-tree': '새집 나무',
  '22-plant-shelf': '식물 선반',
  '23-butterfly-sunflower': '나비와 해바라기',
  '24-cozy-kitchen': '아늑한 부엌',
  '25-rustic-bridge': '시골 다리',
  'happy-cat': '웃는 고양이',
  'rocket-space': '우주 로켓',
  'flower-garden': '꽃밭',
}

export interface BuiltinImage {
  id: string
  title: string
  url: string
  thumbnailUrl: string
}

function fileId(path: string): string {
  return path.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? path
}

function fallbackTitle(id: string): string {
  return id.replace(/[-_]+/g, ' ').trim()
}

const thumbnailsById = new Map(
  Object.entries(thumbnailModules).map(([path, url]) => [fileId(path), url]),
)

export const builtinImages: BuiltinImage[] = Object.entries(imageModules)
  .map(([path, url]) => {
    const id = fileId(path)
    return {
      id,
      title: labels[id] ?? fallbackTitle(id),
      url,
      thumbnailUrl: thumbnailsById.get(id) ?? url,
    }
  })
  .sort((left, right) => left.id.localeCompare(right.id))

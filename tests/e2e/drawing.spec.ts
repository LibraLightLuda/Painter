import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

test('explains local-server startup when index.html is opened directly', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('index.html')).href)
  await expect(page.getByRole('heading', { name: '로컬 서버로 실행해 주세요' })).toBeVisible()
  await expect(page.getByText('start-app.cmd')).toBeVisible()
})

test('draws, saves, restores, undoes and exports the original canvas size', async ({ page }) => {
  await page.goto('/')
  const canvas = page.getByTestId('drawing-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('기기에 저장됨')).toBeVisible()

  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.mouse.move(box.x + box.width * 0.46, box.y + box.height * 0.42)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.60, box.y + box.height * 0.54, { steps: 12 })
  await page.mouse.up()

  await expect(page.getByTestId('undo-button')).toBeEnabled()
  await expect(page.getByText('기기에 저장됨')).toBeVisible({ timeout: 7_000 })
  await page.reload()
  await expect(page.getByTestId('undo-button')).toBeEnabled()

  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('redo-button')).toBeEnabled()
  await page.getByTestId('redo-button').click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-button').click()
  await page.getByRole('button', { name: 'PNG 만들기' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Download path is unavailable')
  const image = PNG.sync.read(await import('node:fs').then(({ readFileSync }) => readFileSync(path)))
  expect(image.width).toBe(1080)
  expect(image.height).toBe(1080)
  if (process.env.VISUAL_QA === '1') await page.screenshot({ path: '.qa/mobile.png', fullPage: true })
})

test('switches from a stroke to two-pointer view manipulation', async ({ page }) => {
  await page.goto('/')
  const canvas = page.getByTestId('drawing-canvas')
  await expect(canvas).toBeVisible()
  const before = await page.locator('.zoom-badge').textContent()

  await canvas.evaluate((element) => {
    const dispatch = (type: string, pointerId: number, clientX: number, clientY: number, timeStamp: number) => {
      const event = new PointerEvent(type, {
        pointerId,
        pointerType: 'touch',
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      element.dispatchEvent(event)
    }
    const rect = element.getBoundingClientRect()
    const y = rect.top + rect.height * 0.45
    dispatch('pointerdown', 1, rect.left + 120, y, 0)
    dispatch('pointerdown', 2, rect.left + 220, y, 10)
    dispatch('pointermove', 2, rect.left + 290, y, 40)
    dispatch('pointerup', 1, rect.left + 120, y, 90)
    dispatch('pointerup', 2, rect.left + 290, y, 100)
  })

  await expect(page.locator('.zoom-badge')).not.toHaveText(before ?? '')
})

test('switches brushes, changes size, zooms and starts a clean drawing', async ({ page }) => {
  await page.goto('/')
  const canvas = page.getByTestId('drawing-canvas')
  await expect(canvas).toBeVisible()

  await page.getByTestId('tool-marker').click()
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('brush-size').fill('42')
  await page.getByTestId('brush-opacity').fill('37')
  await page.getByRole('button', { name: '색상 #d64b3c' }).click()
  await expect(page.getByText('42 px')).toBeVisible()
  await expect(page.getByText('37%')).toBeVisible()

  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.42)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.58, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('undo-button')).toBeEnabled()

  const storedBrush = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_300))
    const request = indexedDB.open('fingertip-drawing')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('revisions', 'readonly')
    const revisions = await new Promise<Array<{ status: string; payload: { history: { done: Array<{ tool: string; size: number }> } } }>>((resolve, reject) => {
      const getAll = transaction.objectStore('revisions').getAll()
      getAll.onsuccess = () => resolve(getAll.result)
      getAll.onerror = () => reject(getAll.error)
    })
    database.close()
    return revisions.find((revision) => revision.status === 'complete')?.payload.history.done.at(-1)
  })
  expect(storedBrush).toMatchObject({ tool: 'marker', size: 42 })

  const zoomControls = page.locator('.zoom-controls')
  await expect(zoomControls).toHaveCSS('opacity', '0')
  const beforeZoom = await page.locator('.zoom-badge').textContent()
  await canvas.hover()
  await page.mouse.wheel(0, -420)
  await expect(zoomControls).toHaveClass(/is-visible/)
  await expect(zoomControls).toHaveCSS('opacity', '1')
  await expect(page.locator('.zoom-badge')).not.toHaveText(beforeZoom ?? '')
  await page.getByTestId('fit-button').click()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(zoomControls).toHaveCSS('opacity', '0', { timeout: 4_000 })

  await page.getByTestId('new-drawing-button').click()
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await expect(page.getByLabel('작업 제목')).toHaveValue('새 그림')
  await expect(page.getByRole('button', { name: '기기에 저장됨' })).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await expect(page.getByTestId('tool-marker')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('brush-size')).toHaveValue('42')
  await expect(page.getByTestId('brush-opacity')).toHaveValue('37')
  await expect(page.getByRole('button', { name: '색상 #d64b3c' })).toHaveAttribute('aria-pressed', 'true')
})

test('collapses mobile tools into a bookmark and refits the canvas', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByTestId('tool-dock-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const beforeWorkspace = await page.locator('.workspace').boundingBox()
  if (!beforeWorkspace) throw new Error('Workspace has no bounding box')

  await page.getByTestId('tool-pencil').click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 4_000 })
  await expect(page.locator('.toolbar')).toBeHidden()
  const afterWorkspace = await page.locator('.workspace').boundingBox()
  if (!afterWorkspace) throw new Error('Collapsed workspace has no bounding box')
  expect(afterWorkspace.height).toBeGreaterThan(beforeWorkspace.height + 100)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.toolbar')).toBeVisible()
  await expect(page.getByTestId('tool-pencil')).toHaveAttribute('aria-pressed', 'true')
})

test('creates, saves and restores a drawable multilingual outline word', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('word-button').click()
  await expect(page.locator('.toast')).toContainText(/단어 .*를 만들었어요/)
  await expect(page.getByText('기기에 저장됨')).toBeVisible({ timeout: 7_000 })

  const savedGuide = await page.evaluate(async () => {
    const request = indexedDB.open('fingertip-drawing')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('revisions', 'readonly')
    const revisions = await new Promise<Array<{ status: string; createdAt: number; payload: { wordGuide?: { language: string; text: string } } }>>((resolve, reject) => {
      const getAll = transaction.objectStore('revisions').getAll()
      getAll.onsuccess = () => resolve(getAll.result)
      getAll.onerror = () => reject(getAll.error)
    })
    database.close()
    return revisions
      .filter((revision) => revision.status === 'complete')
      .sort((left, right) => right.createdAt - left.createdAt)[0]?.payload.wordGuide
  })
  expect(savedGuide?.language).toMatch(/^(en|ko|ja|zh)$/)
  expect(savedGuide?.text.length).toBeGreaterThan(0)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-button').click()
  await page.getByRole('button', { name: 'PNG 만들기' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Word guide export path is unavailable')
  const image = PNG.sync.read(await import('node:fs').then(({ readFileSync }) => readFileSync(path)))
  let outlinePixels = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset] < 245 || image.data[offset + 1] < 245 || image.data[offset + 2] < 245) outlinePixels += 1
  }
  expect(outlinePixels).toBeGreaterThan(1_000)

  await page.reload()
  await expect(page.getByTestId('word-button')).toHaveAttribute('aria-label', new RegExp(savedGuide?.text ?? ''))
  const canvas = page.getByTestId('drawing-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('undo-button')).toBeEnabled()
})

test('migrates legacy tool preferences before the mobile UI becomes interactive', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('fingertip-tool-settings-v2')
    localStorage.setItem('fingertip-tool-settings-v1', JSON.stringify({
      brush: { tool: 'marker', color: '#d64b3c' },
      sizes: { marker: 48 },
      opacities: { marker: 0.43 },
      details: { marker: { flow: 0.62, hardness: 0.71, stabilization: 0.44 } },
    }))
  })
  await page.goto('/')

  await expect(page.getByTestId('tool-marker')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('brush-size')).toHaveValue('48')
  await expect(page.getByTestId('brush-opacity')).toHaveValue('43')
  await expect(page.getByRole('button', { name: '색상 #d64b3c' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForFunction(() => Boolean(localStorage.getItem('fingertip-tool-settings-v2')))
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('fingertip-tool-settings-v2') ?? '{}'))
  expect(migrated).toMatchObject({
    version: 2,
    brush: { tool: 'marker', color: '#d64b3c' },
    sizes: { marker: 48 },
    opacities: { marker: 0.43 },
    details: { marker: { flow: 0.62, hardness: 0.71, stabilization: 0.44 } },
  })
})

test('eraser removes artwork instead of painting with white', async ({ page }) => {
  await page.goto('/')
  const canvas = page.getByTestId('drawing-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.up()
  await page.getByTestId('tool-eraser').click()
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.up()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-button').click()
  await page.getByRole('button', { name: 'PNG 만들기' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Download path is unavailable')
  const image = PNG.sync.read(await import('node:fs').then(({ readFileSync }) => readFileSync(path)))
  const pixel = (540 * image.width + 540) * 4
  expect([...image.data.subarray(pixel, pixel + 4)]).toEqual([255, 255, 255, 255])
})

test('imports a local image, restores it and exports JPEG options', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('image-import-button').click()
  await expect(page.getByRole('heading', { name: '이미지 가져오기' })).toBeVisible()
  const source = new PNG({ width: 320, height: 180 })
  for (let offset = 0; offset < source.data.length; offset += 4) {
    source.data[offset] = 227
    source.data[offset + 1] = 59
    source.data[offset + 2] = 47
    source.data[offset + 3] = 255
  }
  await page.locator('.image-sheet input[type="file"]').setInputFiles({
    name: 'red-image.png',
    mimeType: 'image/png',
    buffer: PNG.sync.write(source),
  })
  await expect(page.getByAltText('가져올 이미지 미리보기')).toBeVisible()
  await page.getByRole('button', { name: '채우기' }).click()
  await page.getByRole('button', { name: '배경으로 놓기' }).click()
  await expect(page.getByText('이미지를 배경으로 놓았어요.')).toBeVisible()
  await page.reload()

  await page.getByTestId('export-button').click()
  await page.locator('input[name="format"][value="jpeg"]').check()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JPEG 만들기' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.jpg$/)
  const path = await download.path()
  if (!path) throw new Error('JPEG path is unavailable')
  const bytes = await import('node:fs').then(({ readFileSync }) => readFileSync(path))
  expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8])
})

test('loads a built-in coloring image directly onto the canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('word-button').click()
  await page.getByTestId('image-import-button').click()
  await expect(page.getByRole('heading', { name: '내장 이미지에서 선택' })).toBeVisible()
  expect(await page.locator('[data-testid^="builtin-image-"]').count()).toBeGreaterThanOrEqual(13)
  await page.getByTestId('builtin-image-01-flower-teapot').click()
  await expect(page.getByRole('heading', { name: '이미지 가져오기' })).toBeHidden()
  await expect(page.locator('.toast')).toContainText('이미지를 배경으로 놓았어요.')

  await page.reload()
  await expect(page.getByTestId('word-button')).toHaveAttribute('aria-label', '랜덤 단어 만들기')
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-button').click()
  await page.getByRole('button', { name: 'PNG 만들기' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Built-in coloring image export path is unavailable')
  const image = PNG.sync.read(await import('node:fs').then(({ readFileSync }) => readFileSync(path)))
  let linePixels = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset] < 80 && image.data[offset + 1] < 80 && image.data[offset + 2] < 80) linePixels += 1
  }
  expect(linePixels).toBeGreaterThan(2_000)
})

test('creates layers and manages multiple saved projects', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('layers-button').click()
  await page.getByRole('button', { name: '＋ 새 그리기 레이어' }).click()
  await expect(page.getByText('그리기 2')).toBeVisible()
  await page.getByRole('button', { name: '레이어 닫기' }).click()

  const canvas = page.getByTestId('drawing-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.up()

  await page.getByTestId('layers-button').click()
  await page.getByRole('button', { name: '그리기 2 숨기기' }).click()
  await page.getByRole('button', { name: '레이어 닫기' }).click()
  const hiddenDownloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-button').click()
  await page.getByRole('button', { name: 'PNG 만들기' }).click()
  const hiddenDownload = await hiddenDownloadPromise
  const hiddenPath = await hiddenDownload.path()
  if (!hiddenPath) throw new Error('Hidden layer export path is unavailable')
  const hiddenImage = PNG.sync.read(await import('node:fs').then(({ readFileSync }) => readFileSync(hiddenPath)))
  const centerPixel = (540 * hiddenImage.width + 540) * 4
  expect([...hiddenImage.data.subarray(centerPixel, centerPixel + 4)]).toEqual([255, 255, 255, 255])

  await page.getByRole('button', { name: '내 작업 열기' }).click()
  await expect(page.getByRole('heading', { name: '내 작업' })).toBeVisible()
  await page.getByRole('button', { name: '복제' }).click()
  await expect(page.getByLabel('작업 제목')).toHaveValue('새 그림 복사본')
  await page.getByRole('button', { name: '내 작업 열기' }).click()
  await expect(page.locator('.project-card')).toHaveCount(2)
})

test('stores advanced brush settings and pointer pressure samples', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tool-pen').click()
  await page.getByTestId('brush-settings-button').click()
  await page.getByTestId('brush-stabilization').fill('72')
  await page.getByTestId('brush-flow').fill('64')
  await page.getByTestId('brush-hardness').fill('58')
  await page.getByTestId('brush-spacing').fill('18')
  await page.getByRole('button', { name: '브러시 설정 닫기' }).click()

  const canvas = page.getByTestId('drawing-canvas')
  await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const dispatch = (type: string, x: number, pressure: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId: 9,
      pointerType: 'pen',
      clientX: rect.left + x,
      clientY: rect.top + rect.height / 2,
      pressure,
      bubbles: true,
      cancelable: true,
    }))
    dispatch('pointerdown', rect.width * 0.35, 0.2)
    dispatch('pointermove', rect.width * 0.5, 0.55)
    dispatch('pointerup', rect.width * 0.65, 0.9)
  })
  await expect(page.getByText('기기에 저장됨')).toBeVisible({ timeout: 7_000 })
  const saved = await page.evaluate(async () => {
    const settings = JSON.parse(localStorage.getItem('fingertip-tool-settings-v2') ?? '{}')
    const legacySettings = JSON.parse(localStorage.getItem('fingertip-tool-settings-v1') ?? '{}')
    const request = indexedDB.open('fingertip-drawing')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('revisions', 'readonly')
    const revisions = await new Promise<Array<{ status: string; payload: { history: { done: Array<{ points: Array<{ pressure?: number }> }> } } }>>((resolve, reject) => {
      const getAll = transaction.objectStore('revisions').getAll()
      getAll.onsuccess = () => resolve(getAll.result)
      getAll.onerror = () => reject(getAll.error)
    })
    database.close()
    const stroke = revisions.filter((revision) => revision.status === 'complete').at(-1)?.payload.history.done.at(-1)
    return {
      version: settings.version,
      details: settings.details?.pen,
      legacyDetails: legacySettings.details?.pen,
      pressures: stroke?.points.map((point) => point.pressure ?? 0),
    }
  })
  expect(saved.version).toBe(2)
  expect(saved.details).toMatchObject({ stabilization: 0.72, flow: 0.64, hardness: 0.58, spacing: 0.18 })
  expect(saved.legacyDetails).toMatchObject({ stabilization: 0.72, flow: 0.64, hardness: 0.58, spacing: 0.18 })
  expect(saved.pressures?.[0] ?? 0).toBeCloseTo(0.2)
  expect(Math.max(...(saved.pressures ?? [0]))).toBeGreaterThan(0.2)

  await page.reload()
  await page.getByTestId('brush-settings-button').click()
  await expect(page.getByTestId('brush-stabilization')).toHaveValue('72')
  await expect(page.getByTestId('brush-flow')).toHaveValue('64')
  await expect(page.getByTestId('brush-hardness')).toHaveValue('58')
  await expect(page.getByTestId('brush-spacing')).toHaveValue('18')
})

test('fills regions, draws filled shapes and picks a canvas color', async ({ page }) => {
  await page.goto('/')
  const canvas = page.getByTestId('drawing-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.getByRole('button', { name: '색상 #d64b3c' }).click()
  await page.getByTestId('tool-fill').click()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('undo-button')).toBeEnabled()
  await page.getByTestId('undo-button').click()

  await page.getByTestId('tool-rectangle').click()
  await page.getByTestId('brush-settings-button').click()
  await page.getByTestId('shape-fill').check()
  await page.getByRole('button', { name: '브러시 설정 닫기' }).click()
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65)
  await page.mouse.up()

  await page.getByRole('button', { name: '색상 #246bce' }).click()
  await page.getByTestId('tool-eyedropper').click()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('tool-rectangle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '색상 #d64b3c' })).toHaveAttribute('aria-pressed', 'true')
})

test('serves the cached app shell while the network is unavailable', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true)
  const statuses = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src]')?.src
    const stylesheet = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href
    const urls = ['/index.html', script, stylesheet].filter((url): url is string => Boolean(url))
    return Promise.all(urls.map(async (url) => (await fetch(url)).status))
  })
  expect(statuses).toEqual([200, 200, 200])
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByTestId('drawing-canvas')).toBeVisible()
  await expect(page.getByText(/오프라인/)).toBeVisible()
})

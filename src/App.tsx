import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CanvasSurface } from './components/CanvasSurface'
import { ImageImportSheet } from './components/ImageImportSheet'
import { ExportSheet, type ExportOptions } from './components/ExportSheet'
import { ProjectListSheet } from './components/ProjectListSheet'
import { LayerSheet } from './components/LayerSheet'
import { ColorSheet } from './components/ColorSheet'
import { BrushSettingsSheet } from './components/BrushSettingsSheet'
import { type DrawingChange, type DrawingController, type DrawingState } from './drawing/controller'
import {
  createEmptySnapshot,
  DEFAULT_PROJECT_ID,
  type BackgroundImageState,
  type BrushSettings,
  type BrushTool,
  type SaveStatus,
} from './drawing/types'
import { downloadFile, safeFilename, shareOrDownloadImage } from './export/png'
import { createProjectFile, readProjectFile } from './export/projectFile'
import { AutosaveCoordinator } from './persistence/autosave'
import {
  listRecentProjects,
  markProjectDeleted,
  saveProjectRevision,
  type ProjectListEntry,
} from './persistence/revisions'
import { applyWaitingUpdate, registerPwa } from './pwa/register'
import type { PreparedImage } from './images/importImage'
import { takeSharedImage } from './images/shareTarget'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const initialDrawingState: DrawingState = {
  canUndo: false,
  canRedo: false,
  scale: 1,
  inputMode: 'idle',
  brush: {
    tool: 'pen', color: '#1e1f1d', size: 4, opacity: 1,
    flow: 1, hardness: 0.95, spacing: 0.1, stabilization: 0.35,
    pressure: true, shapeFill: false, tolerance: 24,
  },
  layers: [{ id: 'layer-1', name: '그리기 1', visible: true, opacity: 1 }],
  activeLayerId: 'layer-1',
}

interface ToolPreset {
  label: string
  glyph: string
  size: number
  opacity: number
  flow: number
  hardness: number
  spacing: number
  stabilization: number
  pressure: boolean
}

const toolMeta: Record<BrushTool, ToolPreset> = {
  pen: { label: '펜', glyph: '●', size: 4, opacity: 1, flow: 1, hardness: 0.95, spacing: 0.1, stabilization: 0.35, pressure: true },
  pencil: { label: '연필', glyph: '✎', size: 3, opacity: 0.75, flow: 0.85, hardness: 0.82, spacing: 0.12, stabilization: 0.45, pressure: true },
  marker: { label: '마커', glyph: '▬', size: 18, opacity: 0.55, flow: 0.85, hardness: 0.72, spacing: 0.16, stabilization: 0.3, pressure: false },
  brush: { label: '붓', glyph: '◒', size: 14, opacity: 0.85, flow: 0.78, hardness: 0.58, spacing: 0.1, stabilization: 0.55, pressure: true },
  highlighter: { label: '형광펜', glyph: '▰', size: 32, opacity: 0.22, flow: 0.75, hardness: 0.82, spacing: 0.15, stabilization: 0.3, pressure: false },
  spray: { label: '스프레이', glyph: '⁙', size: 24, opacity: 0.65, flow: 0.72, hardness: 0.6, spacing: 0.3, stabilization: 0.2, pressure: true },
  eraser: { label: '지우개', glyph: '◇', size: 24, opacity: 1, flow: 1, hardness: 0.95, spacing: 0.1, stabilization: 0.4, pressure: true },
  eyedropper: { label: '스포이드', glyph: '⌁', size: 4, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: false },
  fill: { label: '페인트통', glyph: '◩', size: 4, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: false },
  line: { label: '직선', glyph: '╱', size: 5, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: true },
  rectangle: { label: '사각형', glyph: '□', size: 5, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: true },
  ellipse: { label: '원', glyph: '○', size: 5, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: true },
  arrow: { label: '화살표', glyph: '↗', size: 5, opacity: 1, flow: 1, hardness: 1, spacing: 0.1, stabilization: 0, pressure: true },
}

const colors = ['#1e1f1d', '#246bce', '#d64b3c', '#21845b', '#ee762f']
const TOOL_SETTINGS_KEY = 'fingertip-tool-settings-v1'

type ToolNumberMap = Record<BrushTool, number>
type ToolDetails = Pick<BrushSettings, 'flow' | 'hardness' | 'spacing' | 'stabilization' | 'pressure' | 'shapeFill' | 'tolerance'>
type ToolDetailsMap = Record<BrushTool, ToolDetails>

interface StoredToolSettings {
  brush?: { tool?: BrushTool; color?: string }
  sizes?: Partial<ToolNumberMap>
  opacities?: Partial<ToolNumberMap>
  recentColors?: string[]
  favoriteColors?: string[]
  details?: Partial<Record<BrushTool, Partial<ToolDetails>>>
}

function defaultToolNumbers(key: 'size' | 'opacity'): ToolNumberMap {
  return Object.fromEntries(
    (Object.keys(toolMeta) as BrushTool[]).map((tool) => [tool, toolMeta[tool][key]]),
  ) as ToolNumberMap
}

function defaultToolDetails(): ToolDetailsMap {
  return Object.fromEntries(
    (Object.keys(toolMeta) as BrushTool[]).map((tool) => [tool, {
      flow: toolMeta[tool].flow,
      hardness: toolMeta[tool].hardness,
      spacing: toolMeta[tool].spacing,
      stabilization: toolMeta[tool].stabilization,
      pressure: toolMeta[tool].pressure,
      shapeFill: false,
      tolerance: 24,
    }]),
  ) as ToolDetailsMap
}

function mergeToolDetails(stored?: StoredToolSettings['details']): ToolDetailsMap {
  const defaults = defaultToolDetails()
  for (const tool of Object.keys(defaults) as BrushTool[]) {
    defaults[tool] = { ...defaults[tool], ...stored?.[tool] }
  }
  return defaults
}

function readToolSettings(): StoredToolSettings {
  try {
    return JSON.parse(localStorage.getItem(TOOL_SETTINGS_KEY) ?? '{}') as StoredToolSettings
  } catch {
    return {}
  }
}

const statusText: Record<SaveStatus, string> = {
  loading: '작업 여는 중',
  unsaved: '변경됨',
  saving: '저장 중',
  saved: '기기에 저장됨',
  error: '저장 실패 · 재시도',
}

export default function App() {
  const storedToolsRef = useRef<StoredToolSettings>(readToolSettings())
  const controllerRef = useRef<DrawingController | null>(null)
  const autosaveRef = useRef<AutosaveCoordinator | null>(null)
  const titleRef = useRef('새 그림')
  const readyRef = useRef(false)
  const [title, setTitle] = useState('새 그림')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading')
  const [drawingState, setDrawingState] = useState(initialDrawingState)
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [toolSizes, setToolSizes] = useState<ToolNumberMap>(() => ({
    ...defaultToolNumbers('size'),
    ...storedToolsRef.current.sizes,
  }))
  const [toolOpacities, setToolOpacities] = useState<ToolNumberMap>(() => ({
    ...defaultToolNumbers('opacity'),
    ...storedToolsRef.current.opacities,
  }))
  const [recentColors, setRecentColors] = useState<string[]>(() =>
    storedToolsRef.current.recentColors?.slice(0, 12) ?? colors,
  )
  const [favoriteColors, setFavoriteColors] = useState<string[]>(() => storedToolsRef.current.favoriteColors?.slice(0, 16) ?? [])
  const [toolDetails, setToolDetails] = useState<ToolDetailsMap>(() => mergeToolDetails(storedToolsRef.current.details))
  const [colorSheetOpen, setColorSheetOpen] = useState(false)
  const [brushSettingsOpen, setBrushSettingsOpen] = useState(false)
  const [imageSheetOpen, setImageSheetOpen] = useState(false)
  const [incomingImage, setIncomingImage] = useState<Blob | null>(null)
  const [exportSheetOpen, setExportSheetOpen] = useState(false)
  const [backupSheetOpen, setBackupSheetOpen] = useState(false)
  const [projectSheetOpen, setProjectSheetOpen] = useState(false)
  const [projectBusy, setProjectBusy] = useState(false)
  const [projects, setProjects] = useState<ProjectListEntry[]>([])
  const [activeProjectId, setActiveProjectId] = useState(DEFAULT_PROJECT_ID)
  const [layerSheetOpen, setLayerSheetOpen] = useState(false)
  const projectFileRef = useRef<HTMLInputElement>(null)

  const refreshProjects = useCallback(async () => {
    const entries = await listRecentProjects()
    setProjects(entries)
    return entries
  }, [])

  const announce = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? '' : current)), 4_000)
  }, [])

  const handleDrawingChange = useCallback((change: DrawingChange) => {
    setDrawingState(change.state)
    if (readyRef.current && (change.kind === 'content' || change.kind === 'view')) {
      autosaveRef.current?.markDirty()
    }
  }, [])

  const handleControllerReady = useCallback(
    async (controller: DrawingController) => {
      controllerRef.current = controller
      let restored = false
      try {
        const entries = await listRecentProjects()
        setProjects(entries)
        const revision = entries[0]?.revision ?? null
        const snapshot = revision?.payload ?? createEmptySnapshot()
        setActiveProjectId(snapshot.id)
        titleRef.current = snapshot.title
        setTitle(snapshot.title)
        await controller.load(snapshot, revision?.backgroundAsset)
        restored = Boolean(revision)
        if (!revision) controller.fitToScreen()
      } catch {
        await controller.load(createEmptySnapshot())
        controller.fitToScreen()
        setSaveStatus('error')
        announce('기기 저장소를 열지 못했어요. 그림은 계속 그릴 수 있고 PNG로 내보낼 수 있어요.')
      }

      const storedBrush = storedToolsRef.current.brush
      const storedTool = storedBrush?.tool && storedBrush.tool in toolMeta ? storedBrush.tool : 'pen'
      controller.setBrush({
        tool: storedTool,
        color: storedBrush?.color ?? '#1e1f1d',
        size: storedToolsRef.current.sizes?.[storedTool] ?? toolMeta[storedTool].size,
        opacity: storedToolsRef.current.opacities?.[storedTool] ?? toolMeta[storedTool].opacity,
        ...mergeToolDetails(storedToolsRef.current.details)[storedTool],
      })

      const autosave = new AutosaveCoordinator({
        save: async () => {
          const active = controllerRef.current
          if (!active) return
          const snapshot = active.serialize(titleRef.current)
          const checkpoint = await active.createCheckpointBlob()
          await saveProjectRevision(snapshot, checkpoint, active.getBackgroundAsset())
        },
        onStatus: setSaveStatus,
      })
      autosaveRef.current = autosave
      readyRef.current = true
      setReady(true)
      if (restored) setSaveStatus('saved')
      else autosave.markDirty()
    },
    [announce],
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        TOOL_SETTINGS_KEY,
        JSON.stringify({
          brush: { tool: drawingState.brush.tool, color: drawingState.brush.color },
          sizes: toolSizes,
          opacities: toolOpacities,
          recentColors,
          favoriteColors,
          details: toolDetails,
        } satisfies StoredToolSettings),
      )
    } catch {
      // Drawing remains available when browser settings storage is restricted.
    }
  }, [drawingState.brush.color, drawingState.brush.tool, favoriteColors, recentColors, toolDetails, toolOpacities, toolSizes])

  useEffect(() => {
    const color = drawingState.brush.color
    setRecentColors((current) => current[0] === color ? current : [color, ...current.filter((item) => item !== color)].slice(0, 12))
  }, [drawingState.brush.color])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        controllerRef.current?.cancelActive()
        void autosaveRef.current?.flush()
      }
    }
    const onPageHide = () => {
      controllerRef.current?.cancelActive()
      void autosaveRef.current?.flush()
    }
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!new URL(window.location.href).searchParams.has('shared-image')) return
    void takeSharedImage()
      .then((blob) => {
        if (!blob) {
          announce('공유된 이미지를 읽지 못했어요. 내 기기에서 다시 선택해 주세요.')
          return
        }
        setIncomingImage(blob)
        setImageSheetOpen(true)
        history.replaceState(null, '', `${location.pathname}${location.hash}`)
      })
      .catch(() => announce('공유된 이미지를 읽지 못했어요.'))
  }, [announce])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement && !event.clipboardData?.files.length) return
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'))
        ?? [...(event.clipboardData?.items ?? [])]
          .find((item) => item.type.startsWith('image/'))
          ?.getAsFile()
      if (!file) return
      event.preventDefault()
      setIncomingImage(file)
      setImageSheetOpen(true)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof HTMLInputElement) return
      event.preventDefault()
      if (event.shiftKey) controllerRef.current?.redo()
      else controllerRef.current?.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const pwa = registerPwa(setWaitingWorker)
    return pwa.dispose
  }, [])

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  useEffect(
    () => () => {
      readyRef.current = false
      autosaveRef.current?.dispose()
    },
    [],
  )

  const handleTitle = (nextTitle: string) => {
    setTitle(nextTitle)
    titleRef.current = nextTitle
    autosaveRef.current?.markDirty()
  }

  const handleTool = (tool: BrushTool) => {
    const preset = toolMeta[tool]
    controllerRef.current?.setBrush({
      tool,
      size: toolSizes[tool],
      opacity: toolOpacities[tool] ?? preset.opacity,
      ...toolDetails[tool],
    })
  }

  const handleBrushDetails = (next: Partial<ToolDetails>) => {
    const tool = drawingState.brush.tool
    setToolDetails((current) => ({ ...current, [tool]: { ...current[tool], ...next } }))
    controllerRef.current?.setBrush(next)
  }

  const handleBrushOpacity = (opacity: number) => {
    const tool = drawingState.brush.tool
    setToolOpacities((current) => ({ ...current, [tool]: opacity }))
    controllerRef.current?.setBrush({ opacity })
  }

  const handleColor = (color: string) => {
    controllerRef.current?.setBrush({ color })
    setRecentColors((current) => [color, ...current.filter((item) => item !== color)].slice(0, 12))
  }

  const handleBrushSize = (size: number) => {
    const tool = drawingState.brush.tool
    setToolSizes((current) => ({ ...current, [tool]: size }))
    controllerRef.current?.setBrush({ size })
  }

  const handleNewDrawing = async () => {
    const controller = controllerRef.current
    if (!controller) return
    const snapshot = createEmptySnapshot(Date.now(), crypto.randomUUID())
    titleRef.current = snapshot.title
    setTitle(snapshot.title)
    setActiveProjectId(snapshot.id)
    controller.startNew(snapshot)
    autosaveRef.current?.markDirty()
    const saved = await autosaveRef.current?.flush()
    await refreshProjects()
    setProjectSheetOpen(false)
    announce(saved === false ? '새 그림을 열었어요. 기기 저장은 잠시 후 다시 시도합니다.' : '새 그림을 열었어요.')
  }

  const handleOpenProjectSheet = async () => {
    await autosaveRef.current?.flush()
    await refreshProjects()
    setProjectSheetOpen(true)
  }

  const handleOpenProject = async (entry: ProjectListEntry) => {
    const controller = controllerRef.current
    if (!controller || entry.meta.id === activeProjectId) {
      setProjectSheetOpen(false)
      return
    }
    setProjectBusy(true)
    try {
      await autosaveRef.current?.flush()
      await controller.load(entry.revision.payload, entry.revision.backgroundAsset)
      titleRef.current = entry.revision.payload.title
      setTitle(entry.revision.payload.title)
      setActiveProjectId(entry.meta.id)
      setSaveStatus('saved')
      setProjectSheetOpen(false)
    } catch {
      announce('이 작업을 열지 못했어요. 마지막 정상 저장본은 그대로 유지됩니다.')
    } finally {
      setProjectBusy(false)
    }
  }

  const handleDuplicateProject = async (entry: ProjectListEntry) => {
    const controller = controllerRef.current
    if (!controller) return
    setProjectBusy(true)
    try {
      await autosaveRef.current?.flush()
      const snapshot = {
        ...structuredClone(entry.revision.payload),
        id: crypto.randomUUID(),
        title: `${entry.revision.payload.title} 복사본`,
        updatedAt: Date.now(),
      }
      await controller.load(snapshot, entry.revision.backgroundAsset)
      titleRef.current = snapshot.title
      setTitle(snapshot.title)
      setActiveProjectId(snapshot.id)
      autosaveRef.current?.markDirty()
      await autosaveRef.current?.flush()
      await refreshProjects()
      setProjectSheetOpen(false)
      announce('작업을 복제했어요.')
    } catch {
      announce('작업을 복제하지 못했어요.')
    } finally {
      setProjectBusy(false)
    }
  }

  const handleDeleteProject = async (entry: ProjectListEntry) => {
    setProjectBusy(true)
    try {
      await markProjectDeleted(entry.meta.id)
      const remaining = await refreshProjects()
      if (entry.meta.id === activeProjectId) {
        const next = remaining[0]
        if (next) await handleOpenProject(next)
        else await handleNewDrawing()
      }
      announce('작업을 목록에서 삭제했어요.')
    } catch {
      announce('작업을 삭제하지 못했어요.')
    } finally {
      setProjectBusy(false)
    }
  }

  const handleImageImport = async (
    image: PreparedImage,
    mode: BackgroundImageState['mode'],
    rotation: BackgroundImageState['rotation'],
  ) => {
    const controller = controllerRef.current
    if (!controller) return
    await controller.setBackgroundImage(image.blob, {
      mimeType: image.blob.type || 'image/png',
      width: image.width,
      height: image.height,
      mode,
      rotation,
    })
    autosaveRef.current?.markDirty()
    await autosaveRef.current?.flush()
    setIncomingImage(null)
    announce(image.optimized ? '큰 이미지를 기기에 맞게 줄여 배경으로 놓았어요.' : '이미지를 배경으로 놓았어요.')
  }

  const handleExport = async (options: ExportOptions) => {
    const controller = controllerRef.current
    if (!controller || exporting) return
    setExporting(true)
    try {
      const type = options.format === 'jpeg' ? 'image/jpeg' : 'image/png'
      const blob = await controller.createExportBlob(type, options.scale, options.quality)
      const result = await shareOrDownloadImage(blob, titleRef.current, options.format)
      if (result === 'downloaded') announce(`${options.format === 'jpeg' ? 'JPEG' : 'PNG'} 파일을 저장했어요.`)
      if (result === 'shared') announce(`${options.format === 'jpeg' ? 'JPEG' : 'PNG'} 공유 시트를 열었어요.`)
      setExportSheetOpen(false)
    } catch {
      announce('이미지를 만들지 못했어요. 75% 또는 50% 크기로 다시 시도해 주세요.')
    } finally {
      setExporting(false)
    }
  }

  const handleProjectBackup = async () => {
    const controller = controllerRef.current
    if (!controller) return
    try {
      const blob = await createProjectFile(
        controller.serialize(titleRef.current),
        controller.getBackgroundAsset(),
      )
      downloadFile(new File(
        [blob],
        safeFilename(titleRef.current, new Date(), 'fingertip'),
        { type: blob.type },
      ))
      announce('다시 편집할 수 있는 손끝 원본 파일을 저장했어요.')
      setBackupSheetOpen(false)
    } catch {
      announce('원본 파일을 만들지 못했어요.')
    }
  }

  const handleProjectRestore = async (file: File) => {
    const controller = controllerRef.current
    if (!controller) return
    try {
      const imported = await readProjectFile(file)
      const snapshot = {
        ...imported.snapshot,
        id: crypto.randomUUID(),
        updatedAt: Date.now(),
      }
      await controller.load(snapshot, imported.background)
      titleRef.current = snapshot.title
      setTitle(snapshot.title)
      setActiveProjectId(snapshot.id)
      autosaveRef.current?.markDirty()
      await autosaveRef.current?.flush()
      await refreshProjects()
      setBackupSheetOpen(false)
      announce('원본 작업을 불러왔어요.')
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '원본 작업을 불러오지 못했어요.')
    }
  }

  const handleUpdate = async () => {
    if (!waitingWorker) return
    const saved = await autosaveRef.current?.flush()
    if (saved === false) {
      announce('저장에 실패해 업데이트를 멈췄어요. PNG로 백업한 뒤 다시 시도해 주세요.')
      return
    }
    await applyWaitingUpdate(waitingWorker)
    window.location.reload()
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const displayedStatus = !online && saveStatus === 'saved' ? '오프라인 · 기기에 저장됨' : statusText[saveStatus]
  const colorDisabled = drawingState.brush.tool === 'eraser' || drawingState.brush.tool === 'eyedropper'
  const sizeDisabled = drawingState.brush.tool === 'eyedropper' || drawingState.brush.tool === 'fill'

  return (
    <main className="app-shell">
      {waitingWorker && (
        <aside className="update-banner" aria-live="polite">
          <span>새 버전이 준비됐어요.</span>
          <button type="button" onClick={handleUpdate}>저장 후 적용</button>
        </aside>
      )}

      <section className="editor-shell" aria-label="그림 편집기">
        <header className="topbar">
          <button type="button" className="brand project-list-button" aria-label="내 작업 열기" onClick={() => void handleOpenProjectSheet()}>
            <span className="brand-mark" aria-hidden="true"><i /></span>
            <span className="brand-name">손끝</span>
          </button>

          <label className="title-field">
            <span className="sr-only">작업 제목</span>
            <input
              value={title}
              onChange={(event) => handleTitle(event.target.value)}
              onBlur={() => void autosaveRef.current?.flush()}
              maxLength={60}
              aria-label="작업 제목"
            />
          </label>

          <button
            type="button"
            className={`save-pill save-${saveStatus}`}
            onClick={() => saveStatus === 'error' && void autosaveRef.current?.retry()}
            disabled={saveStatus !== 'error'}
            aria-label={displayedStatus}
          >
            <span className="status-dot" aria-hidden="true" />
            <span>{displayedStatus}</span>
          </button>

          {installPrompt && (
            <button type="button" className="quiet-button" onClick={handleInstall}>설치</button>
          )}
          <button
            type="button"
            className="new-button"
            onClick={() => void handleNewDrawing()}
            disabled={!ready}
            data-testid="new-drawing-button"
          >
            <span aria-hidden="true">＋</span>
            <span>새 그림</span>
          </button>
          <button
            type="button"
            className="export-button"
            onClick={() => setExportSheetOpen(true)}
            disabled={!ready || exporting}
            data-testid="export-button"
          >
            <span aria-hidden="true">↗</span>
            <span>{exporting ? '준비 중' : '내보내기'}</span>
          </button>
        </header>

        <div
          className="workspace"
          onDragOver={(event) => {
            if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault()
          }}
          onDrop={(event) => {
            const file = event.dataTransfer.files[0]
            if (!file?.type.startsWith('image/')) return
            event.preventDefault()
            setIncomingImage(file)
            setImageSheetOpen(true)
          }}
        >
          <CanvasSurface onReady={handleControllerReady} onChange={handleDrawingChange} />
          {!ready && <div className="loading-cover">최근 그림을 불러오는 중…</div>}
          <div className="zoom-controls" aria-label="확대 및 축소">
            <button
              type="button"
              onClick={() => controllerRef.current?.zoomBy(0.8)}
              aria-label="축소"
              data-testid="zoom-out-button"
            >−</button>
            <output className="zoom-badge" aria-live="polite">{Math.round(drawingState.scale * 100)}%</output>
            <button
              type="button"
              onClick={() => controllerRef.current?.zoomBy(1.25)}
              aria-label="확대"
              data-testid="zoom-in-button"
            >＋</button>
            <button
              type="button"
              className="fit-button"
              onClick={() => controllerRef.current?.fitToScreen()}
              aria-label="화면에 맞춤"
              data-testid="fit-button"
            >맞춤</button>
          </div>
        </div>

        <div className="tool-dock">
          <nav className="toolbar" aria-label="그리기 도구">
            {(Object.keys(toolMeta) as BrushTool[]).map((tool) => {
              const selected = drawingState.brush.tool === tool
              return (
                <button
                  key={tool}
                  type="button"
                  className={`tool-button ${selected ? 'is-selected' : ''}`}
                  onClick={() => handleTool(tool)}
                  aria-pressed={selected}
                  aria-label={`${toolMeta[tool].label}${selected ? ' 선택됨' : ''}`}
                  data-testid={`tool-${tool}`}
                >
                  <span className={`tool-glyph glyph-${tool}`} aria-hidden="true">{toolMeta[tool].glyph}</span>
                  <span>{toolMeta[tool].label}</span>
                </button>
              )
            })}
            <button
              type="button"
              className="tool-button"
              onClick={() => setBrushSettingsOpen(true)}
              disabled={drawingState.brush.tool === 'eyedropper'}
              aria-label="브러시 세부 설정"
              data-testid="brush-settings-button"
            >
              <span className="action-glyph" aria-hidden="true">⚙</span>
              <span>세부</span>
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="tool-button"
              onClick={() => {
                setIncomingImage(null)
                setImageSheetOpen(true)
              }}
              aria-label="이미지 가져오기"
              data-testid="image-import-button"
            >
              <span className="action-glyph" aria-hidden="true">▣</span>
              <span>이미지</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => setBackupSheetOpen(true)}
              aria-label="원본 백업 및 불러오기"
              data-testid="project-file-button"
            >
              <span className="action-glyph" aria-hidden="true">⇅</span>
              <span>원본</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => setLayerSheetOpen(true)}
              aria-label="레이어 열기"
              data-testid="layers-button"
            >
              <span className="action-glyph" aria-hidden="true">▱</span>
              <span>레이어</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => controllerRef.current?.undo()}
              disabled={!drawingState.canUndo}
              aria-label="실행 취소"
              data-testid="undo-button"
            >
              <span className="action-glyph" aria-hidden="true">↶</span>
              <span>취소</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => controllerRef.current?.redo()}
              disabled={!drawingState.canRedo}
              aria-label="다시 실행"
              data-testid="redo-button"
            >
              <span className="action-glyph" aria-hidden="true">↷</span>
              <span>다시</span>
            </button>
          </nav>

          <section className="brush-controls" aria-label="브러시 설정">
            <div className={`color-controls ${colorDisabled ? 'is-disabled' : ''}`} aria-label="색상 선택">
              {recentColors.slice(0, 6).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-button ${drawingState.brush.color === color ? 'is-selected' : ''}`}
                  style={{ '--swatch-color': color } as CSSProperties}
                  onClick={() => handleColor(color)}
                  aria-label={`색상 ${color}`}
                  aria-pressed={drawingState.brush.color === color}
                  disabled={colorDisabled}
                />
              ))}
              <button type="button" className="custom-color" aria-label="색상 휠과 팔레트 열기" onClick={() => setColorSheetOpen(true)} disabled={colorDisabled}>
                <span aria-hidden="true">＋</span>
              </button>
            </div>
            <label className="size-control">
              <span>굵기 <strong>{Math.round(drawingState.brush.size)} px</strong></span>
              <input
                type="range"
                min="1"
                max="160"
                step="1"
                value={drawingState.brush.size}
                onChange={(event) => handleBrushSize(Number(event.target.value))}
                aria-label="브러시 굵기"
                disabled={sizeDisabled}
                data-testid="brush-size"
              />
              <i
                className="live-size-preview"
                style={{ '--preview-size': `${Math.min(24, Math.max(3, drawingState.brush.size / 2))}px` } as CSSProperties}
                aria-hidden="true"
              />
            </label>
            <label className="opacity-control">
              <span>농도 <strong>{Math.round(drawingState.brush.opacity * 100)}%</strong></span>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={Math.round(drawingState.brush.opacity * 100)}
                onChange={(event) => handleBrushOpacity(Number(event.target.value) / 100)}
                aria-label="브러시 불투명도"
                disabled={drawingState.brush.tool === 'eraser' || drawingState.brush.tool === 'eyedropper'}
                data-testid="brush-opacity"
              />
            </label>
          </section>
        </div>
      </section>

      <div className={`toast ${notice ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>

      <ImageImportSheet
        open={imageSheetOpen}
        incomingBlob={incomingImage}
        onClose={() => {
          setImageSheetOpen(false)
          setIncomingImage(null)
        }}
        onImport={handleImageImport}
      />
      <ExportSheet
        open={exportSheetOpen}
        busy={exporting}
        onClose={() => !exporting && setExportSheetOpen(false)}
        onExport={handleExport}
      />
      <ColorSheet
        open={colorSheetOpen}
        color={drawingState.brush.color}
        recent={recentColors}
        favorites={favoriteColors}
        onChoose={handleColor}
        onFavorites={setFavoriteColors}
        onClose={() => setColorSheetOpen(false)}
      />
      <BrushSettingsSheet
        open={brushSettingsOpen}
        brush={drawingState.brush}
        onChange={handleBrushDetails}
        onClose={() => setBrushSettingsOpen(false)}
      />

      {backupSheetOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setBackupSheetOpen(false)}>
          <section className="compact-sheet" role="dialog" aria-modal="true" aria-labelledby="backup-sheet-title">
            <header className="sheet-header">
              <div>
                <span className="eyebrow">기기 밖에도 안전하게</span>
                <h2 id="backup-sheet-title">원본 백업</h2>
              </div>
              <button type="button" className="sheet-close" onClick={() => setBackupSheetOpen(false)} aria-label="원본 백업 닫기">×</button>
            </header>
            <p className="sheet-copy">손끝 원본 파일에는 스트로크, 실행 취소 기록, 보기 상태와 배경 이미지가 들어 있어 나중에 다시 편집할 수 있습니다.</p>
            <div className="backup-actions">
              <button type="button" className="confirm-button" onClick={() => void handleProjectBackup()}>원본 파일 저장</button>
              <button type="button" onClick={() => projectFileRef.current?.click()}>원본 파일 불러오기</button>
              <input
                ref={projectFileRef}
                type="file"
                accept=".fingertip,.json,application/vnd.fingertip.project+json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleProjectRestore(file)
                  event.target.value = ''
                }}
              />
            </div>
          </section>
        </div>
      )}
      <ProjectListSheet
        open={projectSheetOpen}
        entries={projects}
        activeId={activeProjectId}
        busy={projectBusy}
        onClose={() => !projectBusy && setProjectSheetOpen(false)}
        onNew={handleNewDrawing}
        onOpen={handleOpenProject}
        onDuplicate={handleDuplicateProject}
        onDelete={handleDeleteProject}
      />
      <LayerSheet
        open={layerSheetOpen}
        layers={drawingState.layers}
        activeLayerId={drawingState.activeLayerId}
        onClose={() => setLayerSheetOpen(false)}
        onAdd={() => controllerRef.current?.addLayer()}
        onSelect={(id) => controllerRef.current?.selectLayer(id)}
        onToggle={(id) => controllerRef.current?.toggleLayer(id)}
        onOpacity={(id, opacity) => controllerRef.current?.setLayerOpacity(id, opacity)}
        onMove={(id, direction) => controllerRef.current?.moveLayer(id, direction)}
        onDuplicate={(id) => controllerRef.current?.duplicateLayer(id)}
        onDelete={(id) => controllerRef.current?.deleteLayer(id)}
      />
    </main>
  )
}

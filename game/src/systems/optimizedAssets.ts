type LoaderMethod = (key: unknown, url?: unknown, ...rest: unknown[]) => unknown

interface ImageLoaderPrototype {
  image: LoaderMethod
  spritesheet: LoaderMethod
  start: () => unknown
}

interface LoaderRuntime {
  list?: { size: number }
  on: (event: string, listener: (value: number) => void) => void
  off: (event: string, listener: (value: number) => void) => void
  once: (event: string, listener: () => void) => void
}

function setLoadingOverlay(visible: boolean, progress = 0): void {
  const overlay = document.getElementById('asset-loading')
  if (!overlay) return
  const clamped = Math.min(1, Math.max(0, progress))
  overlay.classList.toggle('is-hidden', !visible)
  overlay.setAttribute('aria-hidden', visible ? 'false' : 'true')
  const bar = document.getElementById('asset-loading-bar')
  const label = document.getElementById('asset-loading-progress')
  const status = document.getElementById('asset-loading-status')
  if (bar) bar.style.width = `${Math.max(4, clamped * 100)}%`
  if (label) label.textContent = `${Math.round(clamped * 100)}%`
  if (status) status.textContent = clamped < 0.55 ? '正在装载云图与仙众...' : '正在校准场景与交互...'
}

export function optimizedImageUrl(url: string): string {
  return url.replace(/\.(png|jpe?g)(?=($|[?#]))/i, '.webp')
}

export function installOptimizedImageLoader(prototype: object): void {
  const loader = prototype as ImageLoaderPrototype
  for (const method of ['image', 'spritesheet'] as const) {
    const original = loader[method]
    loader[method] = function (key: unknown, url?: unknown, ...rest: unknown[]): unknown {
      return original.call(
        this,
        key,
        typeof url === 'string' ? optimizedImageUrl(url) : url,
        ...rest,
      )
    }
  }

  const originalStart = loader.start
  loader.start = function (): unknown {
    const runtime = this as unknown as LoaderRuntime
    if ((runtime.list?.size ?? 0) > 0) {
      const onProgress = (value: number): void => setLoadingOverlay(true, value)
      setLoadingOverlay(true, 0)
      runtime.on('progress', onProgress)
      runtime.once('complete', () => {
        runtime.off('progress', onProgress)
        setLoadingOverlay(false, 1)
      })
    } else {
      setLoadingOverlay(false, 1)
    }
    return originalStart.call(this)
  }
}

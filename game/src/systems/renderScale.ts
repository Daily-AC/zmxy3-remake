export const LOGICAL_WIDTH = 960
export const LOGICAL_HEIGHT = 540

export interface RenderMetrics {
  scale: number
  width: number
  height: number
}

export function computeRenderMetrics(devicePixelRatio: number): RenderMetrics {
  const finite = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1
  const scale = Math.min(2, Math.max(1, finite))
  return {
    scale,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
  }
}

export const RENDER_METRICS = computeRenderMetrics(
  typeof window === 'undefined' ? 1 : window.devicePixelRatio,
)

export function logicalPointerPosition(
  pointer: Pick<{ x: number; y: number }, 'x' | 'y'>,
  _scale = RENDER_METRICS.scale,
): { x: number; y: number } {
  return { x: pointer.x, y: pointer.y }
}

export function withTextResolution<T extends Record<string, unknown>>(
  style: T,
  scale = RENDER_METRICS.scale,
): T & { resolution: number } {
  return {
    ...style,
    resolution: typeof style.resolution === 'number' ? style.resolution : scale,
  }
}

export function configureLogicalCamera(scene: {
  cameras: { main: { setZoom: (value: number) => unknown } }
}): void {
  scene.cameras.main.setZoom(1)
}

interface TextFactoryPrototype {
  text: (x: number, y: number, text: string | string[], style?: Record<string, unknown>) => unknown
  __zaixuHiDpiText?: boolean
}

export function installHiDpiTextFactory(factoryPrototype: TextFactoryPrototype): void {
  if (factoryPrototype.__zaixuHiDpiText) return
  const original = factoryPrototype.text
  factoryPrototype.text = function (this: unknown, x, y, text, style = {}) {
    return original.call(this, x, y, text, withTextResolution(style))
  }
  factoryPrototype.__zaixuHiDpiText = true
}

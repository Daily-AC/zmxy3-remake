// Generic runtime for tools/prefab-compiler's output: a compiled FFDec
// symbol tree (tools/prefab-compiler/README.md documents the JSON schema)
// materialized into a Phaser Container tree. This is the "构造即正确" half
// of the compiler pipeline (tasks/prefab-compiler-brief.md) -- coordinates
// come straight from the compiled matrix/originFrac, no hand-typed offsets.
//
// Split in two layers on purpose, matching this project's existing test
// convention (systems/ pure logic vs scenes/ Phaser glue, see CLAUDE.md
// "架构原则"): `normalizeNode`/`indexInstances`/`countFrames` are pure
// functions over the plain JSON (unit-tested without touching Phaser --
// nothing in this codebase's test suite constructs a live Phaser.Scene);
// `PrefabLoader.build()` is the thin Phaser-materializing step exercised by
// the real scenes (SkillTreeScene/BattleScene) and by screenshot-based
// acceptance, not by vitest.

import Phaser from 'phaser'

// ---------------------------------------------------------------------------
// JSON schema (mirrors tools/prefab-compiler/compiler.py's output exactly)
// ---------------------------------------------------------------------------

export interface PrefabMatrix {
  tx: number
  ty: number
  scaleX: number
  scaleY: number
  rotSkew0: number
  rotSkew1: number
}

export interface PrefabBounds {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  w: number
  h: number
}

export interface PrefabOrigin {
  x: number
  y: number
}

export type PrefabNodeType = 'container' | 'image' | 'text' | 'unknown'

export interface PrefabFrame {
  frame: number
  frameLabel?: string
  /** container/button frames: nested subtree for this frame. */
  children?: PrefabNode[]
  /** sprite-flattened frames: an opaque per-frame raster instead of children. */
  textureKey?: string
  textureFile?: string
  textureMissing?: boolean
  exportedPngSize?: { w: number; h: number }
}

export interface PrefabNode {
  type: PrefabNodeType
  characterId?: number
  symbolKind?: string
  instanceName?: string | null
  depth?: number | null
  matrix?: PrefabMatrix
  boundsPx?: PrefabBounds | null
  originFrac?: PrefabOrigin
  textureKey?: string
  textureFile?: string
  textureMissing?: boolean
  frameCount?: number
  children?: PrefabNode[]
  frames?: PrefabFrame[]
  text?: string | null
  fontSize?: number | null
  color?: string | null
}

export interface PrefabDocument {
  symbol: string
  characterId: number
  sourceSwf: string
  root: PrefabNode
  warnings: string[]
}

export const IDENTITY_MATRIX: PrefabMatrix = {
  tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotSkew0: 0, rotSkew1: 0,
}
export const DEFAULT_ORIGIN: PrefabOrigin = { x: 0, y: 0 }

// ---------------------------------------------------------------------------
// pure helpers (no Phaser) -- unit-tested directly
// ---------------------------------------------------------------------------

/** Fills in defaults a compiled node may omit (root nodes have no `matrix`;
 * leaves with no derivable bounds have `boundsPx: null`). Never mutates the
 * input. */
export function normalizeNode(node: PrefabNode): PrefabNode {
  return {
    ...node,
    matrix: node.matrix ?? IDENTITY_MATRIX,
    originFrac: node.originFrac ?? DEFAULT_ORIGIN,
    instanceName: node.instanceName ?? null,
  }
}

/** Rotation angle (radians) approximated from the matrix's rotate/skew
 * terms, assuming no true skew (holds for every symbol this compiler has
 * been run against so far -- see PrefabLoader header). Documented lossy
 * fallback, not silently wrong: a genuinely skewed matrix will render at a
 * plausible-but-not-exact rotation rather than throwing. */
export function approximateRotation(m: PrefabMatrix): number {
  if (m.rotSkew0 === 0 && m.rotSkew1 === 0) return 0
  return Math.atan2(m.rotSkew0, m.scaleX)
}

function childrenOf(node: PrefabNode): PrefabNode[] {
  if (node.children) return node.children
  if (node.frames && node.frames.length > 0) {
    // instance-name indexing looks through every frame, not just frame 1 --
    // a named node hidden until frame 3 (e.g. WorldMapScene's hover state)
    // must still be discoverable.
    return node.frames.flatMap((f) => f.children ?? [])
  }
  return []
}

/** instanceName -> node, for every named PlaceObject anywhere in the tree
 * (recursing into every frame of multi-frame nodes). Throws on a duplicate
 * name within one document -- that would silently shadow interaction
 * wiring, better to fail loudly at load time. */
export function indexInstances(root: PrefabNode, out: Map<string, PrefabNode> = new Map()): Map<string, PrefabNode> {
  if (root.instanceName) {
    if (out.has(root.instanceName)) {
      throw new Error(`prefab: duplicate instanceName "${root.instanceName}"`)
    }
    out.set(root.instanceName, root)
  }
  for (const child of childrenOf(root)) indexInstances(child, out)
  return out
}

/** 1 for a static node; frames.length for a multi-frame container or
 * sprite-flattened leaf. */
export function countFrames(node: PrefabNode): number {
  return node.frames && node.frames.length > 0 ? node.frames.length : 1
}

export function isMultiFrame(node: PrefabNode): boolean {
  return countFrames(node) > 1
}

// ---------------------------------------------------------------------------
// Phaser materialization
// ---------------------------------------------------------------------------

export interface PrefabMultiFrameHandle {
  characterId?: number
  instanceName: string | null
  frameCount: number
  currentFrame: number
  container: Phaser.GameObjects.Container
  /** 1-indexed, matches the compiled JSON's `frame` numbering (and thus the
   * original SWF's gotoAndStop(n) semantics where the compiler could infer
   * a frameLabel). */
  gotoFrame(n: number): void
}

export interface PrefabInstance {
  root: Phaser.GameObjects.Container
  instances: Map<string, Phaser.GameObjects.GameObject>
  multiFrame: PrefabMultiFrameHandle[]
  warnings: string[]
}

export interface PrefabBuildOptions {
  /** Resolves a compiled node/frame to an already-`scene.load.image`-ed
   * Phaser texture key. Defaults to `textureFile ?? textureKey` as-is --
   * pass this when your scene loads textures under different keys (e.g.
   * prefixed `st_${textureKey}`). */
  textureKeyFor?: (node: PrefabNode, frame?: PrefabFrame) => string | undefined
  /** x,y position of the compiled root symbol within the scene/parent container. */
  x?: number
  y?: number
}

function defaultTextureKeyFor(node: PrefabNode, frame?: PrefabFrame): string | undefined {
  return frame?.textureKey ?? frame?.textureFile ?? node.textureFile ?? node.textureKey
}

export class PrefabLoader {
  constructor(private scene: Phaser.Scene) {}

  build(doc: PrefabDocument, opts: PrefabBuildOptions = {}): PrefabInstance {
    const instances = new Map<string, Phaser.GameObjects.GameObject>()
    const multiFrame: PrefabMultiFrameHandle[] = []
    const textureKeyFor = opts.textureKeyFor ?? defaultTextureKeyFor
    const warnings = [...doc.warnings]

    const rootObj = this.materialize(normalizeNode(doc.root), textureKeyFor, instances, multiFrame, warnings)
    const root = rootObj as Phaser.GameObjects.Container
    root.setPosition(opts.x ?? 0, opts.y ?? 0)
    return { root, instances, multiFrame, warnings }
  }

  private applyTransform(obj: Phaser.GameObjects.Components.Transform, node: PrefabNode): void {
    const m = node.matrix ?? IDENTITY_MATRIX
    obj.setPosition(m.tx, m.ty)
    obj.setScale(m.scaleX, m.scaleY)
    const rot = approximateRotation(m)
    if (rot !== 0) obj.setRotation(rot)
  }

  private materialize(
    node: PrefabNode,
    textureKeyFor: (node: PrefabNode, frame?: PrefabFrame) => string | undefined,
    instances: Map<string, Phaser.GameObjects.GameObject>,
    multiFrame: PrefabMultiFrameHandle[],
    warnings: string[],
  ): Phaser.GameObjects.GameObject {
    if (node.type === 'image') {
      if (isMultiFrame(node)) {
        return this.materializeMultiFrameImage(node, textureKeyFor, instances, multiFrame, warnings)
      }
      const obj = this.materializeImage(node, node, textureKeyFor, warnings)
      this.applyTransform(obj, node)
      this.registerInstance(node, obj, instances)
      return obj
    }

    if (node.type === 'text') {
      const t = this.scene.add.text(0, 0, node.text ?? '', {
        fontSize: `${node.fontSize ?? 12}px`,
        color: node.color ?? '#ffffff',
      })
      this.applyTransform(t, node)
      this.registerInstance(node, t, instances)
      return t
    }

    // container (incl. buttons, which compile down to a container too)
    if (isMultiFrame(node)) {
      return this.materializeMultiFrameContainer(node, textureKeyFor, instances, multiFrame, warnings)
    }
    const container = this.scene.add.container(0, 0)
    for (const child of node.children ?? []) {
      const childObj = this.materialize(normalizeNode(child), textureKeyFor, instances, multiFrame, warnings)
      this.applyTransform(childObj as unknown as Phaser.GameObjects.Components.Transform, child)
      container.add(childObj)
    }
    this.registerInstance(node, container, instances)
    return container
  }

  private materializeImage(
    node: PrefabNode,
    textureSource: PrefabNode | PrefabFrame,
    textureKeyFor: (node: PrefabNode, frame?: PrefabFrame) => string | undefined,
    warnings: string[],
  ): Phaser.GameObjects.Image {
    const isFrame = 'frame' in textureSource
    const key = isFrame ? textureKeyFor(node, textureSource as PrefabFrame) : textureKeyFor(node)
    const missing = isFrame ? (textureSource as PrefabFrame).textureMissing : node.textureMissing
    if (missing || !key || !this.scene.textures.exists(key)) {
      warnings.push(`prefab: no texture for cid=${node.characterId} (key=${key ?? 'none'}) -- rendering as empty placeholder, not inventing art`)
      const img = this.scene.add.image(0, 0, '__MISSING')
      img.setVisible(false)
      return img
    }
    const img = this.scene.add.image(0, 0, key)
    const origin = node.originFrac ?? DEFAULT_ORIGIN
    img.setOrigin(origin.x, origin.y)
    return img
  }

  private registerInstance(node: PrefabNode, obj: Phaser.GameObjects.GameObject, instances: Map<string, Phaser.GameObjects.GameObject>): void {
    if (node.instanceName) instances.set(node.instanceName, obj)
  }

  private materializeMultiFrameContainer(
    node: PrefabNode,
    textureKeyFor: (node: PrefabNode, frame?: PrefabFrame) => string | undefined,
    instances: Map<string, Phaser.GameObjects.GameObject>,
    multiFrame: PrefabMultiFrameHandle[],
    warnings: string[],
  ): Phaser.GameObjects.Container {
    const wrapper = this.scene.add.container(0, 0)
    const frameContainers: Phaser.GameObjects.Container[] = []
    for (const frame of node.frames ?? []) {
      const fc = this.scene.add.container(0, 0)
      for (const child of frame.children ?? []) {
        const childObj = this.materialize(normalizeNode(child), textureKeyFor, instances, multiFrame, warnings)
        this.applyTransform(childObj as unknown as Phaser.GameObjects.Components.Transform, child)
        fc.add(childObj)
      }
      fc.setVisible(false)
      wrapper.add(fc)
      frameContainers.push(fc)
    }
    if (frameContainers.length > 0) frameContainers[0].setVisible(true)
    const handle: PrefabMultiFrameHandle = {
      characterId: node.characterId,
      instanceName: node.instanceName ?? null,
      frameCount: frameContainers.length,
      currentFrame: 1,
      container: wrapper,
      gotoFrame(n: number) {
        if (n < 1 || n > frameContainers.length) {
          throw new RangeError(`prefab: gotoFrame(${n}) out of range 1..${frameContainers.length}`)
        }
        frameContainers.forEach((fc, i) => fc.setVisible(i === n - 1))
        handle.currentFrame = n
      },
    }
    multiFrame.push(handle)
    this.registerInstance(node, wrapper, instances)
    return wrapper
  }

  private materializeMultiFrameImage(
    node: PrefabNode,
    textureKeyFor: (node: PrefabNode, frame?: PrefabFrame) => string | undefined,
    instances: Map<string, Phaser.GameObjects.GameObject>,
    multiFrame: PrefabMultiFrameHandle[],
    warnings: string[],
  ): Phaser.GameObjects.Container {
    const wrapper = this.scene.add.container(0, 0)
    const frameImages: Phaser.GameObjects.Image[] = []
    for (const frame of node.frames ?? []) {
      const img = this.materializeImage(node, frame, textureKeyFor, warnings)
      img.setVisible(false)
      wrapper.add(img)
      frameImages.push(img)
    }
    if (frameImages.length > 0) frameImages[0].setVisible(true)
    const handle: PrefabMultiFrameHandle = {
      characterId: node.characterId,
      instanceName: node.instanceName ?? null,
      frameCount: frameImages.length,
      currentFrame: 1,
      container: wrapper,
      gotoFrame(n: number) {
        if (n < 1 || n > frameImages.length) {
          throw new RangeError(`prefab: gotoFrame(${n}) out of range 1..${frameImages.length}`)
        }
        frameImages.forEach((img, i) => img.setVisible(i === n - 1))
        handle.currentFrame = n
      },
    }
    multiFrame.push(handle)
    this.registerInstance(node, wrapper, instances)
    return wrapper
  }
}

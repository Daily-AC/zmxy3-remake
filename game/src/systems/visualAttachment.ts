export type VisualAnchor = 'hero' | 'target' | 'world'

export interface VisualAttachmentSpec {
  anchor: VisualAnchor
  offset: { forward: number; y: number }
  pivotPx: { x: number; y: number }
  scale: number
  followAnchor: boolean
}

export function resolveVisualAttachment(input: {
  anchor: { x: number; y: number }
  facing: -1 | 1
  offset: { forward: number; y: number }
  pivotPx: { x: number; y: number }
  scale: number
}): { x: number; y: number; originX: number; originY: number; flipX: boolean } {
  return {
    x: input.anchor.x + input.facing * input.offset.forward,
    y: input.anchor.y + input.offset.y,
    originX: input.pivotPx.x,
    originY: input.pivotPx.y,
    flipX: input.facing === 1,
  }
}

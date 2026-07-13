export interface HitStopRelease {
  actorId: string
  pendingAction: string | null
}

export interface HitStopEndResult {
  released: readonly HitStopRelease[]
  hasActiveStops: boolean
}

export function presentationActionPriority(action: string): number {
  if (action === 'dead') return 30
  if (action === 'hurt') return 20
  return 10
}

function uniqueActorIds(actorIds: readonly string[]): string[] {
  return [...new Set(actorIds)]
}

export class PresentationHitStopGate {
  private readonly stopCounts = new Map<string, number>()
  private readonly pendingActions = new Map<string, string>()

  begin(actorIds: readonly string[]): readonly string[] {
    const newlyStopped: string[] = []
    for (const actorId of uniqueActorIds(actorIds)) {
      const count = this.stopCounts.get(actorId) ?? 0
      this.stopCounts.set(actorId, count + 1)
      if (count === 0) newlyStopped.push(actorId)
    }
    return newlyStopped
  }

  requestAction(actorId: string, action: string): { applyNow: boolean } {
    if (!this.isStopped(actorId)) return { applyNow: true }
    const pending = this.pendingActions.get(actorId)
    if (!pending || presentationActionPriority(action) >= presentationActionPriority(pending)) {
      this.pendingActions.set(actorId, action)
    }
    return { applyNow: false }
  }

  end(actorIds: readonly string[]): HitStopEndResult {
    const released: HitStopRelease[] = []
    for (const actorId of uniqueActorIds(actorIds)) {
      const count = this.stopCounts.get(actorId) ?? 0
      if (count === 0) continue
      if (count <= 1) {
        this.stopCounts.delete(actorId)
        const pendingAction = this.pendingActions.get(actorId) ?? null
        this.pendingActions.delete(actorId)
        released.push({ actorId, pendingAction })
      } else {
        this.stopCounts.set(actorId, count - 1)
      }
    }
    return { released, hasActiveStops: this.hasActiveStops() }
  }

  isStopped(actorId: string): boolean {
    return (this.stopCounts.get(actorId) ?? 0) > 0
  }

  hasActiveStops(): boolean {
    return this.stopCounts.size > 0
  }

  clear(): void {
    this.stopCounts.clear()
    this.pendingActions.clear()
  }
}

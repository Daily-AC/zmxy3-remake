export interface SingleFlightSnapshotCaptureOptions<Input, Output> {
  request(callback: (value: Input) => void): void
  decode(value: Input): Output
  timeoutMs?: number
  schedule?: (callback: () => void, timeoutMs: number) => unknown
  cancel?: (handle: unknown) => void
}

interface SnapshotFlight<Output> {
  promise: Promise<Output>
  reject(reason: Error): void
}

const DEFAULT_TIMEOUT_MS = 5000

export class SingleFlightSnapshotCapture<Input, Output> {
  private readonly request: (callback: (value: Input) => void) => void
  private readonly decode: (value: Input) => Output
  private readonly timeoutMs: number
  private readonly schedule: (callback: () => void, timeoutMs: number) => unknown
  private readonly cancel: (handle: unknown) => void
  private inFlight: SnapshotFlight<Output> | null = null

  constructor(options: SingleFlightSnapshotCaptureOptions<Input, Output>) {
    this.request = options.request
    this.decode = options.decode
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.schedule = options.schedule ?? ((callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs))
    this.cancel = options.cancel ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  capture(): Promise<Output> {
    if (this.inFlight) return this.inFlight.promise

    let resolvePromise!: (value: Output) => void
    let rejectPromise!: (reason: Error) => void
    const promise = new Promise<Output>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    let settled = false
    let timeoutHandle: unknown
    const flight: SnapshotFlight<Output> = {
      promise,
      reject: (reason) => settleReject(reason),
    }
    const cleanup = (): void => {
      try {
        if (timeoutHandle !== undefined) this.cancel(timeoutHandle)
      } finally {
        if (this.inFlight === flight) this.inFlight = null
      }
    }
    const settleResolve = (value: Output): void => {
      if (settled) return
      settled = true
      try {
        cleanup()
      } catch {
        // Cleanup must never prevent the shared Promise from settling.
      }
      resolvePromise(value)
    }
    const settleReject = (reason: Error): void => {
      if (settled) return
      settled = true
      try {
        cleanup()
      } catch {
        // Cleanup must never prevent the shared Promise from settling.
      }
      rejectPromise(reason)
    }

    this.inFlight = flight
    try {
      timeoutHandle = this.schedule(
        () => settleReject(new Error(`renderer snapshot timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      )
      this.request((value) => {
        try {
          settleResolve(this.decode(value))
        } catch (error) {
          settleReject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    } catch (error) {
      settleReject(error instanceof Error ? error : new Error(String(error)))
    }
    return promise
  }

  shutdown(reason = new Error('renderer snapshot cancelled by scene shutdown')): void {
    this.inFlight?.reject(reason)
  }
}

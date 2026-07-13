import { describe, expect, it } from 'vitest'
import { SingleFlightSnapshotCapture } from '../src/presentation/singleFlightSnapshotCapture'

describe('combat core renderer snapshot capture', () => {
  it('shares one in-flight request and starts a fresh request after completion', async () => {
    let requests = 0
    let callback: ((value: string) => void) | undefined
    const capture = new SingleFlightSnapshotCapture<string, string>({
      request: (next) => { requests += 1; callback = next },
      decode: (value) => value,
    })

    const first = capture.capture()
    const second = capture.capture()
    expect(first).toBe(second)
    expect(requests).toBe(1)
    callback?.('data:image/png;base64,first')
    await expect(Promise.all([first, second])).resolves.toEqual([
      'data:image/png;base64,first',
      'data:image/png;base64,first',
    ])

    const third = capture.capture()
    expect(requests).toBe(2)
    callback?.('data:image/png;base64,second')
    await expect(third).resolves.toBe('data:image/png;base64,second')
  })

  it('rejects and clears the flight when the requester or callback decoder fails', async () => {
    const requestFailure = new SingleFlightSnapshotCapture<string, string>({
      request: () => { throw new Error('request failed') },
      decode: (value) => value,
    })
    await expect(requestFailure.capture()).rejects.toThrow('request failed')

    let callback: ((value: string) => void) | undefined
    let requests = 0
    const decodeFailure = new SingleFlightSnapshotCapture<string, string>({
      request: (next) => { requests += 1; callback = next },
      decode: () => { throw new Error('not an image') },
    })
    const rejected = expect(decodeFailure.capture()).rejects.toThrow('not an image')
    callback?.('invalid')
    await rejected
    decodeFailure.capture().catch(() => undefined)
    expect(requests).toBe(2)
    decodeFailure.shutdown()
  })

  it('rejects timed-out captures and permits a later retry', async () => {
    const scheduled: Array<() => void> = []
    let requests = 0
    const capture = new SingleFlightSnapshotCapture<string, string>({
      request: () => { requests += 1 },
      decode: (value) => value,
      timeoutMs: 50,
      schedule: (callback) => { scheduled.push(callback); return callback },
      cancel: () => undefined,
    })

    const timedOut = expect(capture.capture()).rejects.toThrow('timed out after 50ms')
    scheduled.shift()?.()
    await timedOut
    capture.capture().catch(() => undefined)
    expect(requests).toBe(2)
    capture.shutdown()
  })

  it('rejects an in-flight capture when the scene shuts down', async () => {
    const capture = new SingleFlightSnapshotCapture<string, string>({
      request: () => undefined,
      decode: (value) => value,
    })
    const rejected = expect(capture.capture()).rejects.toThrow('scene shutdown')
    capture.shutdown(new Error('scene shutdown'))
    await rejected
  })
})

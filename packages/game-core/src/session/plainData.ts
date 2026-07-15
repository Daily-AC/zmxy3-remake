export function assertPlainData(input: unknown, label: string): void {
  const ancestors = new WeakSet<object>()
  const visitDataProperty = (owner: object, key: PropertyKey): void => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    if (!descriptor) throw new TypeError(`${label} contains an invalid property`)
    if ('get' in descriptor || 'set' in descriptor) {
      throw new TypeError(`${label} must not contain accessors`)
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`${label} must not contain non-enumerable properties`)
    }
    visit(descriptor.value)
  }
  const visit = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return
    if (typeof value !== 'object') throw new TypeError(`${label} must contain only plain data`)
    if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles`)
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          throw new TypeError(`${label} must contain only plain arrays`)
        }
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key === 'symbol') throw new TypeError(`${label} arrays must not contain symbol keys`)
          if (key === 'length') continue
          const index = Number(key)
          if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
            throw new TypeError(`${label} arrays may contain only indexes and length`)
          }
          visitDataProperty(value, key)
        }
        return
      }
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${label} must contain only plain objects`)
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') throw new TypeError(`${label} objects must not contain symbol keys`)
        visitDataProperty(value, key)
      }
    } finally {
      ancestors.delete(value)
    }
  }
  visit(input)
}

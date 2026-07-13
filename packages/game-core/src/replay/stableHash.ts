import { cloneSerializable } from '../session/snapshot'

function stringifyCanonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('value is not JSON-serializable')
    return encoded
  }
  if (Array.isArray(value)) return '[' + value.map(stringifyCanonical).join(',') + ']'
  const record = value as Record<string, unknown>
  return '{' + Object.keys(record)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + stringifyCanonical(record[key]))
    .join(',') + '}'
}

export function stableStringify(value: unknown): string {
  return stringifyCanonical(cloneSerializable(value))
}

export function stableHash(value: unknown): string {
  const input = stableStringify(value)
  let hash = 0x811c9dc5

  const writeByte = (byte: number): void => {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }

  for (const character of input) {
    const codePoint = character.codePointAt(0) as number
    if (codePoint <= 0x7f) {
      writeByte(codePoint)
    } else if (codePoint <= 0x7ff) {
      writeByte(0xc0 | (codePoint >>> 6))
      writeByte(0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      writeByte(0xe0 | (codePoint >>> 12))
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f))
      writeByte(0x80 | (codePoint & 0x3f))
    } else {
      writeByte(0xf0 | (codePoint >>> 18))
      writeByte(0x80 | ((codePoint >>> 12) & 0x3f))
      writeByte(0x80 | ((codePoint >>> 6) & 0x3f))
      writeByte(0x80 | (codePoint & 0x3f))
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

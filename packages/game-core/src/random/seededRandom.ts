const ZERO_SEED_FALLBACK = 0x6d2b79f5

export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || ZERO_SEED_FALLBACK
  }

  static fromState(state: number): SeededRandom {
    return new SeededRandom(state)
  }

  getState(): number {
    return this.state >>> 0
  }

  nextUint32(): number {
    let value = this.state >>> 0
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state
  }

  next(): number {
    return this.nextUint32() / 0x100000000
  }
}

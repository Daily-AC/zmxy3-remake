import { describe, expect, it } from 'vitest'
import { resolveLaojunGift } from '../src/systems/npcGift'

describe('Laojun bounded gift roll', () => {
  it('rejects arbitrary LLM-created items without spending the one allowed roll', () => {
    expect(resolveLaojunGift('made-up-sword', false, () => 0)).toEqual({ status: 'disallowed', attempted: false })
  })

  it('awards the canonical ordinary pilgrim staff when the injected roll succeeds', () => {
    const result = resolveLaojunGift('ptdxzg', false, () => 0)
    expect(result.status).toBe('awarded')
    expect(result.attempted).toBe(true)
    if (result.status !== 'awarded') return
    expect(result.item).toMatchObject({
      id: 'ptdxzg',
      name: '普通的行者棍',
      sourceType: 'zbwq',
      sourceUser: '悟空',
      sourceShowId: 1,
    })
  })

  it('allows only one eligible roll per world-map session', () => {
    expect(resolveLaojunGift('ptdxzg', false, () => 1)).toEqual({ status: 'missed', attempted: true })
    expect(resolveLaojunGift('ptdxzg', true, () => 0)).toEqual({ status: 'already_attempted', attempted: true })
  })
})

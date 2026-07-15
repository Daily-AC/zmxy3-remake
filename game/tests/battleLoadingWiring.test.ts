import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('battle loading wiring', () => {
  it('registers legacy and production battle scenes behind BattleLoadingScene', () => {
    const shared = read('../src/scenes/shellShared.ts')
    const main = read('../src/main.ts')
    expect(shared).toMatch(/battleLoading: 'battle-loading'/)
    expect(main).toMatch(/import \{ BattleLoadingScene \} from '\.\/scenes\/BattleLoadingScene'/)
    expect(main).toMatch(/SkillTreeScene, BattleLoadingScene, BattleScene/)
    expect(shared).toMatch(/battleRuntime: 'battle-runtime'/)
    expect(main).toMatch(/BattleScene, BattleRuntimeScene/)
  })

  it('routes solo campaign entry through loading with nested battleData', () => {
    const worldMap = read('../src/scenes/WorldMapScene.ts')
    expect(worldMap).toMatch(/BATTLE_LOADING_BACKGROUNDS/)
    expect(worldMap).toMatch(
      /this\.scene\.start\(SCENE\.battleLoading, \{ battleData: \{ campaignIndex, activeSlot: this\.slot, runtime \} \}\)/,
    )
    expect(worldMap).not.toMatch(/this\.scene\.start\(SCENE\.battle, \{ campaignIndex \}\)/)
  })

  it('routes coop entry through loading without dropping campaign or session data', () => {
    const lobby = read('../src/scenes/LobbyScene.ts')
    expect(lobby).toMatch(/BATTLE_LOADING_BACKGROUNDS/)
    expect(lobby).toMatch(
      /this\.scene\.start\(SCENE\.battleLoading, \{\s*battleData: \{ campaignIndex: levelIdToIndex\(levelId\), coopSession \},\s*\}\)/,
    )
    expect(lobby).not.toMatch(/this\.scene\.start\(SCENE\.battle, \{ campaignIndex: levelIdToIndex\(levelId\), coopSession \}\)/)
  })

  it('emits the explicit ready event only after BattleScene create initialization', () => {
    const battle = read('../src/scenes/BattleScene.ts')
    expect(battle).toMatch(/export const BATTLE_READY_EVENT = 'battle-ready'/)
    expect(battle).toMatch(/this\.startCoopSync\(\)[\s\S]*this\.events\.emit\(BATTLE_READY_EVENT\)/)
  })
})

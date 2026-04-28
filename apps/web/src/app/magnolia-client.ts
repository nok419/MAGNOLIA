import { MagnoliaGameSession } from "@magnolia/game-session"
import {
  createDexieSaveRepository,
  loadContentBundle,
} from "@magnolia/persistence"

export async function createMagnoliaClient(): Promise<MagnoliaGameSession> {
  // session 生成と保存層の接続は、画面や hook から見えない境界に閉じます。
  const content = loadContentBundle()
  const repository = createDexieSaveRepository({ content })
  const session = new MagnoliaGameSession({
    content,
    repository,
  })
  await session.initialize()
  return session
}

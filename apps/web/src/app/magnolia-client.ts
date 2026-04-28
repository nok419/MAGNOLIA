import type { ContentBundle } from "@magnolia/contracts"
import { MagnoliaGameSession } from "@magnolia/game-session"
import {
  createDexieSaveRepository,
  loadContentBundle,
} from "@magnolia/persistence"

export type MagnoliaClient = {
  content: ContentBundle
  session: MagnoliaGameSession
}

export async function createMagnoliaClient(): Promise<MagnoliaClient> {
  // Web app の composition root。repository と session の具象生成はここへ閉じる。
  const content = loadContentBundle()
  const repository = createDexieSaveRepository({ content })
  const session = new MagnoliaGameSession({
    content,
    repository,
  })
  await session.initialize()
  return {
    content,
    session,
  }
}

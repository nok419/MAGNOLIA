export function resolveBattleRenderer<T>(registry: Record<string, T>, candidates: Array<string | undefined>): T {
  for (const candidate of candidates) {
    if (candidate && registry[candidate]) {
      return registry[candidate]
    }
  }
  return registry.default
}

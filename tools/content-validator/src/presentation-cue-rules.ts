import {
  addIssue,
  asArray,
  asNumber,
  asRecord,
  asString,
  type ValidationContext,
} from "./validate-content.js"

const CHANNELS = new Set(["overlay", "explore", "battle", "transition", "ui"])

export function validatePresentationCueRules(context: ValidationContext): void {
  const file = context.store.files.find((entry) => entry.gameplayRelativePath === "presentation-cues.json")
  if (!file) {
    addIssue(context, "Missing presentation-cues.json.", "content/gameplay")
    return
  }

  for (const cue of asArray(file.data)) {
    const record = asRecord(cue)
    const id = asString(record?.id) ?? "(unknown)"
    if (!CHANNELS.has(asString(record?.channel) ?? "")) {
      addIssue(context, `Presentation cue '${id}' has unsupported channel '${String(record?.channel)}'.`, file.relativePath)
    }
    const durationMs = asNumber(record?.defaultDurationMs)
    if (durationMs === undefined || durationMs <= 0 || durationMs > 10000) {
      addIssue(context, `Presentation cue '${id}' must declare defaultDurationMs between 1 and 10000.`, file.relativePath)
    }
    const reduceFlashingVariant = asRecord(record?.reduceFlashingVariant)
    if (!reduceFlashingVariant) {
      addIssue(context, `Presentation cue '${id}' must declare reduceFlashingVariant.`, file.relativePath)
    }
    const variantDuration = asNumber(reduceFlashingVariant?.defaultDurationMs)
    if (variantDuration !== undefined && durationMs !== undefined && variantDuration > durationMs * 1.5) {
      addIssue(context, `Presentation cue '${id}' reduceFlashingVariant duration is unexpectedly long.`, file.relativePath)
    }
    const maxFlashHz = asNumber(record?.maxFlashHz)
    if (maxFlashHz !== undefined && maxFlashHz > 3) {
      addIssue(context, `Presentation cue '${id}' maxFlashHz must be 3 or lower.`, file.relativePath)
    }
  }
}

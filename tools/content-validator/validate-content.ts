import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { validatePresentationCueRules } from "./presentation-cue-rules.js"
import { validatePresetRules } from "./preset-rules.js"
import { validateReferenceRules } from "./reference-rules.js"
import { validateTimingRules } from "./timing-rules.js"

export type ContentFile = {
  path: string
  relativePath: string
  gameplayRelativePath: string
  data: unknown
}

export type ContentStore = {
  rootDir: string
  gameplayDir: string
  files: ContentFile[]
  byGroup: Record<string, ContentFile[]>
}

export type ValidationIssue = {
  file?: string
  message: string
}

export type ValidationContext = {
  store: ContentStore
  issues: ValidationIssue[]
}

export function addIssue(context: ValidationContext, message: string, file?: string): void {
  context.issues.push({ file, message })
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function getId(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) {
      return value
    }
  }
  return undefined
}

export function indexById(files: readonly ContentFile[], keys: readonly string[]): Map<string, ContentFile> {
  const index = new Map<string, ContentFile>()
  for (const file of files) {
    const record = asRecord(file.data)
    if (!record) {
      continue
    }
    const id = getId(record, keys)
    if (id) {
      index.set(id, file)
    }
  }
  return index
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function collectJsonFiles(dir: string, rootDir: string, gameplayDir: string): ContentFile[] {
  if (!existsSync(dir)) {
    return []
  }

  const files: ContentFile[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath, rootDir, gameplayDir))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }
    files.push({
      path: entryPath,
      relativePath: path.relative(rootDir, entryPath),
      gameplayRelativePath: path.relative(gameplayDir, entryPath),
      data: readJson(entryPath),
    })
  }
  return files
}

function groupFiles(files: readonly ContentFile[], gameplayDir: string): Record<string, ContentFile[]> {
  const groups: Record<string, ContentFile[]> = {}
  for (const file of files) {
    const parts = file.gameplayRelativePath.split(path.sep)
    const group = parts[0] === "equipment" && parts[1] === "effects"
      ? "equipment/effects"
      : parts[0]
    groups[group] ??= []
    groups[group].push(file)
  }
  return groups
}

function createStore(): ContentStore {
  const rootDir = process.cwd()
  const gameplayDir = path.join(rootDir, "content", "gameplay")
  const files = collectJsonFiles(gameplayDir, rootDir, gameplayDir)
  return {
    rootDir,
    gameplayDir,
    files,
    byGroup: groupFiles(files, gameplayDir),
  }
}

function main(): void {
  const store = createStore()
  const context: ValidationContext = { store, issues: [] }

  validateReferenceRules(context)
  validateTimingRules(context)
  validatePresetRules(context)
  validatePresentationCueRules(context)

  if (context.issues.length > 0) {
    for (const issue of context.issues) {
      const prefix = issue.file ? `${issue.file}: ` : ""
      console.error(`${prefix}${issue.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`content validation passed (${store.files.length} JSON files)`)
}

main()

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { validatePresentationCueRules } from "./presentation-cue-rules.js"
import { validateBulletPatternRules } from "./bullet-pattern-rules.js"
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
  usesDefaultGameplayDir: boolean
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
  warnings: ValidationIssue[]
  reports: string[]
}

export function addIssue(context: ValidationContext, message: string, file?: string): void {
  context.issues.push({ file, message })
}

export function addWarning(context: ValidationContext, message: string, file?: string): void {
  context.warnings.push({ file, message })
}

export function addReport(context: ValidationContext, message: string): void {
  context.reports.push(message)
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

function createStore(gameplayDirInput?: string): ContentStore {
  const rootDir = process.cwd()
  const defaultGameplayDir = path.join(rootDir, "content", "gameplay")
  const gameplayDir = gameplayDirInput
    ? path.resolve(rootDir, gameplayDirInput)
    : defaultGameplayDir
  const files = collectJsonFiles(gameplayDir, rootDir, gameplayDir)
  return {
    rootDir,
    gameplayDir,
    usesDefaultGameplayDir: gameplayDir === defaultGameplayDir,
    files,
    byGroup: groupFiles(files, gameplayDir),
  }
}

function main(): void {
  const options = readCliOptions(process.argv.slice(2))
  const store = createStore(options.gameplayDir)
  const context: ValidationContext = { store, issues: [], warnings: [], reports: [] }

  validateReferenceRules(context)
  validateTimingRules(context)
  validateBulletPatternRules(context)
  validatePresetRules(context)
  validatePresentationCueRules(context)

  for (const warning of context.warnings) {
    const prefix = warning.file ? `${warning.file}: ` : ""
    console.warn(`warning: ${prefix}${warning.message}`)
  }

  for (const report of context.reports) {
    console.log(report)
  }

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

function readCliOptions(args: string[]): { gameplayDir?: string } {
  const options: { gameplayDir?: string } = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg !== "--gameplay-dir") {
      throw new Error(`Unsupported argument '${arg}'.`)
    }

    const gameplayDir = args[index + 1]
    if (!gameplayDir) {
      throw new Error("--gameplay-dir requires a path.")
    }

    // fixture を使う検証でも、validator の出力パスは repo root 相対のまま保ちます。
    options.gameplayDir = gameplayDir
    index += 1
  }
  return options
}

main()

#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const rootDir = process.cwd()
const battleRenderDir = path.join(rootDir, "apps", "web", "src", "render", "battle")
const webSourceDir = path.join(rootDir, "apps", "web", "src")
const webEntryPoint = path.join(webSourceDir, "main.tsx")
const useMagnoliaAppPath = path.join(webSourceDir, "app", "use-magnolia-app.ts")
const useMagnoliaAppAllowedImporters = new Set([
  "apps/web/src/app/App.tsx",
])
const allowedAdapterPattern = /migration-adapter/
const sourceExtensions = [".ts", ".tsx", ".css", ".json"]
const planningCommentExtensions = new Set([".ts", ".tsx", ".css", ".mjs"])
const planningCommentRoots = [
  "apps/web/src/",
  "packages/game-session/src/",
  "tools/mission-authoring/",
]
const stalePlanningCommentPattern = /\b(?:TODO|FIXME|Future|MGN-[A-Z0-9-]+)\b/
const packageEntryPoints = new Map([
  ["@magnolia/contracts", "packages/contracts/src/index.ts"],
  ["@magnolia/game-session", "packages/game-session/src/index.ts"],
  ["@magnolia/persistence", "packages/persistence/src/index.ts"],
])
const webReachabilityAllowlist = new Map([
  [
    "apps/web/src/render/battle/fixtures/key-visual-render-state.ts",
    "test fixture compatibility entry; runtime imports apps/web/src/render/key-visual/key-visual-render-state.ts directly",
  ],
])

const issues = []

for (const filePath of collectSourceFiles(battleRenderDir, [".ts", ".tsx"])) {
  const relativePath = toProjectPath(filePath)
  if (allowedAdapterPattern.test(relativePath)) {
    continue
  }
  const source = fs.readFileSync(filePath, "utf8")
  auditRendererDispatchSource(relativePath, source)
}

auditWebSourceReachability()
auditUseMagnoliaAppImportDirection()
auditStalePlanningComments()

if (issues.length > 0) {
  console.error("source audit failed")
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log("source audit passed")

function auditRendererDispatchSource(relativePath, source) {
  if (source.includes("mission:")) {
    issues.push(`${relativePath}: mission-scoped renderer dispatch is not allowed outside migration adapters.`)
  }
  if (source.includes("legacyEntityId")) {
    issues.push(`${relativePath}: legacy entity ID renderer fallback is not allowed outside migration adapters.`)
  }
  if (/\b(enemy_[A-Za-z0-9_]*|proj_[A-Za-z0-9_]*)\s*:/.test(source)) {
    issues.push(`${relativePath}: enemy/projectile ID renderer keys must use visual presets instead.`)
  }
}

function auditWebSourceReachability() {
  const candidateFiles = collectVisibleSourceFiles(webSourceDir, sourceExtensions)
  const candidateSet = new Set(candidateFiles)
  const reachable = collectReachableFiles(webEntryPoint, candidateSet)
  const unreachable = candidateFiles
    .filter((filePath) => !reachable.has(filePath))
    .map(toProjectPath)
    .filter((filePath) => !webReachabilityAllowlist.has(filePath))
    .sort()

  if (unreachable.length > 0) {
    issues.push(
      [
        "apps/web/src: files must be reachable from apps/web/src/main.tsx or removed.",
        ...unreachable.map((filePath) => `  - ${filePath}`),
      ].join("\n"),
    )
  }
}

function auditUseMagnoliaAppImportDirection() {
  const candidateFiles = collectVisibleSourceFiles(webSourceDir, [".ts", ".tsx"])
  for (const filePath of candidateFiles) {
    if (filePath === useMagnoliaAppPath) {
      continue
    }
    const relativePath = toProjectPath(filePath)
    const source = fs.readFileSync(filePath, "utf8")
    for (const specifier of collectModuleImportSpecifiers(source)) {
      const resolved = resolveImportSpecifier(filePath, specifier)
      if (resolved !== useMagnoliaAppPath) {
        continue
      }
      if (!useMagnoliaAppAllowedImporters.has(relativePath)) {
        issues.push(
          `${relativePath}: use-magnolia-app.ts is the composition root hook and must not be imported by lower app modules.`,
        )
      }
    }
  }
}

function auditStalePlanningComments() {
  for (const projectPath of collectGitVisibleFiles()) {
    if (!planningCommentRoots.some((root) => projectPath.startsWith(root))) {
      continue
    }
    if (!planningCommentExtensions.has(path.extname(projectPath))) {
      continue
    }
    const source = fs.readFileSync(path.join(rootDir, projectPath), "utf8")
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!isCommentLine(line) || !stalePlanningCommentPattern.test(line)) {
        return
      }
      issues.push(
        `${projectPath}:${index + 1}: move TODO/FIXME/Future/MGN planning notes to docs/latest_Review or an issue.`,
      )
    })
  }
}

function isCommentLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")
}

function collectReachableFiles(entryPoint, candidateSet) {
  const reachable = new Set()
  const pending = [entryPoint]

  // main.tsx から import を順に辿り、実際に Web bundle の入口へ接続している source だけを到達済みにします。
  while (pending.length > 0) {
    const current = pending.pop()
    if (!candidateSet.has(current) || reachable.has(current)) {
      continue
    }

    reachable.add(current)
    const source = fs.readFileSync(current, "utf8")
    for (const specifier of collectImportSpecifiers(current, source)) {
      const resolved = resolveImportSpecifier(current, specifier)
      if (resolved && candidateSet.has(resolved) && !reachable.has(resolved)) {
        pending.push(resolved)
      }
    }
  }

  return reachable
}

function collectImportSpecifiers(filePath, source) {
  // CSS は TypeScript と import 構文が違うため、入口だけを共有して parser を分けます。
  if (filePath.endsWith(".css")) {
    return collectCssImportSpecifiers(source)
  }
  return collectModuleImportSpecifiers(source)
}

function collectModuleImportSpecifiers(source) {
  const specifiers = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]

  // import / export の静的参照だけを追い、runtime の条件分岐は TypeScript build に任せます。
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1])
    }
  }
  return specifiers
}

function collectCssImportSpecifiers(source) {
  const specifiers = []
  const importPattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/g
  for (const match of source.matchAll(importPattern)) {
    specifiers.push(match[1])
  }
  return specifiers
}

function resolveImportSpecifier(fromFile, rawSpecifier) {
  const specifier = rawSpecifier.split("?")[0]
  // Vite の @ alias と workspace package の公開入口だけを解決し、外部 package は到達性の対象外にします。
  if (specifier.startsWith("@/")) {
    return resolveExistingPath(path.join(webSourceDir, specifier.slice(2)))
  }
  if (specifier.startsWith(".")) {
    return resolveExistingPath(path.resolve(path.dirname(fromFile), specifier))
  }
  if (packageEntryPoints.has(specifier)) {
    return path.join(rootDir, packageEntryPoints.get(specifier))
  }
  return null
}

function resolveExistingPath(basePath) {
  // import 側の拡張子省略と directory index を TypeScript / Vite の通常解決に合わせます。
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath
  }
  for (const extension of sourceExtensions) {
    const filePath = `${basePath}${extension}`
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath
    }
  }
  for (const extension of sourceExtensions) {
    const indexPath = path.join(basePath, `index${extension}`)
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath
    }
  }
  return null
}

function collectVisibleSourceFiles(dir, extensions) {
  // 新規追加直後の source も辿れるよう、Git 管理下の file と未追跡 file を同じ条件で扱います。
  const trackedFiles = collectGitVisibleFiles()
  const normalizedDir = toProjectPath(dir)
  return trackedFiles
    .filter((filePath) => filePath.startsWith(`${normalizedDir}/`))
    .filter((filePath) => extensions.includes(path.extname(filePath)))
    .map((filePath) => path.join(rootDir, filePath))
    .filter((filePath) => fs.existsSync(filePath))
    .sort()
}

function collectGitVisibleFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed.")
  }
  return result.stdout.split("\0").filter(Boolean)
}

function collectSourceFiles(dir, extensions) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath, extensions))
      continue
    }
    if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      files.push(entryPath)
    }
  }
  return files
}

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/")
}

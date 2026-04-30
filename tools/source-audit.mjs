#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()
const battleRenderDir = path.join(rootDir, "apps", "web", "src", "render", "battle")
const allowedAdapterPattern = /migration-adapter/

const issues = []

for (const filePath of collectSourceFiles(battleRenderDir)) {
  const relativePath = toProjectPath(filePath)
  if (allowedAdapterPattern.test(relativePath)) {
    continue
  }
  const source = fs.readFileSync(filePath, "utf8")
  auditRendererDispatchSource(relativePath, source)
}

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

function collectSourceFiles(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath))
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/")
}

#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const DEFAULT_OUTPUT = "artifacts/magnolia-source.zip"
const outputPath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_OUTPUT)

const sourceFiles = run("git", [
  "-c",
  "core.quotePath=false",
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
])
  .stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => existsSync(file))
  .filter((file) => !isGeneratedOrMetadata(file))

if (sourceFiles.length === 0) {
  throw new Error("No source files were found from git ls-files.")
}

mkdirSync(path.dirname(outputPath), { recursive: true })
rmSync(outputPath, { force: true })

// 引き継ぎ用 zip は Git から見えるソースだけで作り、生成物や OS メタデータを混ぜません。
const zipResult = spawnSync("zip", ["-X", "-q", outputPath, ...sourceFiles], {
  cwd: process.cwd(),
  encoding: "utf8",
})

if (zipResult.status !== 0) {
  throw new Error(zipResult.stderr || "zip command failed.")
}

assertArchiveEntriesAllowed(outputPath)
assertArchiveContainsExpectedFiles(outputPath, sourceFiles)
console.log(`source archive written: ${path.relative(process.cwd(), outputPath)}`)

function isGeneratedOrMetadata(file) {
  return (
    file === ".DS_Store" ||
    file.includes("/.DS_Store") ||
    file.startsWith("__MACOSX/") ||
    file.includes("/__MACOSX/") ||
    file.includes("/._") ||
    file.startsWith("._") ||
    file.startsWith("artifacts/") ||
    file.endsWith(".zip") ||
    file.endsWith(".diff") ||
    file.endsWith(".patch") ||
    file.includes("/dist/") ||
    file.endsWith(".tsbuildinfo") ||
    file.includes("/node_modules/") ||
    file.includes("/.vite/") ||
    file.includes("/.vite-temp/")
  )
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} ${args.join(" ")} failed.`)
  }
  return result
}

function assertArchiveEntriesAllowed(archivePath) {
  const listing = readArchiveEntries(archivePath)
  const forbidden = listing.find(isGeneratedOrMetadata)
  if (forbidden) {
    throw new Error(`source archive contains forbidden entry: ${forbidden}`)
  }
}

function assertArchiveContainsExpectedFiles(archivePath, expectedFiles) {
  const entries = new Set(readArchiveEntries(archivePath))
  const missing = expectedFiles.filter((file) => !entries.has(file))
  if (missing.length > 0) {
    throw new Error(`source archive is missing ${missing.length} entries; first missing: ${missing[0]}`)
  }
}

function readArchiveEntries(archivePath) {
  const bsdtar = spawnSync("bsdtar", ["-tf", archivePath], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
  if (bsdtar.status === 0) {
    return bsdtar.stdout.trim().split("\n").filter(Boolean)
  }
  return run("unzip", ["-Z1", archivePath])
    .stdout
    .trim()
    .split("\n")
    .filter(Boolean)
}

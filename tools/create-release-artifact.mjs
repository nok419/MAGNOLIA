#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const DEFAULT_OUTPUT = "artifacts/magnolia-release.zip"
const outputPath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_OUTPUT)
const webDistDir = path.join(process.cwd(), "apps", "web", "dist")

if (!existsSync(webDistDir)) {
  throw new Error("apps/web/dist was not found. Run `npm run build` before creating release artifact.")
}

const releaseFiles = collectFiles(webDistDir)
  .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
  .filter((file) => !isMetadata(file))

if (releaseFiles.length === 0) {
  throw new Error("No release files were found in apps/web/dist.")
}

mkdirSync(path.dirname(outputPath), { recursive: true })
rmSync(outputPath, { force: true })

// release artifact は実行用 dist だけを含め、review 用 source archive とは用途を分けます。
const zipResult = spawnSync("zip", ["-X", "-q", outputPath, ...releaseFiles], {
  cwd: process.cwd(),
  encoding: "utf8",
})

if (zipResult.status !== 0) {
  throw new Error(zipResult.stderr || "zip command failed.")
}

assertReleaseArchive(outputPath)
console.log(`release artifact written: ${path.relative(process.cwd(), outputPath)}`)

function collectFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath))
      continue
    }
    if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

function assertReleaseArchive(archivePath) {
  const listing = run("unzip", ["-Z1", archivePath])
    .stdout
    .trim()
    .split("\n")
    .filter(Boolean)

  const forbidden = listing.find((entry) =>
    isMetadata(entry) ||
    entry.includes("/node_modules/") ||
    entry.endsWith(".tsbuildinfo") ||
    entry.includes("/.vite/") ||
    entry.includes("/.vite-temp/"),
  )
  if (forbidden) {
    throw new Error(`release artifact contains forbidden entry: ${forbidden}`)
  }
  if (!listing.every((entry) => entry.startsWith("apps/web/dist/"))) {
    throw new Error("release artifact must contain only apps/web/dist entries.")
  }
}

function isMetadata(file) {
  return (
    file === ".DS_Store" ||
    file.includes("/.DS_Store") ||
    file.startsWith("__MACOSX/") ||
    file.includes("/__MACOSX/") ||
    file.includes("/._") ||
    file.startsWith("._")
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

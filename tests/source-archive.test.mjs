import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const ROOT = path.resolve(import.meta.dirname, "..")

test("source and release archive commands are separate", () => {
  const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))

  assert.equal(packageJson.scripts["archive:source"], "node tools/create-source-archive.mjs")
  assert.equal(packageJson.scripts["archive:release"], "npm run build && node tools/create-release-artifact.mjs")
})

test("source archive excludes generated files, caches, and OS metadata", () => {
  const output = path.join(mkdtempSync(path.join(os.tmpdir(), "magnolia-archive-")), "source.zip")
  const archive = spawnSync(process.execPath, ["tools/create-source-archive.mjs", output], {
    cwd: ROOT,
    encoding: "utf8",
  })
  assert.equal(archive.status, 0, archive.stderr)

  const entries = readArchiveEntries(output)
  assert(entries.length > 0)
  assert(entries.includes("package.json"))
  assert(entries.includes("tsconfig.base.json"))
  assert(entries.includes("docs/05_データ構造.md"))
  assert(entries.includes("apps/web/public/sound/shot-placeholder.mp3"))
  assert(!entries.includes("sound/ショット.mp3"))
  assert(!entries.some((entry) => entry.includes("__MACOSX/")))
  assert(!entries.some((entry) => entry.endsWith(".DS_Store") || entry.includes("/.DS_Store")))
  assert(!entries.some((entry) => entry.includes("/._") || entry.startsWith("._")))
  assert(!entries.some((entry) => entry.includes("/node_modules/")))
  assert(!entries.some((entry) => entry.includes("/.vite/") || entry.includes("/.vite-temp/")))
  assert(!entries.some((entry) => entry.includes("/dist/")))
  assert(!entries.some((entry) => entry.endsWith(".tsbuildinfo")))
  assert(!entries.some((entry) => entry.endsWith(".zip") || entry.endsWith(".diff") || entry.endsWith(".patch")))
})

function readArchiveEntries(output) {
  const bsdtar = spawnSync("bsdtar", ["-tf", output], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (bsdtar.status === 0) {
    return bsdtar.stdout.trim().split("\n").filter(Boolean)
  }

  const listing = spawnSync("unzip", ["-Z1", output], {
    cwd: ROOT,
    encoding: "utf8",
  })
  assert.equal(listing.status, 0, listing.stderr)
  return listing.stdout.trim().split("\n").filter(Boolean)
}

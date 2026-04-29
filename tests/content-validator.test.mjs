import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

const rootDir = path.resolve(import.meta.dirname, "..")
const validatorPath = path.join(rootDir, "tools", "content-validator", "dist", "validate-content.js")

test("current gameplay content passes validation", () => {
  const result = runValidator()

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /content validation passed/)
})

test("fixture gameplay directory reports a missing mission reference", (t) => {
  const fixtureDir = copyCurrentGameplayFixture(t)
  mutateJson(path.join(fixtureDir, "transmissions", "tx_good_morning.json"), (transmission) => {
    transmission.missionId = "mission_missing"
  })

  const result = runValidator(["--gameplay-dir", fixtureDir])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing mission 'mission_missing'/)
})

test("source archive script excludes generated archive paths", () => {
  const archiveSource = readProjectFile("tools/create-source-archive.mjs")

  assert.match(archiveSource, /file\.startsWith\("artifacts\/"\)/)
  assert.match(archiveSource, /file\.includes\("\/__MACOSX\/"\)/)
  assert.match(archiveSource, /file\.endsWith\("\.tsbuildinfo"\)/)
})

function runValidator(args = []) {
  // package script と同じ生成済み validator を実行し、CLI 配線も検査します。
  return spawnSync(process.execPath, [validatorPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
  })
}

function copyCurrentGameplayFixture(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magnolia-content-validator-"))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  const fixtureDir = path.join(tempRoot, "gameplay")
  fs.cpSync(path.join(rootDir, "content", "gameplay"), fixtureDir, { recursive: true })
  return fixtureDir
}

function mutateJson(filePath, mutate) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
  mutate(data)
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

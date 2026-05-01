import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const ROOT = path.resolve(import.meta.dirname, "..")

test("source audit includes the web entry reachability gate", () => {
  const audit = spawnSync(process.execPath, ["tools/source-audit.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  })

  assert.equal(audit.status, 0, audit.stderr)
  assert.match(audit.stdout, /source audit passed/)
})

test("source audit rejects unreachable web source", () => {
  const probePath = path.join(ROOT, "apps", "web", "src", "__source_audit_probe.ts")
  writeFileSync(probePath, "export const unreachableProbe = true\n")
  try {
    const audit = spawnSync(process.execPath, ["tools/source-audit.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    })

    assert.notEqual(audit.status, 0)
    assert.match(audit.stderr, /__source_audit_probe\.ts/)
  } finally {
    rmSync(probePath, { force: true })
  }
})

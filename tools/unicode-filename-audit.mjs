#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const result = spawnSync("git", [
  "-c",
  "core.quotePath=false",
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
], {
  cwd: process.cwd(),
  encoding: "utf8",
})

if (result.status !== 0) {
  throw new Error(result.stderr || "git ls-files failed.")
}

const nonNfc = result.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => file.normalize("NFC") !== file)

if (nonNfc.length > 0) {
  console.error("Non-NFC filenames detected:")
  for (const file of nonNfc) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

console.log("unicode filename audit passed")

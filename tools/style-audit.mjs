#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, "apps", "web", "src")
const baselinePath = path.join(rootDir, "tools", "style-audit", "direct-color-baseline.json")
const updateBaseline = process.argv.includes("--update-baseline")

const excludedRelativePaths = new Set([
  "apps/web/src/styles/tokens.css",
  "apps/web/src/render/shared/canvas-palette.ts",
])

const requiredRolePairs = [
  ["--color-void-base", "voidBase"],
  ["--color-void-raised", "voidRaised"],
  ["--color-void-depth", "voidDepth"],
  ["--color-line-subtle", "lineSubtle"],
  ["--color-line-strong", "lineStrong"],
  ["--color-signal-primary", "signalPrimary"],
  ["--color-signal-readable", "signalReadable"],
  ["--color-residual-warmth", "residualWarmth"],
  ["--color-restoration", "restoration"],
  ["--color-threat-noise", "threatNoise"],
]

const colorPatterns = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\brgba?\(\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*[0-9.]+[^)]*?\)/g,
  /\bhsla?\(\s*[0-9.]+[^)]*?\)/g,
]

const issues = []
verifyRequiredRolePairs()

const currentReport = createReport(listSourceFiles(sourceDir))
if (updateBaseline) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(currentReport, null, 2)}\n`)
  console.log(`style audit baseline updated: ${path.relative(rootDir, baselinePath)}`)
  process.exit(issues.length > 0 ? 1 : 0)
}

const baseline = readBaseline()
issues.push(...compareWithBaseline(currentReport, baseline))
printReport(currentReport)

if (issues.length > 0) {
  console.error("\nstyle audit failed")
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log("\nstyle audit passed")

function verifyRequiredRolePairs() {
  const tokens = readProjectFile("apps/web/src/styles/tokens.css")
  const palette = readProjectFile("apps/web/src/render/shared/canvas-palette.ts")
  const paletteDoc = readProjectFile("docs/11_design_package/02_palette.md")

  for (const [cssToken, canvasRole] of requiredRolePairs) {
    if (!tokens.includes(cssToken)) {
      issues.push(`apps/web/src/styles/tokens.css: missing semantic token '${cssToken}'`)
    }
    if (!palette.includes(canvasRole)) {
      issues.push(`apps/web/src/render/shared/canvas-palette.ts: missing canvas role '${canvasRole}'`)
    }
    if (!paletteDoc.includes(cssToken) || !paletteDoc.includes(canvasRole)) {
      issues.push(`docs/11_design_package/02_palette.md: missing mapping for '${cssToken}' / '${canvasRole}'`)
    }
  }
}

function listSourceFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (/\.(css|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function createReport(files) {
  const entries = {}
  for (const filePath of files) {
    const relativePath = toProjectPath(filePath)
    if (excludedRelativePaths.has(relativePath)) {
      continue
    }

    const source = fs.readFileSync(filePath, "utf8")
    const matches = findDirectColors(source)
    if (matches.length === 0) {
      continue
    }

    entries[relativePath] = {
      count: matches.length,
      threatNoiseCandidates: matches.filter((match) => isThreatNoiseCandidate(match.value)).length,
      examples: Array.from(new Set(matches.map((match) => match.value))).slice(0, 8),
    }
  }

  return {
    version: 1,
    source: "apps/web/src",
    excludes: Array.from(excludedRelativePaths).sort(),
    generatedBy: "tools/style-audit.mjs",
    files: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
  }
}

function findDirectColors(source) {
  const matches = []
  for (const pattern of colorPatterns) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      matches.push({ value: match[0], index: match.index ?? 0 })
    }
  }
  return matches.sort((a, b) => a.index - b.index)
}

function isThreatNoiseCandidate(value) {
  const rgb = parseRgb(value)
  if (!rgb) {
    return false
  }
  const [red, green, blue] = rgb
  return red >= 220 && green <= 170 && blue <= 190
}

function parseRgb(value) {
  if (value.startsWith("#")) {
    const hex = value.slice(1)
    const normalized =
      hex.length === 3
        ? hex.split("").map((char) => `${char}${char}`).join("")
        : hex.slice(0, 6)
    if (normalized.length !== 6) {
      return null
    }
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ]
  }

  const match = value.match(/\brgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/)
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) {
    issues.push(`missing style audit baseline: ${path.relative(rootDir, baselinePath)}`)
    return { files: {} }
  }
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"))
}

function compareWithBaseline(current, baseline) {
  const failures = []
  const baselineFiles = baseline.files ?? {}
  const currentFiles = current.files ?? {}

  for (const [filePath, currentEntry] of Object.entries(currentFiles)) {
    const baselineEntry = baselineFiles[filePath]
    if (!baselineEntry) {
      failures.push(`${filePath}: direct color literals are not allowed in new baseline files`)
      continue
    }
    if (currentEntry.count > baselineEntry.count) {
      failures.push(`${filePath}: direct color literals increased ${baselineEntry.count} -> ${currentEntry.count}`)
    }
    if (currentEntry.threatNoiseCandidates > baselineEntry.threatNoiseCandidates) {
      failures.push(
        `${filePath}: red threatNoise-like literals increased ${baselineEntry.threatNoiseCandidates} -> ${currentEntry.threatNoiseCandidates}`,
      )
    }
  }

  return failures
}

function printReport(report) {
  const files = Object.entries(report.files)
  const total = files.reduce((sum, [, entry]) => sum + entry.count, 0)
  const threatTotal = files.reduce((sum, [, entry]) => sum + entry.threatNoiseCandidates, 0)

  console.log(`style audit: ${total} direct color literals in ${files.length} files`)
  console.log(`style audit: ${threatTotal} red threatNoise migration candidates`)
  for (const [filePath, entry] of files) {
    console.log(`- ${filePath}: ${entry.count} direct colors, ${entry.threatNoiseCandidates} threat candidates`)
  }
}

function readProjectFile(relativePath) {
  try {
    return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
  } catch {
    return ""
  }
}

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/")
}

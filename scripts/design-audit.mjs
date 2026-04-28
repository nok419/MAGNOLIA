import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = new URL("..", import.meta.url).pathname

const checks = []

function walk(dir, predicate = () => true) {
  const files = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") {
      continue
    }
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...walk(path, predicate))
    } else if (predicate(path)) {
      files.push(path)
    }
  }
  return files
}

function findMatches(files, pattern, allow = () => false) {
  const matches = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (pattern.test(line) && !allow(file, line)) {
        matches.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`)
      }
    })
  }
  return matches
}

function addCheck(name, matches, mode = "fail") {
  checks.push({ name, matches, mode })
}

const sourceFiles = [
  ...walk(join(root, "apps/web/src"), (file) => /\.(ts|tsx|css)$/.test(file)),
  ...walk(join(root, "packages"), (file) => /\.(ts|tsx)$/.test(file)),
  ...walk(join(root, "content"), (file) => /\.json$/.test(file)),
]

const styleFiles = walk(join(root, "apps/web/src/styles"), (file) => file.endsWith(".css"))

addCheck(
  "Math.random is not allowed in app/package/content runtime files",
  findMatches(sourceFiles, /Math\.random\s*\(/),
)

addCheck(
  "feature CSS must use semantic tokens instead of raw colors",
  findMatches(
    styleFiles,
    /#[0-9A-Fa-f]{3,8}|rgba\(\s*[0-9]|rgb\(\s*[0-9]|hsl\(/,
    (file) => file.endsWith("base.css"),
  ),
)

addCheck(
  "runtime TypeScript must not define raw colors outside visual-tokens",
  findMatches(
    sourceFiles.filter((file) => /\.(ts|tsx)$/.test(file)),
    /#[0-9A-Fa-f]{3,8}|rgba\(\s*[0-9]|rgb\(\s*[0-9]|hsl\(/,
    (file) => file.endsWith("visual-tokens.ts"),
  ),
)

addCheck(
  "feature CSS must not use transition: all",
  findMatches(styleFiles, /transition:\s*all\b/),
)

addCheck(
  "visual preset JSON must be runtime data, not support files",
  findMatches(
    walk(join(root, "content/gameplay/visual-presets"), (file) => file.endsWith(".json")),
    /supportFile|Runtime loading still resolves|mirror active/,
  ),
)

addCheck(
  "feature CSS keyframes outside base.css should be justified and minimal",
  findMatches(styleFiles, /^@keyframes\b/, (file) => file.endsWith("base.css")),
  "warn",
)

const bulletVisualRoleFile = join(root, "content/gameplay/visual-presets/bullet_visual_roles.json")
const projectileRendererFile = join(root, "apps/web/src/render/battle/projectile-renderers.ts")
const bulletVisualRoles = JSON.parse(readFileSync(bulletVisualRoleFile, "utf8"))
const projectileRendererText = readFileSync(projectileRendererFile, "utf8")
addCheck(
  "bullet visual role expectedRendererKey must resolve in projectile renderer registry",
  bulletVisualRoles.roles
    .filter((role) => !projectileRendererText.includes(`"${role.expectedRendererKey}"`))
    .map((role) => `content/gameplay/visual-presets/bullet_visual_roles.json: ${role.visualRole} -> ${role.expectedRendererKey}`),
)

let failed = false
for (const check of checks) {
  const header = `[${check.mode === "fail" ? "FAIL" : "WARN"}] ${check.name}`
  if (check.matches.length === 0) {
    console.log(`[PASS] ${check.name}`)
    continue
  }
  console.log(header)
  for (const match of check.matches.slice(0, 80)) {
    console.log(`  ${match}`)
  }
  if (check.matches.length > 80) {
    console.log(`  ... ${check.matches.length - 80} more`)
  }
  if (check.mode === "fail") {
    failed = true
  }
}

if (failed) {
  process.exitCode = 1
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const DEFAULT_GAMEPLAY_DIR = path.join(ROOT, "content", "gameplay")
const LIST_KINDS = new Set(["missions", "transmissions", "chunks", "enemies", "bullet-patterns"])

main()

function main() {
  // CLI errors should stop before any file write so authoring mistakes do not leave partial JSON changes.
  try {
    const { command, args } = parseCommand(process.argv.slice(2))
    const result = runCommand(command, args)
    if (result !== undefined) {
      printJson(result)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function runCommand(command, args) {
  if (command === "list") {
    return listContent(args)
  }
  if (command === "wave") {
    return editWave(args)
  }
  if (command === "enemy-spawn") {
    return editEnemySpawn(args)
  }
  if (command === "hazard") {
    return editMissionArrayById(args, "hazards", "hazardId")
  }
  if (command === "beat") {
    return editMissionArrayById(args, "beatEvents", "beatId")
  }
  if (command === "manifest") {
    return runNpmScript(args.check ? "content:manifest:check" : "content:manifest")
  }
  if (command === "validate") {
    return runNpmScript("content:validate")
  }
  if (command === "preview-fixture") {
    return writePreviewFixture(args)
  }

  throw new Error(`Unknown command '${command}'. Run with --help for usage.`)
}

function parseCommand(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(usage())
    process.exit(0)
  }

  const [command, ...rest] = argv
  return { command, args: parseArgs(rest) }
}

function parseArgs(argv) {
  // A tiny parser keeps the harness dependency-free and makes shell examples predictable.
  const args = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      args._.push(token)
      continue
    }

    const key = toCamelCase(token.slice(2))
    const next = argv[index + 1]
    if (next === undefined || next.startsWith("--")) {
      args[key] = true
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function listContent(args) {
  const [kind] = args._
  if (!LIST_KINDS.has(kind)) {
    throw new Error(`list requires one of: ${[...LIST_KINDS].join(", ")}`)
  }

  const gameplayDir = resolveGameplayDir(args)
  if (kind === "missions") {
    return readJsonDir(path.join(gameplayDir, "missions")).map((mission) => ({
      missionId: mission.missionId,
      transmissionId: mission.transmissionId,
      durationMs: mission.durationMs,
      waves: mission.waves?.length ?? 0,
      hazards: mission.hazards?.length ?? 0,
      beats: mission.beatEvents?.length ?? 0,
    }))
  }
  if (kind === "transmissions") {
    return readJsonDir(path.join(gameplayDir, "transmissions"), (file) => !file.endsWith(".chunks.json"))
      .map((transmission) => ({
        transmissionId: transmission.transmissionId,
        missionId: transmission.missionId,
        title: transmission.title,
        chunks: transmission.transcriptChunkIds?.length ?? 0,
      }))
  }
  if (kind === "chunks") {
    return readJsonDir(path.join(gameplayDir, "transmissions"), (file) => file.endsWith(".chunks.json"))
      .flat()
      .map((chunk) => ({
        chunkId: chunk.chunkId,
        transmissionId: chunk.transmissionId,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        speakerLabel: chunk.speakerLabel,
        text: chunk.text,
      }))
  }
  if (kind === "enemies") {
    return readJsonDir(path.join(gameplayDir, "enemies")).map((enemy) => ({
      enemyId: enemy.enemyId,
      hp: enemy.hp,
      behaviorKind: enemy.behaviorKind,
      bulletPatternIds: enemy.bulletPatternIds ?? [],
      visualPresetId: enemy.visualPresetId,
    }))
  }

  return readJsonDir(path.join(gameplayDir, "bullet-patterns")).map((pattern) => ({
    bulletPatternId: pattern.bulletPatternId,
    patternKind: pattern.patternKind,
    projectileId: pattern.projectileId,
    cadenceMs: pattern.cadenceMs,
    burstCount: pattern.burstCount,
  }))
}

function editWave(args) {
  const [action] = args._
  const { mission, file } = loadMissionForEdit(args)

  if (action === "add") {
    const wave = readJsonOption(args, "json") ?? {
      atMs: readInteger(args, "atMs"),
      intentTag: readRequired(args, "intentTag"),
      entries: readJsonOption(args, "entriesJson") ?? [],
    }
    mission.waves = [...(mission.waves ?? []), wave].sort(compareAtMs)
    writeJson(file, mission)
    return { missionId: mission.missionId, added: "wave", wave }
  }

  const index = readInteger(args, "index")
  assertArrayIndex(mission.waves, index, "wave")
  if (action === "update") {
    const patch = readPatch(args, ["atMs", "intentTag", "entriesJson"])
    if (patch.entriesJson !== undefined) {
      patch.entries = patch.entriesJson
      delete patch.entriesJson
    }
    mission.waves[index] = { ...mission.waves[index], ...patch }
    mission.waves.sort(compareAtMs)
    writeJson(file, mission)
    return { missionId: mission.missionId, updated: "wave", index }
  }
  if (action === "delete") {
    const [removed] = mission.waves.splice(index, 1)
    writeJson(file, mission)
    return { missionId: mission.missionId, deleted: "wave", index, removed }
  }

  throw new Error("wave action must be add, update, or delete")
}

function editEnemySpawn(args) {
  const [action] = args._
  const { mission, file } = loadMissionForEdit(args)
  const waveIndex = readInteger(args, "waveIndex")
  assertArrayIndex(mission.waves, waveIndex, "wave")
  const wave = mission.waves[waveIndex]
  wave.entries = wave.entries ?? []

  if (action === "add") {
    const entry = readJsonOption(args, "json") ?? {
      enemyId: readRequired(args, "enemyId"),
      spawnPointId: readRequired(args, "spawnPointId"),
      seed: readInteger(args, "seed"),
    }
    const overrides = readJsonOption(args, "overridesJson")
    if (overrides !== undefined) {
      entry.overrides = overrides
    }
    wave.entries.push(entry)
    writeJson(file, mission)
    return { missionId: mission.missionId, added: "enemy-spawn", waveIndex, entry }
  }

  const entryIndex = readInteger(args, "entryIndex")
  assertArrayIndex(wave.entries, entryIndex, "enemy spawn")
  if (action === "update") {
    wave.entries[entryIndex] = { ...wave.entries[entryIndex], ...readPatch(args, ["enemyId", "spawnPointId", "seed", "overridesJson"]) }
    if (wave.entries[entryIndex].overridesJson !== undefined) {
      wave.entries[entryIndex].overrides = wave.entries[entryIndex].overridesJson
      delete wave.entries[entryIndex].overridesJson
    }
    writeJson(file, mission)
    return { missionId: mission.missionId, updated: "enemy-spawn", waveIndex, entryIndex }
  }
  if (action === "delete") {
    const [removed] = wave.entries.splice(entryIndex, 1)
    writeJson(file, mission)
    return { missionId: mission.missionId, deleted: "enemy-spawn", waveIndex, entryIndex, removed }
  }

  throw new Error("enemy-spawn action must be add, update, or delete")
}

function editMissionArrayById(args, arrayKey, idKey) {
  const [action] = args._
  const { mission, file } = loadMissionForEdit(args)
  mission[arrayKey] = mission[arrayKey] ?? []

  if (action === "add") {
    const item = readJsonOption(args, "json")
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${arrayKey} add requires --json with one object`)
    }
    if (!item[idKey]) {
      throw new Error(`${arrayKey} add JSON must include ${idKey}`)
    }
    assertMissingId(mission[arrayKey], idKey, item[idKey])
    mission[arrayKey].push(item)
    mission[arrayKey].sort(compareAtMs)
    writeJson(file, mission)
    return { missionId: mission.missionId, added: arrayKey, [idKey]: item[idKey] }
  }

  const id = readRequired(args, idKey)
  const index = mission[arrayKey].findIndex((item) => item[idKey] === id)
  assertFound(index, `${arrayKey} '${id}'`)
  if (action === "update") {
    const patch = readJsonOption(args, "json")
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error(`${arrayKey} update requires --json with one object`)
    }
    mission[arrayKey][index] = { ...mission[arrayKey][index], ...patch, [idKey]: id }
    mission[arrayKey].sort(compareAtMs)
    writeJson(file, mission)
    return { missionId: mission.missionId, updated: arrayKey, [idKey]: id }
  }
  if (action === "delete") {
    const [removed] = mission[arrayKey].splice(index, 1)
    writeJson(file, mission)
    return { missionId: mission.missionId, deleted: arrayKey, [idKey]: id, removed }
  }

  throw new Error(`${arrayKey} action must be add, update, or delete`)
}

function writePreviewFixture(args) {
  const gameplayDir = resolveGameplayDir(args)
  const missionId = readRequired(args, "mission")
  const mission = readMission(gameplayDir, missionId).mission
  const transmission = readJson(path.join(gameplayDir, "transmissions", `${mission.transmissionId}.json`))
  const chunks = readJson(path.join(gameplayDir, "transmissions", `${mission.transmissionId}.chunks.json`))
  const enemies = Object.fromEntries(readJsonDir(path.join(gameplayDir, "enemies")).map((enemy) => [enemy.enemyId, enemy]))
  const bulletPatterns = Object.fromEntries(
    readJsonDir(path.join(gameplayDir, "bullet-patterns")).map((pattern) => [pattern.bulletPatternId, pattern]),
  )

  // The preview fixture is a deterministic authoring snapshot, not a runtime save file.
  const fixture = {
    fixtureKind: "mission-preview",
    missionId,
    generatedFrom: {
      missionFile: `content/gameplay/missions/${missionId}.json`,
      transmissionFile: `content/gameplay/transmissions/${mission.transmissionId}.json`,
      chunksFile: `content/gameplay/transmissions/${mission.transmissionId}.chunks.json`,
    },
    mission: {
      durationMs: mission.durationMs,
      scrollSpeed: mission.scrollSpeed,
      backgroundPresetId: mission.backgroundPresetId,
      waves: mission.waves ?? [],
      hazards: mission.hazards ?? [],
      beatEvents: mission.beatEvents ?? [],
    },
    transmission: {
      transmissionId: transmission.transmissionId,
      title: transmission.title,
      sender: transmission.sender,
      transcriptChunkIds: transmission.transcriptChunkIds ?? [],
      chunks,
    },
    referencedEnemies: collectReferencedEnemies(mission, enemies),
    referencedBulletPatterns: collectReferencedBulletPatterns(mission, enemies, bulletPatterns),
  }

  const out = path.resolve(ROOT, args.out ?? path.join("tools", "mission-authoring", "fixtures", `${missionId}.preview.json`))
  writeJson(out, fixture)
  return { missionId, previewFixture: path.relative(ROOT, out).split(path.sep).join("/") }
}

function collectReferencedEnemies(mission, enemies) {
  // Stable sorting keeps the fixture reviewable when waves are reordered.
  const ids = new Set()
  for (const wave of mission.waves ?? []) {
    for (const entry of wave.entries ?? []) {
      ids.add(entry.enemyId)
    }
  }
  return [...ids].sort().map((id) => enemies[id] ?? { enemyId: id, missing: true })
}

function collectReferencedBulletPatterns(mission, enemies, bulletPatterns) {
  const ids = new Set()
  for (const enemy of collectReferencedEnemies(mission, enemies)) {
    for (const patternId of enemy.bulletPatternIds ?? []) {
      ids.add(patternId)
    }
  }
  return [...ids].sort().map((id) => bulletPatterns[id] ?? { bulletPatternId: id, missing: true })
}

function loadMissionForEdit(args) {
  const gameplayDir = resolveGameplayDir(args)
  return readMission(gameplayDir, readRequired(args, "mission"))
}

function readMission(gameplayDir, missionId) {
  const file = path.join(gameplayDir, "missions", `${missionId}.json`)
  if (!existsSync(file)) {
    throw new Error(`Mission file not found: ${file}`)
  }
  return { mission: readJson(file), file }
}

function readPatch(args, keys) {
  const patch = readJsonOption(args, "json") ?? {}
  for (const key of keys) {
    if (args[key] === undefined) {
      continue
    }
    patch[key] = key.endsWith("Json") ? JSON.parse(args[key]) : coerceScalar(args[key])
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("update requires at least one field or --json")
  }
  return patch
}

function readJsonDir(dir, include = () => true) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && include(file))
    .sort()
    .map((file) => readJson(path.join(dir, file)))
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"))
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function runNpmScript(script) {
  // The harness delegates validation and manifest generation to the same scripts used by CI.
  const result = spawnSync("npm", ["run", script], { cwd: ROOT, encoding: "utf8", stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed with status ${result.status}`)
  }
  return { script, status: result.status }
}

function resolveGameplayDir(args) {
  return path.resolve(ROOT, args.gameplayDir ?? DEFAULT_GAMEPLAY_DIR)
}

function readJsonOption(args, key) {
  if (args[key] === undefined) {
    return undefined
  }
  return JSON.parse(args[key])
}

function readRequired(args, key) {
  if (args[key] === undefined || args[key] === true) {
    throw new Error(`Missing --${toKebabCase(key)}`)
  }
  return args[key]
}

function readInteger(args, key) {
  const value = Number.parseInt(readRequired(args, key), 10)
  if (!Number.isInteger(value)) {
    throw new Error(`--${toKebabCase(key)} must be an integer`)
  }
  return value
}

function coerceScalar(value) {
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return value
}

function assertArrayIndex(array, index, label) {
  if (!Array.isArray(array) || index < 0 || index >= array.length) {
    throw new Error(`No ${label} at index ${index}`)
  }
}

function assertFound(index, label) {
  if (index === -1) {
    throw new Error(`Could not find ${label}`)
  }
}

function assertMissingId(array, idKey, id) {
  if (array.some((item) => item[idKey] === id)) {
    throw new Error(`${idKey} '${id}' already exists`)
  }
}

function compareAtMs(left, right) {
  return (left.atMs ?? left.spawnAtMs ?? 0) - (right.atMs ?? right.spawnAtMs ?? 0)
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

function usage() {
  return `Usage:
  node tools/mission-authoring/mission-authoring.mjs list <missions|transmissions|chunks|enemies|bullet-patterns>
  node tools/mission-authoring/mission-authoring.mjs wave add --mission mission_good_morning --at-ms 56000 --intent-tag test --entries-json '[]'
  node tools/mission-authoring/mission-authoring.mjs wave update --mission mission_good_morning --index 0 --at-ms 9000
  node tools/mission-authoring/mission-authoring.mjs wave delete --mission mission_good_morning --index 0
  node tools/mission-authoring/mission-authoring.mjs enemy-spawn add --mission mission_good_morning --wave-index 0 --enemy-id enemy_scout --spawn-point-id spawn_top_center --seed 200
  node tools/mission-authoring/mission-authoring.mjs hazard add --mission mission_good_morning --json '{"hazardId":"hazard_new","kind":"magneticDisaster"}'
  node tools/mission-authoring/mission-authoring.mjs beat add --mission mission_good_morning --json '{"beatId":"beat_new","atMs":0,"durationMs":1000,"intentTag":"draft"}'
  node tools/mission-authoring/mission-authoring.mjs preview-fixture --mission mission_good_morning
  node tools/mission-authoring/mission-authoring.mjs manifest
  node tools/mission-authoring/mission-authoring.mjs validate

Options:
  --gameplay-dir <path>  Use a copied content/gameplay directory for safe edits.
  --json <json>          Add or update a whole object.
`
}

'use strict'

const fs = require('fs')
const path = require('path')
const { simulateFullMatch, simulateMatch } = require('../src/match-engine')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

function parseArgs(argv) {
  return {
    ticks: Number(argv[2] ?? 30),
    seed: argv[3] ?? 'demo-seed',
    secondsPerTick: Number(argv[4] ?? 5),
    includeDebug: argv.includes('--debug'),
    fullMatch: argv.includes('--full')
  }
}

function fullMatchWarning(options) {
  if (!options.fullMatch && options.ticks >= 5400) return 'You are running simulateMatch(), not simulateFullMatch(). Use --full for a two-half simulation.'
  return undefined
}

async function main(argv = process.argv) {
  const { ticks, seed, secondsPerTick, includeDebug, fullMatch } = parseArgs(argv)
  const warning = fullMatchWarning({ ticks, fullMatch })
  if (warning) console.warn(warning)
  const input = {
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick
  }
  const options = {
    includeDebugLog: includeDebug,
    includeTacticalDebug: includeDebug
  }
  const result = fullMatch
    ? await simulateFullMatch(input, options)
    : await simulateMatch(input, { ticks, ...options })

  const outputDir = path.join(__dirname, '..', 'tmp')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'demo-match.json')
  const output = {
    seed,
    ticks,
    secondsPerTick,
    frames: result.frames,
    events: result.events,
    ...(includeDebug ? { debugLog: result.debugLog, debugTacticalFrames: result.debugTacticalFrames } : {}),
    ...(result.halves ? { halves: result.halves } : {}),
    finalStats: result.finalStats
  }
  fs.writeFileSync(outputPath, JSON.stringify(output))

  console.log(`Wrote ${result.frames.length} frames and ${result.events.length} events to ${path.relative(process.cwd(), outputPath)}`)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  fullMatchWarning,
  main,
  parseArgs
}

'use strict'

const fs = require('fs')
const path = require('path')
const { simulateFullMatch, simulateMatch } = require('../src/match-engine')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

async function main() {
  const ticks = Number(process.argv[2] ?? 30)
  const seed = process.argv[3] ?? 'demo-seed'
  const secondsPerTick = Number(process.argv[4] ?? 5)
  const includeDebug = process.argv.includes('--debug')
  const fullMatch = process.argv.includes('--full')
  const input = {
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick
  }
  const result = fullMatch
    ? await simulateFullMatch(input)
    : await simulateMatch(input, { ticks })

  const outputDir = path.join(__dirname, '..', 'tmp')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'demo-match.json')
  fs.writeFileSync(outputPath, JSON.stringify({
    seed,
    ticks,
    secondsPerTick,
    frames: result.frames,
    events: result.events,
    ...(includeDebug ? { debugLog: result.debugLog } : {}),
    ...(result.halves ? { halves: result.halves } : {}),
    finalStats: result.finalStats
  }, null, 2))

  console.log(`Wrote ${result.frames.length} frames and ${result.events.length} events to ${path.relative(process.cwd(), outputPath)}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

'use strict'

const fs = require('fs')
const path = require('path')
const { simulateMatch } = require('../src/match-engine')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

async function main() {
  const ticks = Number(process.argv[2] ?? 30)
  const seed = process.argv[3] ?? 'demo-seed'
  const result = await simulateMatch({
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick: 5
  }, { ticks })

  const outputDir = path.join(__dirname, '..', 'tmp')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'demo-match.json')
  fs.writeFileSync(outputPath, JSON.stringify({
    seed,
    ticks,
    frames: result.frames,
    events: result.events,
    finalStats: result.finalStats
  }, null, 2))

  console.log(`Wrote ${result.frames.length} frames and ${result.events.length} events to ${path.relative(process.cwd(), outputPath)}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

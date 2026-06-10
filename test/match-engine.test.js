'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { simulateMatch } = require('../src/match-engine')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

function demoInput(seed = 'test-seed') {
  return {
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick: 5
  }
}

test('simulateMatch emits render-ready frames and events', async () => {
  const result = await simulateMatch(demoInput(), { ticks: 3 })

  assert.equal(result.frames.length, 4)
  assert.equal(result.frames[0].players.length, 22)
  assert.equal(result.frames[3].tick, 3)
  assert.equal(result.frames[3].second, 15)
  assert.equal(typeof result.frames[3].ball.x, 'number')
  assert.ok(Array.isArray(result.events))
})

test('simulateMatch is deterministic for the same seed', async () => {
  const first = await simulateMatch(demoInput('repeatable'), { ticks: 5 })
  const second = await simulateMatch(demoInput('repeatable'), { ticks: 5 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.finalStats, second.finalStats)
})

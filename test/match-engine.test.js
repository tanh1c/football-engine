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

test('simulateMatch supports one-second smooth tick output', async () => {
  const result = await simulateMatch({ ...demoInput('smooth-one-second'), secondsPerTick: 1 }, { ticks: 3 })

  assert.equal(result.frames.length, 4)
  assert.equal(result.frames[3].tick, 3)
  assert.equal(result.frames[3].second, 3)
  assert.equal(result.frames[3].continuity.secondsPerTick, 1)
  assert.equal(result.frames[0].continuity.nextTick, 1)
  assert.equal(result.frames[0].ball.trajectory.to.x, result.frames[1].ball.x)
})

test('simulateMatch is deterministic for the same seed', async () => {
  const first = await simulateMatch(demoInput('repeatable'), { ticks: 5 })
  const second = await simulateMatch(demoInput('repeatable'), { ticks: 5 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.finalStats, second.finalStats)
})

test('simulateMatch includes tactical metadata on emitted frames', async () => {
  const result = await simulateMatch(demoInput('tactical-frame'), { ticks: 2 })
  const frame = result.frames[2]

  assert.ok(frame.tactical)
  assert.equal(typeof frame.tactical.phase, 'string')
  assert.equal(typeof frame.tactical.pressure.score, 'number')
  assert.ok(Array.isArray(frame.tactical.passOptions))
})

test('tactical action scoring keeps simulation deterministic', async () => {
  const first = await simulateMatch(demoInput('tactical-action-hook'), { ticks: 20 })
  const second = await simulateMatch(demoInput('tactical-action-hook'), { ticks: 20 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.events, second.events)
})

test('simulateMatch includes full phase 2 tactical metadata on frames', async () => {
  const result = await simulateMatch(demoInput('full-phase-2-frame'), { ticks: 2 })
  const tactical = result.frames[2].tactical

  assert.ok(Array.isArray(tactical.formationTargets))
  assert.ok(Array.isArray(tactical.intercepts))
  assert.ok(tactical.pressing)
  assert.ok(Array.isArray(tactical.actionRecommendations))
})

test('full phase 2 action recommendations keep simulation deterministic', async () => {
  const first = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })
  const second = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.events, second.events)
})

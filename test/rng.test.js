'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { simulateMatch } = require('../src/match-engine')
const { withSeededRandom } = require('../src/match-engine/rng')

function demoInput(seed = 'rng-test') {
  return {
    homeTeam: require('../vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: require('../vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: require('../vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick: 1
  }
}

test('withSeededRandom does not replace global Math.random during operation', async () => {
  const originalRandom = Math.random

  await withSeededRandom('no-global-random', async () => {
    assert.equal(Math.random, originalRandom)
  })

  assert.equal(Math.random, originalRandom)
})

test('simulateMatch does not replace global Math.random', async () => {
  const originalRandom = Math.random

  await simulateMatch(demoInput('no-global-random'), { ticks: 3 })

  assert.equal(Math.random, originalRandom)
})

test('withSeededRandom rejects overlapping seeded operations', async () => {
  await assert.rejects(async () => {
    await withSeededRandom('outer', async () => {
      await withSeededRandom('inner', async () => 1)
    })
  }, /seeded random operation is already active/i)
})

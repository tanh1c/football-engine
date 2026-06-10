'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { estimateInterceptions } = require('../src/match-engine/tactical/intercept')

function player(playerID, teamID, x, y, fitness = 100) {
  return { playerID, teamID, position: 'CM', currentPOS: [x, y], originPOS: [x, y], fitness }
}

test('estimateInterceptions ranks closer players with lower reachTicks', () => {
  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 52, 50), player('A2', 'A', 80, 80)] },
    secondTeam: { teamID: 'B', players: [] }
  })

  assert.equal(result[0].playerId, 'A1')
  assert.ok(result[0].reachTicks < result[1].reachTicks)
})

test('estimateInterceptions penalizes low fitness', () => {
  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 60, 50, 100), player('A2', 'A', 60, 50, 30)] },
    secondTeam: { teamID: 'B', players: [] }
  })

  const fresh = result.find(item => item.playerId === 'A1')
  const tired = result.find(item => item.playerId === 'A2')
  assert.ok(fresh.reachTicks < tired.reachTicks)
})

test('estimateInterceptions excludes inactive players', () => {
  const inactive = player('A2', 'A', 50, 50)
  inactive.currentPOS = ['NP', 'NP']

  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 80, 80), inactive] },
    secondTeam: { teamID: 'B', players: [] }
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].playerId, 'A1')
})

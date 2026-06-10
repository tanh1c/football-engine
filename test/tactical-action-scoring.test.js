'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { recommendActions } = require('../src/match-engine/tactical/actionScoring')

function player(playerID, teamID, position, x, y, hasBall = false) {
  return { playerID, teamID, name: playerID, position, currentPOS: [x, y], originPOS: [x, y], hasBall, fitness: 100 }
}

function baseMatch(position = [50, 80], role = 'ST') {
  return {
    pitchSize: [100, 100],
    ball: { position: [position[0], position[1], 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', role, position[0], position[1], true), player('A10', 'A', 'CM', 55, 85)] },
    secondTeam: { teamID: 'B', players: [] }
  }
}

test('recommendActions favors shoot for high xG striker chances', () => {
  const result = recommendActions(baseMatch([50, 92], 'ST'), {
    phase: 'final_third',
    pressure: { score: 0.1 },
    shotQuality: { xg: 0.45 },
    passOptions: []
  })

  assert.equal(result[0].action, 'shoot')
  assert.ok(result[0].score > 0.5)
})

test('recommendActions favors boot under high pressure in defensive third', () => {
  const result = recommendActions(baseMatch([50, 15], 'CB'), {
    phase: 'build_up',
    pressure: { score: 0.9 },
    shotQuality: { xg: 0.02 },
    passOptions: []
  })

  assert.equal(result[0].action, 'boot')
})

test('recommendActions favors pass for safe progressive pass option', () => {
  const result = recommendActions(baseMatch([50, 55], 'CM'), {
    phase: 'midfield',
    pressure: { score: 0.2 },
    shotQuality: { xg: 0.05 },
    passOptions: [{ playerId: 'A10', score: 0.85, progress: 0.3 }]
  })

  assert.equal(result[0].action, 'pass')
  assert.equal(result[0].targetPlayerId, 'A10')
})

test('recommendActions favors cross for wide final-third players', () => {
  const result = recommendActions(baseMatch([88, 80], 'RM'), {
    phase: 'final_third',
    pressure: { score: 0.2 },
    shotQuality: { xg: 0.08 },
    passOptions: []
  })

  assert.equal(result[0].action, 'cross')
})

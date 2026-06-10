'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { analyzeTactics } = require('../src/match-engine/tactical')

function player(playerID, teamID, x, y, hasBall = false) {
  return {
    playerID,
    teamID,
    name: playerID,
    position: 'CM',
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    skill: { passing: 70, control: 70, shooting: 70 }
  }
}

test('analyzeTactics returns phase, possession, pressure, pass options, and shot quality', () => {
  const result = analyzeTactics({
    pitchSize: [100, 100],
    ball: { position: [50, 70, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 70, true), player('A10', 'A', 50, 85)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 70)] },
    iterationLog: []
  })

  assert.equal(result.phase, 'final_third')
  assert.equal(result.possessionTeamId, 'A')
  assert.equal(typeof result.pressure.score, 'number')
  assert.equal(result.passOptions[0].playerId, 'A10')
  assert.equal(result.shotQuality.playerId, 'A8')
})

test('analyzeTactics includes full phase 2 tactical fields', () => {
  const result = analyzeTactics({
    pitchSize: [100, 100],
    ball: { position: [50, 70, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 70, true), player('A10', 'A', 50, 85)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 70), player('B5', 'B', 70, 70)] },
    iterationLog: []
  })

  assert.ok(Array.isArray(result.formationTargets))
  assert.ok(Array.isArray(result.intercepts))
  assert.ok(result.pressing)
  assert.ok(Array.isArray(result.actionRecommendations))
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { rankPassOptions } = require('../src/match-engine/tactical/passOptions')

function player(playerID, teamID, x, y, position = 'CM', hasBall = false) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    skill: { passing: 70, control: 70 }
  }
}

test('rankPassOptions favors progressive unpressured teammates', () => {
  const result = rankPassOptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true), player('A10', 'A', 50, 70), player('A6', 'A', 50, 35)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 20, 20)] }
  })

  assert.equal(result[0].playerId, 'A10')
  assert.ok(result[0].score > result[1].score)
})

test('rankPassOptions penalizes receivers under pressure', () => {
  const result = rankPassOptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true), player('A10', 'A', 50, 70), player('A11', 'A', 65, 70)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 50, 71)] }
  })

  assert.equal(result[0].playerId, 'A11')
})

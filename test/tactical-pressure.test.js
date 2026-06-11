'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { calculatePressure } = require('../src/match-engine/tactical/pressure')

function player(playerID, teamID, x, y, hasBall = false) {
  return { playerID, teamID, currentPOS: [x, y], hasBall, originPOS: [x, y] }
}

function state(opponentPosition) {
  return {
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 50, true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', opponentPosition[0], opponentPosition[1])] }
  }
}

test('calculatePressure is higher when nearest opponent is closer', () => {
  const close = calculatePressure(state([52, 50]))
  const far = calculatePressure(state([90, 90]))

  assert.ok(close.score > far.score)
  assert.equal(close.nearestOpponentId, 'B4')
})

test('calculatePressure counts opponents inside pressure radii', () => {
  const result = calculatePressure({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 50, true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 52, 50), player('B5', 'B', 58, 50)] }
  })

  assert.equal(result.closeOpponents, 1)
  assert.equal(result.nearbyOpponents, 2)
})

test('calculatePressure does not count possession teammates as opponents in vendor-shaped state', () => {
  const result = calculatePressure({
    ball: { position: [50, 50, 0], withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [
      { playerID: 'A8', currentPOS: [50, 50] },
      { playerID: 'A10', currentPOS: [52, 50] }
    ] },
    secondTeam: { teamID: 'B', players: [
      { playerID: 'B4', currentPOS: [70, 50] }
    ] }
  })

  assert.equal(result.nearestOpponentId, 'B4')
  assert.equal(result.closeOpponents, 0)
})

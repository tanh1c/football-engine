'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { assignPressing } = require('../src/match-engine/tactical/pressing')

function player(playerID, teamID, x, y, hasBall = false) {
  return { playerID, teamID, name: playerID, position: 'CM', currentPOS: [x, y], originPOS: [x, y], hasBall, fitness: 100 }
}

const matchDetails = {
  pitchSize: [100, 100],
  ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
  kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, true), player('A10', 'A', 70, 70)] },
  secondTeam: { teamID: 'B', players: [player('B6', 'B', 53, 50), player('B4', 'B', 60, 55), player('B5', 'B', 80, 80)] }
}

test('assignPressing selects nearest opponent as presser', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })

  assert.equal(result.presserId, 'B6')
})

test('assignPressing excludes presser from cover players', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })

  assert.ok(result.coverIds.length > 0)
  assert.equal(result.coverIds.includes(result.presserId), false)
})

test('assignPressing places block lane between carrier and best pass receiver', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })
  const lane = result.blockLanes[0]

  assert.equal(lane.fromPlayerId, 'A8')
  assert.equal(lane.toPlayerId, 'A10')
  assert.ok(lane.x > 50 && lane.x < 70)
  assert.ok(lane.y > 50 && lane.y < 70)
})

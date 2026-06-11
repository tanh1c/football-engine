'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { assignMovementIntents } = require('../src/match-engine/tactical/movementIntent')
const { applyMovementIntents } = require('../src/match-engine/tactical/applyMovementIntents')

function player(playerID, teamID, x, y, position = 'CM', hasBall = false) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    fitness: 100
  }
}

test('assignMovementIntents sends presser toward ball carrier', () => {
  const matchDetails = {
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 50)] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { presserId: 'B4', coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 50,
    y: 50,
    reason: 'press',
    urgency: 0.9
  })
})

test('assignMovementIntents falls back to formation target recovery', () => {
  const matchDetails = {
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 50)] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: [{ playerId: 'B4', x: 40, y: 35 }]
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 40,
    y: 35,
    reason: 'recover_shape',
    urgency: 0.45
  })
})

test('applyMovementIntents writes tactical targets to vendor intent positions', () => {
  const pressingPlayer = player('B4', 'B', 55, 50)
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [pressingPlayer] }
  }

  applyMovementIntents(matchDetails, {
    movementIntents: [{ playerId: 'B4', x: -10, y: 120, reason: 'press', urgency: 0.9 }]
  })

  assert.deepEqual(pressingPlayer.intentPOS, [0, 100])
  assert.deepEqual(pressingPlayer.currentPOS, [55, 50])
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { ballCrossed } = require('../vendor/footballSimulationEngine/lib/ballMovement')

function player() {
  return {
    playerID: 'A1',
    name: 'A One',
    originPOS: [20, 80],
    currentPOS: [20, 80],
    height: 180,
    skill: { strength: 80, jumping: 70, passing: 80, crossing: 80 },
    stats: { passes: { total: 0 } }
  }
}

test('ballCrossed does not print raw target coordinates', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: {
      position: [20, 80, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: { name: 'A', teamID: 'A', players: [player()] },
    secondTeam: { name: 'B', teamID: 'B', players: [player()] },
    iterationLog: []
  }
  const messages = []
  const originalLog = console.log
  console.log = message => messages.push(message)

  try {
    ballCrossed(matchDetails, matchDetails.kickOffTeam, matchDetails.kickOffTeam.players[0])

    assert.deepEqual(messages, [])
  } finally {
    console.log = originalLog
  }
})

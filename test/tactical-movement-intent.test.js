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

test('assignMovementIntents moves distant pressers to close down space around carrier', () => {
  const matchDetails = {
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 80, 50)] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { presserId: 'B4', coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 58,
    y: 50,
    reason: 'press',
    urgency: 0.9
  })
})

test('assignMovementIntents creates attacking support runs for progressive pass options', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 60, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 60, 'CM', true), player('A9', 'A', 55, 70, 'ST')] },
    secondTeam: { teamID: 'B', players: [] }
  }

  const result = assignMovementIntents(matchDetails, {
    phase: 'final_third',
    passOptions: [{ playerId: 'A9', progress: 0.2, score: 0.8 }],
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A9'), {
    playerId: 'A9',
    x: 55,
    y: 62,
    reason: 'support_run',
    urgency: 0.75
  })
})

test('assignMovementIntents sends nearest players toward loose balls in transition', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: false, withTeam: '', Player: '', position: [48, 52, 0], ballOverIterations: [] },
    kickOffTeam: { teamID: 'A', players: [player('A4', 'A', 45, 50), player('A8', 'A', 10, 10)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 52, 54), player('B8', 'B', 90, 90)] }
  }

  const result = assignMovementIntents(matchDetails, {
    phase: 'transition',
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: [
      { playerId: 'A4', x: 30, y: 30 },
      { playerId: 'B4', x: 70, y: 70 }
    ]
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A4'), {
    playerId: 'A4',
    x: 48,
    y: 52,
    reason: 'loose_ball_recovery',
    urgency: 0.85
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 48,
    y: 52,
    reason: 'loose_ball_recovery',
    urgency: 0.85
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

test('assignMovementIntents keeps both goalkeepers near their goalmouths', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [52, 62, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 50, 20, 'GK'), player('A8', 'A', 52, 62, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B1', 'B', 50, 80, 'GK')] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  const kickOffGoalkeeper = result.find(intent => intent.playerId === 'A1')
  const secondGoalkeeper = result.find(intent => intent.playerId === 'B1')

  assert.equal(kickOffGoalkeeper?.reason, 'goalkeeper_position')
  assert.equal(secondGoalkeeper?.reason, 'goalkeeper_position')
  assert.ok(kickOffGoalkeeper.y <= 8)
  assert.ok(secondGoalkeeper.y >= 92)
})

test('assignMovementIntents adds role-specific attacking movement', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [52, 62, 0] },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 50, 5, 'GK'),
        player('A8', 'A', 52, 62, 'CM', true),
        player('A9', 'A', 48, 74, 'ST'),
        player('A7', 'A', 75, 66, 'RM')
      ]
    },
    secondTeam: { teamID: 'B', players: [] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A9'), {
    playerId: 'A9',
    x: 56,
    y: 85,
    reason: 'attack_channel',
    urgency: 0.65
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A7'), {
    playerId: 'A7',
    x: 90,
    y: 72,
    reason: 'hold_width',
    urgency: 0.5
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A1'), {
    playerId: 'A1',
    x: 50.4,
    y: 8,
    reason: 'goalkeeper_position',
    urgency: 0.35
  })
})

test('assignMovementIntents adds role movement v2 for channels triangles overlaps and keeper angle', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [65, 62, 0] },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 50, 5, 'GK'),
        player('A2', 'A', 24, 54, 'LB'),
        player('A6', 'A', 42, 60, 'CM'),
        player('A8', 'A', 65, 62, 'CM', true),
        player('A9', 'A', 48, 74, 'ST')
      ]
    },
    secondTeam: { teamID: 'B', players: [] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A9'), {
    playerId: 'A9',
    x: 56,
    y: 85,
    reason: 'attack_channel',
    urgency: 0.65
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A6'), {
    playerId: 'A6',
    x: 53.5,
    y: 67,
    reason: 'support_triangle',
    urgency: 0.55
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A2'), {
    playerId: 'A2',
    x: 16,
    y: 70,
    reason: 'overlap',
    urgency: 0.55
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A1'), {
    playerId: 'A1',
    x: 53,
    y: 8,
    reason: 'goalkeeper_position',
    urgency: 0.35
  })
})

test('assignMovementIntents adds movement v3 for compact backline and winger decisions', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [62, 58, 0] },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 50, 5, 'GK'),
        player('A3', 'A', 35, 28, 'CB'),
        player('A4', 'A', 64, 32, 'CB'),
        player('A7', 'A', 82, 60, 'RW'),
        player('A8', 'A', 62, 58, 'CM', true)
      ]
    },
    secondTeam: { teamID: 'B', players: [] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A3'), {
    playerId: 'A3',
    x: 42.5,
    y: 38,
    reason: 'hold_line',
    urgency: 0.5
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A4'), {
    playerId: 'A4',
    x: 57,
    y: 38,
    reason: 'hold_line',
    urgency: 0.5
  })
  assert.deepEqual(result.find(intent => intent.playerId === 'A7'), {
    playerId: 'A7',
    x: 72,
    y: 70,
    reason: 'inside_channel',
    urgency: 0.55
  })
})

test('assignMovementIntents keeps winger wide when touchline lane is open', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [44, 58, 0] },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 50, 5, 'GK'),
        player('A7', 'A', 78, 60, 'RW'),
        player('A8', 'A', 44, 58, 'CM', true)
      ]
    },
    secondTeam: { teamID: 'B', players: [] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'A7'), {
    playerId: 'A7',
    x: 90,
    y: 66,
    reason: 'hold_width',
    urgency: 0.5
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

test('applyMovementIntents ignores invalid tactical target coordinates', () => {
  const pressingPlayer = player('B4', 'B', 55, 50)
  pressingPlayer.intentPOS = [55, 50]
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [pressingPlayer] }
  }

  applyMovementIntents(matchDetails, {
    movementIntents: [{ playerId: 'B4', x: undefined, y: undefined, reason: 'press', urgency: 0.9 }]
  })

  assert.deepEqual(pressingPlayer.intentPOS, [55, 50])
})

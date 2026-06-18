'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { recommendActions } = require('../src/match-engine/tactical/actionScoring')
const actions = require('../vendor/footballSimulationEngine/lib/actions')

function player(playerID, teamID, position, x, y, hasBall = false) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    fitness: 100,
    height: 180,
    skill: { shooting: 80, jumping: 70, strength: 80, tackling: 70, agility: 70 }
  }
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

test('recommendActions favors available midfield passes over repeated carrying', () => {
  const result = recommendActions(baseMatch([50, 55], 'ST'), {
    phase: 'midfield',
    pressure: { score: 0 },
    shotQuality: { xg: 0.03 },
    passOptions: [{ playerId: 'A10', score: 0.45, progress: 0.02 }]
  })

  assert.equal(result[0].action, 'pass')
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

test('recommendActions favors shoot for decent final-third striker chances', () => {
  const result = recommendActions(baseMatch([50, 76], 'ST'), {
    phase: 'final_third',
    pressure: { score: 0.1 },
    shotQuality: { xg: 0.09 },
    passOptions: []
  })

  assert.equal(result[0].action, 'shoot')
})

test('recommendActions favors shoot for decent final-third non-striker chances', () => {
  const result = recommendActions(baseMatch([50, 78], 'CM'), {
    phase: 'final_third',
    pressure: { score: 0.1 },
    shotQuality: { xg: 0.1 },
    passOptions: []
  })

  assert.equal(result[0].action, 'shoot')
})

test('recommendActions does not favor shoot from midfield', () => {
  const result = recommendActions(baseMatch([50, 50], 'ST'), {
    phase: 'midfield',
    pressure: { score: 0 },
    shotQuality: { xg: 0.06 },
    passOptions: []
  })

  assert.notEqual(result[0].action, 'shoot')
})

test('recommendActions favors shoot for strikers entering the attacking third', () => {
  const result = recommendActions(baseMatch([50, 68], 'ST'), {
    phase: 'midfield',
    pressure: { score: 0.1 },
    shotQuality: { xg: 0.07 },
    passOptions: []
  })

  assert.equal(result[0].action, 'shoot')
})

test('findPossActions gives tactical recommendations a usable floor', () => {
  const matchDetails = baseMatch([50, 76], 'ST')
  matchDetails.tactical = { actionRecommendations: [{ playerId: 'A9', action: 'shoot', score: 0.7 }] }
  const playerWithBall = matchDetails.kickOffTeam.players[0]
  const possibleActions = actions.findPossActions(playerWithBall, matchDetails.kickOffTeam, matchDetails.secondTeam, 0, 0, matchDetails)
  const shoot = possibleActions.find(action => action.name === 'shoot')

  assert.ok(shoot.points >= 45)
})

test('findPossActions strongly favors high tactical shoot recommendations', () => {
  const matchDetails = baseMatch([50, 76], 'ST')
  matchDetails.tactical = { actionRecommendations: [{ playerId: 'A9', action: 'shoot', score: 0.9 }] }
  const playerWithBall = matchDetails.kickOffTeam.players[0]
  const possibleActions = actions.findPossActions(playerWithBall, matchDetails.kickOffTeam, matchDetails.secondTeam, 0, 0, matchDetails)
  const shoot = possibleActions.find(action => action.name === 'shoot')

  assert.ok(shoot.points >= 70)
})


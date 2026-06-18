'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { estimateShotQuality } = require('../src/match-engine/tactical/shotQuality')

function player(playerID, teamID, x, y, shooting = 70, hasBall = false) {
  return {
    playerID,
    teamID,
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    skill: { shooting }
  }
}

test('estimateShotQuality gives higher xG for closer central shots', () => {
  const close = estimateShotQuality({
    pitchSize: [100, 100],
    ball: { position: [50, 90, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 90, 80, true)] },
    secondTeam: { teamID: 'B', players: [] }
  }, { score: 0 })

  const far = estimateShotQuality({
    pitchSize: [100, 100],
    ball: { position: [50, 45, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 45, 80, true)] },
    secondTeam: { teamID: 'B', players: [] }
  }, { score: 0 })

  assert.ok(close.xg > far.xg)
})

test('estimateShotQuality keeps close central chances below penalty-level xG', () => {
  const close = estimateShotQuality({
    pitchSize: [100, 100],
    ball: { position: [50, 98, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 98, 80, true)] },
    secondTeam: { teamID: 'B', players: [] }
  }, { score: 0 })

  assert.ok(close.xg <= 0.55)
})

test('estimateShotQuality reduces xG under pressure', () => {
  const baseState = {
    pitchSize: [100, 100],
    ball: { position: [50, 90, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 90, 80, true)] },
    secondTeam: { teamID: 'B', players: [] }
  }

  assert.ok(
    estimateShotQuality(baseState, { score: 0 }).xg > estimateShotQuality(baseState, { score: 0.8 }).xg
  )
})

test('estimateShotQuality keeps midfield shots low xG', () => {
  const midfield = estimateShotQuality({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', 50, 50, 90, true)] },
    secondTeam: { teamID: 'B', players: [] }
  }, { score: 0 })

  assert.ok(midfield.xg < 0.08)
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { calculateFormationTargets } = require('../src/match-engine/tactical/formation')

function player(playerID, teamID, position, x, y) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    fitness: 100
  }
}

function match(phase = 'midfield') {
  return {
    pitchSize: [100, 100],
    ball: { position: [80, 70, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 'GK', 50, 5),
        player('A4', 'A', 'CB', 45, 25),
        player('A8', 'A', 'CM', 50, 50),
        player('A7', 'A', 'RM', 88, 55),
        player('A9', 'A', 'ST', 50, 75)
      ]
    },
    secondTeam: { teamID: 'B', players: [] },
    iterationLog: [],
    tactical: { phase }
  }
}

test('calculateFormationTargets preserves width for wide midfielders', () => {
  const targets = calculateFormationTargets(match('midfield'), { phase: 'midfield' })
  const winger = targets.find(target => target.playerId === 'A7')

  assert.ok(winger.x > 70)
  assert.equal(winger.reason, 'provide_width')
})

test('calculateFormationTargets keeps center backs deeper than central midfielders', () => {
  const targets = calculateFormationTargets(match('midfield'), { phase: 'midfield' })
  const cb = targets.find(target => target.playerId === 'A4')
  const cm = targets.find(target => target.playerId === 'A8')

  assert.ok(cb.y < cm.y)
  assert.equal(cb.reason, 'hold_shape')
})

test('calculateFormationTargets pushes striker higher in final third than build up', () => {
  const buildUpTarget = calculateFormationTargets(match('build_up'), { phase: 'build_up' }).find(target => target.playerId === 'A9')
  const finalThirdTarget = calculateFormationTargets(match('final_third'), { phase: 'final_third' }).find(target => target.playerId === 'A9')

  assert.ok(finalThirdTarget.y > buildUpTarget.y)
  assert.equal(finalThirdTarget.reason, 'attack_depth')
})

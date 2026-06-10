'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { classifyPhase } = require('../src/match-engine/tactical/phase')

function state(overrides = {}) {
  return {
    pitchSize: [100, 100],
    ball: {
      position: [50, 50, 0],
      withPlayer: true,
      withTeam: 'A',
      Player: 'A9',
      ...overrides.ball
    },
    kickOffTeam: { teamID: 'A', name: 'A', players: [] },
    secondTeam: { teamID: 'B', name: 'B', players: [] },
    iterationLog: overrides.iterationLog ?? []
  }
}

test('classifyPhase returns set_piece from set-piece log messages', () => {
  assert.equal(classifyPhase(state({ iterationLog: ['Corner to A'] })), 'set_piece')
})

test('classifyPhase returns final_third near opponent goal', () => {
  assert.equal(classifyPhase(state({ ball: { position: [50, 88, 0], withTeam: 'A' } })), 'final_third')
})

test('classifyPhase returns build_up near own defensive third', () => {
  assert.equal(classifyPhase(state({ ball: { position: [50, 15, 0], withTeam: 'A' } })), 'build_up')
})

test('classifyPhase returns midfield in central areas', () => {
  assert.equal(classifyPhase(state()), 'midfield')
})

test('classifyPhase returns transition when no team controls the ball', () => {
  assert.equal(classifyPhase(state({ ball: { withPlayer: false, withTeam: '' } })), 'transition')
})

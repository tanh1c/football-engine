'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { checkProvidedAction } = require('../vendor/footballSimulationEngine/lib/playerMovement')

function captureConsoleError(callback) {
  const messages = []
  const originalError = console.error
  console.error = message => messages.push(message)

  try {
    return { result: callback(), messages }
  } finally {
    console.error = originalError
  }
}

test('checkProvidedAction handles stale non-holder penalty action without console error', () => {
  const player = { playerID: 'A1', name: 'A One', action: 'penalty' }
  const { result, messages } = captureConsoleError(() => (
    checkProvidedAction({ ball: { Player: 'A9' } }, player, 'run')
  ))

  assert.equal(result, 'run')
  assert.deepEqual(messages, [])
})

test('checkProvidedAction handles ball-holder defensive action without console error', () => {
  const player = { playerID: 'A1', name: 'A One', action: 'tackle' }
  const { result, messages } = captureConsoleError(() => (
    checkProvidedAction({ ball: { Player: 'A1' } }, player, 'run')
  ))

  assert.ok(['shoot', 'throughBall', 'pass', 'cross', 'cleared', 'boot', 'penalty'].includes(result))
  assert.deepEqual(messages, [])
})

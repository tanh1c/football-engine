'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { fullMatchWarning, parseArgs } = require('../scripts/simulate-demo')

test('parseArgs keeps legacy positional simulate-demo arguments', () => {
  const result = parseArgs(['node', 'scripts/simulate-demo.js', '900', 'demo-seed', '1', '--debug'])

  assert.equal(result.ticks, 900)
  assert.equal(result.seed, 'demo-seed')
  assert.equal(result.secondsPerTick, 1)
  assert.equal(result.includeDebug, true)
  assert.equal(result.fullMatch, false)
})

test('fullMatchWarning warns when long one-half simulation looks like a full match', () => {
  assert.equal(fullMatchWarning({ ticks: 5400, fullMatch: false }), 'You are running simulateMatch(), not simulateFullMatch(). Use --full for a two-half simulation.')
  assert.equal(fullMatchWarning({ ticks: 5400, fullMatch: true }), undefined)
  assert.equal(fullMatchWarning({ ticks: 900, fullMatch: false }), undefined)
})

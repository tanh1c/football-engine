'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const common = require('../vendor/footballSimulationEngine/lib/common')
const { resolveSlide, resolveTackle } = require('../vendor/footballSimulationEngine/lib/actions')
const { checkProvidedAction, decideMovement } = require('../vendor/footballSimulationEngine/lib/playerMovement')
const { setGameVariables } = require('../vendor/footballSimulationEngine/lib/setVariables')

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

test('setGameVariables assigns teamID to every player', () => {
  const team = setGameVariables({
    players: [
      { name: 'A One', position: 'CM', currentPOS: [10, 10] },
      { name: 'A Two', position: 'ST', currentPOS: [20, 20] }
    ]
  })

  assert.ok(team.teamID)
  assert.equal(team.players.every(player => player.teamID === team.teamID), true)
})

function tackleState(opponents = []) {
  const tackler = {
    playerID: 'A1',
    name: 'A One',
    skill: { tackling: 80, strength: 80 },
    stats: { tackles: { total: 0, on: 0, off: 0, fouls: 0 } }
  }
  const team = { teamID: 'A', players: [tackler] }
  const opposition = { teamID: 'B', players: opponents }
  const matchDetails = {
    kickOffTeam: { teamID: 'A' },
    secondTeam: { teamID: 'B' },
    kickOffTeamStatistics: { fouls: 0 },
    secondTeamStatistics: { fouls: 0 },
    ball: { Player: opponents[0]?.playerID ?? 'missing-owner' },
    iterationLog: []
  }
  return { matchDetails, opposition, tackler, team }
}

function withRandomSequence(values, run) {
  let index = 0
  common.setRandomSource(() => values[index++] ?? 0.99)
  try {
    return run()
  } finally {
    common.setRandomSource()
  }
}

test('resolveTackle records structured foul events', () => {
  const ballCarrier = {
    playerID: 'B9',
    name: 'B Nine',
    skill: { tackling: 70, strength: 70, agility: 70 }
  }
  const { matchDetails, opposition, tackler, team } = tackleState([ballCarrier])
  matchDetails.matchClock = { tick: 7, minute: 0, second: 7 }
  matchDetails.events = []

  withRandomSequence([0.9], () => {
    resolveTackle(tackler, team, opposition, matchDetails)
  })

  assert.deepEqual(matchDetails.events.map(event => event.type), ['foul'])
  assert.equal(matchDetails.events[0].playerName, 'A One')
  assert.equal(matchDetails.events[0].targetPlayerName, 'B Nine')
})

test('resolveTackle records fouls on the lowest foul roll', () => {
  const ballCarrier = {
    playerID: 'B9',
    name: 'B Nine',
    skill: { tackling: 70, strength: 70, agility: 70 }
  }
  const { matchDetails, opposition, tackler, team } = tackleState([ballCarrier])

  withRandomSequence([0], () => {
    assert.equal(resolveTackle(tackler, team, opposition, matchDetails), true)
  })

  assert.equal(tackler.stats.tackles.fouls, 1)
  assert.equal(matchDetails.kickOffTeamStatistics.fouls, 1)
})

test('resolveTackle records fouls on realistic foul rolls', () => {
  const ballCarrier = {
    playerID: 'B9',
    name: 'B Nine',
    skill: { tackling: 70, strength: 70, agility: 70 }
  }
  const { matchDetails, opposition, tackler, team } = tackleState([ballCarrier])

  withRandomSequence([0.9], () => {
    assert.equal(resolveTackle(tackler, team, opposition, matchDetails), true)
  })

  assert.equal(tackler.stats.tackles.fouls, 1)
  assert.equal(matchDetails.kickOffTeamStatistics.fouls, 1)
})

test('movePlayers lets defenders challenge when within realistic contact range', () => {
  const { movePlayers } = require('../vendor/footballSimulationEngine/lib/playerMovement')
  const defender = {
    playerID: 'B4',
    name: 'B Four',
    position: 'CB',
    originPOS: [53.5, 50],
    currentPOS: [53.5, 50],
    hasBall: false,
    skill: { tackling: 80, strength: 80, agility: 70 },
    stats: {
      tackles: { total: 0, on: 0, off: 0, fouls: 0 },
      cards: { yellow: 0, red: 0 }
    }
  }
  const carrier = {
    playerID: 'A9',
    name: 'A Nine',
    position: 'ST',
    originPOS: [50, 20],
    currentPOS: [50, 50],
    hasBall: true,
    skill: { tackling: 70, strength: 70, agility: 70 },
    stats: { tackles: { total: 0, on: 0, off: 0, fouls: 0 } }
  }
  const defendingTeam = { teamID: 'B', intent: 'defend', players: [defender] }
  const attackingTeam = { teamID: 'A', intent: 'attack', players: [carrier] }
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A9', lastTouch: { playerID: 'A9', iterations: 10 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: { fouls: 0 },
    secondTeamStatistics: { fouls: 0 },
    iterationLog: []
  }

  withRandomSequence([0.9], () => {
    movePlayers([{ player: defender, action: 'tackle', move: [0, 0] }], defendingTeam, attackingTeam, matchDetails)
  })

  assert.equal(defender.stats.tackles.total, 1)
})

test('decideMovement lets close defenders attempt defensive actions', () => {
  const defender = {
    playerID: 'B4',
    name: 'B Four',
    position: 'CB',
    originPOS: [51, 50],
    currentPOS: [51, 50],
    intentPOS: [51, 50],
    fitness: 100,
    hasBall: false,
    action: 'none',
    skill: { tackling: 80, strength: 80, agility: 70, jumping: 70, perception: 70 }
  }
  const carrier = {
    playerID: 'A9',
    name: 'A Nine',
    position: 'ST',
    originPOS: [50, 20],
    currentPOS: [50, 50],
    intentPOS: [50, 50],
    fitness: 100,
    hasBall: true,
    skill: { tackling: 70, strength: 70, agility: 70, jumping: 70, shooting: 70 }
  }
  const defendingTeam = { teamID: 'B', players: [defender] }
  const attackingTeam = { teamID: 'A', players: [carrier] }
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A9', lastTouch: { playerID: 'A9', iterations: 10 }, ballOverIterations: [] },
    tactical: {},
    iterationLog: []
  }

  withRandomSequence([0.2], () => {
    const moves = decideMovement({ name: 'B Four', position: 1 }, defendingTeam, attackingTeam, matchDetails)
    assert.ok(['tackle', 'slide', 'intercept'].includes(moves[0].action))
  })
})

test('resolveTackle safely ignores missing ball owner in opposition', () => {
  const { matchDetails, opposition, tackler, team } = tackleState()

  assert.equal(resolveTackle(tackler, team, opposition, matchDetails), false)
  assert.equal(tackler.stats.tackles.total, 0)
})

test('resolveSlide safely ignores missing ball owner in opposition', () => {
  const { matchDetails, opposition, tackler, team } = tackleState()

  assert.equal(resolveSlide(tackler, team, opposition, matchDetails), false)
  assert.equal(tackler.stats.tackles.total, 0)
})

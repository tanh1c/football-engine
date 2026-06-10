'use strict'

const { initiateGame, playIteration, startSecondHalf } = require('../../vendor/footballSimulationEngine/engine')
const { hashSeed, withSeededRandom } = require('./rng')
const { toMatchFrame } = require('./frameAdapter')
const { analyzeTactics } = require('./tactical')

const DEFAULT_SECONDS_PER_TICK = 1

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeClock(clock, secondsPerTick = DEFAULT_SECONDS_PER_TICK) {
  const tick = Number(clock?.tick ?? 0)
  const totalSeconds = Number(clock?.totalSeconds ?? tick * secondsPerTick)
  return {
    tick,
    totalSeconds,
    minute: Math.floor(totalSeconds / 60),
    second: Math.floor(totalSeconds % 60),
    secondsPerTick
  }
}

function advanceClock(clock, secondsPerTick = DEFAULT_SECONDS_PER_TICK) {
  const previous = normalizeClock(clock, secondsPerTick)
  const tick = previous.tick + 1
  const totalSeconds = previous.totalSeconds + secondsPerTick
  return {
    tick,
    totalSeconds,
    minute: Math.floor(totalSeconds / 60),
    second: Math.floor(totalSeconds % 60),
    secondsPerTick
  }
}

async function initMatch(input) {
  const {
    homeTeam,
    awayTeam,
    pitch,
    seed = 'fm-like-demo',
    secondsPerTick = DEFAULT_SECONDS_PER_TICK
  } = input

  const initialRngState = hashSeed(seed)
  const { value: matchDetails, rngState } = await withSeededRandom(initialRngState, () => (
    initiateGame(clone(homeTeam), clone(awayTeam), clone(pitch))
  ))

  matchDetails.matchClock = normalizeClock({ tick: 0, totalSeconds: 0 }, secondsPerTick)
  matchDetails.seed = String(seed)
  matchDetails.rngState = rngState
  const tactical = analyzeTactics(matchDetails)
  matchDetails.frameHistory = [toMatchFrame(matchDetails, tactical)]

  return matchDetails
}

async function stepMatch(matchDetails, options = {}) {
  const secondsPerTick = options.secondsPerTick ?? matchDetails.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK
  matchDetails.tactical = analyzeTactics(matchDetails)
  const { value: state, rngState } = await withSeededRandom(matchDetails.rngState ?? matchDetails.seed, () => (
    playIteration(matchDetails)
  ))

  state.rngState = rngState
  state.matchClock = advanceClock(state.matchClock, secondsPerTick)

  const tactical = analyzeTactics(state)
  const frame = toMatchFrame(state, tactical)
  state.frameHistory = [...(state.frameHistory ?? []), frame]

  return {
    state,
    frame,
    events: frame.events
  }
}

async function startSecondHalfMatch(matchDetails) {
  const state = await startSecondHalf(matchDetails)
  state.matchClock = normalizeClock(state.matchClock, state.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK)
  const tactical = analyzeTactics(state)
  const frame = toMatchFrame(state, tactical)
  state.frameHistory = [...(state.frameHistory ?? []), frame]
  return { state, frame, events: frame.events }
}

async function simulateMatch(input, options = {}) {
  const ticks = Number(options.ticks ?? input.ticks ?? 90)
  let state = await initMatch(input)
  const frames = [...state.frameHistory]
  const events = []

  for (let index = 0; index < ticks; index++) {
    const result = await stepMatch(state, options)
    state = result.state
    frames.push(result.frame)
    events.push(...result.events)
  }

  return {
    state,
    frames,
    events,
    finalStats: {
      kickOffTeam: state.kickOffTeam?.statistics,
      secondTeam: state.secondTeam?.statistics
    }
  }
}

module.exports = {
  initMatch,
  simulateMatch,
  startSecondHalfMatch,
  stepMatch,
  toMatchFrame
}

'use strict'

const { initiateGame, playIteration, startSecondHalf } = require('../../vendor/footballSimulationEngine/engine')
const { hashSeed, withSeededRandom } = require('./rng')
const { toMatchFrame } = require('./frameAdapter')
const { analyzeTactics } = require('./tactical')
const { applyMovementIntents } = require('./tactical/applyMovementIntents')
const { addFrameContinuity } = require('./continuity')

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
  applyMovementIntents(matchDetails, matchDetails.tactical)
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
  const { value: state, rngState } = await withSeededRandom(matchDetails.rngState ?? matchDetails.seed, () => (
    startSecondHalf(matchDetails)
  ))
  state.rngState = rngState
  state.matchClock = normalizeClock(state.matchClock, state.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK)
  const tactical = analyzeTactics(state)
  const frame = toMatchFrame(state, tactical)
  state.frameHistory = [...(state.frameHistory ?? []), frame]
  return { state, frame, events: frame.events }
}

async function collectTicks(state, ticks, options, frames, events, debugLog) {
  for (let index = 0; index < ticks; index++) {
    const result = await stepMatch(state, options)
    state = result.state
    frames.push(result.frame)
    events.push(...result.events)
    debugLog.push(...(result.frame.debugLog ?? []))
  }
  return state
}

function matchResult(state, frames, events, debugLog, extra = {}) {
  return {
    state,
    frames: addFrameContinuity(frames),
    events,
    debugLog,
    finalStats: {
      kickOffTeam: state.kickOffTeamStatistics,
      secondTeam: state.secondTeamStatistics
    },
    ...extra
  }
}

async function simulateMatch(input, options = {}) {
  const ticks = Number(options.ticks ?? input.ticks ?? 90)
  let state = await initMatch(input)
  const frames = [...state.frameHistory]
  const events = []
  const debugLog = []

  state = await collectTicks(state, ticks, options, frames, events, debugLog)

  return matchResult(state, frames, events, debugLog)
}

async function simulateFullMatch(input, options = {}) {
  const secondsPerTick = Number(options.secondsPerTick ?? input.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK)
  const firstHalfTicks = Number(options.firstHalfTicks ?? Math.ceil((45 * 60) / secondsPerTick))
  const secondHalfTicks = Number(options.secondHalfTicks ?? Math.ceil((45 * 60) / secondsPerTick))
  let state = await initMatch(input)
  const frames = [...state.frameHistory]
  const events = []
  const debugLog = []

  state = await collectTicks(state, firstHalfTicks, options, frames, events, debugLog)

  const secondHalf = await startSecondHalfMatch(state)
  state = secondHalf.state
  frames.push(secondHalf.frame)
  events.push(...secondHalf.events)
  debugLog.push(...(secondHalf.frame.debugLog ?? []))

  state = await collectTicks(state, secondHalfTicks, options, frames, events, debugLog)

  return matchResult(state, frames, events, debugLog, {
    halves: {
      first: { ticks: firstHalfTicks },
      second: { ticks: secondHalfTicks }
    }
  })
}

module.exports = {
  initMatch,
  simulateFullMatch,
  simulateMatch,
  startSecondHalfMatch,
  stepMatch,
  toMatchFrame
}

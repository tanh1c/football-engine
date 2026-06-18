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

function playerById(matchDetails, playerId) {
  return [matchDetails.kickOffTeam, matchDetails.secondTeam]
    .flatMap(team => team?.players ?? [])
    .find(player => String(player.playerID) === String(playerId))
}

function applyActionRecommendations(matchDetails, tactical) {
  const carrier = matchDetails.ball?.Player ? playerById(matchDetails, matchDetails.ball.Player) : undefined
  if (!carrier) return

  const recommendation = tactical?.actionRecommendations?.find(candidate => candidate.action === 'pass' && candidate.targetPlayerId)
  if (!recommendation || recommendation.playerId !== String(carrier.playerID)) return

  carrier.actionTargetPlayerId = recommendation.targetPlayerId
}

function buildPreActionContext(matchDetails, tactical) {
  const owner = matchDetails.ball?.Player ? playerById(matchDetails, matchDetails.ball.Player) : undefined
  return {
    tick: matchDetails.matchClock?.tick,
    ballOwnerId: owner ? String(owner.playerID) : undefined,
    ballOwnerName: owner?.name,
    ballOwnerTeamId: matchDetails.ball?.withTeam ? String(matchDetails.ball.withTeam) : undefined,
    ballOwnerPosition: Array.isArray(owner?.currentPOS) ? owner.currentPOS.slice(0, 2) : undefined,
    phase: tactical?.phase,
    pressure: tactical?.pressure,
    shotQuality: tactical?.shotQuality,
    passOptions: tactical?.passOptions
  }
}

function alignCurrentTickEvents(matchDetails, startEventCount, clock) {
  for (const event of (matchDetails.events ?? []).slice(startEventCount)) {
    event.tick = clock.tick
    event.minute = clock.minute
    event.second = clock.second
  }
}

async function initMatch(input, options = {}) {
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
  matchDetails.frameHistory = options.collectFrames === false ? [] : [toMatchFrame(matchDetails, tactical)]

  return matchDetails
}

async function stepMatch(matchDetails, options = {}) {
  const secondsPerTick = options.secondsPerTick ?? matchDetails.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK
  matchDetails.tactical = analyzeTactics(matchDetails)
  const preActionContext = buildPreActionContext(matchDetails, matchDetails.tactical)
  applyActionRecommendations(matchDetails, matchDetails.tactical)
  applyMovementIntents(matchDetails, matchDetails.tactical)
  const startEventCount = matchDetails.events?.length ?? 0
  const { value: state, rngState } = await withSeededRandom(matchDetails.rngState ?? matchDetails.seed, () => (
    playIteration(matchDetails)
  ))

  state.rngState = rngState
  state.matchClock = advanceClock(state.matchClock, secondsPerTick)
  alignCurrentTickEvents(state, startEventCount, state.matchClock)

  const tactical = analyzeTactics(state)
  const frame = toMatchFrame(state, tactical, { preActionContext })
  if (options.collectFrames !== false) state.frameHistory = [...(state.frameHistory ?? []), frame]

  return {
    state,
    frame,
    events: frame.events
  }
}

async function startSecondHalfMatch(matchDetails, options = {}) {
  const { value: state, rngState } = await withSeededRandom(matchDetails.rngState ?? matchDetails.seed, () => (
    startSecondHalf(matchDetails)
  ))
  state.rngState = rngState
  state.matchClock = normalizeClock(state.matchClock, state.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK)
  state.events = [
    ...(state.events ?? []),
    {
      id: `${state.matchClock.tick}:half_time:${Number(state._eventCounter ?? 0) + 1}`,
      tick: state.matchClock.tick,
      minute: state.matchClock.minute,
      second: state.matchClock.second,
      type: 'half_time',
      message: `Second half started: ${state.secondTeam.name} to kick off`,
      commentaryText: 'The second half is underway.'
    }
  ]
  state._eventCounter = Number(state._eventCounter ?? 0) + 1
  const tactical = analyzeTactics(state)
  const frame = toMatchFrame(state, tactical)
  if (options.collectFrames !== false) state.frameHistory = [...(state.frameHistory ?? []), frame]
  return { state, frame, events: frame.events }
}

async function collectTicks(state, ticks, options, frames, events, debugLog) {
  for (let index = 0; index < ticks; index++) {
    const result = await stepMatch(state, options)
    state = result.state
    if (options.collectFrames !== false) frames.push(result.frame)
    options.onFrame?.(result.frame)
    events.push(...result.events)
    debugLog.push(...(result.frame.debugLog ?? []))
  }
  return state
}

function toPublicPlayer(player) {
  return {
    id: player.id,
    teamId: player.teamId,
    name: player.name,
    shirtNo: player.shirtNo,
    side: player.side,
    role: player.role,
    x: player.x,
    y: player.y,
    hasBall: player.hasBall
  }
}

function toPublicFrame(frame, options = {}) {
  const publicFrame = { ...frame }
  publicFrame.eventIds = (publicFrame.events ?? []).map(event => event.id)
  if (!options.includeTacticalDebug) {
    delete publicFrame.tactical
    publicFrame.players = (publicFrame.players ?? []).map(toPublicPlayer)
  }
  if (!options.includeFrameEvents) publicFrame.events = []
  if (!options.includeDebugLog) delete publicFrame.debugLog
  return publicFrame
}

function withFrameIdentity(frames) {
  return frames.map((frame, index) => ({
    ...frame,
    frameIndex: index,
    absoluteTick: index
  }))
}

function matchResult(state, frames, events, debugLog, options = {}, extra = {}) {
  const identifiedFrames = withFrameIdentity(frames)
  const continuousFrames = addFrameContinuity(identifiedFrames)
  const allEvents = options.collectFrames === false ? events : continuousFrames.flatMap(frame => frame.events ?? [])
  const allDebugLog = options.collectFrames === false ? debugLog : continuousFrames.flatMap(frame => frame.debugLog ?? [])

  return {
    state: options.includeState === false ? undefined : state,
    frames: options.collectFrames === false ? [] : continuousFrames.map(frame => toPublicFrame(frame, options)),
    events: allEvents,
    debugLog: options.includeDebugLog ? allDebugLog : [],
    debugTacticalFrames: options.includeTacticalDebug ? continuousFrames.map(frame => frame.tactical) : undefined,
    finalStats: {
      kickOffTeam: state.kickOffTeamStatistics,
      secondTeam: state.secondTeamStatistics,
      score: {
        kickOffTeam: Number(state.kickOffTeamStatistics?.goals ?? 0),
        secondTeam: Number(state.secondTeamStatistics?.goals ?? 0)
      }
    },
    ...extra
  }
}

async function simulateMatch(input, options = {}) {
  const ticks = Number(options.ticks ?? input.ticks ?? 90)
  let state = await initMatch(input, options)
  const frames = options.collectFrames === false ? [] : [...state.frameHistory]
  const events = []
  const debugLog = []

  state = await collectTicks(state, ticks, options, frames, events, debugLog)

  return matchResult(state, frames, events, debugLog, options)
}

async function simulateFullMatch(input, options = {}) {
  const secondsPerTick = Number(options.secondsPerTick ?? input.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK)
  const firstHalfTicks = Number(options.firstHalfTicks ?? Math.ceil((45 * 60) / secondsPerTick))
  const secondHalfTicks = Number(options.secondHalfTicks ?? Math.ceil((45 * 60) / secondsPerTick))
  let state = await initMatch(input, options)
  const frames = options.collectFrames === false ? [] : [...state.frameHistory]
  const events = []
  const debugLog = []

  state = await collectTicks(state, firstHalfTicks, options, frames, events, debugLog)

  const secondHalf = await startSecondHalfMatch(state, options)
  state = secondHalf.state
  if (options.collectFrames !== false) frames.push(secondHalf.frame)
  options.onFrame?.(secondHalf.frame)
  events.push(...secondHalf.events)
  debugLog.push(...(secondHalf.frame.debugLog ?? []))

  state = await collectTicks(state, secondHalfTicks, options, frames, events, debugLog)

  return matchResult(state, frames, events, debugLog, options, {
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

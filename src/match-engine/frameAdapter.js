'use strict'

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DEBUG_LOG_PREFIXES = [
  'ball start position:',
  'ball end position:',
  'closest player to ball:',
  'closest player to position:',
  'creating new ball movement',
  'ball still moving from previous kick:',
  'target selected:',
  'passed to new position:'
]

function playerStatus(player) {
  if (player.redCard === true || player.sentOff === true) return 'sent_off'
  if (player.injured === true) return 'injured'
  return 'normal'
}

function isPublicLogMessage(message) {
  const lower = String(message).toLowerCase()
  return !DEBUG_LOG_PREFIXES.some(prefix => lower.startsWith(prefix))
}

function parseSetPieceDetails(text) {
  const position = text.match(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*-?\d+(?:\.\d+)?)?\s*\]/)
  const withoutPosition = text.replace(/\s*\[[^\]]+\]\s*$/, '').trim()
  const setPiece = withoutPosition.match(/^(Goal Kick|Corner|Throw in|freekick|free kick|penalty)(?:\s+to|\s+awarded|:)?\s*-?\s*(.*)$/i)
  if (!setPiece) return {}
  const kindByLabel = {
    'goal kick': 'goal_kick',
    corner: 'corner',
    'throw in': 'throw_in',
    freekick: 'free_kick',
    'free kick': 'free_kick',
    penalty: 'penalty'
  }
  const teamName = setPiece[2].replace(/^to\s*:?\s*/i, '').replace(/^:\s*/, '').trim() || undefined
  return {
    kind: kindByLabel[setPiece[1].toLowerCase()],
    teamName,
    position: position ? { x: Number(position[1]), y: Number(position[2]) } : undefined
  }
}

function parseEventDetails(message, type) {
  const text = String(message)
  const goal = text.match(/^Goal Scored by - (.+) - \((.+)\)$/i)
  if (goal) return { playerName: goal[1], teamName: goal[2], outcome: 'goal' }

  const pass = text.match(/^ball passed by: (.+)$/i) ?? text.match(/^passed by: (.+)$/i)
  if (pass) return { playerName: pass[1] }

  const shot = text.match(/^Shot Made by: (.+)$/i)
  if (shot) return { playerName: shot[1] }

  const save = text.match(/^ball saved by (.+) possesion to (.+)$/i)
  if (save) return { playerName: save[1], teamName: save[2], outcome: 'saved' }

  if (type === 'set_piece') return parseSetPieceDetails(text)

  return {}
}

function mapDebugLog(matchDetails, clock) {
  return (matchDetails.iterationLog ?? [])
    .filter(message => !isPublicLogMessage(message))
    .map((message, index) => ({
      id: `${clock.tick}:debug:${index}`,
      tick: clock.tick,
      minute: clock.minute,
      second: clock.second,
      message: String(message)
    }))
}

function mapPlayer(player, team, side, tactical) {
  const [x = 0, y = 0] = Array.isArray(player.currentPOS) ? player.currentPOS : []
  const id = String(player.playerID ?? `${team.teamID ?? team.name}-${player.name}`)
  const movementIntent = tactical?.movementIntents?.find(intent => intent.playerId === id)
  return {
    id,
    teamId: String(team.teamID ?? team.name),
    teamName: team.name,
    side,
    name: player.name,
    shirtNo: player.shirtNo ?? player.number,
    role: player.position,
    x: toNumber(x),
    y: toNumber(y),
    hasBall: player.hasBall === true,
    stamina: toNumber(player.fitness, 100),
    movementIntent,
    status: playerStatus(player)
  }
}

function classifyLogMessage(message) {
  const text = String(message)
  const lower = text.toLowerCase()

  if (lower.includes('goal kick')) return 'set_piece'
  if (lower.includes('corner')) return 'set_piece'
  if (lower.includes('throw')) return 'set_piece'
  if (lower.includes('free kick') || lower.includes('freekick')) return 'set_piece'
  if (lower.includes('penalty')) return 'set_piece'
  if (lower.includes('goal scored') || lower.includes('goal')) return 'goal'
  if (lower.includes('saved')) return 'save'
  if (lower.includes('shot') || lower.includes('shoot')) return 'shot'
  if (lower.includes('pass')) return 'pass'
  if (lower.includes('tackle')) return 'tackle'
  if (lower.includes('offside')) return 'offside'
  if (lower.includes('foul')) return 'foul'
  return 'commentary'
}

function commentaryText(type, details) {
  if (type === 'goal' && details.teamName) return `Goal for ${details.teamName}!`
  if (type === 'shot' && details.playerName) return `${details.playerName} shoots.`
  if (type === 'pass' && details.fromPlayerName && details.toPlayerName) return `${details.fromPlayerName} looks for ${details.toPlayerName}.`
  if (type === 'pass' && details.playerName) return `${details.playerName} plays a pass.`
  if (type === 'long_ball' && details.fromPlayerName && details.toPlayerName) return `${details.fromPlayerName} goes long towards ${details.toPlayerName}.`
  if (type === 'switch_play' && details.fromPlayerName && details.toPlayerName) return `${details.fromPlayerName} switches play to ${details.toPlayerName}.`
  if (type === 'through_ball' && details.fromPlayerName && details.toPlayerName) return `${details.fromPlayerName} tries to slide ${details.toPlayerName} through.`
  if (type === 'cross' && details.fromPlayerName) return `${details.fromPlayerName} swings a cross into the area.`
  if (type === 'save' && details.playerName) return `${details.playerName} makes the save.`
  if (type === 'foul' && details.playerName) return `Foul against ${details.playerName}.`
  if (type === 'tackle' && details.playerName) return `${details.playerName} attempts a tackle.`
  if (type === 'set_piece') return 'Set piece awarded.'
  return undefined
}

function eventContext(type, details, tactical, options) {
  const preActionContext = options?.preActionContext
  const matchesPreActionOwner = !details.playerName || details.playerName === preActionContext?.ballOwnerName
  if ((type === 'shot' || type === 'goal') && matchesPreActionOwner && preActionContext?.shotQuality) {
    return {
      phase: preActionContext.phase ?? tactical?.phase,
      pressure: preActionContext.pressure?.score ?? tactical?.pressure?.score,
      xg: preActionContext.shotQuality.xg
    }
  }

  return {
    phase: tactical?.phase,
    pressure: tactical?.pressure?.score,
    xg: type === 'shot' || type === 'goal' ? tactical?.shotQuality?.xg : undefined
  }
}

function linkedShotContext(matchDetails, shotId) {
  if (!shotId) return undefined
  return (matchDetails.events ?? []).find(event => event.id === shotId && event.type === 'shot')
}

function normalizeStructuredEvent(event, clock, tactical, index, options = {}, matchDetails = {}) {
  const type = event.type ?? 'commentary'
  const message = event.message ?? event.commentaryText ?? String(type)
  const details = {
    playerName: event.playerName,
    teamName: event.teamName,
    outcome: event.outcome,
    shotId: event.shotId,
    fromPlayerName: event.fromPlayerName,
    toPlayerName: event.toPlayerName
  }
  if (type === 'goal' && !details.shotId && event.lastShotEventId) details.shotId = event.lastShotEventId
  const linkedShot = type === 'goal' ? linkedShotContext(matchDetails, details.shotId) : undefined
  const context = eventContext(type, details, tactical, options)
  if (linkedShot) {
    context.phase = linkedShot.phase
    context.pressure = linkedShot.pressure
    context.xg = linkedShot.xg
  }

  return {
    ...event,
    id: event.id ?? `${clock.tick}:structured:${index}`,
    tick: toNumber(event.tick, clock.tick),
    minute: toNumber(event.minute, clock.minute),
    second: toNumber(event.second, clock.second),
    type,
    message,
    commentaryText: event.commentaryText ?? commentaryText(type, details),
    ...details,
    phase: event.phase ?? context.phase,
    pressure: event.pressure ?? context.pressure,
    xg: event.xg ?? context.xg
  }
}

function mapLogEvents(matchDetails, clock, tactical, options = {}, startIndex = 0) {
  return (matchDetails.iterationLog ?? [])
    .filter(isPublicLogMessage)
    .map((message, index) => {
      const type = classifyLogMessage(message)
      const details = parseEventDetails(message, type)
      return {
        id: `${clock.tick}:${startIndex + index}`,
        tick: clock.tick,
        minute: clock.minute,
        second: clock.second,
        type,
        message: String(message),
        commentaryText: commentaryText(type, details),
        ...details,
        ...eventContext(type, details, tactical, options)
      }
    })
}

function mapEvents(matchDetails, clock, tactical, options = {}) {
  const hasStructuredHistory = Array.isArray(matchDetails.events) && matchDetails.events.length > 0
  if (hasStructuredHistory) {
    const currentEvents = matchDetails.events.filter(event => Number(event.tick ?? clock.tick) === Number(clock.tick))
    if (currentEvents.length > 0) {
      const structuredEvents = currentEvents.map((event, index) => normalizeStructuredEvent(event, clock, tactical, index, options, matchDetails))
      const structuredMessages = new Set(structuredEvents.map(event => String(event.message)))
      const logEvents = mapLogEvents(matchDetails, clock, tactical, options, structuredEvents.length)
        .filter(event => event.type === 'set_piece' && !structuredMessages.has(String(event.message)))
      return [...structuredEvents, ...logEvents]
    }
  }

  return mapLogEvents(matchDetails, clock, tactical, options)
    .filter(event => !hasStructuredHistory || !['save', 'goal', 'blocked_shot'].includes(event.type))
}

function toMatchFrame(matchDetails, tactical, options = {}) {
  const clock = matchDetails.matchClock ?? { tick: 0, minute: 0, second: 0, totalSeconds: 0 }
  const ballPosition = Array.isArray(matchDetails.ball?.position) ? matchDetails.ball.position : [0, 0, 0]
  const players = [
    ...(matchDetails.kickOffTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.kickOffTeam, 'kickOffTeam', tactical)),
    ...(matchDetails.secondTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.secondTeam, 'secondTeam', tactical))
  ]
  const ballOwner = matchDetails.ball?.Player
    ? players.find(player => player.id === String(matchDetails.ball.Player))
    : undefined

  return {
    tick: clock.tick,
    minute: clock.minute,
    second: clock.second,
    half: matchDetails.half,
    continuity: {
      secondsPerTick: toNumber(clock.secondsPerTick, 1),
      previousTick: Math.max(0, toNumber(clock.tick) - 1),
      nextTick: toNumber(clock.tick) + 1
    },
    pitch: {
      width: toNumber(matchDetails.pitchSize?.[0] ?? matchDetails.pitchWidth),
      height: toNumber(matchDetails.pitchSize?.[1] ?? matchDetails.pitchHeight)
    },
    score: {
      [String(matchDetails.kickOffTeam?.teamID ?? matchDetails.kickOffTeam?.name ?? 'home')]: toNumber(matchDetails.kickOffTeamStatistics?.goals),
      [String(matchDetails.secondTeam?.teamID ?? matchDetails.secondTeam?.name ?? 'away')]: toNumber(matchDetails.secondTeamStatistics?.goals)
    },
    ball: {
      x: toNumber(ballOwner?.x ?? ballPosition[0]),
      y: toNumber(ballOwner?.y ?? ballPosition[1]),
      z: ballOwner ? 0 : toNumber(ballPosition[2]),
      ownerPlayerId: matchDetails.ball?.Player ? String(matchDetails.ball.Player) : undefined,
      ownerTeamId: matchDetails.ball?.withTeam ? String(matchDetails.ball.withTeam) : undefined
    },
    players,
    events: mapEvents(matchDetails, clock, tactical, options),
    debugLog: mapDebugLog(matchDetails, clock),
    tactical
  }
}

module.exports = {
  toMatchFrame
}

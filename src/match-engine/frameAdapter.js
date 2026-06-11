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
  'ball still moving from previous kick:'
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

function parseEventDetails(message, type) {
  const text = String(message)
  const goal = text.match(/^Goal Scored by - (.+) - \((.+)\)$/i)
  if (goal) return { playerName: goal[1], teamName: goal[2], outcome: 'goal' }

  const pass = text.match(/^ball passed by: (.+)$/i) ?? text.match(/^passed by: (.+)$/i)
  if (pass) return { playerName: pass[1] }

  const shot = text.match(/^Shot Made by: (.+)$/i)
  if (shot) return { playerName: shot[1] }

  if (type === 'set_piece') {
    const setPiece = text.match(/^(Goal Kick|Corner|Throw in|freekick|penalty)(?: to| awarded|:)?\s*-?\s*(.*)$/i)
    if (setPiece?.[2]) return { teamName: setPiece[2].replace(/^to:\s*/i, '').trim() || undefined }
  }

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
  if (lower.includes('shot') || lower.includes('shoot')) return 'shot'
  if (lower.includes('pass')) return 'pass'
  if (lower.includes('tackle')) return 'tackle'
  if (lower.includes('offside')) return 'offside'
  if (lower.includes('foul')) return 'foul'
  return 'commentary'
}

function mapEvents(matchDetails, clock, tactical) {
  return (matchDetails.iterationLog ?? [])
    .filter(isPublicLogMessage)
    .map((message, index) => {
      const type = classifyLogMessage(message)
      return {
        id: `${clock.tick}:${index}`,
        tick: clock.tick,
        minute: clock.minute,
        second: clock.second,
        type,
        message: String(message),
        ...parseEventDetails(message, type),
        phase: tactical?.phase,
        pressure: tactical?.pressure?.score,
        xg: type === 'shot' || type === 'goal' ? tactical?.shotQuality?.xg : undefined
      }
    })
}

function toMatchFrame(matchDetails, tactical) {
  const clock = matchDetails.matchClock ?? { tick: 0, minute: 0, second: 0, totalSeconds: 0 }
  const ballPosition = Array.isArray(matchDetails.ball?.position) ? matchDetails.ball.position : [0, 0, 0]
  const players = [
    ...(matchDetails.kickOffTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.kickOffTeam, 'kickOffTeam', tactical)),
    ...(matchDetails.secondTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.secondTeam, 'secondTeam', tactical))
  ]

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
      x: toNumber(ballPosition[0]),
      y: toNumber(ballPosition[1]),
      z: toNumber(ballPosition[2]),
      ownerPlayerId: matchDetails.ball?.Player ? String(matchDetails.ball.Player) : undefined,
      ownerTeamId: matchDetails.ball?.withTeam ? String(matchDetails.ball.withTeam) : undefined
    },
    players,
    events: mapEvents(matchDetails, clock, tactical),
    debugLog: mapDebugLog(matchDetails, clock),
    tactical
  }
}

module.exports = {
  toMatchFrame
}

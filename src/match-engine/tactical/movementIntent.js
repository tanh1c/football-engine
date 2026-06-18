'use strict'

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function allPlayers(matchDetails) {
  return [matchDetails.kickOffTeam, matchDetails.secondTeam].flatMap(activePlayers)
}

function findPlayer(matchDetails, playerId) {
  return allPlayers(matchDetails).find(player => String(player.playerID) === String(playerId))
}

function intent(playerId, x, y, reason, urgency) {
  return {
    playerId: String(playerId),
    x: Number(Number(x).toFixed(3)),
    y: Number(Number(y).toFixed(3)),
    reason,
    urgency: Number(Number(urgency).toFixed(3))
  }
}

function possessionTeam(matchDetails) {
  const teamId = matchDetails.ball?.withTeam
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.kickOffTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.secondTeam
  return undefined
}

function attacksTowardBottom(matchDetails, team) {
  const [, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const firstPlayer = team?.players?.find(player => Array.isArray(player.originPOS))
  return firstPlayer ? firstPlayer.originPOS[1] <= pitchHeight / 2 : team?.teamID === matchDetails.kickOffTeam?.teamID
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function supportRunTarget(matchDetails, team, player) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const yStep = attacksTowardBottom(matchDetails, team) ? 8 : -8
  return {
    x: clamp(player.currentPOS[0], 0, pitchWidth),
    y: clamp(player.currentPOS[1] + yStep, 0, pitchHeight)
  }
}

function distanceToBall(player, ballPosition) {
  return Math.abs(player.currentPOS[0] - ballPosition[0]) + Math.abs(player.currentPOS[1] - ballPosition[1])
}

function closestPlayerToBall(team, ballPosition) {
  return activePlayers(team)
    .filter(player => String(player.position ?? '') !== 'GK')
    .sort((a, b) => distanceToBall(a, ballPosition) - distanceToBall(b, ballPosition))[0]
}

function pressTarget(presser, carrier) {
  const dx = presser.currentPOS[0] - carrier.currentPOS[0]
  const dy = presser.currentPOS[1] - carrier.currentPOS[1]
  const distance = Math.sqrt((dx * dx) + (dy * dy))
  if (distance <= 8) return { x: carrier.currentPOS[0], y: carrier.currentPOS[1] }
  return {
    x: carrier.currentPOS[0] + (dx / distance) * 8,
    y: carrier.currentPOS[1] + (dy / distance) * 8
  }
}

function roleIntent(matchDetails, team, player) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const attacksDown = attacksTowardBottom(matchDetails, team)
  const role = String(player.position ?? '')
  const ball = matchDetails.ball?.position ?? [pitchWidth / 2, pitchHeight / 2]
  const carrier = findPlayer(matchDetails, matchDetails.ball?.Player)
  const forwardStep = attacksDown ? 10 : -10
  const supportStep = attacksDown ? 6 : -6
  const carrierX = carrier?.currentPOS?.[0] ?? ball[0]
  const carrierY = carrier?.currentPOS?.[1] ?? ball[1]

  if (role === 'ST') {
    const channelDirection = ball[0] >= pitchWidth / 2 ? 1 : -1
    const channelX = clamp(player.currentPOS[0] + (channelDirection * 8), pitchWidth * 0.15, pitchWidth * 0.85)
    return intent(player.playerID, channelX, clamp(player.currentPOS[1] + (forwardStep * 1.1), 0, pitchHeight), 'attack_channel', 0.65)
  }

  if (role === 'CM' && !player.hasBall) {
    return intent(player.playerID, clamp((player.currentPOS[0] + carrierX) / 2, 0, pitchWidth), clamp((player.currentPOS[1] + carrierY) / 2 + supportStep, 0, pitchHeight), 'support_triangle', 0.55)
  }

  if (role === 'LB' || role === 'RB') {
    const wideX = role === 'LB' ? pitchWidth * 0.16 : pitchWidth * 0.84
    return intent(player.playerID, wideX, clamp(player.currentPOS[1] + (forwardStep * 1.6), 0, pitchHeight), 'overlap', 0.55)
  }

  if (role === 'CB') {
    const centreSideX = player.currentPOS[0] < pitchWidth / 2 ? pitchWidth * 0.425 : pitchWidth * 0.57
    const lineY = attacksDown
      ? clamp(Math.min(carrierY - (pitchHeight * 0.2), pitchHeight * 0.38), pitchHeight * 0.18, pitchHeight * 0.55)
      : clamp(Math.max(carrierY + (pitchHeight * 0.2), pitchHeight * 0.62), pitchHeight * 0.45, pitchHeight * 0.82)
    return intent(player.playerID, centreSideX, lineY, 'hold_line', 0.5)
  }

  if (role === 'LM' || role === 'LW') {
    if (ball[0] < pitchWidth * 0.45) {
      return intent(player.playerID, pitchWidth * 0.28, clamp(player.currentPOS[1] + forwardStep, 0, pitchHeight), 'inside_channel', 0.55)
    }
    return intent(player.playerID, pitchWidth * 0.1, clamp(player.currentPOS[1] + supportStep, 0, pitchHeight), 'hold_width', 0.5)
  }

  if (role === 'RM' || role === 'RW') {
    if (ball[0] > pitchWidth * 0.55) {
      return intent(player.playerID, pitchWidth * 0.72, clamp(player.currentPOS[1] + forwardStep, 0, pitchHeight), 'inside_channel', 0.55)
    }
    return intent(player.playerID, pitchWidth * 0.9, clamp(player.currentPOS[1] + supportStep, 0, pitchHeight), 'hold_width', 0.5)
  }

  if (role === 'GK') {
    const homeY = attacksDown ? pitchHeight * 0.06 : pitchHeight * 0.94
    const maxStepFromLine = pitchHeight * 0.02
    const angleX = pitchWidth * 0.5 + ((ball[0] - (pitchWidth * 0.5)) * 0.2)
    const angleY = attacksDown
      ? Math.min(homeY + maxStepFromLine, homeY + ((ball[1] - homeY) * 0.04))
      : Math.max(homeY - maxStepFromLine, homeY + ((ball[1] - homeY) * 0.04))
    return intent(player.playerID, clamp(angleX, pitchWidth * 0.35, pitchWidth * 0.65), clamp(angleY, 0, pitchHeight), 'goalkeeper_position', 0.35)
  }

  return undefined
}

function assignMovementIntents(matchDetails, tactical = {}) {
  const intents = new Map()
  const carrier = findPlayer(matchDetails, matchDetails.ball?.Player)
  const teamInPossession = possessionTeam(matchDetails)
  const presserId = tactical.pressing?.presserId
  const ballPosition = matchDetails.ball?.position

  if (tactical.phase === 'transition' && Array.isArray(ballPosition) && (matchDetails.ball?.ballOverIterations?.length ?? 0) === 0) {
    for (const team of [matchDetails.kickOffTeam, matchDetails.secondTeam]) {
      const closest = closestPlayerToBall(team, ballPosition)
      if (closest) intents.set(String(closest.playerID), intent(closest.playerID, ballPosition[0], ballPosition[1], 'loose_ball_recovery', 0.85))
    }
  }

  if (presserId && carrier) {
    const presser = findPlayer(matchDetails, presserId)
    const target = presser ? pressTarget(presser, carrier) : { x: carrier.currentPOS[0], y: carrier.currentPOS[1] }
    intents.set(String(presserId), intent(presserId, target.x, target.y, 'press', 0.9))
  }

  for (const option of tactical.passOptions?.slice(0, 2) ?? []) {
    if (option.progress > 0 && option.score >= 0.45 && !intents.has(String(option.playerId))) {
      const runner = findPlayer(matchDetails, option.playerId)
      if (runner && teamInPossession?.players?.some(player => String(player.playerID) === String(runner.playerID))) {
        const target = supportRunTarget(matchDetails, teamInPossession, runner)
        intents.set(String(option.playerId), intent(option.playerId, target.x, target.y, 'support_run', 0.75))
      }
    }
  }

  for (const lane of tactical.pressing?.blockLanes ?? []) {
    if (!intents.has(String(lane.defenderId))) {
      intents.set(String(lane.defenderId), intent(lane.defenderId, lane.x, lane.y, 'cover', 0.7))
    }
  }

  for (const team of [matchDetails.kickOffTeam, matchDetails.secondTeam]) {
    const goalkeeper = activePlayers(team).find(player => String(player.position ?? '') === 'GK')
    if (goalkeeper && !intents.has(String(goalkeeper.playerID))) {
      const goalkeeperIntent = roleIntent(matchDetails, team, goalkeeper)
      if (goalkeeperIntent) intents.set(String(goalkeeper.playerID), goalkeeperIntent)
    }
  }

  if (teamInPossession) {
    for (const player of activePlayers(teamInPossession)) {
      if (!intents.has(String(player.playerID))) {
        const roleBasedIntent = roleIntent(matchDetails, teamInPossession, player)
        if (roleBasedIntent) intents.set(String(player.playerID), roleBasedIntent)
      }
    }
  }

  for (const target of tactical.formationTargets ?? []) {
    if (!intents.has(String(target.playerId))) {
      intents.set(String(target.playerId), intent(target.playerId, target.x, target.y, 'recover_shape', 0.45))
    }
  }

  return [...intents.values()].sort((a, b) => a.playerId.localeCompare(b.playerId))
}

module.exports = {
  assignMovementIntents
}

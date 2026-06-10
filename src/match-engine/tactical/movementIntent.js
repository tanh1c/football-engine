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

function assignMovementIntents(matchDetails, tactical = {}) {
  const intents = new Map()
  const carrier = findPlayer(matchDetails, matchDetails.ball?.Player)
  const presserId = tactical.pressing?.presserId

  if (presserId && carrier) {
    intents.set(String(presserId), intent(presserId, carrier.currentPOS[0], carrier.currentPOS[1], 'press', 0.9))
  }

  for (const lane of tactical.pressing?.blockLanes ?? []) {
    if (!intents.has(String(lane.defenderId))) {
      intents.set(String(lane.defenderId), intent(lane.defenderId, lane.x, lane.y, 'cover', 0.7))
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

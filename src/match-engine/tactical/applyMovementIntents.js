'use strict'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function playersById(matchDetails) {
  return new Map([matchDetails.kickOffTeam, matchDetails.secondTeam]
    .flatMap(activePlayers)
    .map(player => [String(player.playerID), player]))
}

function applyMovementIntents(matchDetails, tactical = {}) {
  const [pitchWidth = 100, pitchHeight = 100] = matchDetails.pitchSize ?? []
  const players = playersById(matchDetails)

  for (const movementIntent of tactical.movementIntents ?? []) {
    const player = players.get(String(movementIntent.playerId))
    if (!player) continue
    player.intentPOS = [
      clamp(Number(movementIntent.x), 0, pitchWidth),
      clamp(Number(movementIntent.y), 0, pitchHeight)
    ]
  }

  return matchDetails
}

module.exports = {
  applyMovementIntents
}

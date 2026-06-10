'use strict'

function getCarrier(matchDetails) {
  const ball = matchDetails.ball ?? {}
  const team = matchDetails.kickOffTeam?.teamID === ball.withTeam ? matchDetails.kickOffTeam : matchDetails.secondTeam
  return team?.players?.find(player => player.playerID === ball.Player)
}

function attacksTowardBottom(matchDetails) {
  return matchDetails.ball?.withTeam === matchDetails.kickOffTeam?.teamID
}

function attackingProgress(matchDetails, player) {
  const [, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  return attacksTowardBottom(matchDetails) ? player.currentPOS[1] / pitchHeight : 1 - (player.currentPOS[1] / pitchHeight)
}

function isWide(matchDetails, player) {
  const [pitchWidth] = matchDetails.pitchSize ?? [100, 100]
  return player.currentPOS[0] < pitchWidth * 0.22 || player.currentPOS[0] > pitchWidth * 0.78
}

function recommendation(action, score, player, reason, targetPlayerId) {
  return {
    playerId: String(player.playerID),
    action,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(3)),
    targetPlayerId,
    reason
  }
}

function recommendActions(matchDetails, tactical = {}) {
  const carrier = getCarrier(matchDetails)
  if (!carrier) return []

  const pressure = tactical.pressure?.score ?? 0
  const xg = tactical.shotQuality?.xg ?? 0
  const bestPass = tactical.passOptions?.[0]
  const progress = attackingProgress(matchDetails, carrier)
  const actions = []

  actions.push(recommendation('shoot', (xg * 1.4) + (carrier.position === 'ST' ? 0.15 : 0) - (pressure * 0.25), carrier, 'high_xg_chance'))
  if (bestPass) actions.push(recommendation('pass', bestPass.score + Math.max(0, bestPass.progress ?? 0) * 0.2 - pressure * 0.1, carrier, 'safe_progressive_pass', bestPass.playerId))
  actions.push(recommendation('boot', (1 - progress) * pressure, carrier, 'defensive_pressure'))
  actions.push(recommendation('cross', isWide(matchDetails, carrier) && tactical.phase === 'final_third' ? 0.72 - pressure * 0.2 : 0.05, carrier, 'wide_final_third'))
  actions.push(recommendation('run', 0.35 + (1 - pressure) * 0.25, carrier, 'space_to_carry'))

  return actions.sort((a, b) => b.score - a.score)
}

module.exports = {
  recommendActions
}

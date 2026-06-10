'use strict'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function teamAttacksTowardBottom(matchDetails, team) {
  return team?.teamID === matchDetails.kickOffTeam?.teamID
}

function roleDepth(role) {
  if (role === 'GK') return 0.06
  if (role === 'CB') return 0.24
  if (role === 'LB' || role === 'RB') return 0.34
  if (role === 'CM' || role === 'LM' || role === 'RM') return 0.52
  if (role === 'ST') return 0.78
  return 0.5
}

function phaseDepthAdjustment(role, phase) {
  if (phase === 'build_up') return role === 'ST' ? -0.08 : -0.05
  if (phase === 'final_third') return role === 'ST' ? 0.1 : 0.06
  if (phase === 'transition') return 0.02
  return 0
}

function targetReason(role) {
  if (role === 'GK') return 'protect_goal'
  if (role === 'RM' || role === 'LM' || role === 'RB' || role === 'LB') return 'provide_width'
  if (role === 'ST') return 'attack_depth'
  if (role === 'CM') return 'support_ball'
  return 'hold_shape'
}

function targetWidth(player, ballX, pitchWidth) {
  const role = player.position
  if (role === 'LM' || role === 'LB') return clamp((pitchWidth * 0.18) + (ballX * 0.08), 8, pitchWidth * 0.35)
  if (role === 'RM' || role === 'RB') return clamp((pitchWidth * 0.82) + ((ballX - pitchWidth) * 0.08), pitchWidth * 0.65, pitchWidth - 8)
  if (role === 'CM') return clamp((pitchWidth * 0.5) + ((ballX - pitchWidth * 0.5) * 0.25), pitchWidth * 0.25, pitchWidth * 0.75)
  return clamp(player.originPOS?.[0] ?? pitchWidth / 2, 5, pitchWidth - 5)
}

function targetForPlayer(matchDetails, team, player, tactical = {}) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const [ballX] = matchDetails.ball?.position ?? [pitchWidth / 2, pitchHeight / 2]
  const phase = tactical.phase ?? 'midfield'
  const attacksBottom = teamAttacksTowardBottom(matchDetails, team)
  const adjustedDepth = clamp(roleDepth(player.position) + phaseDepthAdjustment(player.position, phase), 0.03, 0.95)
  const y = attacksBottom ? adjustedDepth * pitchHeight : (1 - adjustedDepth) * pitchHeight

  return {
    playerId: String(player.playerID),
    teamId: String(team.teamID),
    role: player.position,
    x: Number(targetWidth(player, ballX, pitchWidth).toFixed(3)),
    y: Number(y.toFixed(3)),
    reason: targetReason(player.position)
  }
}

function calculateFormationTargets(matchDetails, tactical = {}) {
  return [matchDetails.kickOffTeam, matchDetails.secondTeam]
    .flatMap(team => activePlayers(team).map(player => targetForPlayer(matchDetails, team, player, tactical)))
}

module.exports = {
  calculateFormationTargets
}

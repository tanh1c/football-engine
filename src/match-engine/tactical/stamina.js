'use strict'

function staminaFactor(player) {
  const fitness = Number(player.fitness ?? 100)
  return Math.max(0.35, Math.min(1, fitness / 100))
}

function roleSpeed(player) {
  if (player.position === 'GK') return 1.2
  if (player.position === 'ST') return 2.1
  if (player.position === 'RM' || player.position === 'LM' || player.position === 'RB' || player.position === 'LB') return 2.2
  return 1.9
}

function effectiveSpeed(player) {
  return roleSpeed(player) * staminaFactor(player)
}

module.exports = {
  staminaFactor,
  roleSpeed,
  effectiveSpeed
}

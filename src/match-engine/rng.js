'use strict'

const UINT32_MAX_PLUS_ONE = 0x100000000

function hashSeed(seed) {
  const value = String(seed ?? 'fm-like-default-seed')
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seedOrState) {
  let state = typeof seedOrState === 'number' ? seedOrState >>> 0 : hashSeed(seedOrState)

  const random = () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE
  }

  random.getState = () => state >>> 0
  return random
}

async function withSeededRandom(seedOrState, operation) {
  const originalRandom = Math.random
  const random = createSeededRandom(seedOrState)
  Math.random = random

  try {
    const value = await operation()
    return { value, rngState: random.getState() }
  } finally {
    Math.random = originalRandom
  }
}

module.exports = {
  createSeededRandom,
  hashSeed,
  withSeededRandom
}

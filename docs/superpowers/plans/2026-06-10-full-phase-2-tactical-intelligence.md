# Full Phase 2 Tactical Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 2 tactical intelligence with formation targets, intercept/press/block assignments, and context-aware action recommendations.

**Architecture:** Keep `vendor/footballSimulationEngine` as the execution core and extend the pure tactical layer under `src/match-engine/tactical/`. Tactical modules compute deterministic metadata from `matchDetails`; `frameAdapter` exports it; vendor hooks only consume small action biases after the analysis is stable. This follows the approved spec at `docs/superpowers/specs/2026-06-10-full-phase-2-tactical-intelligence-design.md`.

**Tech Stack:** Node.js CommonJS, `node:test`, current seeded RNG wrapper, mutable JSON match state from `footballSimulationEngine`.

---

## File structure

- Create `src/match-engine/tactical/formation.js`: role-aware formation target calculation.
- Create `src/match-engine/tactical/stamina.js`: shared stamina/speed helpers for intercept and pressing.
- Create `src/match-engine/tactical/intercept.js`: deterministic reach-tick estimates for active players.
- Create `src/match-engine/tactical/pressing.js`: presser, cover, and block-lane assignment.
- Create `src/match-engine/tactical/actionScoring.js`: context-aware action recommendation generation.
- Modify `src/match-engine/tactical/index.js`: compose the new modules into `analyzeTactics()`.
- Modify `vendor/footballSimulationEngine/lib/actions.js`: replace the tiny static bias with recommendation-aware action point adjustment.
- Modify `src/match-engine/index.js`: pass tactical recommendations to vendor execution in a minimal way.
- Modify tests under `test/`: add focused unit tests and integration coverage.

---

### Task 1: Formation targets

**Files:**
- Create: `src/match-engine/tactical/formation.js`
- Test: `test/tactical-formation.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/tactical-formation.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { calculateFormationTargets } = require('../src/match-engine/tactical/formation')

function player(playerID, teamID, position, x, y) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    fitness: 100
  }
}

function match(phase = 'midfield') {
  return {
    pitchSize: [100, 100],
    ball: { position: [80, 70, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: {
      teamID: 'A',
      players: [
        player('A1', 'A', 'GK', 50, 5),
        player('A4', 'A', 'CB', 45, 25),
        player('A8', 'A', 'CM', 50, 50),
        player('A7', 'A', 'RM', 88, 55),
        player('A9', 'A', 'ST', 50, 75)
      ]
    },
    secondTeam: { teamID: 'B', players: [] },
    iterationLog: [],
    tactical: { phase }
  }
}

test('calculateFormationTargets preserves width for wide midfielders', () => {
  const targets = calculateFormationTargets(match('midfield'), { phase: 'midfield' })
  const winger = targets.find(target => target.playerId === 'A7')

  assert.ok(winger.x > 70)
  assert.equal(winger.reason, 'provide_width')
})

test('calculateFormationTargets keeps center backs deeper than central midfielders', () => {
  const targets = calculateFormationTargets(match('midfield'), { phase: 'midfield' })
  const cb = targets.find(target => target.playerId === 'A4')
  const cm = targets.find(target => target.playerId === 'A8')

  assert.ok(cb.y < cm.y)
  assert.equal(cb.reason, 'hold_shape')
})

test('calculateFormationTargets pushes striker higher in final third than build up', () => {
  const buildUpTarget = calculateFormationTargets(match('build_up'), { phase: 'build_up' }).find(target => target.playerId === 'A9')
  const finalThirdTarget = calculateFormationTargets(match('final_third'), { phase: 'final_third' }).find(target => target.playerId === 'A9')

  assert.ok(finalThirdTarget.y > buildUpTarget.y)
  assert.equal(finalThirdTarget.reason, 'attack_depth')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/tactical-formation.test.js`

Expected: FAIL with module not found for `src/match-engine/tactical/formation`.

- [ ] **Step 3: Write minimal implementation**

Create `src/match-engine/tactical/formation.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/tactical-formation.test.js`

Expected: PASS.

---

### Task 2: Stamina and intercept estimates

**Files:**
- Create: `src/match-engine/tactical/stamina.js`
- Create: `src/match-engine/tactical/intercept.js`
- Test: `test/tactical-intercept.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/tactical-intercept.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { estimateInterceptions } = require('../src/match-engine/tactical/intercept')

function player(playerID, teamID, x, y, fitness = 100) {
  return { playerID, teamID, position: 'CM', currentPOS: [x, y], originPOS: [x, y], fitness }
}

test('estimateInterceptions ranks closer players with lower reachTicks', () => {
  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 52, 50), player('A2', 'A', 80, 80)] },
    secondTeam: { teamID: 'B', players: [] }
  })

  assert.equal(result[0].playerId, 'A1')
  assert.ok(result[0].reachTicks < result[1].reachTicks)
})

test('estimateInterceptions penalizes low fitness', () => {
  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 60, 50, 100), player('A2', 'A', 60, 50, 30)] },
    secondTeam: { teamID: 'B', players: [] }
  })

  const fresh = result.find(item => item.playerId === 'A1')
  const tired = result.find(item => item.playerId === 'A2')
  assert.ok(fresh.reachTicks < tired.reachTicks)
})

test('estimateInterceptions excludes inactive players', () => {
  const inactive = player('A2', 'A', 50, 50)
  inactive.currentPOS = ['NP', 'NP']

  const result = estimateInterceptions({
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A1', 'A', 80, 80), inactive] },
    secondTeam: { teamID: 'B', players: [] }
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].playerId, 'A1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/tactical-intercept.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/match-engine/tactical/stamina.js`:

```js
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
```

Create `src/match-engine/tactical/intercept.js`:

```js
'use strict'

const { distance } = require('./pressure')
const { effectiveSpeed } = require('./stamina')

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function estimateInterceptions(matchDetails) {
  const ballPosition = matchDetails.ball?.position ?? [0, 0]
  const estimates = [matchDetails.kickOffTeam, matchDetails.secondTeam]
    .flatMap(team => activePlayers(team).map(player => {
      const reachTicks = Math.ceil(distance(player.currentPOS, ballPosition) / effectiveSpeed(player))
      return {
        playerId: String(player.playerID),
        teamId: String(team.teamID),
        reachTicks,
        target: { x: Number(ballPosition[0]), y: Number(ballPosition[1]) }
      }
    }))
    .sort((a, b) => a.reachTicks - b.reachTicks)

  return estimates.map((estimate, index) => ({ ...estimate, rank: index + 1 }))
}

module.exports = {
  estimateInterceptions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/tactical-intercept.test.js`

Expected: PASS.

---

### Task 3: Pressing and block assignments

**Files:**
- Create: `src/match-engine/tactical/pressing.js`
- Test: `test/tactical-pressing.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/tactical-pressing.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { assignPressing } = require('../src/match-engine/tactical/pressing')

function player(playerID, teamID, x, y, hasBall = false) {
  return { playerID, teamID, name: playerID, position: 'CM', currentPOS: [x, y], originPOS: [x, y], hasBall, fitness: 100 }
}

const matchDetails = {
  pitchSize: [100, 100],
  ball: { position: [50, 50, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
  kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, true), player('A10', 'A', 70, 70)] },
  secondTeam: { teamID: 'B', players: [player('B6', 'B', 53, 50), player('B4', 'B', 60, 55), player('B5', 'B', 80, 80)] }
}

test('assignPressing selects nearest opponent as presser', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })

  assert.equal(result.presserId, 'B6')
})

test('assignPressing excludes presser from cover players', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })

  assert.ok(result.coverIds.length > 0)
  assert.equal(result.coverIds.includes(result.presserId), false)
})

test('assignPressing places block lane between carrier and best pass receiver', () => {
  const result = assignPressing(matchDetails, {
    passOptions: [{ playerId: 'A10', score: 0.8 }]
  })
  const lane = result.blockLanes[0]

  assert.equal(lane.fromPlayerId, 'A8')
  assert.equal(lane.toPlayerId, 'A10')
  assert.ok(lane.x > 50 && lane.x < 70)
  assert.ok(lane.y > 50 && lane.y < 70)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/tactical-pressing.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/match-engine/tactical/pressing.js`:

```js
'use strict'

const { distance } = require('./pressure')

function getTeam(matchDetails, teamId) {
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.kickOffTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.secondTeam
  return undefined
}

function getOpposition(matchDetails, teamId) {
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.secondTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.kickOffTeam
  return undefined
}

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function assignPressing(matchDetails, tactical = {}) {
  const ball = matchDetails.ball ?? {}
  if (!ball.withPlayer || !ball.withTeam) return { coverIds: [], blockLanes: [] }

  const possessionTeam = getTeam(matchDetails, ball.withTeam)
  const defendingTeam = getOpposition(matchDetails, ball.withTeam)
  const carrier = activePlayers(possessionTeam).find(player => player.playerID === ball.Player)
  if (!carrier || !defendingTeam) return { coverIds: [], blockLanes: [] }

  const defendersByDistance = activePlayers(defendingTeam)
    .map(player => ({ player, distance: distance(player.currentPOS, carrier.currentPOS) }))
    .sort((a, b) => a.distance - b.distance)

  const presser = defendersByDistance[0]?.player
  const coverIds = defendersByDistance.slice(1, 3).map(item => String(item.player.playerID))
  const bestPass = tactical.passOptions?.[0]
  const receiver = bestPass ? activePlayers(possessionTeam).find(player => String(player.playerID) === bestPass.playerId) : undefined
  const blockLanes = receiver && presser ? [{
    defenderId: coverIds[0] ?? String(presser.playerID),
    fromPlayerId: String(carrier.playerID),
    toPlayerId: String(receiver.playerID),
    x: Number(((carrier.currentPOS[0] + receiver.currentPOS[0]) / 2).toFixed(3)),
    y: Number(((carrier.currentPOS[1] + receiver.currentPOS[1]) / 2).toFixed(3))
  }] : []

  return {
    presserId: presser ? String(presser.playerID) : undefined,
    coverIds,
    blockLanes
  }
}

module.exports = {
  assignPressing
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/tactical-pressing.test.js`

Expected: PASS.

---

### Task 4: Action recommendations

**Files:**
- Create: `src/match-engine/tactical/actionScoring.js`
- Test: `test/tactical-action-scoring.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/tactical-action-scoring.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { recommendActions } = require('../src/match-engine/tactical/actionScoring')

function player(playerID, teamID, position, x, y, hasBall = false) {
  return { playerID, teamID, name: playerID, position, currentPOS: [x, y], originPOS: [x, y], hasBall, fitness: 100 }
}

function baseMatch(position = [50, 80], role = 'ST') {
  return {
    pitchSize: [100, 100],
    ball: { position: [position[0], position[1], 0], withPlayer: true, withTeam: 'A', Player: 'A9' },
    kickOffTeam: { teamID: 'A', players: [player('A9', 'A', role, position[0], position[1], true), player('A10', 'A', 'CM', 55, 85)] },
    secondTeam: { teamID: 'B', players: [] }
  }
}

test('recommendActions favors shoot for high xG striker chances', () => {
  const result = recommendActions(baseMatch([50, 92], 'ST'), {
    phase: 'final_third',
    pressure: { score: 0.1 },
    shotQuality: { xg: 0.45 },
    passOptions: []
  })

  assert.equal(result[0].action, 'shoot')
  assert.ok(result[0].score > 0.5)
})

test('recommendActions favors boot under high pressure in defensive third', () => {
  const result = recommendActions(baseMatch([50, 15], 'CB'), {
    phase: 'build_up',
    pressure: { score: 0.9 },
    shotQuality: { xg: 0.02 },
    passOptions: []
  })

  assert.equal(result[0].action, 'boot')
})

test('recommendActions favors pass for safe progressive pass option', () => {
  const result = recommendActions(baseMatch([50, 55], 'CM'), {
    phase: 'midfield',
    pressure: { score: 0.2 },
    shotQuality: { xg: 0.05 },
    passOptions: [{ playerId: 'A10', score: 0.85, progress: 0.3 }]
  })

  assert.equal(result[0].action, 'pass')
  assert.equal(result[0].targetPlayerId, 'A10')
})

test('recommendActions favors cross for wide final-third players', () => {
  const result = recommendActions(baseMatch([88, 80], 'RM'), {
    phase: 'final_third',
    pressure: { score: 0.2 },
    shotQuality: { xg: 0.08 },
    passOptions: []
  })

  assert.equal(result[0].action, 'cross')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/tactical-action-scoring.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/match-engine/tactical/actionScoring.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/tactical-action-scoring.test.js`

Expected: PASS.

---

### Task 5: Compose full tactical analysis and expose frame metadata

**Files:**
- Modify: `src/match-engine/tactical/index.js`
- Test: `test/tactical-analysis.test.js`
- Test: `test/match-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `test/tactical-analysis.test.js`:

```js
test('analyzeTactics includes full phase 2 tactical fields', () => {
  const result = analyzeTactics({
    pitchSize: [100, 100],
    ball: { position: [50, 70, 0], withPlayer: true, withTeam: 'A', Player: 'A8' },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 70, true), player('A10', 'A', 50, 85)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 70), player('B5', 'B', 70, 70)] },
    iterationLog: []
  })

  assert.ok(Array.isArray(result.formationTargets))
  assert.ok(Array.isArray(result.intercepts))
  assert.ok(result.pressing)
  assert.ok(Array.isArray(result.actionRecommendations))
})
```

Add to `test/match-engine.test.js`:

```js
test('simulateMatch includes full phase 2 tactical metadata on frames', async () => {
  const result = await simulateMatch(demoInput('full-phase-2-frame'), { ticks: 2 })
  const tactical = result.frames[2].tactical

  assert.ok(Array.isArray(tactical.formationTargets))
  assert.ok(Array.isArray(tactical.intercepts))
  assert.ok(tactical.pressing)
  assert.ok(Array.isArray(tactical.actionRecommendations))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/tactical-analysis.test.js test/match-engine.test.js`

Expected: FAIL because new tactical fields are missing.

- [ ] **Step 3: Modify tactical composer**

Replace `src/match-engine/tactical/index.js` with:

```js
'use strict'

const { classifyPhase } = require('./phase')
const { calculatePressure } = require('./pressure')
const { rankPassOptions } = require('./passOptions')
const { estimateShotQuality } = require('./shotQuality')
const { calculateFormationTargets } = require('./formation')
const { estimateInterceptions } = require('./intercept')
const { assignPressing } = require('./pressing')
const { recommendActions } = require('./actionScoring')

function analyzeTactics(matchDetails) {
  const base = {
    phase: classifyPhase(matchDetails),
    possessionTeamId: matchDetails.ball?.withTeam ? String(matchDetails.ball.withTeam) : undefined,
    pressure: calculatePressure(matchDetails)
  }
  base.passOptions = rankPassOptions(matchDetails)
  base.shotQuality = estimateShotQuality(matchDetails, base.pressure)
  base.formationTargets = calculateFormationTargets(matchDetails, base)
  base.intercepts = estimateInterceptions(matchDetails)
  base.pressing = assignPressing(matchDetails, base)
  base.actionRecommendations = recommendActions(matchDetails, base)
  return base
}

module.exports = {
  analyzeTactics,
  classifyPhase,
  calculatePressure,
  rankPassOptions,
  estimateShotQuality,
  calculateFormationTargets,
  estimateInterceptions,
  assignPressing,
  recommendActions
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/tactical-analysis.test.js test/match-engine.test.js`

Expected: PASS.

---

### Task 6: Recommendation-aware vendor action hook

**Files:**
- Modify: `src/match-engine/index.js`
- Modify: `vendor/footballSimulationEngine/lib/actions.js`
- Test: `test/match-engine.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/match-engine.test.js`:

```js
test('full phase 2 action recommendations keep simulation deterministic', async () => {
  const first = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })
  const second = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.events, second.events)
})
```

- [ ] **Step 2: Run test before hook**

Run: `npm test -- test/match-engine.test.js`

Expected: PASS. This is a baseline determinism test before modifying the hook.

- [ ] **Step 3: Store tactical recommendations before vendor iteration**

In `src/match-engine/index.js`, inside `stepMatch()` before `playIteration(matchDetails)`, add:

```js
  matchDetails.tactical = analyzeTactics(matchDetails)
```

The resulting function body should include:

```js
async function stepMatch(matchDetails, options = {}) {
  const secondsPerTick = options.secondsPerTick ?? matchDetails.matchClock?.secondsPerTick ?? DEFAULT_SECONDS_PER_TICK
  matchDetails.tactical = analyzeTactics(matchDetails)
  const { value: state, rngState } = await withSeededRandom(matchDetails.rngState ?? matchDetails.seed, () => (
    playIteration(matchDetails)
  ))
```

- [ ] **Step 4: Add recommendation multiplier helper**

In `vendor/footballSimulationEngine/lib/actions.js`, replace `selectAction(possibleActions)` with:

```js
function recommendationMultiplier(actionName, possibleActions) {
  const recommendation = possibleActions.find(action => action.recommendationAction === actionName)
  if (!recommendation) return 1
  return 1 + Math.max(0, Math.min(1, recommendation.recommendationScore ?? 0))
}

function selectAction(possibleActions) {
  const adjustedActions = possibleActions.map(action => ({ ...action }))
  for (const action of adjustedActions) {
    action.points = Math.round(action.points * recommendationMultiplier(action.name, adjustedActions))
    if (action.name === 'pass') action.points = Math.round(action.points * 1.1)
    if (action.name === 'throughBall') action.points = Math.round(action.points * 1.05)
    if (action.name === 'shoot' && action.points > 0) action.points = Math.round(action.points * 1.05)
    if (action.name === 'boot') action.points = Math.round(action.points * 0.9)
  }

  let goodActions = []
  for (const thisAction of adjustedActions) {
    let tempArray = Array(thisAction.points).fill(thisAction.name)
    goodActions = goodActions.concat(tempArray)
  }
  if (goodActions[0] == null) return 'wait'
  return goodActions[common.getRandomNumber(0, goodActions.length - 1)]
}
```

- [ ] **Step 5: Pass recommendations into action objects**

In `vendor/footballSimulationEngine/lib/actions.js`, update `populatePossibleActions()` after action points are set and before `adjustForBallHeight`:

```js
  const recommendation = matchDetails.tactical?.actionRecommendations?.find(item => item.playerId === String(player.playerID))
  if (recommendation) {
    possibleActions.forEach(action => {
      action.recommendationAction = recommendation.action
      action.recommendationScore = recommendation.score
    })
  }
```

The edited section should be:

```js
  possibleActions[9].points = j
  possibleActions[10].points = k
  const recommendation = matchDetails.tactical?.actionRecommendations?.find(item => item.playerId === String(player.playerID))
  if (recommendation) {
    possibleActions.forEach(action => {
      action.recommendationAction = recommendation.action
      action.recommendationScore = recommendation.score
    })
  }
  possibleActions = adjustForBallHeight(possibleActions, player, matchDetails)
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: PASS.

---

### Task 7: Final verification and demo

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Generate tactical demo JSON**

Run: `npm run simulate -- 20 tactical-demo`

Expected: command succeeds and reports `Wrote 21 frames`.

- [ ] **Step 3: Check changed files**

Run: `git status --short`

Expected: changes include tactical modules, tests, `src/match-engine/index.js`, `src/match-engine/frameAdapter.js`, and `vendor/footballSimulationEngine/lib/actions.js`.

- [ ] **Step 4: Report completion**

Report the test command outputs and changed file categories. Do not create a commit unless the user explicitly asks.

# Phase 3 Continuous Match Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 2D match viewer feel continuous by emitting denser simulation frames, adding movement/trajectory metadata, and rendering interpolated playback.

**Architecture:** Keep the vendored simulation engine as the source of match truth. Add pure continuity helpers around exported frames and viewer rendering so visual smoothing does not affect deterministic simulation results. Tactical metadata from Phase 2 feeds conservative movement intents that are exported for rendering/debugging but do not rewrite vendor movement yet.

**Tech Stack:** Node.js CommonJS match engine, Node test runner, browser canvas ES module viewer, existing vendored `footballSimulationEngine`.

---

## File structure

- Create `src/match-engine/tactical/movementIntent.js` — converts Phase 2 tactical metadata into per-player movement intents.
- Create `src/match-engine/continuity.js` — adds previous/next tick and ball trajectory metadata to completed frame arrays.
- Create `src/viewer/interpolate.js` — pure ES module helpers for player, ball, and clock interpolation.
- Modify `src/match-engine/tactical/index.js` — includes `movementIntents` in `analyzeTactics()` output.
- Modify `src/match-engine/frameAdapter.js` — attaches player-level `movementIntent` and frame continuity defaults.
- Modify `src/match-engine/index.js` — post-processes generated frames with continuity metadata.
- Modify `scripts/simulate-demo.js` — accepts `secondsPerTick` as a third CLI argument after seed.
- Modify `src/viewer/render.js` — renders interpolated frames using a playhead rather than jumping raw snapshots.
- Modify `public/index.html` — adds playback speed controls.
- Modify `README.md` — documents smooth demo commands.
- Create `test/tactical-movement-intent.test.js`.
- Create `test/match-continuity.test.js`.
- Create `test/viewer-interpolate.test.js`.
- Modify `test/match-engine.test.js`.

---

### Task 1: Configurable smooth demo tick duration

**Files:**
- Modify: `scripts/simulate-demo.js`
- Modify: `test/match-engine.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `test/match-engine.test.js` after the existing clock/frame test:

```js
test('simulateMatch supports one-second smooth tick output', async () => {
  const result = await simulateMatch({ ...demoInput('smooth-one-second'), secondsPerTick: 1 }, { ticks: 3 })

  assert.equal(result.frames.length, 4)
  assert.equal(result.frames[3].tick, 3)
  assert.equal(result.frames[3].second, 3)
  assert.equal(result.frames[3].continuity.secondsPerTick, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/match-engine.test.js
```

Expected: FAIL because `frame.continuity` does not exist yet.

- [ ] **Step 3: Add frame continuity default metadata**

In `src/match-engine/frameAdapter.js`, update the returned frame object in `toMatchFrame()` to include:

```js
    continuity: {
      secondsPerTick: toNumber(clock.secondsPerTick, 1),
      previousTick: Math.max(0, toNumber(clock.tick) - 1),
      nextTick: toNumber(clock.tick) + 1
    },
```

Place it after `half: matchDetails.half,` and before `pitch:`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/match-engine.test.js
```

Expected: PASS for `test/match-engine.test.js`.

- [ ] **Step 5: Update CLI secondsPerTick argument**

In `scripts/simulate-demo.js`, change:

```js
  const ticks = Number(process.argv[2] ?? 30)
  const seed = process.argv[3] ?? 'demo-seed'
```

To:

```js
  const ticks = Number(process.argv[2] ?? 30)
  const seed = process.argv[3] ?? 'demo-seed'
  const secondsPerTick = Number(process.argv[4] ?? 5)
```

Then change:

```js
    secondsPerTick: 5
```

To:

```js
    secondsPerTick
```

And add `secondsPerTick` to the JSON written to `tmp/demo-match.json`:

```js
    seed,
    ticks,
    secondsPerTick,
    frames: result.frames,
```

- [ ] **Step 6: Verify CLI still runs**

Run:

```bash
npm run simulate -- 3 smooth-test 1
```

Expected: command writes 4 frames to `tmp/demo-match.json`.

- [ ] **Step 7: Commit**

```bash
git add scripts/simulate-demo.js src/match-engine/frameAdapter.js test/match-engine.test.js
git commit -m "Add configurable smooth simulation ticks"
```

---

### Task 2: Movement intent tactical metadata

**Files:**
- Create: `src/match-engine/tactical/movementIntent.js`
- Modify: `src/match-engine/tactical/index.js`
- Modify: `src/match-engine/frameAdapter.js`
- Create: `test/tactical-movement-intent.test.js`
- Modify: `test/tactical-analysis.test.js`

- [ ] **Step 1: Write failing movement intent tests**

Create `test/tactical-movement-intent.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { assignMovementIntents } = require('../src/match-engine/tactical/movementIntent')

function player(playerID, teamID, x, y, position = 'CM', hasBall = false) {
  return {
    playerID,
    teamID,
    name: playerID,
    position,
    currentPOS: [x, y],
    originPOS: [x, y],
    hasBall,
    fitness: 100
  }
}

test('assignMovementIntents sends presser toward ball carrier', () => {
  const matchDetails = {
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 50)] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { presserId: 'B4', coverIds: [], blockLanes: [] },
    formationTargets: []
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 50,
    y: 50,
    reason: 'press',
    urgency: 0.9
  })
})

test('assignMovementIntents falls back to formation target recovery', () => {
  const matchDetails = {
    ball: { withPlayer: true, withTeam: 'A', Player: 'A8', position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [player('A8', 'A', 50, 50, 'CM', true)] },
    secondTeam: { teamID: 'B', players: [player('B4', 'B', 55, 50)] }
  }

  const result = assignMovementIntents(matchDetails, {
    pressing: { coverIds: [], blockLanes: [] },
    formationTargets: [{ playerId: 'B4', x: 40, y: 35 }]
  })

  assert.deepEqual(result.find(intent => intent.playerId === 'B4'), {
    playerId: 'B4',
    x: 40,
    y: 35,
    reason: 'recover_shape',
    urgency: 0.45
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/tactical-movement-intent.test.js
```

Expected: FAIL because `src/match-engine/tactical/movementIntent.js` does not exist.

- [ ] **Step 3: Implement movement intent module**

Create `src/match-engine/tactical/movementIntent.js`:

```js
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
```

- [ ] **Step 4: Verify movement intent tests pass**

Run:

```bash
npm test -- test/tactical-movement-intent.test.js
```

Expected: PASS.

- [ ] **Step 5: Add movement intents to tactical analysis**

Modify `src/match-engine/tactical/index.js`:

```js
const { assignMovementIntents } = require('./movementIntent')
```

Then after pressing is assigned:

```js
  base.movementIntents = assignMovementIntents(matchDetails, base)
```

And add export:

```js
  assignMovementIntents
```

- [ ] **Step 6: Add integration assertion**

In `test/tactical-analysis.test.js`, inside `analyzeTactics includes full phase 2 tactical fields`, add:

```js
  assert.ok(Array.isArray(result.movementIntents))
```

- [ ] **Step 7: Attach movement intent to frame players**

In `src/match-engine/frameAdapter.js`, change `mapPlayer(player, team, side)` to accept tactical:

```js
function mapPlayer(player, team, side, tactical) {
  const [x = 0, y = 0] = Array.isArray(player.currentPOS) ? player.currentPOS : []
  const id = String(player.playerID ?? `${team.teamID ?? team.name}-${player.name}`)
  const movementIntent = tactical?.movementIntents?.find(intent => intent.playerId === id)
  return {
    id,
```

Then add this property before `status`:

```js
    movementIntent,
```

Update player mapping calls:

```js
    ...(matchDetails.kickOffTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.kickOffTeam, 'kickOffTeam', tactical)),
    ...(matchDetails.secondTeam?.players ?? []).map(player => mapPlayer(player, matchDetails.secondTeam, 'secondTeam', tactical))
```

- [ ] **Step 8: Verify tactical analysis and match engine tests**

Run:

```bash
npm test -- test/tactical-analysis.test.js test/match-engine.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/match-engine/tactical/movementIntent.js src/match-engine/tactical/index.js src/match-engine/frameAdapter.js test/tactical-movement-intent.test.js test/tactical-analysis.test.js
git commit -m "Add tactical movement intents"
```

---

### Task 3: Frame continuity and ball trajectory post-processing

**Files:**
- Create: `src/match-engine/continuity.js`
- Modify: `src/match-engine/index.js`
- Create: `test/match-continuity.test.js`
- Modify: `test/match-engine.test.js`

- [ ] **Step 1: Write failing continuity tests**

Create `test/match-continuity.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { addFrameContinuity } = require('../src/match-engine/continuity')

test('addFrameContinuity links neighboring ticks', () => {
  const frames = addFrameContinuity([
    { tick: 0, ball: { x: 1, y: 2, z: 0 }, continuity: { secondsPerTick: 1 } },
    { tick: 1, ball: { x: 3, y: 4, z: 0 }, continuity: { secondsPerTick: 1 } }
  ])

  assert.equal(frames[0].continuity.previousTick, undefined)
  assert.equal(frames[0].continuity.nextTick, 1)
  assert.equal(frames[1].continuity.previousTick, 0)
  assert.equal(frames[1].continuity.nextTick, undefined)
})

test('addFrameContinuity derives ball trajectory from neighboring frames', () => {
  const frames = addFrameContinuity([
    { tick: 0, ball: { x: 1, y: 2, z: 0 }, continuity: { secondsPerTick: 1 } },
    { tick: 1, ball: { x: 3, y: 4, z: 5 }, continuity: { secondsPerTick: 1 } }
  ])

  assert.deepEqual(frames[0].ball.trajectory, {
    from: { x: 1, y: 2, z: 0 },
    to: { x: 3, y: 4, z: 5 },
    reason: 'frame_delta'
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/match-continuity.test.js
```

Expected: FAIL because `src/match-engine/continuity.js` does not exist.

- [ ] **Step 3: Implement continuity helper**

Create `src/match-engine/continuity.js`:

```js
'use strict'

function ballPoint(ball = {}) {
  return {
    x: Number(ball.x ?? 0),
    y: Number(ball.y ?? 0),
    z: Number(ball.z ?? 0)
  }
}

function addFrameContinuity(frames) {
  return (frames ?? []).map((frame, index, allFrames) => {
    const previous = allFrames[index - 1]
    const next = allFrames[index + 1]
    return {
      ...frame,
      continuity: {
        ...(frame.continuity ?? {}),
        previousTick: previous?.tick,
        nextTick: next?.tick
      },
      ball: {
        ...frame.ball,
        trajectory: next ? {
          from: ballPoint(frame.ball),
          to: ballPoint(next.ball),
          reason: 'frame_delta'
        } : undefined
      }
    }
  })
}

module.exports = {
  addFrameContinuity
}
```

- [ ] **Step 4: Verify continuity tests pass**

Run:

```bash
npm test -- test/match-continuity.test.js
```

Expected: PASS.

- [ ] **Step 5: Use continuity helper in simulateMatch**

Modify `src/match-engine/index.js`:

```js
const { addFrameContinuity } = require('./continuity')
```

In `simulateMatch()`, before returning, add:

```js
  const continuousFrames = addFrameContinuity(frames)
```

Then return:

```js
    frames: continuousFrames,
```

- [ ] **Step 6: Add integration assertion**

In `test/match-engine.test.js`, inside `simulateMatch supports one-second smooth tick output`, add:

```js
  assert.equal(result.frames[0].continuity.nextTick, 1)
  assert.equal(result.frames[0].ball.trajectory.to.x, result.frames[1].ball.x)
```

- [ ] **Step 7: Verify match engine tests pass**

Run:

```bash
npm test -- test/match-engine.test.js test/match-continuity.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/match-engine/continuity.js src/match-engine/index.js test/match-continuity.test.js test/match-engine.test.js
git commit -m "Add frame continuity metadata"
```

---

### Task 4: Pure viewer interpolation helpers

**Files:**
- Create: `src/viewer/interpolate.js`
- Create: `test/viewer-interpolate.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing interpolation tests**

Create `test/viewer-interpolate.test.js`:

```js
'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

async function loadModule() {
  return import('../src/viewer/interpolate.js')
}

test('interpolateFrame blends player and ball positions', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [{ id: 'A1', x: 0, y: 0 }],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 10, y: 20, z: 4 },
    players: [{ id: 'A1', x: 10, y: 20 }],
    events: []
  }, 0.5)

  assert.equal(frame.ball.x, 5)
  assert.equal(frame.ball.y, 10)
  assert.equal(frame.ball.z, 2)
  assert.equal(frame.players[0].x, 5)
  assert.equal(frame.players[0].y, 10)
  assert.equal(frame.second, 0.5)
})

test('interpolateFrame falls back when next player is missing', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [{ id: 'A1', x: 7, y: 8 }],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [],
    events: []
  }, 0.5)

  assert.equal(frame.players[0].x, 7)
  assert.equal(frame.players[0].y, 8)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/viewer-interpolate.test.js
```

Expected: FAIL because `src/viewer/interpolate.js` does not exist.

- [ ] **Step 3: Make viewer interpolation file loadable as ES module**

Because the project is CommonJS but browser viewer files are ES modules, create `src/viewer/package.json`:

```json
{
  "type": "module"
}
```

- [ ] **Step 4: Implement interpolation helpers**

Create `src/viewer/interpolate.js`:

```js
function clampRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function lerp(a, b, ratio) {
  return Number(a ?? 0) + (Number(b ?? a ?? 0) - Number(a ?? 0)) * ratio
}

function playerMap(frame) {
  return new Map((frame?.players ?? []).map(player => [player.id, player]))
}

function interpolatePlayers(current, next, ratio) {
  const nextPlayers = playerMap(next)
  return (current.players ?? []).map(player => {
    const nextPlayer = nextPlayers.get(player.id)
    if (!nextPlayer) return { ...player }
    return {
      ...player,
      x: lerp(player.x, nextPlayer.x, ratio),
      y: lerp(player.y, nextPlayer.y, ratio),
      hasBall: ratio < 0.5 ? player.hasBall : nextPlayer.hasBall
    }
  })
}

function interpolateBall(current, next, ratio) {
  const nextBall = next?.ball ?? current.ball
  return {
    ...current.ball,
    x: lerp(current.ball?.x, nextBall?.x, ratio),
    y: lerp(current.ball?.y, nextBall?.y, ratio),
    z: lerp(current.ball?.z, nextBall?.z, ratio),
    ownerPlayerId: ratio < 0.5 ? current.ball?.ownerPlayerId : nextBall?.ownerPlayerId,
    ownerTeamId: ratio < 0.5 ? current.ball?.ownerTeamId : nextBall?.ownerTeamId
  }
}

function frameSeconds(frame) {
  return Number(frame?.minute ?? 0) * 60 + Number(frame?.second ?? 0)
}

export function interpolateFrame(current, next, ratio) {
  if (!current) return undefined
  const boundedRatio = clampRatio(ratio)
  if (!next) return { ...current, players: [...(current.players ?? [])], ball: { ...(current.ball ?? {}) } }
  const totalSeconds = lerp(frameSeconds(current), frameSeconds(next), boundedRatio)

  return {
    ...current,
    tick: lerp(current.tick, next.tick, boundedRatio),
    minute: Math.floor(totalSeconds / 60),
    second: totalSeconds % 60,
    ball: interpolateBall(current, next, boundedRatio),
    players: interpolatePlayers(current, next, boundedRatio),
    events: boundedRatio < 0.5 ? current.events : next.events
  }
}

export function framePairAtPlayhead(frames, playhead) {
  const safeFrames = frames ?? []
  const baseIndex = Math.max(0, Math.min(safeFrames.length - 1, Math.floor(playhead)))
  return {
    current: safeFrames[baseIndex],
    next: safeFrames[baseIndex + 1],
    ratio: clampRatio(playhead - baseIndex),
    baseIndex
  }
}
```

- [ ] **Step 5: Verify interpolation tests pass**

Run:

```bash
npm test -- test/viewer-interpolate.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/viewer/package.json src/viewer/interpolate.js test/viewer-interpolate.test.js
git commit -m "Add viewer frame interpolation helpers"
```

---

### Task 5: Smooth viewer playback controls

**Files:**
- Modify: `src/viewer/render.js`
- Modify: `public/index.html`

- [ ] **Step 1: Update renderer to use interpolation helpers**

At the top of `src/viewer/render.js`, add:

```js
import { framePairAtPlayhead, interpolateFrame } from './interpolate.js'
```

Change viewer state to:

```js
  const state = {
    frames: [],
    frameIndex: 0,
    playhead: 0,
    playing: false,
    lastTime: 0,
    speed: options.speed ?? 1,
    renderFps: options.renderFps ?? 60,
    rafId: undefined
  }
```

In `setFrames()`, set both index and playhead:

```js
    state.frameIndex = 0
    state.playhead = 0
```

Add helper:

```js
  function renderFrame() {
    const pair = framePairAtPlayhead(state.frames, state.playhead)
    state.frameIndex = pair.baseIndex
    return interpolateFrame(pair.current, pair.next, pair.ratio)
  }
```

In `draw()`, replace:

```js
    const frame = state.frames[state.frameIndex]
```

With:

```js
    const frame = renderFrame()
```

- [ ] **Step 2: Update playback loop**

Replace `loop(timestamp)` with:

```js
  function loop(timestamp) {
    if (!state.playing) return
    if (!state.lastTime) state.lastTime = timestamp
    const elapsedSeconds = (timestamp - state.lastTime) / 1000
    state.lastTime = timestamp
    state.playhead += elapsedSeconds * state.speed
    if (state.playhead >= Math.max(0, state.frames.length - 1)) state.playhead = 0
    draw()
    state.rafId = requestAnimationFrame(loop)
  }
```

Update `next()`:

```js
  function next() {
    state.playhead = Math.min(state.frames.length - 1, Math.floor(state.playhead) + 1)
    state.frameIndex = Math.floor(state.playhead)
    draw()
  }
```

Update `previous()`:

```js
  function previous() {
    state.playhead = Math.max(0, Math.floor(state.playhead) - 1)
    state.frameIndex = Math.floor(state.playhead)
    draw()
  }
```

Add:

```js
  function setSpeed(speed) {
    state.speed = Math.max(0.25, Math.min(8, Number(speed) || 1))
  }
```

Return `setSpeed`:

```js
  return { draw, next, pause, play, previous, resize, setFrames, setSpeed, state }
```

- [ ] **Step 3: Improve HUD clock formatting for fractional seconds**

In `drawHud(frame)`, replace the clock line with:

```js
    const displaySecond = Math.floor(frame.second)
    context.fillText(`Tick ${Math.floor(frame.tick)} • ${String(frame.minute).padStart(2, '0')}:${String(displaySecond).padStart(2, '0')}`, 28, 42)
```

- [ ] **Step 4: Add speed control to HTML**

In `public/index.html`, add this after the Next button:

```html
      <label>Speed
        <select id="speed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>
      </label>
```

And add JS listener after button listeners:

```js
      document.getElementById('speed').addEventListener('change', event => viewer.setSpeed(event.target.value))
```

- [ ] **Step 5: Run automated tests**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Run a smooth demo**

Run:

```bash
npm run simulate -- 30 smooth-viewer-test 1
```

Expected: command writes 31 frames to `tmp/demo-match.json`.

- [ ] **Step 7: Commit**

```bash
git add src/viewer/render.js public/index.html
git commit -m "Render interpolated match playback"
```

---

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README commands**

In `README.md`, replace the command block with:

```md
```bash
npm test
npm run simulate -- 900 smooth-demo 1
python3 -m http.server 8080
```
```

Replace the sentence after the command block with:

```md
Then open `http://localhost:8080/public/` to view interpolated match playback. The third `simulate` argument controls `secondsPerTick`; use `1` for smoother output or `5` for the original quicker snapshot demo.
```

Add to `What is implemented`:

```md
- Interpolated browser playback with configurable speed, continuity metadata, movement intents, and ball trajectory hints.
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run final demo generation**

Run:

```bash
npm run simulate -- 900 smooth-demo 1
```

Expected: writes 901 frames to `tmp/demo-match.json`.

- [ ] **Step 4: Manually verify viewer**

Run:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/public/
```

Expected: players and ball move smoothly between engine frames; speed selector changes playback speed; play/pause/prev/next still work.

- [ ] **Step 5: Commit**

```bash
git add README.md tmp/demo-match.json
git commit -m "Document smooth match playback"
```

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: no unexpected tracked changes. Untracked local workspace files may remain only if they were already present before Phase 3.

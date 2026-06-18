# Feedback6 Semantic Correctness Implementation Plan

**Goal:** Fix feedback6 semantic correctness issues so public match events stop contradicting state: shot/save/goal links must be current, terminal outcomes must be unique, set-piece fallback events need `teamId`, passes need real resolution, and batch must catch these regressions.

**Core principle:** Do not chase pretty batch numbers before event semantics are correct. If realism metrics move after fixing terminal state, retune from batch evidence rather than weakening correctness gates.

---

## Phase 1 — Shot lifecycle source of truth

### Problem

Save/goal/blocked events can link to the latest shot in global history instead of the shot currently being resolved. This allows saves hundreds of ticks after a shot.

### Files

Modify:
- `vendor/footballSimulationEngine/lib/ballMovement.js`
- `vendor/footballSimulationEngine/lib/setPositions.js`

Tests:
- `test/vendor-output-hygiene.test.js`

### Implementation

1. When a shot event is created, set:

```js
outcome: 'pending'
```

2. Store the current shot on `ball.lastTouch`:

```js
matchDetails.ball.lastTouch.shotEventId = shotEvent.id
matchDetails.ball.lastTouch.action = 'shot'
matchDetails.ball.lastTouch.playerID = player.playerID
matchDetails.ball.lastTouch.teamID = team.teamID
matchDetails.ball.lastTouch.xg = shotEvent.xg
```

3. Add helper:

```js
function currentShotEvent(matchDetails) {
  const lastTouch = matchDetails.ball?.lastTouch ?? {}
  if (lastTouch.action !== 'shot' && lastTouch.action !== 'penalty') return undefined
  if (!lastTouch.shotEventId) return undefined

  return (matchDetails.events ?? []).find(event => (
    event.type === 'shot' &&
    event.id === lastTouch.shotEventId &&
    event.outcome === 'pending'
  ))
}
```

4. Add terminal resolver:

```js
function resolveShotOutcome(matchDetails, outcome, details = {}) {
  const shot = currentShotEvent(matchDetails)
  if (!shot) return undefined

  Object.assign(shot, { outcome, ...details })
  if (matchDetails.ball?.lastTouch) delete matchDetails.ball.lastTouch.shotEventId
  return shot
}
```

5. Stop using global `latestShotEvent(matchDetails)` for save/goal/blocked resolution.

### Tests first

Add regression tests proving:
- save does not link to an old shot after possession/action changed
- save does not link if `ball.lastTouch.action !== 'shot'`
- save resolves shot outcome from `pending` to `saved`
- save clears `ball.lastTouch.shotEventId`
- second save attempt for the same shot does not emit another linked save

### Verification

```bash
npm test -- test/vendor-output-hygiene.test.js
```

---

## Phase 2 — Save/goal/blocked terminal correctness

### Problem

Feedback6 found same-team saves, self-saves, multi-save shots, and goal xG mismatch with linked shot xG.

### Files

Modify:
- `vendor/footballSimulationEngine/lib/ballMovement.js`
- `vendor/footballSimulationEngine/lib/setPositions.js`
- possibly `src/match-engine/frameAdapter.js`

Tests:
- `test/vendor-output-hygiene.test.js`
- `test/frame-adapter.test.js`

### Implementation

1. `pushSaveEvent()` must require a current pending shot.

Validate before resolving:

```js
const shot = currentShotEvent(matchDetails)
if (!shot) return undefined
if (String(shot.teamId) === String(keeperTeam.teamID)) return undefined
if (String(shot.playerId) === String(keeper.playerID)) return undefined
```

Then resolve and emit:

```js
resolveShotOutcome(matchDetails, 'saved', {
  savedByPlayerId: String(keeper.playerID),
  savedByPlayerName: keeper.name,
  savedByTeamId: String(keeperTeam.teamID),
  savedByTeamName: keeperTeam.name
})

return pushStructuredEvent(matchDetails, {
  type: 'save',
  shotId: shot.id,
  playerId: String(keeper.playerID),
  playerName: keeper.name,
  teamId: String(keeperTeam.teamID),
  teamName: keeperTeam.name,
  shotPlayerId: shot.playerId,
  shotPlayerName: shot.playerName,
  shotTeamId: shot.teamId,
  shotTeamName: shot.teamName,
  xg: shot.xg,
  phase: shot.phase,
  pressure: shot.pressure,
  outcome: 'saved',
  message: `ball saved by ${keeper.name}`
})
```

2. Goal events must copy linked shot context:

```js
const shot = resolveShotOutcome(matchDetails, 'goal')

pushStructuredEvent(matchDetails, {
  type: 'goal',
  shotId: shot?.id,
  playerId: shot?.playerId ?? fallbackPlayerId,
  playerName: shot?.playerName ?? fallbackPlayerName,
  teamId: shot?.teamId ?? scoringTeam.teamID,
  teamName: shot?.teamName ?? scoringTeam.name,
  xg: shot?.xg,
  phase: shot?.phase,
  pressure: shot?.pressure,
  outcome: 'goal',
  message: ...
})
```

3. Blocked shots must be terminal:

```js
const shot = resolveShotOutcome(matchDetails, 'blocked', {
  blockedByPlayerId: String(defender.playerID),
  blockedByPlayerName: defender.name
})
```

4. Off-target/out boundary handling should resolve current pending shot to `off_target` or `out`.

### Tests first

Add tests proving:
- same-team keeper cannot emit linked save
- same player cannot save own shot
- goal copies xG from linked shot exactly
- save copies xG from linked shot exactly
- blocked shot resolves shot outcome to `blocked`
- shot cannot be saved after it was already blocked
- shot cannot produce both save and goal

### Verification

```bash
npm test -- test/vendor-output-hygiene.test.js test/frame-adapter.test.js
```

---

## Phase 3 — Batch semantic invariant checks

### Problem

Current batch gates check broad realism but not event contradictions.

### Files

Modify:
- `scripts/simulate-batch.js`

Tests:
- `test/batch-summary.test.js`

### Implementation

1. Add `countEventInvariants(events)`:

```js
function countEventInvariants(events = []) {
  const shotById = new Map()
  const terminalEventsByShotId = new Map()
  const invariants = {
    sameTeamSaveEvents: 0,
    selfSaveEvents: 0,
    missingShotLinkEvents: 0,
    staleShotLinkEvents: 0,
    multiTerminalShotEvents: 0,
    goalXgMismatchEvents: 0
  }

  for (const event of events) {
    if (event.type === 'shot' && event.id) shotById.set(event.id, event)
  }

  for (const event of events) {
    if (!['save', 'goal', 'blocked_shot'].includes(event.type)) continue

    if (!event.shotId) {
      invariants.missingShotLinkEvents++
      continue
    }

    const shot = shotById.get(event.shotId)
    if (!shot) {
      invariants.missingShotLinkEvents++
      continue
    }

    const tickDistance = Math.abs(Number(event.tick ?? 0) - Number(shot.tick ?? 0))
    if (tickDistance > 30) invariants.staleShotLinkEvents++

    const terminals = terminalEventsByShotId.get(event.shotId) ?? []
    terminals.push(event)
    terminalEventsByShotId.set(event.shotId, terminals)

    if (event.type === 'save') {
      if (String(event.teamId) === String(shot.teamId)) invariants.sameTeamSaveEvents++
      if (String(event.playerId) === String(shot.playerId)) invariants.selfSaveEvents++
    }

    if (event.type === 'goal' && event.xg !== undefined && shot.xg !== undefined) {
      if (Number(event.xg) !== Number(shot.xg)) invariants.goalXgMismatchEvents++
    }
  }

  for (const terminals of terminalEventsByShotId.values()) {
    if (terminals.length > 1) invariants.multiTerminalShotEvents += terminals.length - 1
  }

  return invariants
}
```

2. Add summary fields:

```text
sameTeamSaveEvents
selfSaveEvents
missingShotLinkEvents
staleShotLinkEvents
multiTerminalShotEvents
goalXgMismatchEvents
```

3. Add realism gate:

```js
const cleanShotSemantics =
  summary.sameTeamSaveEvents === 0 &&
  summary.selfSaveEvents === 0 &&
  summary.missingShotLinkEvents === 0 &&
  summary.staleShotLinkEvents === 0 &&
  summary.multiTerminalShotEvents === 0 &&
  summary.goalXgMismatchEvents === 0
```

4. Include in `realism.passes`.

5. Print CLI output:

```text
same team save events: 0
self save events: 0
missing shot links: 0
stale shot links: 0
multi terminal shot events: 0
goal xG mismatch events: 0
realism shot semantics: true
```

### Tests first

Add tests proving batch fails on:
- same-team save
- self-save
- missing shotId
- stale shot link over 30 ticks
- one shot with two saves
- goal xG differing from shot xG

### Verification

```bash
npm test -- test/batch-summary.test.js
```

---

## Phase 4 — Set-piece fallback teamId

### Problem

Fallback parsed set-piece events can have `teamName` without `teamId`.

### Files

Modify:
- `src/match-engine/frameAdapter.js`

Tests:
- `test/frame-adapter.test.js`

### Implementation

1. Add helper:

```js
function findTeamByName(matchDetails, teamName) {
  const normalized = String(teamName ?? '').trim()
  if (!normalized) return undefined

  for (const team of [matchDetails.kickOffTeam, matchDetails.secondTeam]) {
    if (String(team?.name ?? '').trim() === normalized) return team
  }

  return undefined
}
```

2. Use in fallback set-piece parse:

```js
const team = findTeamByName(matchDetails, details.teamName)

return {
  type: 'set_piece',
  kind,
  teamName: details.teamName,
  teamId: team ? String(team.teamID) : undefined,
  position,
  ...
}
```

3. Avoid duplicate parsed fallback when same tick already has structured `set_piece`.

Simple first pass:

```js
if (structuredEvents.some(event => event.type === 'set_piece')) {
  skip parsed set-piece logs for that tick
}
```

### Tests first

Add tests:
- fallback freekick resolves `teamId` from `teamName`
- fallback corner resolves `teamId`
- fallback set-piece is not duplicated when structured set-piece exists for the same tick

### Verification

```bash
npm test -- test/frame-adapter.test.js
```

---

## Phase 5 — Completed pass resolution

### Problem

Feedback6 found many pass-like events still stuck as `attempted`, with completed pass count possibly zero.

### Files

Modify:
- `vendor/footballSimulationEngine/lib/ballMovement.js`
- possibly `vendor/footballSimulationEngine/lib/setPositions.js`
- `scripts/simulate-batch.js`

Tests:
- `test/vendor-output-hygiene.test.js`
- `test/batch-summary.test.js`

### Implementation

1. When pass is created:

```js
matchDetails.ball.lastTouch.passEventId = passEvent.id
matchDetails.ball.lastTouch.action = 'pass'
```

2. Keep `passEventId` alive while ball is travelling.

3. On teammate possession:

```js
updatePassOutcome(matchDetails, 'completed', {
  receiverPlayerId: String(receiver.playerID),
  receiverPlayerName: receiver.name
})
delete matchDetails.ball.lastTouch.passEventId
```

4. On opponent possession:

```js
updatePassOutcome(matchDetails, 'intercepted', {
  interceptorPlayerId: String(defender.playerID),
  interceptorPlayerName: defender.name,
  interceptorTeamId: String(defenderTeam.teamID),
  interceptorTeamName: defenderTeam.name
})
delete matchDetails.ball.lastTouch.passEventId
```

5. On boundary/set-piece after pass:

```js
updatePassOutcome(matchDetails, 'out')
delete matchDetails.ball.lastTouch.passEventId
```

6. Add batch metrics:

```text
completedPassRate
unresolvedPassRate
interceptedPassRate
```

7. Add gate:

```js
const plausiblePassResolution =
  summary.completedPassRate >= 0.25 &&
  summary.unresolvedPassRate <= 0.5
```

### Tests first

Add tests:
- teammate reception updates pass to completed
- opponent reception updates pass to intercepted
- boundary after pass updates pass to out
- batch summary fails if all pass-like events remain attempted
- batch full smoke has completed pass rate above threshold

### Verification

```bash
npm test -- test/vendor-output-hygiene.test.js test/batch-summary.test.js
node scripts/simulate-batch.js 3 --full
```

---

## Phase 6 — Batch timeout and progress guard

### Problem

Batch should not hang silently. Feedback6 specifically calls out batch 4/10 sandbox instability.

### Files

Modify:
- `scripts/simulate-batch.js`

Tests:
- `test/batch-summary.test.js` or new `test/simulate-batch.test.js`

### Implementation

1. Add CLI option:

```bash
--match-timeout-ms 30000
```

2. Parse:

```js
matchTimeoutMs: optionNumber(argv, '--match-timeout-ms', 30000)
```

3. Add helper:

```js
function timeoutAfter(ms, seed) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${seed} timeout after ${ms}ms`)), ms)
  })
}
```

4. Wrap each match:

```js
const startedAt = Date.now()

try {
  const result = await Promise.race([
    runSingleMatch(...),
    timeoutAfter(options.matchTimeoutMs, seed)
  ])

  results.push({
    seed,
    ok: true,
    durationMs: Date.now() - startedAt,
    ...result
  })
} catch (error) {
  results.push({
    seed,
    ok: false,
    timeout: /timeout/.test(error.message),
    durationMs: Date.now() - startedAt,
    error: error.message
  })
}
```

5. Add CLI progress output in `main()` only:

```text
batch-0 done 8421ms
batch-1 timeout after 30000ms
```

6. Add summary metrics:

```text
timeouts
avgMatchMs
slowestMatchMs
```

7. Fail realism if `timeouts > 0`.

### Tests first

Add tests:
- `parseArgs()` reads `--match-timeout-ms`
- summary counts timeouts
- timeout result makes realism stable false
- duration metrics are averaged

### Verification

```bash
npm test -- test/batch-summary.test.js
node scripts/simulate-batch.js 10 --full --match-timeout-ms 30000
```

---

## Phase 7 — First-pass fast batch mode

### Problem

`collectFrames:false` helps memory, but batch still behaves like live match simulation. True fast-sim is larger work, so first pass should be scoped.

### Files

Modify:
- `src/match-engine/index.js`
- `scripts/simulate-batch.js`

Tests:
- `test/match-engine.test.js`
- `test/batch-summary.test.js`

### Implementation

1. Add option:

```js
simulateFullMatch(input, {
  mode: 'batch'
})
```

2. In batch mode, force:

```js
if (options.mode === 'batch') {
  options.collectFrames = false
  options.includeState = false
  options.includeDebugLog = false
  options.includeTacticalDebug = false
}
```

3. Use in batch runner:

```js
simulateFullMatch(input, {
  mode: 'batch',
  onFrame: frame => invariantCounter.update(normalizeFrame(frame))
})
```

4. Do not skip tactical analysis yet. That is a separate risky optimization.

### Tests first

Add tests:
- `mode: 'batch'` returns no frames/state
- `mode: 'batch'` still returns events/finalStats
- deterministic same seed still works
- batch runner uses batch mode options

### Verification

```bash
npm test -- test/match-engine.test.js test/batch-summary.test.js
node scripts/simulate-batch.js 10 --full
```

---

## Phase 8 — Score API ergonomics

### Problem

Current score API works but is awkward for UI/game layer.

### Files

Modify:
- `src/match-engine/index.js`

Tests:
- `test/match-engine.test.js`

### Implementation

Change `finalStats.score` to:

```js
const kickOffGoals = Number(state.kickOffTeamStatistics?.goals ?? 0)
const secondGoals = Number(state.secondTeamStatistics?.goals ?? 0)

score: {
  home: kickOffGoals,
  away: secondGoals,
  kickOffTeam: kickOffGoals,
  secondTeam: secondGoals,
  byTeamId: {
    [state.kickOffTeam.teamID]: kickOffGoals,
    [state.secondTeam.teamID]: secondGoals
  }
}
```

Keep existing `kickOffTeam` and `secondTeam` fields for compatibility.

### Tests first

Add tests:
- `finalStats.score.home` exists
- `finalStats.score.away` exists
- `finalStats.score.byTeamId[kickOffTeam.teamID]` matches kickoff goals
- existing `kickOffTeam`/`secondTeam` fields remain

### Verification

```bash
npm test -- test/match-engine.test.js
```

---

## Final verification

Run after all phases:

```bash
npm test
node scripts/simulate-batch.js 3 --full
node scripts/simulate-batch.js 10 --full --match-timeout-ms 30000
node scripts/simulate-demo.js 900 critique-seed 1
node scripts/simulate-demo.js 0 full-seed 1 --full
```

Expected evidence:

```text
all tests pass
batch completed: 10/10
crashes: 0
timeouts: 0
same team save events: 0
self save events: 0
missing shot links: 0
stale shot links: 0
multi terminal shot events: 0
goal xG mismatch events: 0
completed pass rate >= 0.25
unresolved pass rate <= 0.5
multi holder frames: 0
realism passes: true
```

---

## Execution order

Do not reorder:

1. Shot lifecycle source of truth
2. Save/goal/blocked terminal correctness
3. Batch semantic invariants
4. Set-piece fallback `teamId`
5. Completed pass resolution
6. Batch timeout/progress guard
7. First-pass fast batch mode
8. Score API ergonomics

Reason: phases 1–3 fix correctness, phases 4–5 fix event quality, phases 6–7 fix operational confidence, phase 8 is API polish.

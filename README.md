# Football Engine MVP

This repository now contains a small FM-like 2D match simulation MVP built around the supplied `footballSimulationEngine` zip.

## What is implemented

- A vendored, runnable `footballSimulationEngine` core without direct `console.log` output from `playIteration()`.
- A deterministic match API with seeded RNG, match clock, frame export, and event/commentary extraction.
- A simple browser canvas viewer that renders pitch, players, ball, clock, and recent events from exported frames.
- Interpolated browser playback with configurable speed, continuity metadata, movement intents, and ball trajectory hints.
- A demo CLI that simulates a match and writes `tmp/demo-match.json` for the viewer.
- A streaming batch CLI that runs invariant and realism checks without retaining full frame histories.

## Commands

```bash
npm test
npm run simulate -- 900 smooth-demo 1
npm run simulate -- 0 full-demo 1 --full
npm run simulate:batch -- 20 --full
python3 -m http.server 8080
```

Then open `http://localhost:8080/public/` to view interpolated match playback. The third `simulate` argument controls `secondsPerTick`; use `1` for smoother output or `5` for the original quicker snapshot demo.

Use `--full` for a real two-half match with a half-time reset. Running `5400` ticks without `--full` is only one continuous `simulateMatch()` run, so the CLI warns when a long one-half run looks like a mistaken full-match command.

Use `--debug` only when you need tactical/debug payloads; normal output keeps public frames small. Batch runs use `collectFrames: false` with streaming invariant counters, so they do not write JSON, retain full frame histories, or include tactical/debug frame payloads.

Batch output prints stability, score/shot/event realism, save/conversion quality, carry-event balance, ownership, coordinate, timeline, multi-holder, and large-jump invariant checks. Generated viewer payloads and archive files are ignored by git via `tmp/` and `*.zip`; remove local review artifacts manually before packaging a portfolio build.

## Match engine API

```js
const {
  initMatch,
  stepMatch,
  simulateMatch,
  simulateFullMatch
} = require('./src/match-engine')
```

- `initMatch({ homeTeam, awayTeam, pitch, seed, secondsPerTick })` creates a deterministic match state.
- `stepMatch(state)` advances one tick and returns `{ state, frame, events }`.
- `simulateMatch(input, { ticks })` returns a one-half style targeted simulation.
- `simulateFullMatch(input)` returns a two-half match with `{ state, frames, events, finalStats, halves }`.
- Pass `{ collectFrames: false, includeState: false, onFrame }` for batch/stat runs that only need streamed invariant checks plus final events/stats.

`finalStats.score` exposes the kickoff-team and second-team goal shorthand for viewer/game UI code. The frontend should consume exported `frames`, not raw `matchDetails`, so the viewer can stay independent from the mutable core engine internals.

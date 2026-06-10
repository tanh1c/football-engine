# Football Engine MVP

This repository now contains a small FM-like 2D match simulation MVP built around the supplied `footballSimulationEngine` zip.

## What is implemented

- A vendored, runnable `footballSimulationEngine` core without direct `console.log` output from `playIteration()`.
- A deterministic match API with seeded RNG, match clock, frame export, and event/commentary extraction.
- A simple browser canvas viewer that renders pitch, players, ball, clock, and recent events from exported frames.
- A demo CLI that simulates a match and writes `tmp/demo-match.json` for the viewer.

## Commands

```bash
npm test
npm run simulate -- 120 demo-seed
python3 -m http.server 8080
```

Then open `http://localhost:8080/public/` to view the generated match frames.

## Match engine API

```js
const { initMatch, stepMatch, simulateMatch } = require('./src/match-engine')
```

- `initMatch({ homeTeam, awayTeam, pitch, seed, secondsPerTick })` creates a deterministic match state.
- `stepMatch(state)` advances one tick and returns `{ state, frame, events }`.
- `simulateMatch(input, { ticks })` returns `{ state, frames, events, finalStats }`.

The frontend should consume exported `frames`, not raw `matchDetails`, so the viewer can stay independent from the mutable core engine internals.

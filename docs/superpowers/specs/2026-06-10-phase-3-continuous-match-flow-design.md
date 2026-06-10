# Phase 3 Continuous Match Flow Design

**Goal:** Make the 2D match output feel like a continuous football match instead of disconnected event snapshots.

**Architecture:** Keep the vendored match engine as the authoritative simulation core, then add a thin continuity layer around exported frames. The engine will emit denser, richer match frames, while the browser viewer will interpolate between frames for smooth visual playback. Tactical metadata from Phase 2 remains the decision context and becomes the input for movement intent/debug overlays.

**Tech Stack:** Node.js CommonJS match engine, existing vendored `footballSimulationEngine`, browser canvas viewer using ES modules, Node test runner.

---

## Current problem

The current demo uses `secondsPerTick: 5`, so `npm run simulate -- 180 quick-demo` outputs about 15 in-game minutes with one frame every 5 match seconds. The viewer advances raw snapshots at a fixed 12 FPS. That means it visually jumps from one engine state to the next rather than showing the ball and players moving through the missing seconds.

Phase 2 made decisions less random by adding tactical context and recommendation-aware action weighting. It did not make movement continuous. The next layer should improve continuity without rewriting the vendored engine.

## Scope

Phase 3 will implement a full vertical slice of continuous match flow:

1. Configurable smooth simulation output.
2. Pure interpolation helpers for players, ball, and clock.
3. Viewer playback based on interpolated render frames instead of raw frame jumps.
4. Movement intent metadata derived from Phase 2 tactical analysis.
5. Ball trajectory metadata derived from consecutive frame positions.
6. Tests proving deterministic simulation and interpolation behavior.

Phase 3 will not attempt a complete Football Manager-level physics engine, collision system, tactical instruction editor, substitutions, injuries, or full AI rewrite. Those remain later phases.

## Components

### Simulation demo configuration

`scripts/simulate-demo.js` should accept optional tick duration input so smooth demos can be generated without editing code. The default can remain compatible, but the user should be able to run a denser demo such as one-second ticks.

Expected usage examples:

```bash
npm run simulate -- 900 smooth-demo 1
npm run simulate -- 5400 full-match-smooth 1
npm run simulate -- 180 quick-demo 5
```

The third CLI argument after seed represents `secondsPerTick`.

### Frame continuity metadata

`src/match-engine/frameAdapter.js` should keep exporting the current frame shape, then add continuity-friendly fields without breaking existing consumers:

```js
continuity: {
  secondsPerTick: 1,
  previousTick: 12,
  nextTick: 14
}
```

Player frame entries should include optional movement intent:

```js
movementIntent: {
  x: 42,
  y: 65,
  reason: 'press',
  urgency: 0.8
}
```

Ball frame entries should include optional trajectory metadata:

```js
trajectory: {
  from: { x: 40, y: 50, z: 0 },
  to: { x: 52, y: 60, z: 0 },
  reason: 'frame_delta'
}
```

### Movement intents

Add a focused tactical module that converts Phase 2 metadata into movement targets:

- Presser moves toward the ball carrier with reason `press`.
- Cover players move toward block-lane or support positions with reason `cover`.
- Players with formation targets move toward those targets with reason `recover_shape`.
- Possession teammates can use the best pass option/support context with reason `support`.

The first version should be deterministic and conservative. It should expose intent metadata; it should not yet override all vendor player movement.

### Ball trajectory

Add a small pure helper that compares consecutive frames and derives visual trajectory metadata. The viewer can interpolate ball position between current and next frame. If the next frame is missing, the ball is rendered at its current position.

This is visual continuity, not full ball physics. It should not change match results.

### Viewer interpolation

`src/viewer/render.js` should render interpolated frames. Instead of incrementing `frameIndex` and drawing only exact snapshots, playback should maintain:

```js
playhead: 0.0
speed: 1
renderFps: 60
```

At draw time:

1. Choose current base frame and next frame.
2. Compute interpolation ratio between `0` and `1`.
3. Interpolate player positions by player ID.
4. Interpolate ball position and height.
5. Interpolate clock display from frame timestamps.
6. Draw tactical/debug overlays when available.

The viewer should include controls for play, pause, previous, next, and playback speed. It should still load `tmp/demo-match.json`.

### Data flow

```text
simulateMatch()
  -> raw engine state per tick
  -> analyzeTactics()
  -> movement intents
  -> toMatchFrame()
  -> tmp/demo-match.json
  -> browser viewer
  -> interpolate frame N to frame N+1
  -> draw smooth 2D playback
```

Simulation determinism remains controlled by seeded RNG. Viewer interpolation must be pure and must not feed back into engine state.

## Error handling

If the viewer cannot find a next frame, it renders the current frame without interpolation. If a player exists in one frame but not the next, it uses the available position. If `tmp/demo-match.json` is missing, the existing console warning remains enough.

## Testing

Add tests for:

- CLI/demo helper behavior where a one-second tick produces expected frame clock progression.
- Interpolation between two frames for players, ball, and clock.
- Missing next-frame fallback.
- Movement intent generation for pressing and recover-shape cases.
- Determinism of smooth simulation output with the same seed.

Existing Phase 2 tests must continue passing.

## Success criteria

A user can run:

```bash
npm run simulate -- 900 smooth-demo 1
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/public/
```

The match should visually move more smoothly than the current five-second snapshot playback. The simulation should still be deterministic for the same seed and should still expose tactical metadata on frames.

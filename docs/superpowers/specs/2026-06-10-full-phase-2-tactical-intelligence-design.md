# Full Phase 2 Tactical Intelligence Design

## Goal

Complete Phase 2 by extending the current tactical metadata MVP into a fuller FM-like tactical layer: dynamic positioning, intercept/press/block assignments, and deeper action scoring.

## Context

The project already has a deterministic match wrapper around `vendor/footballSimulationEngine`, frame export, tactical phase classification, pressure analysis, pass option ranking, shot quality/xG, and a light action-selection bias.

This design keeps the existing vendor engine as the execution core while adding tactical intelligence modules under `src/match-engine/tactical/`. The zip repos remain references, not direct imports:

- `footballSimulationEngine-master.zip`: mutable match state and execution primitives.
- `Pyrus2D-master.zip`: formation, intercept, block, stamina, pass/shoot decision ideas.
- `openengine-master.zip`: phase, xG/xP, action-flow concepts.
- `football2d-main.zip`: viewer-facing frame compatibility only.

## Architecture

The match flow remains:

```text
vendor engine tick
  -> matchDetails
  -> tactical analysis layer
  -> frame/event metadata
  -> selective hooks into vendor action/movement
```

The tactical layer will expose a richer analysis object:

```js
{
  phase,
  possessionTeamId,
  pressure,
  passOptions,
  shotQuality,
  formationTargets,
  intercepts,
  pressing,
  actionRecommendations
}
```

New modules:

```text
src/match-engine/tactical/formation.js
src/match-engine/tactical/intercept.js
src/match-engine/tactical/pressing.js
src/match-engine/tactical/actionScoring.js
src/match-engine/tactical/stamina.js
```

Each module should be deterministic and mostly pure. Randomness stays in the existing seeded vendor execution path.

## Batch A — Tactical positioning

Add role-aware formation targets. Each active player receives a target position based on team side, role, ball position, and phase.

Output shape:

```js
formationTargets: [
  {
    playerId,
    teamId,
    role,
    x,
    y,
    reason
  }
]
```

Allowed `reason` values:

```text
hold_shape
support_ball
provide_width
attack_depth
protect_goal
```

Initial role behavior:

- `GK`: remains near own goal.
- `CB`: holds defensive depth and centrality.
- `LB/RB`: shifts toward ball side while preserving defensive width.
- `CM/LM/RM`: supports ball zone and connects thirds.
- `ST`: holds attacking depth.
- Wide midfielders/wingers: preserve width in possession.

Phase behavior:

- `build_up`: team shape stays deeper and wider.
- `midfield`: midfielders support near the ball lane.
- `final_third`: attacking roles push higher.
- `transition`: closest few players collapse toward ball; others hold shape.
- `set_piece`: keep current formation targets conservative for now.

Batch A should only annotate frames first. A movement hook can be added after tests show stable metadata: non-ball players bias run movement toward their formation target instead of only drifting toward ball/origin.

## Batch B — Intercept, press, and block

Add defensive assignment analysis.

Output shape:

```js
intercepts: [
  {
    playerId,
    teamId,
    reachTicks,
    target: { x, y },
    rank
  }
],
pressing: {
  presserId,
  coverIds,
  blockLanes: [
    {
      defenderId,
      fromPlayerId,
      toPlayerId,
      x,
      y
    }
  ]
}
```

Rules:

- `interceptEstimate` uses distance to ball, role speed, and stamina factor.
- Lower fitness increases `reachTicks`.
- `presserId` is the best opponent to pressure the ball carrier.
- `coverIds` are nearby defenders not selected as presser.
- `blockLanes` target the midpoint or weighted midpoint between the carrier and the best pass options.

Batch B should initially annotate frames. A movement hook can then bias:

- presser toward sprint/tackle movement,
- cover players toward block lane positions,
- non-assigned defenders toward formation targets.

## Batch C — Deeper action scoring

Replace the current tiny action bias with context-aware recommendations while preserving seeded RNG and vendor execution.

Output shape:

```js
actionRecommendations: [
  {
    playerId,
    action,
    score,
    targetPlayerId,
    reason
  }
]
```

Allowed actions:

```text
pass
throughBall
cross
shoot
run
sprint
cleared
boot
```

Scoring rules:

- `shoot`: favored by high xG, final-third phase, striker/attacker role, lower pressure.
- `pass`: favored by safe progressive pass options.
- `throughBall`: favored when an attacking receiver has forward space.
- `cross`: favored for wide players in final third.
- `run`/`sprint`: favored when space ahead is available and pressure is low.
- `cleared`/`boot`: favored in defensive third under high pressure.

Vendor hook strategy:

- Do not remove random selection.
- Convert recommendations into action point multipliers.
- Strong recommendations should noticeably bias `selectAction()`.
- Determinism must remain unchanged for the same seed.

## Data flow

`analyzeTactics(matchDetails)` becomes the single public tactical analysis entrypoint. It should call the modules in order:

```text
phase/pressure/passOptions/shotQuality
  -> formationTargets
  -> intercepts
  -> pressing
  -> actionRecommendations
```

Frame export keeps backward compatibility: existing consumers can ignore new optional fields.

## Testing strategy

Use TDD for every module.

Formation tests:

- winger/wide midfielder target preserves width.
- CB target remains deeper than CM/ST.
- final-third phase pushes attacking roles higher than build-up.

Intercept tests:

- closer player has lower `reachTicks`.
- lower fitness increases `reachTicks`.
- inactive/sent-off players are excluded.

Pressing tests:

- nearest valid opponent becomes presser.
- cover defenders exclude presser.
- block lane targets sit between carrier and best receiver.

Action scoring tests:

- high xG favors `shoot`.
- high pressure in defensive third favors `boot` or `cleared`.
- safe progressive pass favors `pass`.
- wide final-third player favors `cross`.

Integration tests:

- `simulateMatch()` frames include `formationTargets`, `intercepts`, `pressing`, and `actionRecommendations`.
- same seed remains deterministic.
- full `npm test` passes.
- `npm run simulate -- 20 tactical-demo` writes demo JSON successfully.

## Scope boundaries

This phase will not add substitutions, manager AI, morale, training effects, full tactic UI, a full 90-minute match controller, or a complete rewrite of the vendor engine.

The success criterion is a tactical layer that can explain and influence positioning, defensive assignments, and action choices enough that the simulation feels less like random events and more like contextual football behavior.

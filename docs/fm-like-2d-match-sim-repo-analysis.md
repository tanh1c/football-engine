# Phân tích 4 repo zip cho FM-like 2D match simulation

Đã inspect 4 zip trong project:

- `footballSimulationEngine-master.zip`
- `football2d-main.zip`
- `Pyrus2D-master.zip`
- `openengine-master.zip`

Kết luận thẳng: **có thể ghép thành FM-like 2D match sim**, nhưng **không nên ghép trực tiếp source 1:1**. Cách đúng là lấy **footballSimulationEngine làm core MVP**, viết lại **football2d thành renderer thật**, lấy **Pyrus2D làm reference cho AI movement/positioning**, còn **openengine chủ yếu lấy ý tưởng event/phase/xG**, không dùng làm live 2D core.

## Verdict nhanh

| Repo | Dùng được cho FM-like 2D không? | Vai trò nên dùng |
| --- | ---: | --- |
| `footballSimulationEngine` | **Có, dùng nhiều nhất** | Core tick engine, match state, ball/player movement, pass/shot/tackle/set piece/offside |
| `football2d` | **Có, nhưng phải rewrite 70–90%** | Canvas pitch renderer scaffold |
| `Pyrus2D` | **Có, nhưng chỉ port thuật toán/ý tưởng** | Positioning, intercept, pass/shoot candidate, stamina, pressing/blocking |
| `openengine` | **Partial** | Event/phase model, xG, match-flow abstraction, tactics concepts |

## 1. `footballSimulationEngine` — nên làm lõi MVP

Repo này đúng là gần nhất với thứ cần build. README public mô tả nó là module Node.js để simulate match theo **iteration**, gồm 3 hàm chính: initiate match, complete iteration/movement, switch side/start second half. Trong zip, các file quan trọng đã được inspect gồm `engine.js`, `lib/playerMovement.js`, `lib/ballMovement.js`, `lib/actions.js`, `lib/setPositions.js`.

Điểm mạnh nhất: nó đã có **state thật để render 2D**:

```ts
matchDetails = {
  pitchSize,
  ball: {
    position: [x, y, z],
    withPlayer,
    Player,
    withTeam,
    ballOverIterations,
    lastTouch
  },
  kickOffTeam: { players: [{ currentPOS, originPOS, intentPOS, hasBall, stats }] },
  secondTeam: { players: [...] },
  iterationLog,
  statistics
}
```

Nó đã có khá nhiều logic cần cho FM-like engine: closest player to ball, run/sprint, pass, through ball, cross, shot, tackle, slide, foul/card, injury, offside, corner, throw-in, goal kick, free kick, penalty, ball trajectory qua `ballOverIterations`, body part/deflection/z-axis. README v5 cũng ghi rõ nó đã tách player movement khỏi ball action, chỉ cho một player execute ball action mỗi iteration, và block ball action khi bóng đang bay.

Đã chạy thử `init_config/index.js` sau khi vào đúng folder `init_config`; engine chạy được và output ra JSON state sau từng iteration. Nghĩa là repo này **không chỉ là ý tưởng**, mà có thể chạy làm simulation backend.

Điểm yếu cần sửa trước khi dùng production/MVP:

- Không có clock chuẩn kiểu `minute/second/tick`, chỉ có iteration.
- Random dùng `Math.random()`, chưa có seed nên khó replay deterministic.
- `playIteration()` đang `console.log(JSON.stringify(matchDetails))` trực tiếp trong engine, nên phải bỏ để dùng làm library/API.
- Tactic còn đơn giản: `attack/defend`, `originPOS`, `intentPOS`, chưa có pressing line, tempo, width, mentality, role behavior.
- Attribute model còn thô: passing/shooting/tackling/saving/agility/strength/perception/jumping/control.
- Viewer chưa có; cần adapter chuyển `matchDetails` thành frame stream.

**Kết luận:** dùng `footballSimulationEngine` làm **base engine v0.1** là hợp lý nhất.

## 2. `football2d` — không phải engine hoàn chỉnh, chỉ là canvas scaffold

Repo public mô tả mục tiêu là tạo 2D match engine bằng HTML Canvas. Nhưng trong zip hiện tại, phần implementation còn rất sơ khai.

Các file đã inspect gồm `src/startMatch.ts`, `src/types.ts`, `src/draw/*`. Vấn đề lớn là:

```ts
export const startMatch = (
  fieldRenderer: FieldRenderer,
  _homeTeam: Team,
  _awayTeam: Team,
  options?: MatchOptions,
) => { ... }
```

`_homeTeam` và `_awayTeam` đang không được dùng. `drawBall.ts` chỉ có:

```ts
let x = 1;

export const drawBall = (canvasContext) => {
  x += Math.random();
  canvasContext.arc(x, 75, 4, 0, 2 * Math.PI);
};
```

Tức là hiện tại nó vẽ sân khá ổn, nhưng **chưa có player dots, team shape, ball state mapping, animation interpolation, event replay**.

**Kết luận:** không dùng nó như engine. Chỉ lấy:

- field drawing,
- canvas resize,
- pitch dimension scaling,
- package structure TypeScript.

Phần cần viết lại:

```text
drawPlayers()
drawBallFromState()
mapEngineCoordToCanvas()
interpolateFrame(prev, next, alpha)
renderEventOverlay()
renderCommentary()
timeline/replay controls
```

## 3. `openengine` — ý tưởng tốt, nhưng không hợp làm live 2D core

OpenEngine README public nói mục tiêu là open-source football match engine, pluggable vào host app, với nguyên tắc input từ players/tactics phải tạo output nhất quán, không “fake output”. Trong zip, repo này rất rộng: `vanilla`, `prototype`, `openfootie`, `mpn`, `pureengine`, `abstractmodel`, parser/data DSL.

Các phần đáng học:

- `org.openengine.openfootie.MatchEngine`: event-flow theo `MatchPhaseTransition`, duration, possession, goal attempt.
- `org.openengine.mpn.MatchEngine`: có xG, penalties, state transitions, possession switch.
- `org.openengine.prototype.engine.StateActionFrequencyMatrix`: action probability theo pitch zone.
- `org.openengine.vanilla.State`: pass/shoot evaluation dựa trên xP/xG/marking/geometry factor.
- `org.openengine.abstractmodel`: tactical positions/formations/heatmap.

Nhưng nó **không phù hợp để làm live 2D FM viewer trực tiếp**, vì đa phần là event/phase abstraction, không phải tick-by-tick player coordinate simulation. Không có `players[22].currentPOS` dạng render-ready như `footballSimulationEngine`.

**Kết luận:** lấy làm **event layer / analytics layer**, không lấy làm movement engine.

Ví dụ dùng tốt nhất:

```text
footballSimulationEngine tick → raw spatial events
openengine-style phase model → classify:
  build_up, attack, counter_attack, shot, foul, set_piece
xG model → resolve shot quality
commentary model → generate FM-like text
```

## 4. `Pyrus2D` — rất mạnh về AI, nhưng không nên nhúng nguyên repo

Pyrus2D public README nói đây là Python base code cho RoboCup Soccer Simulation 2D, nơi 11 players + 1 coach kết nối vào RoboCup Soccer Server. Paper Pyrus Base cũng mô tả SS2D là môi trường 2 đội 11 người và coach kết nối vào simulation server để thi đấu, thiên về research/multi-agent.

Trong zip, các file đáng học nhất:

- `base/decision.py`: decision tree chính.
- `base/bhv_kick.py`: nếu kickable thì shoot trước, không thì pass/dribble.
- `base/bhv_move.py`: tackle, intercept, block, move to formation target.
- `base/generator_pass.py`: direct pass, lead pass, through pass.
- `base/generator_shoot.py`: shoot candidate evaluation.
- `base/bhv_block.py`: tính block position.
- `base/stamina_manager.py`: dash power theo stamina/recovery/intercept context.
- `base/strategy_formation.py` + `formation_dt/*.conf`: dynamic formation theo ball position bằng Delaunay.

Pyrus2D không hợp để “import vào web game” vì nó phụ thuộc world model/server protocol của RoboCup: `wm`, `SP`, `intercept_table`, `PlayerObject`, `ServerParam`, UDP socket, trainer/coach/player agent. Nhưng thuật toán bên trong cực đáng port.

**Kết luận:** dùng Pyrus2D như **AI behavior reference**, port từng module nhỏ sang TS/Python của project.

## Kiến trúc ghép hợp lý nhất

Nên làm theo hướng này:

```text
                        ┌──────────────────────────┐
                        │   Manager Game Layer      │
                        │ players, teams, tactics   │
                        │ morale, fatigue, form     │
                        └────────────┬─────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────┐
│                  FM-like Match Engine Core                │
│                                                          │
│  Based on footballSimulationEngine concepts:             │
│  - MatchState                                             │
│  - playTick() / playIteration()                           │
│  - player movement                                        │
│  - ball trajectory                                        │
│  - pass/shot/tackle/set-piece/offside                     │
│                                                          │
│  Enhanced with Pyrus2D-inspired AI:                       │
│  - intercept table                                        │
│  - formation target by ball position                      │
│  - pass candidate scoring                                 │
│  - shoot candidate scoring                                │
│  - stamina-aware dash/press/block                         │
│                                                          │
│  Enhanced with openengine-inspired event model:           │
│  - phase transitions                                      │
│  - xG/xP/action probability                               │
│  - match flow/commentary                                  │
└────────────┬─────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────┐
│ Replay/Event Adapter      │
│ emits frames/events       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ 2D Canvas Viewer          │
│ rewritten from football2d │
└──────────────────────────┘
```

## Interface nên tự chuẩn hóa

Đừng để frontend đọc raw `matchDetails` của `footballSimulationEngine` trực tiếp. Nên có adapter:

```ts
type MatchFrame = {
  tick: number;
  minute: number;
  second: number;
  ball: {
    x: number;
    y: number;
    z?: number;
    ownerPlayerId?: string;
    velocity?: { x: number; y: number };
  };
  players: Array<{
    id: string;
    teamId: string;
    name: string;
    shirtNo?: number;
    role: string;
    x: number;
    y: number;
    hasBall: boolean;
    stamina: number;
    status?: 'normal' | 'injured' | 'sent_off';
  }>;
  events: MatchEvent[];
};
```

Event format:

```ts
type MatchEvent =
  | { type: 'pass'; from: string; to?: string; outcome: 'success' | 'failed' }
  | { type: 'shot'; playerId: string; xg: number; outcome: 'goal' | 'saved' | 'off_target' }
  | { type: 'tackle'; playerId: string; targetId: string; outcome: 'won' | 'foul' }
  | { type: 'set_piece'; kind: 'corner' | 'throw_in' | 'free_kick' | 'penalty' }
  | { type: 'goal'; scorerId: string; assistId?: string };
```

## Ghép trực tiếp được không?

**Không nên.** Vì 4 repo khác language/model:

| Repo | Language | Model | Direct merge? |
| --- | --- | --- | --- |
| `footballSimulationEngine` | JS | mutable JSON state | Có thể dùng trực tiếp backend Node |
| `football2d` | TS/browser | render-only, minimal | Rewrite để consume frames |
| `openengine` | Java | event/phase/data-driven | Không nên nhúng trực tiếp |
| `Pyrus2D` | Python | RoboCup agent/server world model | Không nên nhúng trực tiếp |

Cách practical nhất:

```text
MVP 1:
footballSimulationEngine fork
+ clean API
+ deterministic seed
+ frame exporter
+ football2d rewritten viewer

MVP 2:
Pyrus-inspired positioning/intercept/pass/shoot scoring

MVP 3:
openengine-inspired xG/event phase/commentary model
```

## Roadmap cụ thể

### Phase 1 — playable FM-like 2D MVP

Dựa trên `footballSimulationEngine`:

- Bỏ `console.log` trong `engine.js`.
- Thêm `matchClock`: `tick`, `minute`, `second`.
- Thêm seeded RNG thay `Math.random`.
- Thêm `FrameRecorder`.
- Tạo adapter `toMatchFrame(matchDetails)`.
- Tạo API:

```ts
initMatch(input): MatchState
stepMatch(state): { state, frame, events }
simulateMatch(input): { frames, events, finalStats }
```

Viewer:

- Fork `football2d`.
- Giữ `drawField`.
- Thêm `drawPlayers`, `drawBall`, `drawTeamShape`.
- Dùng interpolation giữa frame N và N+1.
- Thêm commentary panel từ `iterationLog`.

### Phase 2 — làm cho “giống FM” hơn

Port ý tưởng từ Pyrus2D:

- `interceptTable`: self/teammate/opponent reach cycle.
- `formationTarget(ballPosition, tactic, phase)`.
- `passCandidateGenerator`: direct/lead/through pass.
- `shootCandidateGenerator`.
- `staminaDashPower`.
- `press/block behavior`.

Phần này sẽ nâng engine từ “cầu thủ chạy về bóng + random action” lên “có tactical intelligence”.

### Phase 3 — match realism layer

Port ý tưởng từ openengine:

- `MatchPhase`: build-up, attack, counter, final-third, set-piece.
- `xG` cho shot.
- `xP` cho pass.
- `action outcome matrix`.
- Event commentary kiểu FM:

```text
12:34 - Team A build from the back
12:41 - CM plays a through ball
12:45 - ST is one-on-one
12:47 - Shot saved by GK
```

## Đánh giá cuối cùng

**Có thể build được FM-like 2D match sim từ 4 repo này**, nhưng blueprint tốt nhất là:

```text
Core engine:
  footballSimulationEngine, fork + refactor mạnh

2D viewer:
  football2d, giữ field renderer, viết lại phần entities/render loop

Advanced AI:
  Pyrus2D, port ý tưởng chứ không import source

Event realism/commentary:
  openengine, lấy phase/xG/action-flow concept
```

Mức độ reuse thực tế đánh giá:

| Repo | Reuse code trực tiếp | Reuse ý tưởng |
| --- | ---: | ---: |
| `footballSimulationEngine` | 60–75% | 85% |
| `football2d` | 15–25% | 60% |
| `Pyrus2D` | 5–15% | 80% |
| `openengine` | 5–10% | 70% |

Vậy hướng đúng nhất cho project là **không tìm thêm engine khác nữa**, mà fork `footballSimulationEngine` làm nền, rồi thiết kế lại thành **deterministic event-frame engine** để feed vào 2D viewer. Đây là con đường nhanh nhất để ra một bản giống FM 2D có thể demo portfolio.

## Nguồn tham khảo public

- [GitHub - GallagherAiden/footballSimulationEngine](https://github.com/GallagherAiden/footballSimulationEngine)
- [GitHub - cyntler/football2d](https://github.com/cyntler/football2d)
- [GitHub - atas76/openengine](https://github.com/atas76/openengine)
- [GitHub - Cyrus2D/Pyrus2D](https://github.com/Cyrus2D/Pyrus2D)
- [Pyrus Base: An Open Source Python Framework for the RoboCup 2D Soccer Simulation](https://arxiv.org/abs/2307.16875)

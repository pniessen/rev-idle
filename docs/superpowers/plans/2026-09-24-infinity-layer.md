# Infinity Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Each task is dispatched to a fresh subagent with the model named in its **Model:** line, followed by a review before the next task starts. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full Infinity layer to Rev Idle, i.e. Phases A, B and C of the spec:
- IP and the Infinity count.
- The trimmed-faithful Infinity Upgrade tree (38 nodes).
- 10 Generators and Generator Power.
- Automation (autobuy, auto-ascend, auto-promote, auto-prestige, auto-infinity).
- 9 Infinity Challenges.
- Break Infinity.
- Stars and Stardust.
- Offline progress that runs all of the above.
- A v1→v2 save migration.
- Pacing tuned to the spec's mostly-idle, 1–2-week targets.

**Architecture:**
- The pure engine is split into three files that attach to one `Engine` object:
  - `src/engine.js`: core Revolution logic, the v2 state, migration, and hook points.
  - `src/engine-infinity.js`: IP, the tree, generators, challenges, Break, Stars, and the `mods` implementation.
  - `src/engine-auto.js`: automation and the adaptive step size.
- Revolution formulas read every Infinity-layer modifier through a single `mods(s)` call. With default mods the results are bit-identical to the shipped game.
- UI: the new ∞ tab lives in `src/ui-infinity.js`. `src/ui.js` renders it through a small `kit` of helpers. Tooltips and unlock toasts go in `src/help.js`.
- `build.mjs` inlines everything into `index.html` and `dist/artifact.html`.

**Tech Stack:**
- Vanilla ES2017 browser JS in IIFEs.
- Node ≥ 18 for tests (`node:test`, `npm test`) and for the pacing sim (`node test/sim.js`).
- No dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-infinity-layer-design.md`. Section numbers (§) below refer to it. The Revolution-stage spec it extends is `docs/superpowers/specs/2026-09-23-rev-idle-design.md`.

## Global Constraints

- All big numbers (score, mults, costs, IP, GP, generator amounts, Stardust) are stored and computed as **log10** plain JS numbers. `-Infinity` means zero. Use `logAdd` and `logSub`, never `10 **` on unbounded values.
- **The engine is pure.** `src/engine*.js` never touch the DOM, `window` (except the final `window.Engine` assignment and IIFE argument), timers or `localStorage`. Everything is exported through the single `Engine` object and is also loadable in Node via `require('./src/engine.js')`.
- **No dependencies.** No npm packages, no bundler, no CDN scripts beyond the existing Google Fonts link.
- **`node build.mjs`** outputs `index.html` (standalone, for GitHub Pages) and the `dist/artifact.html` fragment. **Always rebuild and commit the generated outputs** (`index.html`, `dist/artifact.html`, `.nojekyll`) in the same commit as any `src/` change.
- **One dark look.** Reuse the existing CSS tokens (`--ink`, `--panel`, `--panel-2`, `--line`, `--text`, `--muted`, `--accent`, `--warn`) and fonts (`--font-display` Unbounded, `--font-body` IBM Plex Sans, `--font-mono` JetBrains Mono). Add no new palette or font.
- **Every screen works at 400 px wide** (and 375 px): no horizontal page scroll, touch targets ≥ 40 px tall.
- **No `alert`, `confirm` or `prompt`.** Destructive actions use the existing `twoStepConfirm`, and feedback uses `toast`.
- **`localStorage`** reads and writes are always wrapped in try/catch, and the game must run without storage.
- **No `innerHTML` with dynamic data.** Build nodes with the existing `el()` helper and text nodes. `innerHTML = ''` to clear a container is allowed.
- **Save back-compat:** every v1 save loads (v1→v2 migration via `Engine.migrate`), `SAVE_KEY` stays `'revidle.save.v1'`, and a v2 save missing newer nested fields loads with defaults.
- Revolution-stage mechanics stay unchanged unless an Infinity feature modifies them explicitly through `mods(s)` (spec §3).
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File structure

| Path | Action | Responsibility | Approx. size after |
|---|---|---|---|
| `src/engine.js` | modify | Core Revolution logic, `DEFAULT_MODS`, `registerHooks`, v2 `newState`, `migrate`, `serialize`/`deserialize`, `tick` (with hook calls), `simulate`, `fmtLog`; Node loader for the two extension files | ~560 lines |
| `src/engine-infinity.js` | create | `mods` implementation; IP and ∞; `goInfinite` and `resetForChallenge`; upgrade table and effects; generators; challenges; Break; Stars and Stardust | ~700 lines |
| `src/engine-auto.js` | create | `autoStep`, the stall tracker, `autoUnlocked`, `anyAutoOn`, `adaptiveDt` | ~220 lines |
| `src/ui-infinity.js` | create | The ∞ tab: header and sub-tabs Tree, Gens, Auto, ICs, Stars | ~650 lines |
| `src/ui.js` | modify | Registers the ∞ tab; Infinity modal and flow; Prestige-tab Break button and IP bar; Stats; Settings toggle; offline modal lines; chips; canvas IC banner; finale | +~200 lines |
| `src/help.js` | modify | New `TIPS` entries; unlock toasts; exports `TIPS` for tests | +~150 lines |
| `src/styles.css` | modify | Styles for the ∞ tab (cards, grids, sub-tab row, IP bar) using existing tokens | +~150 lines |
| `src/template.html` | modify | Adds the `/*@ENGINE_INF*/`, `/*@ENGINE_AUTO*/` and `/*@UI_INF*/` script markers | — |
| `build.mjs` | modify | Inlines the three new files at those markers | — |
| `test/engine.test.js` | modify | Updates the legacy `infinity` test to v2 | — |
| `test/infinity.test.js` | create | All new engine tests (Tasks 2–10), plus the tooltip-key test (Task 15) | ~700 lines |
| `test/sim.js` | modify | `MODE=first` (existing) and `MODE=layer` (idle profile, check-ins, macro-steps, snapshots, CHECK) | ~600 lines |
| `.gitignore` | create | `.sim/` | — |
| `README.md` | modify | Infinity layer summary and new sim modes | — |
| `index.html`, `dist/artifact.html`, `.nojekyll` | regenerate | Build outputs | — |

**Why split the engine:** `engine.js` is 373 lines today, and the Infinity layer adds about 900 more. A single file of about 1,300 lines would pass the ~800-line limit and mix three concerns. The split keeps each file focused and small enough for one subagent to hold in context. Load order in the browser is `engine.js` → `engine-infinity.js` → `engine-auto.js` (template markers). In Node, `engine.js` sets `module.exports` and then requires the other two, so `require('./src/engine.js')` always returns the complete engine.

## Shared API contract

Every task relies on these names, signatures and this state shape exactly.

```js
// ===== State v2 (Engine.newState()) =====
{
  v: 2,
  scoreLog: -Infinity,
  circles: [ /* 10 × { unlocked, level, bought, ascensions, multLog, multGainLog, progress, laps } (unchanged) */ ],
  pMult: 1, pExp: 1, prestigeReqLog: 10,
  promo: [0, 0, 0, 0],
  infinities: 0,                                   // plain number (∞ count)
  stats: { totalLaps: 0, prestiges: 0, promotions: 0, playTime: 0, bestScoreLog: -Infinity,
           fastestInfinity: null, lastInfinities: [], totalIpLog: -Infinity },   // lastInfinities: [{ t, ipGainLog }] ≤ 10
  savedAt: 0,
  inf: {
    ipLog: -Infinity,
    upg: {},                                       // { '1;1': true, ... }
    gens: [ /* 10 × */ { b: 0, aLog: -Infinity } ],
    gpLog: -Infinity,
    t: 0, tRun: 0,
    broken: false, pendingConfirm: false, finaleSeen: false,
    ic: { active: 0, done: [false × 9], best: [null × 9] },
    stars: { n: 0, nb: 0, ne: 0, sdLog: -Infinity, sdU: [0, 0, 0, 0] },
    auto: {
      buy:      { on: true, circles: [true × 10] },
      asc:      { on: true, circles: [true × 10] },
      promote:  { on: true, order: [0, 1, 2, 3], xFactor: 2, minTime: 1 },
      prestige: { on: true, multX: 10, expGain: 0, minTime: 0.2 },
      infinity: { on: false, minIpLog: 0, minTime: 0 },
      stallSec: 30,
      confirmInfinity: false,
    },
    rt: { markLog: -Infinity, markT: 0 },
  },
}
// v1 differences: v: 1, has `ip` (plain number), no `inf`, stats lack the three new fields.

// ===== src/engine.js (core) =====
Engine.CIRCLES, Engine.INFINITY_LOG, Engine.TUNE           // TUNE gains Infinity keys from engine-infinity.js / engine-auto.js
Engine.DEFAULT_MODS  // frozen: { lapMult:1, gainLog:0, expAdd:0, prodLog:0, ascBase:10, ascMult:1, v:[1,1,1,1],
                     //          pMultMult:1, pExpMult:1, gainPow:1, disabledPromo:[], maxCircles:10, noAscend:false, decay:0 }
Engine.registerHooks(h)        // h ⊆ { mods, preTick, auto, postTick, stepDt }; own keys overwrite (null clears)
Engine._hooks                  // the live hooks object (tests save/restore)
Engine.mods(s) -> mods         // hooks.mods ? hooks.mods(s) : DEFAULT_MODS
Engine.isFixed(s) -> bool      // !(s.inf.broken && s.inf.ic.active === 0)
Engine.newState() -> state     // v2
Engine.migrate(obj) -> state   // parsed v1|v2 object → v2 state; throws Error('Invalid save')
Engine.serialize(s) -> string; Engine.deserialize(str) -> state   // deserialize = migrate(parse)
Engine.tick(s, dt) -> { laps } // order: m=mods(s); t,tRun += dt; preTick(s,dt,m); laps & mults (with m); decay; score;
                               //        cap if isFixed; stats; auto(s,dt); postTick(s,dt)
Engine.simulate(s, seconds, opts?) -> { scoreLogBefore, scoreLogAfter, ipGainedLog, infinitiesGained, icCompleted }
                               // steps of hooks.stepDt ? hooks.stepDt(s, opts||{}) : 1
Engine.multGainPerLapLog(s, i) -> log
// unchanged names, now mods-aware: lapsPerSec, perRevLog, incomeLog, levelCap, costLog, buy, canAscend, ascend,
// pendingPrestige, canPrestige, prestige, promoXp, canPromote, promote, canInfinity, promoEffects, fmtLog, logAdd, logSub
// prestige() and promote() also set s.inf.tRun = 0 and s.inf.rt = { markLog: -Infinity, markT: 0 }.

// ===== src/engine-infinity.js =====
Engine.goInfinite(s) -> bool   // replaces the core version (spec §2.4)
Engine.resetForChallenge(s)
Engine.icDoneCount(s), Engine.ipGainLog(s), Engine.infGain(s), Engine.breakBonusLog(s)
Engine.UPGRADES                // [{ id, col, row, name, cost, phase: 'A'|'B'|'C', req: 'prev' | string[], desc }]
Engine.upgById(id), Engine.hasUpg(s, id), Engine.upgReqMet(s, id), Engine.canBuyUpgrade(s, id), Engine.buyUpgrade(s, id)
Engine.upgEffect(s, id) -> number | null           // current multiplier/value for display; null for unlock-only nodes
Engine.GEN_COUNT = 10
Engine.genCostLog(s, k), Engine.canBuyGen(s, k), Engine.buyGen(s, k), Engine.genMultLog(s, k)   // k 0-based
Engine.genSoftcap(L), Engine.gpExp(s), Engine.gpMultLog(s)
Engine.ctf(s), Engine.passiveInfRate(s)
Engine.CHALLENGES              // [{ n, name, handicap, reward }] (display strings, n = 1..9)
Engine.canStartChallenge(s, n), Engine.startChallenge(s, n), Engine.exitChallenge(s)
Engine.canBreak(s), Engine.setBroken(s, on) -> bool
Engine.starCostLog(s), Engine.canBuyStar(s), Engine.buyStar(s)
Engine.starBaseCostLog(s), Engine.buyStarBase(s), Engine.starExpCostLog(s), Engine.buyStarExp(s)
Engine.sdRateLog(s), Engine.starGpLog(s), Engine.sdU4Mult(s)
Engine.SD_UPGRADES             // [{ j, name, max, desc }] j 0-based
Engine.sdUpgCostLog(s, j), Engine.canBuySdUpg(s, j), Engine.buySdUpg(s, j)

// ===== src/engine-auto.js =====
Engine.autoUnlocked(s) -> { buy, asc, promote, prestige, infinity }
Engine.anyAutoOn(s) -> bool    // any unlocked automation whose master toggle is on
Engine.updateStall(s), Engine.isStalled(s)
Engine.autoStep(s, dt) -> { actions: string[] }   // order: stall update, ascend, buy, promote, prestige, infinity
Engine.adaptiveDt(s, opts?) -> seconds

// ===== UI contracts =====
window.InfinityUI = { render(container, state, kit), update(container, state, kit) }   // src/ui-infinity.js
// kit (built in ui.js): { el, fmt, toast, twoStepConfirm, statLine, markDirty, save }
window.Help.TIPS               // exported by help.js (for the tooltip-key test)
// data-tip-i indices: iuCard = index into Engine.UPGRADES; genRow/genBuy = k (0-based); sdUpg = j (0-based); icCard/icStart = n (1-based)
```

---

## Browser fixture helper (used by Tasks 11, 12, 15)

Load a save without racing autosave: paste this into the browser console once per page load, then call `loadFixture(state)` or `loadSave(string)`. It goes through the in-game Settings → Import → Load path.

```js
function loadSave(str) {
  location.hash = '#settings';
  setTimeout(function () {
    var ta = document.querySelectorAll('.save-area')[1];
    ta.value = str;
    Array.prototype.find.call(document.querySelectorAll('button'), function (b) { return b.textContent === 'Load'; }).click();
  }, 300);
}
function loadFixture(s) { loadSave(Engine.serialize(s)); }
```

The dev server for browser checks is `python3 -m http.server 8765`, run in the background from the worktree root. Open `http://localhost:8765/index.html` in the browser pane at 400×860, and stop the server when done.

---

## Task 1: Rebase onto main and split-file scaffolding

**Model:** sonnet · **Depends on:** — 

**Files:**
- Modify: `src/engine.js` (Node loader tail), `src/template.html`, `build.mjs`
- Create: `src/engine-infinity.js`, `src/engine-auto.js`, `src/ui-infinity.js`, `.gitignore`
- Test: existing `npm test`

**Interfaces:**
- Consumes: main's help system (`src/help.js`, `/*@HELP*/` marker).
- Produces: the load chain and markers that every later task uses.

- [ ] **Step 1: Rebase.** In `/Users/pniessen/CLAUDE-CODE/projects/rev-idle/.worktrees/infinity`, run `git status` and confirm the tree is clean. Then run `git rebase main`.
  - Expected: the rebase succeeds, because feat/infinity only adds files under `docs/`.
  - If a conflict appears, keep both sides' content and `git rebase --continue`. Never work in the main checkout.
  - Then confirm `src/help.js` exists and `grep -n "@HELP" src/template.html build.mjs` shows the marker in both files.
- [ ] **Step 2: Baseline.** Run `npm test`. Expected: all tests pass.
- [ ] **Step 3: Create `src/engine-infinity.js`:**
  ```js
  // src/engine-infinity.js — Infinity layer mechanics (IP, tree, generators,
  // challenges, Break Infinity, Stars). Pure; attaches to the shared Engine.
  (function (E) {
    'use strict';
    const LOG2 = Math.log10(2);
    E._inf = { LOG2 }; // internal scratch shared by later sections of this file
  })(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);
  ```
- [ ] **Step 4: Create `src/engine-auto.js`** with the same wrapper and header comment `// src/engine-auto.js — automation (autobuy, auto-ascend, auto-promote, auto-prestige, auto-infinity) and adaptive step size. Pure.` The body is `'use strict';` only.
- [ ] **Step 5: Create `src/ui-infinity.js`:**
  ```js
  // src/ui-infinity.js — the ∞ tab (Tree, Gens, Auto, ICs, Stars). DOM only via kit.el.
  (function () {
    'use strict';
    window.InfinityUI = {
      render: function (container, state, kit) {},
      update: function (container, state, kit) {},
    };
  })();
  ```
- [ ] **Step 6: Update the `src/engine.js` tail.** Replace the last line with the following. The circular `require` is safe because `module.exports` is assigned first.
  ```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
    require('./engine-infinity.js');
    require('./engine-auto.js');
  } else {
    window.Engine = Engine;
  }
  ```
- [ ] **Step 7: Template.** In `src/template.html`:
  - Directly after `<script>/*@ENGINE*/</script>`, add `<script>/*@ENGINE_INF*/</script>` and `<script>/*@ENGINE_AUTO*/</script>`.
  - Directly before `<script>/*@UI*/</script>`, add `<script>/*@UI_INF*/</script>`.
- [ ] **Step 8: Build.** In `build.mjs`:
  - Read `src/engine-infinity.js`, `src/engine-auto.js` and `src/ui-infinity.js`.
  - Add the markers `['/*@ENGINE_INF*/', engineInf]`, `['/*@ENGINE_AUTO*/', engineAuto]` and `['/*@UI_INF*/', uiInf]` to the `markers` array. Engine markers go after `/*@ENGINE*/`, and UI_INF goes before `/*@UI*/`.
- [ ] **Step 9: Create `.gitignore`** containing `.sim/`.
- [ ] **Step 10: Verify.**
  - `npm test` passes.
  - `node -e "const E=require('./src/engine.js'); console.log(typeof E.tick, typeof E._inf)"` prints `function object`.
  - `node build.mjs` succeeds, and `grep -c "InfinityUI" index.html dist/artifact.html` prints `1` for each.
- [ ] **Step 11: Commit.** `git add -A && git commit -m "chore: split engine/ui scaffolding for Infinity layer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 2: State v2, migration, fmtLog separators

**Model:** sonnet · **Depends on:** 1

**Files:**
- Modify: `src/engine.js`, `test/engine.test.js`
- Create: `test/infinity.test.js`

**Interfaces:**
- Produces: `newState` (v2), `migrate`, `deserialize` (accepts v1 and v2), and a `fmtLog` that groups exponents ≥ 1000.
- Keeps the legacy `goInfinite` working on v2: it adds 1 IP to `inf.ipLog` and preserves `inf`.

- [ ] **Step 1: Write the failing tests.** Create `test/infinity.test.js`:
  ```js
  'use strict';
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const E = require('../src/engine.js');
  const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);
  const b64 = (o) => Buffer.from(JSON.stringify(o, (k, v) => (v === -Infinity ? '-inf' : v))).toString('base64');
  function v1Save(extra) {
    const s = E.newState();
    return Object.assign({
      v: 1, scoreLog: -Infinity, circles: s.circles, pMult: 1, pExp: 1, prestigeReqLog: 10, promo: [0, 0, 0, 0],
      ip: 0, infinities: 0, stats: { totalLaps: 5, prestiges: 2, promotions: 1, playTime: 100, bestScoreLog: 12 }, savedAt: 123,
    }, extra);
  }

  test('newState is v2 with Infinity defaults', () => {
    const s = E.newState();
    assert.equal(s.v, 2); assert.ok(!('ip' in s));
    assert.equal(s.inf.ipLog, -Infinity);
    assert.equal(s.inf.gens.length, 10);
    assert.deepEqual(s.inf.gens[0], { b: 0, aLog: -Infinity });
    assert.deepEqual(s.inf.ic, { active: 0, done: Array(9).fill(false), best: Array(9).fill(null) });
    assert.deepEqual(s.inf.stars, { n: 0, nb: 0, ne: 0, sdLog: -Infinity, sdU: [0, 0, 0, 0] });
    assert.deepEqual(s.inf.auto.prestige, { on: true, multX: 10, expGain: 0, minTime: 0.2 });
    assert.deepEqual(s.inf.auto.promote, { on: true, order: [0, 1, 2, 3], xFactor: 2, minTime: 1 });
    assert.equal(s.inf.auto.confirmInfinity, false);
    assert.equal(s.stats.fastestInfinity, null);
    assert.deepEqual(s.stats.lastInfinities, []);
  });

  test('v1 save with ip 1 migrates to ipLog 0 and keeps v1 fields', () => {
    const s = E.deserialize(b64(v1Save({ ip: 1, infinities: 1 })));
    assert.equal(s.v, 2); assert.equal(s.inf.ipLog, 0); assert.ok(!('ip' in s));
    assert.equal(s.infinities, 1); assert.equal(s.stats.prestiges, 2); assert.equal(s.savedAt, 123);
    assert.equal(s.inf.auto.promote.xFactor, 2); assert.equal(s.stats.totalIpLog, -Infinity);
  });

  test('v1 save with ip 0 migrates to ipLog -Infinity', () => {
    assert.equal(E.deserialize(b64(v1Save({}))).inf.ipLog, -Infinity);
  });

  test('v2 save missing nested fields gets defaults; unknown keys dropped', () => {
    const s = E.newState();
    s.inf.ipLog = 3; delete s.inf.stars; s.inf.auto.promote = { on: false }; s.inf.upg = { '1;1': true }; s.junk = 7;
    const t = E.deserialize(b64(s));
    assert.equal(t.inf.ipLog, 3); assert.equal(t.inf.auto.promote.on, false); assert.equal(t.inf.auto.promote.xFactor, 2);
    assert.deepEqual(t.inf.stars.sdU, [0, 0, 0, 0]); assert.deepEqual(t.inf.upg, { '1;1': true }); assert.ok(!('junk' in t));
  });

  test('v2 round trip is lossless', () => {
    const s = E.newState(); s.inf.gpLog = 5.5; s.inf.ic.best[2] = 321; s.stats.lastInfinities.push({ t: 60, ipGainLog: 0 });
    assert.deepEqual(E.deserialize(E.serialize(s)), s);
  });

  test('invalid saves are rejected', () => {
    assert.throws(() => E.deserialize(b64({ v: 3, circles: [] })), /Invalid save/);
    assert.throws(() => E.deserialize(b64(v1Save({ circles: [] }))), /Invalid save/);
    assert.throws(() => E.deserialize('garbage'), /Invalid save/);
  });

  test('fmtLog groups large exponents', () => {
    assert.equal(E.fmtLog(3080), '1.00e3,080');
    assert.equal(E.fmtLog(308.25), '1.78e308');
    assert.equal(E.fmtLog(12345.5), '3.16e12,345');
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL (`s.v` is 1; `ip` exists).
- [ ] **Step 3: Implement in `src/engine.js`:**
  - `newState()` returns exactly the v2 shape in the Shared API: remove `ip`, add `inf` and the three new `stats` fields.
  - Add `mergeDefaults(def, obj)`:
    - **Arrays:** if `obj` is not an array, return `def`. If `def.length === 0`, return `obj.slice()`. Otherwise return `def.map((d, i) => i < obj.length ? mergeDefaults(d, obj[i]) : d)`.
    - **Plain objects:** if `obj` is not a non-array object, return `def`. If `def` has no keys, return `Object.assign({}, obj)` (open maps such as `inf.upg`). Otherwise build a new object over `def`'s keys only, recursing for keys present in `obj`.
    - **Primitives:** return `obj === undefined ? def : obj`.
  - Add `migrate(obj)`:
    - Throw `new Error('Invalid save')` unless `obj` is an object with `v === 1 || v === 2`, `Array.isArray(obj.circles)` and `obj.circles.length === 10`.
    - If `v === 1`, set `obj.inf = Object.assign({}, obj.inf, { ipLog: obj.ip > 0 ? Math.log10(obj.ip) : -Infinity })`.
    - Return `Object.assign(mergeDefaults(newState(), obj), { v: 2 })`. `ip` disappears because `newState()` has no `ip` key.
  - `deserialize`: parse as today, then `return migrate(obj)`. Keep the outer try/catch that rethrows `Error('Invalid save')`.
  - `fmtLog`: in the ≥ 1e6 branch, format the exponent as `exp >= 1000 ? exp.toLocaleString('en-US') : String(exp)`.
  - Legacy `goInfinite`, kept until Task 4: save `const inf = s.inf`, `Object.assign(s, newState())`, restore `stats` and `infinities + 1`, then set `s.inf = inf` and `s.inf.ipLog = logAdd(inf.ipLog, 0)`.
- [ ] **Step 4: Update `test/engine.test.js`.** In the `infinity` test, replace `assert.equal(s.ip, 1);` with `assert.equal(s.inf.ipLog, 0);`.
- [ ] **Step 5: Run** `npm test`. Expected: all tests PASS.
- [ ] **Step 6: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(engine): v2 state, v1->v2 migration, grouped exponents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 3: Core hooks and the `mods` choke point

**Model:** sonnet · **Depends on:** 2

**Files:**
- Modify: `src/engine.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `DEFAULT_MODS`, `registerHooks`, `_hooks`, `mods`, `isFixed`, `multGainPerLapLog`, the mods-aware Revolution functions, the `tick` hook order and score cap, the `inf.t`/`inf.tRun` timers, and the `tRun`/`rt` resets in `prestige` and `promote`.

- [ ] **Step 1: Write the failing tests.** Append to `test/infinity.test.js`:
  ```js
  function withMods(over, fn) {
    const saved = E._hooks.mods;
    E.registerHooks({ mods: () => Object.assign({}, E.DEFAULT_MODS, over) });
    try { fn(); } finally { E.registerHooks({ mods: saved }); }
  }

  test('fresh state mods equal DEFAULT_MODS', () => {
    assert.deepEqual(E.mods(E.newState()), E.DEFAULT_MODS);
    assert.ok(Object.isFrozen(E.DEFAULT_MODS));
  });

  test('default mods keep shipped promotion formulas', () => {
    const s = E.newState(); s.promo = [4, 9, 16, 25];
    const p = E.promoEffects(s);
    const p4 = 1 + 0.05 * Math.pow(25, 0.48);
    close(p.p4, p4);
    close(p.p1, p4 * (Math.floor(Math.pow(4, 1.5)) + 1));
    close(p.p2, p4 * (1 + Math.sqrt(9)));
    close(p.p3, p4 * (10 + Math.pow(16, 0.82)));
  });

  test('mods.lapMult scales lapsPerSec', () => {
    const s = E.newState(); const base = E.lapsPerSec(s, 0);
    withMods({ lapMult: 2 }, () => close(E.lapsPerSec(s, 0), 2 * base));
  });

  test('mods.expAdd and prodLog enter perRevLog', () => {
    const s = E.newState(); s.circles[0].multLog = 2; s.pMult = 10; s.pExp = 1.5;
    withMods({ expAdd: 0.5, prodLog: 1 }, () => close(E.perRevLog(s), 2.0 * (2 + 1 + 1)));
    withMods({ expAdd: -5 }, () => close(E.perRevLog(s), 0.1 * (2 + 1)));
  });

  test('mods.gainLog enters multGainPerLapLog', () => {
    const s = E.newState(); const base = E.multGainPerLapLog(s, 0);
    close(base, E.TUNE.multGainLog0);
    withMods({ gainLog: 3 }, () => close(E.multGainPerLapLog(s, 0), base + 3));
  });

  test('pMultMult, pExpMult, gainPow enter pendingPrestige and promoXp', () => {
    const s = E.newState(); s.scoreLog = 20;
    const raw = E.pendingPrestige(s);
    withMods({ pMultMult: 2, pExpMult: 3, gainPow: 0.5 }, () => {
      const g = E.pendingPrestige(s);
      close(g.pMult, Math.pow(raw.pMult * 2, 0.5));
      close(g.pExp, 1 + (raw.pExp - 1) * 3 * 0.5);
    });
    s.scoreLog = -Infinity; s.pMult = 16 * E.TUNE.promoMin;
    withMods({ gainPow: 0.4 }, () => assert.equal(E.promoXp(s), Math.floor(Math.pow(Math.pow(16, E.TUNE.promoPow), 0.4))));
  });

  test('disabled promotions read as level 0 and cannot be chosen', () => {
    const s = E.newState(); s.promo = [4, 9, 16, 25]; s.pMult = 1e9;
    withMods({ disabledPromo: [1, 3] }, () => {
      const p = E.promoEffects(s);
      close(p.p4, 1); close(p.p2, 1);
      assert.ok(!E.canPromote(s, 1)); assert.ok(!E.canPromote(s, 3)); assert.ok(E.canPromote(s, 0));
    });
  });

  test('ascBase, ascMult and v scale p3', () => {
    const s = E.newState(); s.promo = [0, 0, 16, 0];
    withMods({ ascBase: 12, ascMult: 2, v: [1, 1, 0.5, 1] }, () => close(E.promoEffects(s).p3, (12 + Math.pow(16, 0.82) * 0.5) * 2));
  });

  test('maxCircles stops the unlock chain; noAscend blocks ascension', () => {
    const s = E.newState();
    for (let i = 0; i < 4; i++) { s.circles[i].unlocked = true; s.circles[i].bought = 4; s.circles[i].level = 4; }
    s.scoreLog = 50;
    withMods({ maxCircles: 4 }, () => { E.buy(s, 3, 1); assert.ok(!s.circles[4].unlocked); });
    s.circles[0].level = 100;
    withMods({ noAscend: true }, () => assert.ok(!E.canAscend(s, 0)));
    assert.ok(E.canAscend(s, 0));
  });

  test('decay shrinks colour mult logs toward 0', () => {
    const s = E.newState(); s.circles[1].unlocked = true; s.circles[1].level = 0; s.circles[1].multLog = 10;
    withMods({ decay: 0.01 }, () => E.tick(s, 1));
    close(s.circles[1].multLog, 9.9);
  });

  test('score capped at INFINITY_LOG unless broken outside a challenge', () => {
    const s = E.newState(); s.scoreLog = 400; E.tick(s, 0.01); assert.equal(s.scoreLog, E.INFINITY_LOG);
    const b = E.newState(); b.inf.broken = true; b.scoreLog = 400; E.tick(b, 0.01); assert.ok(b.scoreLog >= 400);
    const c = E.newState(); c.inf.broken = true; c.inf.ic.active = 3; c.scoreLog = 400; E.tick(c, 0.01);
    assert.equal(c.scoreLog, E.INFINITY_LOG);
    assert.ok(!E.isFixed(b)); assert.ok(E.isFixed(c)); assert.ok(E.isFixed(s));
  });

  test('timers advance; prestige and promote reset tRun and the stall tracker', () => {
    const s = E.newState();
    E.tick(s, 0.5); close(s.inf.t, 0.5); close(s.inf.tRun, 0.5);
    s.scoreLog = 10; s.inf.rt = { markLog: 9, markT: 0.3 };
    assert.ok(E.prestige(s));
    assert.equal(s.inf.tRun, 0); assert.deepEqual(s.inf.rt, { markLog: -Infinity, markT: 0 }); close(s.inf.t, 0.5);
    E.tick(s, 0.25); s.pMult = 16 * E.TUNE.promoMin;
    assert.ok(E.promote(s, 0)); assert.equal(s.inf.tRun, 0);
  });

  test('registerHooks runs preTick, auto, postTick in order', () => {
    const saved = Object.assign({}, E._hooks); const seen = [];
    E.registerHooks({ preTick: () => seen.push('pre'), auto: () => seen.push('auto'), postTick: () => seen.push('post') });
    try { E.tick(E.newState(), 0.1); } finally { E.registerHooks(saved); }
    assert.deepEqual(seen, ['pre', 'auto', 'post']);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL (`E._hooks` is undefined).
- [ ] **Step 3: Implement in `src/engine.js`:**
  - `const DEFAULT_MODS = Object.freeze({ lapMult: 1, gainLog: 0, expAdd: 0, prodLog: 0, ascBase: 10, ascMult: 1, v: Object.freeze([1, 1, 1, 1]), pMultMult: 1, pExpMult: 1, gainPow: 1, disabledPromo: Object.freeze([]), maxCircles: 10, noAscend: false, decay: 0 });`
  - `const hooks = { mods: null, preTick: null, auto: null, postTick: null, stepDt: null };`
  - `function registerHooks(h) { for (const k of Object.keys(h)) if (k in hooks) hooks[k] = h[k]; }`
  - `function mods(s) { return hooks.mods ? hooks.mods(s) : DEFAULT_MODS; }`
  - `function isFixed(s) { return !(s.inf.broken && s.inf.ic.active === 0); }`
  - `promoEffects(s)`: `const m = mods(s); const L = s.promo.map((x, k) => m.disabledPromo.includes(k) ? 0 : x);`, then:
    ```js
    p4 = 1 + 0.05 * Math.pow(L[3], 0.48) * m.v[3];
    p1 = p4 * (Math.floor(Math.pow(L[0], 1.5)) * m.v[0] + 1);
    p2 = p4 * (1 + Math.sqrt(L[1]) * m.v[1]);
    p3 = p4 * (m.ascBase + Math.pow(L[2], 0.82) * m.v[2]) * m.ascMult;
    ```
  - `lapsPerSec`: `c.level * def.baseSpeed * p.p2 * mods(s).lapMult`. `tick` uses the same product.
  - `multGainPerLapLog(s, i) = s.circles[i].multGainLog + Math.log10(promoEffects(s).p1) + mods(s).gainLog`. `tick` uses the same sum for mult growth.
  - `perRevLog`: `Math.max(0.1, s.pExp + m.expAdd) * (sum + Math.log10(s.pMult) + m.prodLog)`.
  - `pendingPrestige`:
    ```js
    pMult = Math.pow(TUNE.pMultBase * (L - 3) ** TUNE.pMultPow * m.pMultMult, m.gainPow);
    pExp  = 1 + (Math.max(0, L - 5) / TUNE.pExpDiv) * m.pExpMult * m.gainPow;
    ```
  - `promoXp`: `Math.floor(Math.pow((mm / TUNE.promoMin) ** TUNE.promoPow, m.gainPow))`.
  - `canPromote`: `!mods(s).disabledPromo.includes(k) && promoXp(s) > s.promo[k]`.
  - `canAscend`: `!mods(s).noAscend && …`.
  - `buy`: unlock `next` only if `i + 1 < mods(s).maxCircles`.
  - `tick(s, dt)`:
    1. `const m = mods(s); s.inf.t += dt; s.inf.tRun += dt; if (hooks.preTick) hooks.preTick(s, dt, m);`
    2. The shipped lap loop, with `lapMult` and `gainLog`.
    3. If `m.decay > 0`, for each circle `c.multLog = Math.max(0, c.multLog * Math.pow(1 - m.decay, dt))`.
    4. Add score as shipped.
    5. `if (isFixed(s) && s.scoreLog > INFINITY_LOG) s.scoreLog = INFINITY_LOG;`
    6. Stats as shipped.
    7. `if (hooks.auto) hooks.auto(s, dt); if (hooks.postTick) hooks.postTick(s, dt);`
  - `prestige` and `promote`: after the reset, `s.inf.tRun = 0; s.inf.rt = { markLog: -Infinity, markT: 0 };`.
  - Export `DEFAULT_MODS`, `registerHooks`, `_hooks: hooks`, `mods`, `isFixed`, `multGainPerLapLog`.
- [ ] **Step 4: Run** `npm test`. Expected: all tests PASS, including every pre-existing test in `test/engine.test.js`.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(engine): mods hook and tick hook points" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 4: IP, Infinity count, goInfinite and fixed Infinity

**Model:** sonnet · **Depends on:** 3

**Files:**
- Modify: `src/engine-infinity.js`, `src/engine.js` (delete the legacy `goInfinite` and its export)
- Test: `test/infinity.test.js`

**Interfaces:**
- Consumes: `registerHooks`, `DEFAULT_MODS`, `isFixed`, `logAdd`/`logSub`, `newState`.
- Produces:
  - The `mods` implementation with contributor list `E._inf.MOD_FNS`.
  - IP contributor list `E._inf.IP_FNS` (each returns a log to add).
  - Pre-tick list `E._inf.PRE_FNS` (each is `(s, dt, m) => void`).
  - `goInfinite`, `resetForChallenge`, `icDoneCount`, `ipGainLog`, `infGain`, `breakBonusLog`.
  - The fixed-Infinity `postTick`.
  - The Infinity `TUNE` keys `ipBase: 1`, `breakStartLog: 2772`, `breakStepLog: 308`, merged into `E.TUNE`.

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const atInfinity = (s) => { s.scoreLog = E.INFINITY_LOG; return s; };

  test('ipGainLog: flat 1, x2 from the 5th Infinity, +1 per IC, x2 after IC4', () => {
    const s = E.newState();
    close(E.ipGainLog(s), 0);
    s.infinities = 4; close(E.ipGainLog(s), Math.log10(2));
    s.infinities = 0; s.inf.ic.done = [true, true, true, false, false, false, false, false, false];
    close(E.ipGainLog(s), Math.log10(4)); assert.equal(E.icDoneCount(s), 3);
    s.inf.ic.done[3] = true; close(E.ipGainLog(s), Math.log10(5) + Math.log10(2));
    s.inf.stars.sdU[1] = 3; close(E.ipGainLog(s), Math.log10(5) + Math.log10(2) + Math.log10(4));
  });

  test('infGain doubles after IC9', () => {
    const s = E.newState(); assert.equal(E.infGain(s), 1); s.inf.ic.done[8] = true; assert.equal(E.infGain(s), 2);
  });

  test('breakBonusLog: x10 at e3080, x100 at e3388; only broken and outside challenges', () => {
    const s = E.newState(); s.inf.broken = true;
    s.scoreLog = 3079.9; assert.equal(E.breakBonusLog(s), 0);
    s.scoreLog = 3080; assert.equal(E.breakBonusLog(s), 1);
    s.scoreLog = 3388; assert.equal(E.breakBonusLog(s), 2);
    s.inf.ic.active = 2; assert.equal(E.breakBonusLog(s), 0);
    s.inf.ic.active = 0; s.inf.broken = false; assert.equal(E.breakBonusLog(s), 0);
  });

  test('goInfinite grants IP and an Infinity, records stats, resets the run', () => {
    const s = atInfinity(E.newState());
    s.promo = [3, 3, 3, 3]; s.pMult = 1e6; s.inf.t = 100; s.inf.gpLog = 4; s.inf.gens[0] = { b: 2, aLog: 3 }; s.inf.stars.sdLog = 2;
    s.inf.upg['2;1'] = true; s.inf.pendingConfirm = true;
    assert.ok(E.goInfinite(s));
    assert.equal(s.inf.ipLog, 0); assert.equal(s.infinities, 1); assert.equal(s.stats.totalIpLog, 0);
    assert.equal(s.stats.fastestInfinity, 100); assert.deepEqual(s.stats.lastInfinities, [{ t: 100, ipGainLog: 0 }]);
    assert.deepEqual(s.promo, [0, 0, 0, 0]); assert.equal(s.pMult, 1); assert.equal(s.scoreLog, -Infinity);
    assert.equal(s.inf.t, 0); assert.equal(s.inf.tRun, 0); assert.equal(s.inf.gpLog, -Infinity);
    close(s.inf.gens[0].aLog, Math.log10(2)); assert.equal(s.inf.gens[0].b, 2); assert.equal(s.inf.gens[1].aLog, -Infinity);
    assert.equal(s.inf.stars.sdLog, -Infinity); assert.ok(s.inf.upg['2;1']); assert.equal(s.inf.pendingConfirm, false);
    assert.ok(!E.goInfinite(s));
  });

  test('IC4 done: promotions restart at level 1', () => {
    const s = atInfinity(E.newState()); s.inf.ic.done[3] = true; E.goInfinite(s); assert.deepEqual(s.promo, [1, 1, 1, 1]);
  });

  test('lastInfinities keeps 10; IP is capped at INFINITY_LOG', () => {
    const s = E.newState(); s.inf.ipLog = E.INFINITY_LOG - 1e-6;
    for (let i = 0; i < 12; i++) { atInfinity(s); s.inf.t = i + 1; E.goInfinite(s); }
    assert.equal(s.stats.lastInfinities.length, 10); assert.equal(s.stats.lastInfinities[9].t, 12);
    assert.equal(s.inf.ipLog, E.INFINITY_LOG); assert.equal(s.stats.fastestInfinity, 1);
  });

  test('fixed Infinity: first waits for confirmation, later ones are automatic', () => {
    const s = atInfinity(E.newState());
    E.tick(s, 0.01);
    assert.equal(s.infinities, 0); assert.equal(s.inf.pendingConfirm, true); assert.equal(s.scoreLog, E.INFINITY_LOG);
    E.goInfinite(s); assert.equal(s.inf.pendingConfirm, false);
    atInfinity(s); E.tick(s, 0.01); assert.equal(s.infinities, 2);
    s.inf.auto.confirmInfinity = true; atInfinity(s); E.tick(s, 0.01);
    assert.equal(s.infinities, 2); assert.equal(s.inf.pendingConfirm, true);
  });

  test('broken: no automatic Infinity', () => {
    const s = E.newState(); s.infinities = 3; s.inf.broken = true; s.scoreLog = 400;
    E.tick(s, 0.01); assert.equal(s.infinities, 3); assert.ok(E.canInfinity(s));
  });

  test('resetForChallenge resets the run without reward', () => {
    const s = E.newState(); s.scoreLog = 200; s.pMult = 50; s.inf.ipLog = 1; s.inf.t = 9;
    E.resetForChallenge(s);
    assert.equal(s.scoreLog, -Infinity); assert.equal(s.pMult, 1); assert.equal(s.inf.ipLog, 1);
    assert.equal(s.infinities, 0); assert.equal(s.inf.t, 0);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`E.ipGainLog` is not a function).
- [ ] **Step 3: Implement in `src/engine-infinity.js`** (inside the IIFE):
  ```js
  Object.assign(E.TUNE, { ipBase: 1, breakStartLog: 2772, breakStepLog: 308 });
  const I = E._inf; I.MOD_FNS = []; I.IP_FNS = []; I.PRE_FNS = []; I.GEN_FNS = [];

  function mods(s) {
    const d = E.DEFAULT_MODS;
    const m = Object.assign({}, d, { v: d.v.slice(), disabledPromo: d.disabledPromo.slice() });
    for (const f of I.MOD_FNS) f(s, m);
    return m;
  }
  const icDoneCount = (s) => s.inf.ic.done.filter(Boolean).length;
  const infGain = (s) => (s.inf.ic.done[8] ? 2 : 1);
  function breakBonusLog(s) {
    if (!s.inf.broken || s.inf.ic.active) return 0;
    return Math.max(0, Math.floor((s.scoreLog - E.TUNE.breakStartLog) / E.TUNE.breakStepLog));
  }
  function ipGainLog(s) {
    let g = Math.log10(1 + icDoneCount(s)) + Math.log10(E.TUNE.ipBase) + breakBonusLog(s)
          + Math.log10(1 + s.inf.stars.sdU[1]);
    if (s.infinities >= 4) g += I.LOG2;
    if (s.inf.ic.done[3]) g += I.LOG2;
    for (const f of I.IP_FNS) g += f(s);
    return g;
  }
  function runReset(s) {         // spec §2.4 steps 4–5
    const keep = { stats: s.stats, infinities: s.infinities, inf: s.inf, savedAt: s.savedAt };
    Object.assign(s, E.newState(), keep);
    s.promo = s.inf.ic.done[3] ? [1, 1, 1, 1] : [0, 0, 0, 0];
    const f = s.inf;
    f.t = 0; f.tRun = 0; f.gpLog = -Infinity; f.pendingConfirm = false;
    f.gens.forEach((g) => { g.aLog = g.b > 0 ? Math.log10(g.b) : -Infinity; });
    f.stars.sdLog = -Infinity; f.rt = { markLog: -Infinity, markT: 0 };
  }
  function resetForChallenge(s) { runReset(s); }
  function goInfinite(s) {
    if (!E.canInfinity(s)) return false;
    const gain = ipGainLog(s); const t = s.inf.t; const st = s.stats;
    s.inf.ipLog = Math.min(E.INFINITY_LOG, E.logAdd(s.inf.ipLog, gain));
    s.infinities += infGain(s);
    st.fastestInfinity = st.fastestInfinity === null ? t : Math.min(st.fastestInfinity, t);
    st.lastInfinities.push({ t, ipGainLog: gain }); if (st.lastInfinities.length > 10) st.lastInfinities.shift();
    st.totalIpLog = E.logAdd(st.totalIpLog, gain);
    const n = s.inf.ic.active;
    if (n > 0) { s.inf.ic.done[n - 1] = true; const b = s.inf.ic.best[n - 1]; s.inf.ic.best[n - 1] = b === null ? t : Math.min(b, t); s.inf.ic.active = 0; }
    runReset(s);
    return true;
  }
  function postTick(s) {         // spec §2.1
    if (!E.isFixed(s) || !E.canInfinity(s)) return;
    if (s.infinities === 0 || s.inf.auto.confirmInfinity) { s.inf.pendingConfirm = true; return; }
    goInfinite(s);
  }
  function preTick(s, dt, m) { for (const f of I.PRE_FNS) f(s, dt, m); }
  E.registerHooks({ mods, preTick, postTick });
  Object.assign(E, { goInfinite, resetForChallenge, icDoneCount, ipGainLog, infGain, breakBonusLog });
  ```
  In `src/engine.js`, delete the legacy `goInfinite` function and its entry in the returned object. `engine-infinity.js` now supplies `E.goInfinite`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS, including the legacy `infinity` test in `engine.test.js` and `fresh state mods equal DEFAULT_MODS`.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(infinity): IP gain, Infinity count, goInfinite, fixed auto-Infinity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 5: Generators and Generator Power

**Model:** sonnet · **Depends on:** 4

**Files:**
- Modify: `src/engine-infinity.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `GEN_COUNT`, `genCostLog`, `canBuyGen`, `buyGen`, `genMultLog` (sums `I.GEN_FNS`, where each is `(s, k) => log`), `genSoftcap`, `gpExp` (base 0.666; Task 6 adds 14;2 and 19;1 via `I.GPEXP_FNS`, where each returns an exponent or null), `gpMultLog`.
- Adds a mods contributor (`gainLog`) and a generator production pre-tick.
- `TUNE` keys:
  ```js
  genRate: 1, gpExp0: 0.666, genSoftcapLog: 1000,
  genCost: [[Math.log10(32), Math.log10(5)], [Math.log10(150), 1], [5, 2], [9, 3], [15, 4], [21, 5], [27, 6], [33, 7], [39, 8], [45, 9]]
  ```

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const withGens = (s) => { s.inf.upg['1;1'] = true; s.inf.gens[0] = { b: 1, aLog: 0 }; return s; };

  test('generator costs follow the table', () => {
    const s = withGens(E.newState());
    close(E.genCostLog(s, 0), Math.log10(32));
    s.inf.gens[0].b = 3; close(E.genCostLog(s, 0), Math.log10(32 * 25), 1e-5);
    close(E.genCostLog(s, 1), Math.log10(150), 1e-5);
    s.inf.gens[1].b = 2; close(E.genCostLog(s, 1), Math.log10(15000), 1e-5);
    close(E.genCostLog(s, 2), 5); close(E.genCostLog(s, 3), 9);
    close(E.genCostLog(s, 4), 15); s.inf.gens[4].b = 1; close(E.genCostLog(s, 4), 19);
    close(E.genCostLog(s, 9), 45);
  });

  test('buyGen needs 1;1, the previous tier and IP', () => {
    const n = E.newState(); n.inf.ipLog = 5; assert.ok(!E.canBuyGen(n, 0));
    const s = withGens(E.newState()); s.inf.ipLog = Math.log10(200);
    assert.ok(!E.canBuyGen(s, 2));
    assert.ok(E.buyGen(s, 1));
    close(s.inf.ipLog, Math.log10(50), 1e-5); assert.equal(s.inf.gens[1].b, 1); close(s.inf.gens[1].aLog, 0);
    assert.ok(E.canBuyGen(s, 0)); assert.ok(!E.canBuyGen(s, 1));
  });

  test('generator mult: x2 per purchase; 1;1 gives G1 x Infinities', () => {
    const s = withGens(E.newState()); s.infinities = 8;
    close(E.genMultLog(s, 0), Math.log10(8));
    s.inf.gens[0].b = 3; close(E.genMultLog(s, 0), Math.log10(8) + 2 * Math.log10(2));
    s.inf.gens[1].b = 1; close(E.genMultLog(s, 1), 0);
  });

  test('genSoftcap is continuous at 1000', () => {
    assert.equal(E.genSoftcap(999), 999); assert.equal(E.genSoftcap(1000), 1000); close(E.genSoftcap(4000), 2000);
  });

  test('G1 alone: GP = a * m * t', () => {
    const s = withGens(E.newState()); s.infinities = 1;
    for (let i = 0; i < 100; i++) E.tick(s, 0.1);
    close(10 ** s.inf.gpLog, 10, 1e-6);
  });

  test('two tiers: G2 feeds G1', () => {
    const s = withGens(E.newState()); s.infinities = 1; s.inf.gens[1] = { b: 1, aLog: 0 };
    for (let i = 0; i < 1000; i++) E.tick(s, 0.001);
    close(10 ** s.inf.gens[0].aLog, 2, 1e-6);
    close(10 ** s.inf.gpLog, 1.5, 1e-3);
  });

  test('GP multiplies mult gain by GP^0.666 (wiki: GP 16 -> ~6.35)', () => {
    const s = withGens(E.newState()); s.inf.gpLog = Math.log10(16);
    close(E.gpExp(s), 0.666);
    close(10 ** E.gpMultLog(s), Math.pow(16, 0.666));
    assert.ok(Math.abs(10 ** E.gpMultLog(s) - 6.35) < 0.02);
    close(E.multGainPerLapLog(s, 0), E.TUNE.multGainLog0 + E.gpMultLog(s));
    s.inf.gpLog = -2; assert.equal(E.gpMultLog(s), 0);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per spec §5:
  - **`genCostLog(s, k)`:** `const [f, st] = E.TUNE.genCost[k]; const p = k === 0 ? s.inf.gens[0].b - 1 : s.inf.gens[k].b; return f + st * p;`
  - **`canBuyGen(s, k)`:** requires `s.inf.upg['1;1']`, `k === 0 || s.inf.gens[k - 1].b >= 1`, and `s.inf.ipLog >= genCostLog(s, k)`.
  - **`buyGen`:** spends IP with `logSub`, then `b += 1` and `aLog = logAdd(aLog, 0)`.
  - **`genMultLog(s, k)`:**
    ```js
    let L = I.LOG2 * Math.max(0, g.b - 1) + Math.log10(E.TUNE.genRate);
    if (s.inf.upg['1;1'] && k <= s.inf.stars.sdU[0]) L += Math.log10(Math.max(1, s.infinities));
    for (const f of I.GEN_FNS) L += f(s, k);
    return genSoftcap(L);
    ```
  - **`genSoftcap(L)`:** `L <= T.genSoftcapLog ? L : T.genSoftcapLog * Math.sqrt(L / T.genSoftcapLog)`.
  - **`gpExp(s)`:** the largest of `T.gpExp0` and every non-null value from `I.GPEXP_FNS`.
  - **`gpMultLog(s)`:** `gpExp(s) * Math.max(0, s.inf.gpLog)`.
  - **`I.starGpLog`:** define `I.starGpLog = () => 0` for now (Task 9 replaces it).
  - **Production pre-tick** (push onto `I.PRE_FNS`). It computes all new values from start-of-tick amounts, then assigns them:
    - `gp' = logAdd(gpLog, a1Log + M1 + I.starGpLog(s) + log10(dt))`
    - for k = 0..8: `a_k' = logAdd(a_k, a_{k+1}Log + M_{k+1} + log10(dt))`
    - Skip any term whose source amount is `-Infinity`.
  - **Mods contributor:** `(s, m) => { if (s.inf.gpLog > 0) m.gainLog = gpMultLog(s); }`
  - Merge the TUNE keys listed under Interfaces and export all Produces names.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(infinity): generators and Generator Power" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 6: Infinity Upgrade tree

**Model:** sonnet · **Depends on:** 5

**Files:**
- Modify: `src/engine-infinity.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `UPGRADES` (38 nodes; spec §4 table transcribed in order), `upgById`, `hasUpg`, `upgReqMet`, `canBuyUpgrade`, `buyUpgrade` (1;1 grants the free G1), `upgEffect`, `ctf`, `passiveInfRate`, `sdU4Mult`.
- Contributors to `MOD_FNS`, `GEN_FNS`, `IP_FNS`, `GPEXP_FNS` and `PRE_FNS` (passive ∞).
- `TUNE` keys:
  ```js
  u51Div: 600, u51Cap: 10, u52K: 0.1, u62K: 0.25, u162K: 0.05, u8TimeDiv: 60,
  u121Pow: 0.5, u171Pow: 0.25, u161Pow: 0.2, u141K: 0.1,
  icRefSec: 36000, ctfMax: 1e4, u163Ref: 3600, passiveInfK: 2, u201Ref: 600, u201Cap: 100,
  gpExp14: 0.75, gpExp19: 0.9
  ```

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const own = (s, ...ids) => { for (const id of ids) s.inf.upg[id] = true; return s; };

  test('tree: 38 unique nodes with wiki costs; trimmed nodes absent', () => {
    assert.equal(E.UPGRADES.length, 38);
    assert.equal(new Set(E.UPGRADES.map((u) => u.id)).size, 38);
    const cost = (id) => E.upgById(id).cost;
    assert.equal(cost('1;1'), 1); assert.equal(cost('3;2'), 1); assert.equal(cost('4;1'), 3); assert.equal(cost('7;1'), 5);
    assert.equal(cost('8;2'), 32); assert.equal(cost('11;2'), 400); assert.equal(cost('14;2'), 1024);
    assert.equal(cost('16;3'), 5000); assert.equal(cost('17;1'), 1e6); assert.equal(cost('18;1'), 2e11);
    assert.equal(cost('19;1'), 1e12); assert.equal(cost('20;1'), 1e21); assert.equal(cost('21;1'), 1e33);
    for (const gone of ['10;1', '17;2', '18;2', '19;2', '20;2']) assert.equal(E.upgById(gone), undefined);
    assert.deepEqual(['A', 'B', 'C'].map((p) => E.UPGRADES.filter((u) => u.phase === p).length), [11, 12, 15]);
  });

  test('prerequisites', () => {
    const s = E.newState();
    assert.ok(E.upgReqMet(s, '1;1')); assert.ok(!E.upgReqMet(s, '2;1'));
    own(s, '1;1', '2;2'); assert.ok(E.upgReqMet(s, '3;1')); assert.ok(E.upgReqMet(s, '3;2'));
    own(s, '3;2', '4;1', '5;3');
    assert.ok(!E.upgReqMet(s, '6;1')); assert.ok(E.upgReqMet(s, '6;2'));
    own(s, '6;2'); assert.ok(E.upgReqMet(s, '7;1'));
    own(s, '7;1', '8;3'); assert.ok(E.upgReqMet(s, '9;1')); assert.ok(!E.upgReqMet(s, '11;1'));
    own(s, '9;2'); assert.ok(E.upgReqMet(s, '11;1'));
    assert.ok(!E.upgReqMet(s, '21;1')); own(s, '20;1'); assert.ok(E.upgReqMet(s, '21;1'));
  });

  test('buyUpgrade spends IP; 1;1 grants a free G1', () => {
    const s = E.newState(); s.inf.ipLog = Math.log10(3);
    assert.ok(!E.canBuyUpgrade(s, '2;1'));
    assert.ok(E.buyUpgrade(s, '1;1'));
    close(s.inf.ipLog, Math.log10(2)); assert.deepEqual(s.inf.gens[0], { b: 1, aLog: 0 });
    assert.ok(!E.buyUpgrade(s, '1;1'));
    assert.ok(E.buyUpgrade(s, '2;1')); assert.ok(E.buyUpgrade(s, '2;2'));
    assert.equal(s.inf.ipLog, -Infinity); assert.ok(!E.canBuyUpgrade(s, '3;1'));
  });

  test('Revolution-side effects', () => {
    const s = E.newState();
    own(s, '3;1', '4;1'); close(E.mods(s).lapMult, 1.32);
    own(s, '19;3'); close(E.mods(s).lapMult, 3.96);
    own(s, '2;1'); close(E.mods(s).expAdd, 0.01);
    own(s, '6;1'); assert.equal(E.mods(s).ascBase, 12); own(s, '13;1'); assert.equal(E.mods(s).ascBase, 13);
    s.infinities = 9; own(s, '6;2'); close(E.mods(s).ascMult, 1.25);
    s.infinities = 3; own(s, '16;2'); close(E.mods(s).ascMult, (1 + 0.25 * Math.log10(4)) * 1.1);
    s.inf.t = 600; own(s, '5;1'); close(E.mods(s).pMultMult, 2);
    own(s, '5;2'); close(E.mods(s).pExpMult, 1.2);
    s.promo = [16, 0, 0, 0]; own(s, '14;1'); close(E.mods(s).v[0], 1.4);
  });

  test('generator-side effects', () => {
    const s = withGens(E.newState()); s.infinities = 16;
    const g1 = () => E.genMultLog(s, 0), g2 = () => E.genMultLog(s, 1), g3 = () => E.genMultLog(s, 2);
    let b = g1();
    own(s, '8;3'); close(g1(), b + Math.log10(5)); b = g1();
    s.inf.t = 60; own(s, '8;1'); close(g1(), b + Math.log10(Math.SQRT2)); b = g1();
    s.inf.gpLog = Math.log10(99); own(s, '8;2'); close(g1(), b + Math.log10(3)); b = g1();
    s.inf.ipLog = Math.log10(99); own(s, '11;1'); close(g1(), b + Math.log10(3)); b = g1();
    own(s, '17;3'); close(g1(), b + 1);
    b = g2();
    own(s, '9;2'); close(g2(), b + Math.log10(3)); b = g2();
    own(s, '9;1'); close(g2(), b + Math.log10(Math.SQRT2)); b = g2();
    own(s, '11;2'); close(g2(), b + 0.5 * Math.log10(3)); b = g2();
    own(s, '12;1'); close(g2(), b + Math.log10(4));
    b = g3();
    own(s, '17;1'); close(g3(), b + Math.log10(2)); b = g3();
    s.inf.gens[1].b = 4; own(s, '18;3'); close(g3(), b + Math.log10(5));
    own(s, '14;2'); close(E.gpExp(s), 0.75); own(s, '19;1'); close(E.gpExp(s), 0.9);
  });

  test('Break-era effects: ctf, IP upgrades, 16;3, 20;1, 18;1', () => {
    const s = withGens(E.newState());
    assert.equal(E.ctf(s), 1);
    s.inf.ic.done = Array(9).fill(true); s.inf.ic.best = [337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 900];
    close(E.ctf(s), 10);
    let ip = E.ipGainLog(s); own(s, '15;2'); close(E.ipGainLog(s), ip + 0.5);
    s.infinities = 32; ip = E.ipGainLog(s); own(s, '16;1'); close(E.ipGainLog(s), ip + Math.log10(2));
    const g1 = E.genMultLog(s, 0); own(s, '15;3'); close(E.genMultLog(s, 0), g1 + 1);
    s.inf.gens[1].b = 1; const g2 = E.genMultLog(s, 1); own(s, '15;4'); close(E.genMultLog(s, 1), g2 + 0.75);
    const v3 = E.mods(s).v[3]; own(s, '16;3'); close(E.mods(s).v[3], v3 * 2);
    const all = [0, 1, 2].map((k) => E.genMultLog(s, k));
    s.stats.fastestInfinity = 6; own(s, '20;1'); [0, 1, 2].forEach((k) => close(E.genMultLog(s, k), all[k] + 1));
    assert.equal(E.passiveInfRate(s), 0); own(s, '18;1');
    const rate = E.passiveInfRate(s); close(rate, E.TUNE.passiveInfK * E.infGain(s) / 6);
    const inf0 = s.infinities; E.tick(s, 3); close(s.infinities, inf0 + 3 * rate);
    assert.equal(E.sdU4Mult(s), 1);
  });

  test('upgEffect reports live values', () => {
    const s = own(E.newState(), '3;1'); close(E.upgEffect(s, '3;1'), 1.1); assert.equal(E.upgEffect(s, '2;2'), null);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **The table.** Transcribe spec §4 into `UPGRADES` in table order. Every row gets `{ id, col, row, name, cost, phase, req, desc }`. `req` is `'prev'` unless noted:
    - 1;1 is `[]`.
    - 2;1 and 2;2 are `['1;1']`.
    - 5;1, 5;2 and 5;3 are `['4;1']`.
    - 6;1 is `['5;1', '5;2']`.
    - 6;2 is `['5;2', '5;3']`.
    - 8;1, 8;2 and 8;3 are `['7;1']`.
    - 21;1 is `['20;1']`.

    `desc` is the spec's effect text (e.g. `'Lap speed ×1.1'`).
  - **`upgReqMet`.**
    - An array `req` is met when it is empty or any listed id is owned.
    - `'prev'` means any owned node whose `col` equals the largest kept `col` below this one. Compute it from `UPGRADES`, so column 11 looks at column 9.
  - **Buying.** `canBuyUpgrade` requires: not owned, `upgReqMet`, and `ipLog >= log10(cost)`. `buyUpgrade` spends with `logSub`, sets `upg[id] = true`, and for `'1;1'` sets `gens[0] = { b: 1, aLog: 0 }` if `b === 0`.
  - **Helpers:**
    ```js
    ctf(s)            = s.inf.ic.done.every(Boolean)
                          ? Math.min(T.ctfMax, Math.max(1, T.icRefSec / s.inf.ic.best.reduce((a, b) => a + b, 0)))
                          : 1
    sdU4Mult(s)       = Math.min(62.62, Math.pow(1.05, s.inf.stars.sdU[3]))
    passiveInfRate(s) = s.inf.upg['18;1'] && s.stats.fastestInfinity !== null
                          ? T.passiveInfK * infGain(s) / Math.max(1, s.stats.fastestInfinity) * sdU4Mult(s)
                          : 0
    ```
    `passiveInfRate` also feeds a PRE_FN: `s.infinities += rate * dt`.
  - **Contributors** (factor formulas exactly as in spec §4; `has(id)` means `!!s.inf.upg[id]`):
    - **MOD_FNS:**
      - `lapMult *= 1.1 [3;1] * 1.2 [4;1] * 3 [19;3]`
      - `expAdd += 0.01 + Math.min(0.5, 0.01 * sdU[2])` if 2;1
      - `ascBase += 2 [6;1] + 1 [13;1]`
      - `ascMult *= (1 + u62K·log10(1+∞)) [6;2] * (1 + u162K·log2(1+∞)) [16;2]`
      - `pMultMult *= Math.min(u51Cap, 1 + Math.sqrt(t / u51Div))` if 5;1
      - `pExpMult *= 1 + u52K·log2(1+∞)` if 5;2
      - `v[0] *= 1 + Math.sqrt(promo[0]) · u141K` if 14;1
      - `v[3] *= Math.sqrt(clamp(u163Ref / best[8], 1, 10))` if 16;3 and `ic.done[8]`
    - **GEN_FNS** (return log10 factors for k):
      - k=0: 8;1 `0.5·log10(1 + t/u8TimeDiv)`, 8;2 `log10(1 + log10(1 + GP))`, 8;3 `log10 5`, 11;1 `log10(1 + log10(1 + IP))`, 15;3 `log10 ctf`, 17;3 `1`
      - k=1: 9;1 like 8;1, 9;2 `log10 3`, 11;2 `0.5·log10(1 + log10(1 + IP))`, 12;1 `u121Pow·log10(max(1, ∞))`, 15;4 `0.75·log10 ctf`
      - k=2: 17;1 `u171Pow·log10(max(1, ∞))`, 18;3 `log10(1 + gens[1].b)`
      - all k: 20;1 `0.5·log10(clamp(u201Ref / fastest, 1, u201Cap))` when a fastest time exists

      GP and IP inside these formulas are plain values, `10 ** gpLog` and `10 ** ipLog`. Compute `log10(1 + x)` via `E.logAdd(0, xLog)`, so huge values never overflow.
    - **IP_FNS:** 15;2 `0.5·log10 ctf`, 16;1 `u161Pow·log10(max(1, ∞))`.
    - **GPEXP_FNS:** 14;2 → `T.gpExp14`, 19;1 → `T.gpExp19`, otherwise null.
  - **`upgEffect(s, id)`:** returns the current multiplier or value for display:
    - 3;1 → 1.1, 4;1 → 1.2, 19;3 → 3, 8;3 → 5, 9;2 → 3, 17;3 → 10
    - 2;1 → the expAdd share
    - 6;1 → 2, 13;1 → 1
    - the formula value for the others
    - `null` for unlock-only nodes: 2;2, 3;2, 5;3, 7;1, 15;1, 21;1

    It works whether or not the node is owned, so a card can preview it.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS, including `fresh state mods equal DEFAULT_MODS`.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(infinity): trimmed-faithful Infinity Upgrade tree" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 7: Automation engine

**Model:** sonnet · **Depends on:** 6

**Files:**
- Modify: `src/engine-auto.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Consumes: `buy`, `costLog`, `levelCap`, `canAscend`, `ascend`, `promoXp`, `canPromote`, `promote`, `canPrestige`, `pendingPrestige`, `prestige`, `canInfinity`, `goInfinite`, `ipGainLog`, `mods`, `isFixed`.
- Produces: `autoUnlocked`, `anyAutoOn`, `updateStall`, `isStalled`, `autoStep`, plus the registered `auto` hook. `TUNE` key: `autoBuyMaxPerStep: 500`.

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const autoState = (...ids) => { const s = own(withGens(E.newState()), ...ids); s.infinities = 1; return s; };

  test('autoUnlocked follows upgrades; anyAutoOn', () => {
    assert.deepEqual(E.autoUnlocked(autoState('1;1', '2;2', '3;2')), { buy: true, asc: true, promote: true, prestige: false, infinity: false });
    assert.ok(!E.anyAutoOn(E.newState())); assert.ok(E.anyAutoOn(autoState('1;1')));
    const off = autoState('1;1'); off.inf.auto.buy.on = false; assert.ok(!E.anyAutoOn(off));
  });

  test('autobuy: cheapest first until nothing affordable; toggles respected', () => {
    const s = autoState('1;1'); s.scoreLog = 4; E.autoStep(s, 0.1);
    for (let i = 0; i < 10; i++) {
      const c = s.circles[i];
      if (c.unlocked && c.level < E.levelCap(c)) assert.ok(E.costLog(s, i) > s.scoreLog, `circle ${i} still affordable`);
    }
    assert.ok(s.circles[0].level > 5);
    const t = autoState('1;1'); t.scoreLog = 4; t.inf.auto.buy.circles[0] = false; E.autoStep(t, 0.1); assert.equal(t.circles[0].level, 5);
    const u = autoState('1;1'); u.scoreLog = 4; u.inf.auto.buy.on = false; E.autoStep(u, 0.1); assert.equal(u.circles[0].level, 5);
  });

  test('auto-ascend', () => {
    const s = autoState('1;1', '2;2'); s.inf.auto.buy.on = false; s.circles[0].level = 100;
    E.autoStep(s, 0.1); assert.equal(s.circles[0].ascensions, 1);
    const t = autoState('1;1', '2;2'); t.inf.auto.buy.on = false; t.circles[0].level = 100; t.inf.auto.asc.circles[0] = false;
    E.autoStep(t, 0.1); assert.equal(t.circles[0].ascensions, 0);
  });

  test('auto-promote: order, xFactor, minTime, stall fallback', () => {
    const s = autoState('1;1', '3;2'); s.inf.auto.buy.on = false; s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 0.5;
    E.autoStep(s, 0.1); assert.deepEqual(s.promo, [0, 0, 0, 0]);
    s.inf.tRun = 2; E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 0, 0, 0]);
    s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 2; E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 0, 0]);
    s.stats.promotions = 4; s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 2; s.scoreLog = 5; s.inf.rt = { markLog: 5, markT: 1.5 };
    E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 0, 0]);
    s.inf.tRun = 40; s.inf.rt = { markLog: 5, markT: 0 };
    E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 8, 0]);
  });

  test('auto-prestige thresholds', () => {
    const mk = () => { const s = autoState('1;1', '4;1', '5;3'); s.inf.auto.buy.on = false; s.inf.tRun = 1; s.scoreLog = 20; return s; };
    let s = mk(); E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
    s = mk(); s.pMult = 100; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
    s = mk(); s.pMult = 1000; s.pExp = 2; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 0);
    s = mk(); s.pMult = 900; s.pExp = 2; s.inf.tRun = 40; s.inf.rt = { markLog: 20, markT: 0 };
    E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
    s = mk(); s.pMult = 1e6; s.inf.auto.prestige.expGain = 0.05; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
    s = mk(); s.inf.tRun = 0.1; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 0);
  });

  test('stall tracker', () => {
    const s = autoState('1;1'); s.inf.tRun = 31; s.inf.rt = { markLog: 5, markT: 0 }; s.scoreLog = 5.5;
    assert.ok(E.isStalled(s)); E.updateStall(s); assert.ok(E.isStalled(s));
    s.scoreLog = 6.2; E.updateStall(s); assert.equal(s.inf.rt.markLog, 6.2); assert.equal(s.inf.rt.markT, 31); assert.ok(!E.isStalled(s));
    s.inf.auto.stallSec = 0; s.inf.tRun = 1000; assert.ok(!E.isStalled(s));
  });

  test('auto-infinity: broken, owned, thresholds met', () => {
    const s = autoState('1;1', '15;1'); s.inf.auto.buy.on = false; s.inf.broken = true; s.inf.auto.infinity.on = true;
    s.scoreLog = 400; s.inf.t = 5; s.inf.auto.infinity.minIpLog = 5;
    E.autoStep(s, 0.1); assert.equal(s.infinities, 1);
    s.inf.auto.infinity.minIpLog = 0; s.inf.auto.infinity.minTime = 10; E.autoStep(s, 0.1); assert.equal(s.infinities, 1);
    s.inf.auto.infinity.minTime = 0; E.autoStep(s, 0.1); assert.equal(s.infinities, 2);
  });

  test('tick runs autoStep', () => {
    const s = autoState('1;1'); s.scoreLog = 4; E.tick(s, 0.001); assert.ok(s.circles[0].level > 5);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per spec §6.
  - **`autoUnlocked`:** `buy` from 1;1, `asc` from 2;2, `promote` from 3;2, `prestige` from 5;3, `infinity` from 15;1.
  - **`anyAutoOn`:** true when any unlocked automation has its master `on` set.
  - **`updateStall(s)`:** `if (s.scoreLog >= rt.markLog + 1 || s.scoreLog < rt.markLog) { rt.markLog = s.scoreLog; rt.markT = s.inf.tRun; }`
  - **`isStalled(s)`:** `auto.stallSec > 0 && s.inf.tRun - rt.markT > auto.stallSec`.
  - **`autoStep(s, dt)`** runs these steps in order:
    1. `updateStall(s)`.
    2. **Ascend:** every enabled circle where `canAscend` holds.
    3. **Buy:** loop at most `T.autoBuyMaxPerStep` times. Pick the enabled, unlocked, below-cap circle with the smallest `costLog ≤ scoreLog`, and `E.buy(s, i, 1)` it. Stop when none is left.
    4. **Promote:** skip if `tRun < minTime`. Otherwise:
       - Let `k = order[stats.promotions % 4]`, advancing through `order` past any promotion in `mods(s).disabledPromo`. Promote `k` if `promoXp ≥ max(1, promo[k] × xFactor, promo[k] + 1)` and `canPromote(s, k)`.
       - Otherwise, if `isStalled(s) && !canPrestige(s)`, promote the first promotion in cycle order (starting at `k`) that `canPromote` allows.
       - On success, push `'promote'` and return early.
    5. **Prestige:** requires `canPrestige && tRun ≥ minTime`, with `g = pendingPrestige(s)`. Prestige when any of these holds:
       - `pMult === 1`
       - `g.pMult ≥ multX × pMult`
       - `expGain > 0 && g.pExp − pExp ≥ expGain`
       - `isStalled(s) && (g.pMult > 1.5 × pMult || g.pExp > pExp + 0.02)`
    6. **Infinity:** requires infinity unlocked and on, `!isFixed(s)`, `canInfinity`, `ipGainLog(s) ≥ minIpLog` and `s.inf.t ≥ minTime`. Then call `goInfinite`.

    Return `{ actions }`, where the action names are `'ascend'`, `'buy'`, `'promote'`, `'prestige'` and `'infinity'`. Register it with `E.registerHooks({ auto: autoStep })`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(auto): autobuy, auto-ascend, auto-promote, auto-prestige, auto-infinity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 8: Infinity Challenges and Break Infinity

**Model:** sonnet · **Depends on:** 7

**Files:**
- Modify: `src/engine-infinity.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `CHALLENGES`, `canStartChallenge`, `startChallenge`, `exitChallenge`, `canBreak`, `setBroken`, plus challenge contributors to `MOD_FNS` and `GEN_FNS`.
- `TUNE` keys: `ic1Boost: 1.5, ic5Nerf: 0.25, ic5Reward: 1.1, ic6Decay: 0.01, ic4Pow: 0.4`.

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const icReady = (n) => { const s = own(withGens(E.newState()), '7;1'); s.infinities = 5; for (let i = 0; i < n - 1; i++) s.inf.ic.done[i] = true; return s; };

  test('challenge gating, start and exit', () => {
    const s = withGens(E.newState()); assert.ok(!E.canStartChallenge(s, 1));
    own(s, '7;1'); assert.ok(E.canStartChallenge(s, 1)); assert.ok(!E.canStartChallenge(s, 2));
    s.scoreLog = 100; s.pMult = 50; s.inf.ipLog = 1;
    assert.ok(E.startChallenge(s, 1));
    assert.equal(s.inf.ic.active, 1); assert.equal(s.scoreLog, -Infinity); assert.equal(s.pMult, 1); assert.equal(s.inf.ipLog, 1);
    assert.ok(!E.canStartChallenge(s, 1));
    assert.ok(E.exitChallenge(s)); assert.equal(s.inf.ic.active, 0); assert.equal(s.inf.ipLog, 1);
    assert.equal(E.CHALLENGES.length, 9); assert.equal(E.CHALLENGES[3].name, 'Steep Climbs');
  });

  test('IC1: P2/P4 disabled; reward x1.5 on their variable parts', () => {
    const s = icReady(1); E.startChallenge(s, 1); s.promo = [4, 9, 16, 25];
    assert.deepEqual(E.mods(s).disabledPromo, [1, 3]); close(E.promoEffects(s).p2, 1);
    s.inf.ic.active = 0; s.inf.ic.done[0] = true;
    const m = E.mods(s); close(m.v[1], 1.5); close(m.v[3], 1.5);
  });

  test('IC2 asc power /4 then x1.2; IC3 exp -0.4 then +0.03', () => {
    const s = icReady(2); s.inf.ic.active = 2; close(E.mods(s).ascMult, 0.25);
    s.inf.ic.active = 0; s.inf.ic.done[1] = true; close(E.mods(s).ascMult, 1.2);
    s.inf.ic.active = 3; close(E.mods(s).expAdd, -0.4);
    s.inf.ic.active = 0; s.inf.ic.done[2] = true; close(E.mods(s).expAdd, 0.03);
  });

  test('IC4 gains ^0.4; IC5 promotions x0.25 then x1.1', () => {
    const s = icReady(4); s.inf.ic.active = 4; assert.equal(E.mods(s).gainPow, 0.4);
    s.inf.ic.active = 5; const a = E.mods(s).v; close(a[0], 0.25); close(a[1], 0.375); close(a[2], 0.25); close(a[3], 0.375);
    s.inf.ic.active = 0; s.inf.ic.done[4] = true;
    const v = E.mods(s).v; close(v[0], 1.1); close(v[1], 1.65); close(v[2], 1.1); close(v[3], 1.65);
  });

  test('IC6 decays mults; reward doubles generators', () => {
    const s = icReady(6); s.inf.ic.active = 6; assert.equal(E.mods(s).decay, E.TUNE.ic6Decay);
    const g = E.genMultLog(s, 0); s.inf.ic.active = 0; s.inf.ic.done[5] = true; close(E.genMultLog(s, 0), g + Math.log10(2));
  });

  test('IC7 divides by t^2; reward multiplies by t^0.2', () => {
    const s = icReady(7); s.inf.t = 100; s.inf.ic.active = 7; close(E.mods(s).prodLog, -4);
    s.inf.ic.active = 0; s.inf.ic.done[6] = true; close(E.mods(s).prodLog, 0.4);
  });

  test('IC8 disables ascension; reward +2 base', () => {
    const s = icReady(8); s.inf.ic.active = 8; s.circles[0].level = 100; assert.ok(!E.canAscend(s, 0));
    s.inf.ic.active = 0; s.inf.ic.done[7] = true; assert.equal(E.mods(s).ascBase, 12);
  });

  test('IC9 limits to 4 circles; reward doubles Infinities; all done enables Break', () => {
    const s = icReady(9); s.inf.ic.active = 9; assert.equal(E.mods(s).maxCircles, 4); assert.ok(!E.canBreak(s));
    s.inf.ic.active = 0; s.inf.ic.done[8] = true; assert.equal(E.infGain(s), 2); assert.ok(E.canBreak(s));
    assert.ok(E.setBroken(s, true)); assert.ok(s.inf.broken);
    assert.ok(!E.setBroken(icReady(1), true));
  });

  test('completion pays IP and records best time', () => {
    const s = icReady(1); E.startChallenge(s, 1); s.inf.t = 50; s.scoreLog = E.INFINITY_LOG;
    E.tick(s, 0.01);
    assert.ok(s.inf.ic.done[0]); assert.equal(s.inf.ic.active, 0); close(s.inf.ic.best[0], 50.01); assert.equal(s.infinities, 6);
    close(s.inf.ipLog, Math.log10(2));
    assert.ok(E.canStartChallenge(s, 1)); // re-runs allowed
  });

  test('Break: challenges stay fixed; fixing clamps and triggers Infinity', () => {
    const c = icReady(9); c.inf.ic.done = Array(9).fill(true); c.inf.broken = true; c.inf.ic.active = 3; c.scoreLog = 400;
    E.tick(c, 0.01); assert.equal(c.inf.ic.active, 0); assert.equal(c.infinities, 7);
    const s = icReady(9); s.inf.ic.done = Array(9).fill(true); E.setBroken(s, true);
    s.scoreLog = 400; E.tick(s, 0.01); assert.equal(s.infinities, 5);
    E.setBroken(s, false); assert.equal(s.scoreLog, E.INFINITY_LOG); E.tick(s, 0.01); assert.equal(s.infinities, 7);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per spec §8 and §3.
  - **`CHALLENGES`:** display strings, verbatim from the spec §8 table.
  - **`canStartChallenge(s, n)`:** `s.inf.upg['7;1'] && s.inf.ic.active === 0 && (n === 1 || s.inf.ic.done[n - 2])`.
  - **`startChallenge`:** `resetForChallenge(s); s.inf.ic.active = n; return true`.
  - **`exitChallenge`:** only when active; `resetForChallenge(s); s.inf.ic.active = 0; return true`.
  - **`canBreak`:** `ic.done.every(Boolean)`.
  - **`setBroken(s, on)`:** returns false unless `canBreak`. Sets `broken = !!on`. When turning it off with `scoreLog > INFINITY_LOG`, clamps `scoreLog` to `INFINITY_LOG`. Returns true.
  - **MOD_FNS contributor** (`a = ic.active`, `d = ic.done`):
    - `a===1`: `disabledPromo = [1, 3]`
    - `d[0]`: `v[1] *= ic1Boost; v[3] *= ic1Boost`
    - `a===2`: `ascMult *= 0.25`; `d[1]`: `ascMult *= 1.2`
    - `a===3`: `expAdd -= 0.4`; `d[2]`: `expAdd += 0.03`
    - `a===4`: `gainPow = T.ic4Pow`
    - `vAll = (d[4] ? ic5Reward : 1) * (a===5 ? ic5Nerf : 1)`; multiply all four `v` entries by `vAll` when ≠ 1
    - `a===6`: `decay = ic6Decay`
    - `a===7`: `prodLog -= 2·log10(max(1, t))`; `d[6]`: `prodLog += 0.2·log10(max(1, t))`
    - `a===8`: `noAscend = true`; `d[7]`: `ascBase += 2`
    - `a===9`: `maxCircles = 4`

    Only touch a field when its condition holds, so fresh-state mods still deep-equal `DEFAULT_MODS`.
  - **GEN_FNS contributor:** `d[5] ? LOG2 : 0`.
  - **Fixed run by challenge:** `isFixed` already treats an active challenge as fixed, and Task 4's `goInfinite` completes it. No other change is needed.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(infinity): Infinity Challenges and Break Infinity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 9: Stars and Stardust

**Model:** haiku · **Depends on:** 6

**Files:**
- Modify: `src/engine-infinity.js`
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `starCostLog`, `canBuyStar`, `buyStar`, `starBaseCostLog`, `buyStarBase`, `starExpCostLog`, `buyStarExp`, `sdRateLog`, `starGpLog` (replaces `I.starGpLog`), `SD_UPGRADES`, `sdUpgCostLog`, `canBuySdUpg`, `buySdUpg`, plus the Stardust pre-tick (unshifted to the front of `I.PRE_FNS`).
- `TUNE` keys:
  ```js
  starBaseCost: [34, 4], starExpCost: [35, 5], starExpMax: 12,
  sdUpgCost: [[1, 2], [Math.log10(20), 1], [Math.log10(50), Math.log10(3)], [2, Math.log10(2)]], sdUpgMax: [9, Infinity, 50, 85]
  ```

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  const starState = () => own(withGens(E.newState()), '21;1');

  test('star cost steps: +3 to e87, then +7, then growing', () => {
    const s = starState(); const at = (n) => { s.inf.stars.n = n; return E.starCostLog(s); };
    assert.equal(at(0), 33); assert.equal(at(1), 36); assert.equal(at(18), 87); assert.equal(at(19), 94);
    assert.equal(at(30), 171); assert.equal(at(31), 179);
  });

  test('buying stars and star upgrades', () => {
    const s = starState(); s.inf.ipLog = 34;
    assert.ok(E.buyStar(s)); assert.equal(s.inf.stars.n, 1); close(s.inf.ipLog, E.logSub(34, 33));
    assert.equal(E.starBaseCostLog(s), 34); assert.equal(E.starExpCostLog(s), 35);
    s.inf.stars.nb = 1; assert.equal(E.starBaseCostLog(s), 38);
    s.inf.stars.ne = 12; s.inf.ipLog = 500; assert.ok(!E.buyStarExp(s));
    s.inf.stars.ne = 0; assert.ok(E.buyStarExp(s)); assert.equal(s.inf.stars.ne, 1);
    const t = withGens(E.newState()); t.inf.ipLog = 40; assert.ok(!E.canBuyStar(t)); assert.ok(!E.buyStar(t));
  });

  test('stardust rate, accumulation and GP boost', () => {
    const s = starState(); assert.equal(E.sdRateLog(s), -Infinity);
    s.inf.stars.n = 1; close(E.sdRateLog(s), Math.log10(0.05 * 2.75));
    s.inf.stars.n = 2; s.inf.stars.nb = 10; close(E.sdRateLog(s), Math.log10(0.05 * 5.5 * 5.5));
    s.inf.stars.n = 1; s.inf.stars.nb = 0;
    for (let i = 0; i < 100; i++) E.tick(s, 0.1);
    close(10 ** s.inf.stars.sdLog, 1.375, 1e-6);
    s.inf.stars.sdLog = 2; s.inf.stars.ne = 2; close(E.starGpLog(s), 1.0);
  });

  test('stardust multiplies GP gain', () => {
    const a = starState(); a.infinities = 1; a.inf.stars.sdLog = 2; a.inf.stars.ne = 2;
    E.tick(a, 0.1); close(10 ** a.inf.gpLog, 1, 1e-9);
  });

  test('stardust upgrades: costs, caps, effects', () => {
    const s = starState();
    close(E.sdUpgCostLog(s, 0), 1); s.inf.stars.sdU[0] = 1; close(E.sdUpgCostLog(s, 0), 3);
    close(E.sdUpgCostLog(s, 1), Math.log10(20), 1e-5); close(E.sdUpgCostLog(s, 2), Math.log10(50), 1e-5); close(E.sdUpgCostLog(s, 3), 2);
    s.inf.stars.sdLog = 2; assert.ok(E.buySdUpg(s, 3)); assert.equal(s.inf.stars.sdU[3], 1); assert.equal(s.inf.stars.sdLog, -Infinity);
    s.inf.stars.sdLog = 100;
    s.inf.stars.sdU[0] = 9; assert.ok(!E.canBuySdUpg(s, 0));
    s.inf.stars.sdU[2] = 50; assert.ok(!E.canBuySdUpg(s, 2));
    s.inf.stars.sdU[3] = 85; assert.ok(!E.canBuySdUpg(s, 3)); close(E.sdU4Mult(s), 62.62);
    const t = withGens(E.newState()); t.infinities = 8; t.inf.gens[2].b = 1;
    const g3 = E.genMultLog(t, 2); t.inf.stars.sdU[0] = 2; close(E.genMultLog(t, 2), g3 + Math.log10(8));
    const ip = E.ipGainLog(t); t.inf.stars.sdU[1] = 3; close(E.ipGainLog(t), ip + Math.log10(4));
    own(t, '2;1'); t.inf.stars.sdU[2] = 10; close(E.mods(t).expAdd, 0.11);
    assert.equal(E.SD_UPGRADES.length, 4);
  });

  test('Infinity resets Stardust but keeps stars and upgrades', () => {
    const s = starState(); s.inf.stars = { n: 2, nb: 1, ne: 1, sdLog: 5, sdU: [1, 2, 3, 4] }; s.scoreLog = E.INFINITY_LOG;
    E.goInfinite(s);
    assert.deepEqual(s.inf.stars, { n: 2, nb: 1, ne: 1, sdLog: -Infinity, sdU: [1, 2, 3, 4] });
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per spec §7.
  - **`starCostLog`:** `33 + Σ_{j<n} step(j)`, with `step(j) = j < 18 ? 3 : j < 30 ? 7 : 7 + (j − 29)`.
  - **Star purchases:** `canBuyStar` requires 21;1 and IP ≥ cost, and `buyStar` spends and increments `n`. `buyStarBase` and `buyStarExp` also require 21;1:
    - `starBaseCostLog = T.starBaseCost[0] + T.starBaseCost[1] · nb`
    - `starExpCostLog = T.starExpCost[0] + T.starExpCost[1] · ne`, and `buyStarExp` refuses when `ne >= T.starExpMax`
  - **`sdRateLog`:** `n >= 1 ? log10(0.05) + n · log10(2.75 + 0.275·nb) : -Infinity`.
  - **`starGpLog`:** `(0.4 + 0.05·ne) · max(0, sdLog)`. Assign it to `I.starGpLog` so Task 5's production uses it.
  - **Stardust pre-tick:** `sdLog = logAdd(sdLog, sdRateLog + log10(dt))`. Insert it with `I.PRE_FNS.unshift(...)`.
  - **Stardust upgrades:**
    - `SD_UPGRADES`: 4 entries of `{ j, name, max, desc }`, with names and descriptions from spec §7.
    - `sdUpgCostLog(s, j) = c[0] + c[1] · sdU[j]`.
    - `canBuySdUpg` requires 21;1, `sdU[j] < T.sdUpgMax[j]` and `sdLog ≥ cost`. `buySdUpg` spends SD with `logSub` and increments.
  - Upgrades 1–4 already have their effects wired (Tasks 4–6 read `sdU`), so there is nothing else to add.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(infinity): Stars and Stardust" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 10: Adaptive step, simulate and offline budget

**Model:** sonnet · **Depends on:** 7, 8, 9

**Files:**
- Modify: `src/engine-auto.js` (`adaptiveDt` and the `stepDt` hook), `src/engine.js` (`simulate`)
- Test: `test/infinity.test.js`

**Interfaces:**
- Produces: `adaptiveDt` and the `simulate` return fields. `TUNE` keys: `dtRunDiv: 50, dtMin: 0.1, dtMax: 2, dtFixed: 1`.

- [ ] **Step 1: Write the failing tests.** Append:
  ```js
  test('adaptiveDt: fixed 1 s without automation, run-scaled with automation', () => {
    assert.equal(E.adaptiveDt(E.newState()), 1);
    const a = autoState('1;1'); a.inf.tRun = 0; assert.equal(E.adaptiveDt(a), 0.1);
    a.inf.tRun = 50; assert.equal(E.adaptiveDt(a), 1); a.inf.tRun = 1e4; assert.equal(E.adaptiveDt(a), 2);
    a.inf.tRun = 0; assert.equal(E.adaptiveDt(a, { dtMin: 0.5 }), 0.5);
  });

  test('simulate reports IP, Infinities and completed challenges', () => {
    const s = icReady(1); E.startChallenge(s, 1); s.scoreLog = E.INFINITY_LOG;
    const r = E.simulate(s, 1);
    assert.equal(r.infinitiesGained, 1); close(r.ipGainedLog, Math.log10(2)); assert.deepEqual(r.icCompleted, [1]);
    const q = E.simulate(E.newState(), 5); assert.equal(q.infinitiesGained, 0); assert.equal(q.ipGainedLog, -Infinity); assert.deepEqual(q.icCompleted, []);
  });

  test('offline automation tracks active play (10 min)', () => {
    const mk = () => { const s = autoState('1;1', '2;2', '3;1', '3;2', '4;1', '5;3'); s.infinities = 8; return s; };
    const a = mk(), b = mk();
    E.simulate(a, 600, { dtMin: 0.5 });
    for (let i = 0; i < 6000; i++) E.tick(b, 0.1);
    assert.ok(Math.abs(a.stats.prestiges - b.stats.prestiges) <= 2, `prestiges ${a.stats.prestiges} vs ${b.stats.prestiges}`);
    assert.ok(Math.abs(a.stats.bestScoreLog - b.stats.bestScoreLog) <= 1, `best ${a.stats.bestScoreLog} vs ${b.stats.bestScoreLog}`);
  });

  test('8 h offline with automation stays within the 3 s budget', () => {
    const s = autoState('1;1', '2;2', '3;1', '3;2', '4;1', '5;3'); s.infinities = 8;
    const t0 = Date.now(); E.simulate(s, 8 * 3600, { dtMin: 0.5 }); const ms = Date.now() - t0;
    assert.ok(ms < 3000, `took ${ms} ms`);
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`adaptiveDt(s, opts = {})`:**
    ```js
    anyAutoOn(s)
      ? Math.min(opts.dtMax ?? T.dtMax, Math.max(opts.dtMin ?? T.dtMin, s.inf.tRun / T.dtRunDiv))
      : T.dtFixed
    ```
    Register it with `E.registerHooks({ stepDt: adaptiveDt })`.
  - **Core `simulate(s, seconds, opts)`:**
    1. Record `before = { score: s.scoreLog, ip: s.inf.ipLog, inf: s.infinities, done: s.inf.ic.done.slice() }`.
    2. Loop `dt = Math.min(stepDt, remaining)` until `remaining <= 1e-9`.
    3. Return:
       - `scoreLogBefore` and `scoreLogAfter`
       - `ipGainedLog`: `after > before ? (before === -Infinity ? after : logSub(after, before)) : -Infinity`
       - `infinitiesGained`: `s.infinities − before.inf`
       - `icCompleted`: the 1-based numbers of challenges that were not done before and are done after
  - If the tracking test fails, the step rule is wrong. Report it with numbers; do not widen the tolerances.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS, including the legacy `simulate equals many ticks roughly` test (no automation, so steps stay at 1 s).
- [ ] **Step 5: Build and commit.** `node build.mjs && git add -A && git commit -m "feat(engine): adaptive offline step and simulate report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 11: UI — ∞ tab shell, Tree, Gens, Infinity flow

**Model:** sonnet · **Depends on:** 10

**Files:**
- Modify: `src/ui-infinity.js`, `src/ui.js`, `src/help.js`, `src/styles.css`
- Test: browser verification (below)

**Interfaces:**
- Consumes: the Engine API (Shared API contract) and `Help` hooks.
- Produces: `InfinityUI.render` and `InfinityUI.update` with the Tree and Gens sub-tabs; the `kit` object; `Help.TIPS` export; the new TIPS keys and unlock toasts listed below.

**Behaviour:**
1. **Tab registration.** Add `{ id: 'infinity', label: '∞', visible: (s) => s.infinities >= 1 || s.inf.ipLog > -Infinity }` to `TABS` between Promote and Stats.
   - Its render calls `InfinityUI.render(container, state, kit)` and its update calls `InfinityUI.update(container, state, kit)`.
   - `kit = { el, fmt, toast, twoStepConfirm, statLine, markDirty, save }`.
   - Under 420 px, the Stats and Settings tab buttons show an inline SVG icon (bar chart; gear) instead of the text label, and the full name moves to `aria-label`. Use CSS `@media (max-width: 419px)` to swap a `.tab-label` span for a `.tab-icon` span.
2. **Header** (sticky at the top of the ∞ body): `IP {fmt(ipLog)} · +{fmt(ipGainLog)} next · ∞ {infinities, en-US, 2 decimals only if fractional}`. It has `data-tip="ipHeader"` on the IP part and `data-tip="infCount"` on ∞.
3. **Sub-tab row.**
   - The buttons are Tree, Gens, Auto, ICs and Stars. Gens and Auto appear with 1;1, ICs with 7;1, Stars with 21;1.
   - The selection is kept in a module variable and persisted in `localStorage['revidle.infTab']` inside try/catch.
   - This task renders the Tree and Gens bodies. The Auto, ICs and Stars buttons render a "Coming in Task 12" body only until Task 12 replaces them in the same branch before release. Task 15 verifies that no such text remains.
4. **Tree.**
   - For each column present in `UPGRADES`, render a row: a small column label (`C5`), then a 2-column CSS grid of cards.
   - Reveal every column up to and including the first column with no owned node, plus one dimmed preview column after it.
   - Each card shows the name, `fmt(log10(cost)) IP`, and the effect line (`desc`, plus `now ×{upgEffect}` when not null).
   - Card state classes:
     - `.owned` when owned.
     - `.buyable` when `canBuyUpgrade`. Only this card is a `<button>`, and clicking it calls `Engine.buyUpgrade`, then `markDirty` and `save`.
     - `.locked` otherwise, with the text `Needs {req ids joined with ' or '}` or `Needs a C{prev col} upgrade`.
   - Every card has `data-tip="iuCard"` and `data-tip-i={index}`.
5. **Gens.**
   - The GP line `GP {fmt(gpLog)} → Mult Gain ×{fmt(gpMultLog)} (^{gpExp})` carries `data-tip="gpLine"`.
   - Rows G1..G(highest bought + 1), capped at 10. Each row shows the amount `fmt(aLog)`, `×{fmt(genMultLog)}`, and `+{rate}/s` (the rate is the next tier's production, or GP for G1). Rows use `data-tip="genRow"` with `data-tip-i=k`.
   - Each row has a Buy button showing `fmt(genCostLog) IP`, disabled unless `canBuyGen`, with `data-tip="genBuy"`.
   - When `genMultLog` is ≥ 1000, show the footnote "Generator Mult softcapped above e1,000".
6. **Infinity flow in `ui.js`.**
   - Replace the `canInfinity` modal trigger with `state.inf.pendingConfirm`. The modal's button calls `Engine.goInfinite(state)`.
   - First-Infinity modal copy: "You gained 1 Infinity Point. Spend it in the new ∞ tab."
   - When `state.infinities` has increased since the last DOM update and no modal is open, `toast('Infinity! +' + fmt(last.ipGainLog) + ' IP (∞ ' + n + ')')` using `stats.lastInfinities` (the last entry).
   - Offline and hidden-tab catch-up call `Engine.simulate(state, sec, { dtMin: 0.5 })`. The offline modal adds these lines when non-empty: `+X IP`, `+N Infinities`, `Challenge n completed`.
7. **Circles chip bar.** Add a `GP ×…` chip when `gpLog > 0`, with `data-tip="gpChip"`.
8. **Help (`src/help.js`).**
   - Export `TIPS` on `window.Help`.
   - Add these TIPS entries with the spec §10.4 copy, using live values from Engine helpers: `ipHeader`, `infCount`, `iuCard` (i = UPGRADES index; show name, desc, cost, requirement or owned, and the current value), `gpLine`, `genRow`, `genBuy`, `gpChip`, `goInfinite` (updated copy).
   - Add unlock toasts in `onTick` via `markSeen`:
     - `infTabSeen` (infinities ≥ 1): "∞ tab unlocked — spend Infinity Points on upgrades."
     - `gensSeen` (1;1 owned): "Generators online — they build Generator Power, which boosts every ring's mult gain."
     - `autoSeen` (any `autoUnlocked` flag true): "Automation unlocked — configure it in ∞ → Auto."
9. **Styles.** Cards use `--panel-2` with a `--line` border, and `.owned` uses an `--accent` border. `.buyable` glows via a box-shadow built from `--accent`, and `.locked` sits at 0.5 opacity. Use `--font-mono` for numbers. The header is `position: sticky`. Cards are at least 40 px tall.

- [ ] **Step 1: Implement** behaviours 1–9. Build every node with `kit.el`; do not put dynamic data in `innerHTML`.
- [ ] **Step 2: Unit tests.** Run `npm test`. Expected: all PASS (the engine is unchanged).
- [ ] **Step 3: Build.** Run `node build.mjs`. Expected: both outputs are written.
- [ ] **Step 4: Browser verification** (a single pass, using the fixture helper):
  1. Load this fixture:
     ```js
     const s = Engine.newState(); s.infinities = 12; s.inf.ipLog = Math.log10(3000);
     ['1;1','2;2','3;1','3;2','4;1','5;3','5;2','6;1','6;2','7;1'].forEach(id => s.inf.upg[id] = true);
     s.inf.gens[0] = { b: 1, aLog: 0 }; loadFixture(s);
     ```
  2. Check all of the following:
     - The ∞ tab is visible and the header shows IP 3,000 and ∞ 12.
     - Tree columns C1–C8 are visible (C8 buyable, C9 dimmed).
     - Buying 8;3 lowers IP by 16.
     - Gens shows G1 and G2; buying G1 costs 32.
     - No horizontal scroll.
     - Hovering a card shows its tooltip.
     - At 400 px, Stats and Settings show icons.
  3. Load a near-cap fixture:
     ```js
     const t = Engine.newState(); t.infinities = 3; t.inf.upg['1;1'] = true; t.inf.gens[0] = { b: 1, aLog: 0 };
     t.scoreLog = Engine.INFINITY_LOG - 1e-9; t.circles[0].multLog = 300; loadFixture(t);
     ```
     Within a second, an automatic Infinity happens: a toast `Infinity! +1 IP (∞ 4)` and no modal.
  4. Load `Engine.newState()` with `scoreLog = Engine.INFINITY_LOG - 1e-9` and `circles[0].multLog = 300`. The first-Infinity modal appears; confirming it shows the ∞ tab.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(ui): ∞ tab with Tree and Generators; Infinity flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 12: UI — Auto, ICs, Stars and remaining surfaces

**Model:** sonnet · **Depends on:** 11

**Files:**
- Modify: `src/ui-infinity.js`, `src/ui.js`, `src/help.js`, `src/styles.css`
- Test: browser verification

**Interfaces:**
- Consumes: the automation, challenge, Break and Star APIs.
- Produces: the full spec §10 UI and the remaining TIPS keys.

**Behaviour:**
1. **Auto sub-tab.** One collapsible card per unlocked automation (`Engine.autoUnlocked`).
   - **Buy and Ascend:** a master toggle plus a 5×2 grid of colour-dot toggles (colours from `Engine.CIRCLES[i].color`). Each dot has `aria-pressed`.
   - **Promote:** a master toggle; an order picker (4 chips labelled with the promotion names; tapping a chip moves it one position earlier, wrapping); a number input `×` (xFactor, min 1.1); a min-time input in seconds (min 0).
   - **Prestige:** a master toggle; multX (min 1); expGain (min 0); min time (min 0).
   - **Infinity** (only when 15;1 is owned): a master toggle; a min IP input that accepts `1e20` or `100000` and is stored as `log10`; min time.
   - **Shared:** stall seconds (min 0).
   - Inputs commit on `change`. An invalid value reverts to the stored value and shows `toast('Invalid value')`.
   - TIPS keys: `autoBuy`, `autoAsc`, `autoPromote`, `autoPrestige`, `autoInfinity`, `stallSec`.
2. **ICs sub-tab.**
   - A Break card at the top when `Engine.canBreak`. It has a Break/Fix toggle button (calls `Engine.setBroken`) and `data-tip="breakToggle"`.
   - Then 9 cards from `Engine.CHALLENGES`. Each shows its number and name, the handicap, the reward, a status (Locked / Available / Active / Done ✓), and the best time (`m:ss`, or `—`).
   - The Start button uses `twoStepConfirm(btn, 'Start', 'Reset run?', …)` and calls `Engine.startChallenge`. The active card shows Exit (`twoStepConfirm`, then `Engine.exitChallenge`).
   - A ΣIC line appears at the bottom when all 9 are done.
   - TIPS keys: `icCard` and `icStart` (i = n).
3. **Stars sub-tab.**
   - Readouts: `SD {fmt(sdLog)} (+{fmt(sdRateLog)}/s) → GP gain ×{fmt(starGpLog)}`.
   - Three buy rows: Star (count n), Base (`2.75 + 0.275·nb` shown to 3 decimals) and Exponent (`0.4 + 0.05·ne`). Each shows its cost in IP and a Buy button.
   - The 4 Stardust upgrades from `SD_UPGRADES`, each with level/max, description, cost in SD and a Buy button.
   - The reminder line "Stardust resets on Infinity — spend it first."
   - TIPS keys: `starBuy`, `starBase`, `starExp`, `sdAmount`, `sdUpg` (i = j).
4. **Prestige tab (`ui.js`).**
   - When broken and `canInfinity`, show the button `Go Infinite (+{fmt(ipGainLog)} IP)`. It calls `Engine.goInfinite` and needs no confirm, because it is the intended action.
   - When broken, add an IP-bar row: progress = `((scoreLog − 2772) mod 308) / 308` once `scoreLog ≥ 2772`, labelled `IP ×10^{breakBonusLog} · next ×10 at e{2772 + 308·(k+1)}`, with `data-tip="ipBar"`.
   - While a challenge is active, show the banner `IC{n} {name} — reach 1.79e308`.
5. **Canvas.** While a challenge is active, show a small top-left overlay `IC{n} {name}`, a DOM element over the canvas with `pointer-events: none`. The Circles chip bar shows an `IC n` chip with `data-tip="icChip"`.
6. **Stats:** infinities, total IP (`stats.totalIpLog`), fastest Infinity, a table of the last 10 Infinities (time and IP), IC best times and ΣIC.
7. **Settings:** a toggle "Confirm each Infinity" bound to `inf.auto.confirmInfinity`, with `data-tip="confirmInfinity"`.
8. **Finale.** When `inf.ipLog >= Engine.INFINITY_LOG && !inf.finaleSeen`, show the modal "Eternity — coming soon". It reports stats: time played, Infinities and fastest Infinity. On close, set `finaleSeen = true` and save.
9. **Help unlock toasts:**
   - `icSeen` (7;1): "Infinity Challenges unlocked — beat them for permanent rewards."
   - `breakSeen` (`canBreak`): "Break Infinity available — score can now pass 1.79e308."
   - `starsSeen` (21;1): "Stars unlocked — they make Stardust, which powers Generators."
10. Remove every "Coming in Task 12" body.

- [ ] **Step 1: Implement** behaviours 1–10.
- [ ] **Step 2: Unit tests.** `npm test`. Expected: all PASS.
- [ ] **Step 3: Build.** `node build.mjs`.
- [ ] **Step 4: Browser verification** (a single pass, using the fixture helper, at 400×860). Load:
  ```js
  const s = Engine.newState(); s.infinities = 400; s.inf.ipLog = 40;
  Engine.UPGRADES.forEach(u => { s.inf.upg[u.id] = true; });
  s.inf.gens.forEach((g, k) => { if (k < 4) { g.b = 2; g.aLog = Math.log10(2); } });
  s.inf.ic.done = Array(9).fill(true); s.inf.ic.best = [300, 280, 400, 3600, 500, 600, 900, 700, 4000];
  s.inf.stars = { n: 1, nb: 0, ne: 0, sdLog: 3, sdU: [0, 0, 0, 0] };
  loadFixture(s);
  ```
  Then check:
  - Auto shows 5 cards, and toggling a dot survives an Export → Import round trip.
  - An invalid multX (`abc`) reverts with a toast.
  - ICs shows the Break card and 9 Done cards. Break makes the Prestige tab show the IP bar. Starting IC1 asks for a second tap, then shows the banner, the canvas overlay and the chip.
  - Stars buys an SD upgrade.
  - Stats lists the IC times.
  - Settings has the toggle.
  - No horizontal scroll anywhere.
  - Tooltips appear on each new element type.
  - Loading the same fixture with `s.inf.ipLog = Engine.INFINITY_LOG` shows the finale once; it does not reappear after dismissal.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(ui): automation, challenges, Break, Stars, stats and finale" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 13: Pacing sim harness (idle profile)

**Model:** sonnet · **Depends on:** 10

**Files:**
- Modify: `test/sim.js`, `package.json` (script `"sim:layer": "MODE=layer node test/sim.js"`)

**Interfaces:**
- Consumes: the whole Engine API.
- Produces: `MODE=layer` per spec §13, with env `DAYS`, `CHECK`, `NOSKIP`, `FROM`, `OFFLINE`, `VERBOSE`, `QUIET`. The existing `MODE=first` behaviour is unchanged and remains the default.

**Behaviour:**
1. **Structure.** Keep today's `run()` as `runFirst()`. Add `runLayer()`. `require.main` dispatches on `process.env.MODE`.
2. **Clock and stepping.**
   - `t` is game seconds since the new game. `tInf1` is the time of the first Infinity.
   - Each loop step is `dt = E.adaptiveDt(s, { dtMin: 0.1, dtMax: 2 })`, capped so the step never crosses the next check-in.
   - Before all four automations are owned, the step is 0.1 and the greedy active logic (the existing `buyGreedy`, ascend, prestige and promote rules from `runFirst`) acts every step for any action whose automation is not owned. `E.tick` runs every step.
3. **Profiles and check-ins.**
   - **Active:** "check-in" means right after every Infinity.
   - **Idle:** starts at the first check-in after the 4th automation. Check-ins happen at day hours 0, 3, 6, 9, 12, 15 of each 24 h cycle, measured from the idle start (16 h day, 8 h night gap).
   - **Night gaps:** in `OFFLINE=1`, each night gap runs as one `E.simulate(s, 8 * 3600, { dtMin: 0.5 })`.
4. **Check-in actions** (spec §13, in order):
   1. If `pendingConfirm`, call `E.goInfinite(s)`.
   2. Scripted list purchases: repeatedly buy the next list item while affordable. Items are upgrade ids, `'G1'`, `'G2'`, and after `21;1`: `'stars'`.
   3. Otherwise buy the cheapest generator costing ≤ 10% of IP.
   4. Stars: buy SD upgrades in the order 1, 3, 2, 4 while affordable, then Star / Base / Exp, cheapest first.
   5. Challenge gating per spec §13.3. Abandon after 8 h and retry after 4 check-ins. After Break, re-run each IC once per day at the day's first check-in.
   6. Break: set broken, turn on auto-infinity with `minIpLog` = the IP gain the previous run reached at the moment its IP-per-minute peaked (track `ipGainLog(s)/max(1, inf.t)` every 10 game-seconds).
5. **Macro-steps.** Exactly as spec §13 strategy 2.
   - Track the last 5 Infinities `{ runTime, ipGainLog, infGain }` since the last purchase.
   - When they qualify, compute `k`, apply with `E.logAdd` (repeat-sum via `log10(k) + ipGainLog`), and update `stats.lastInfinities` (append up to 10 synthetic entries), `fastestInfinity`, `infinities` and `totalIpLog`.
   - Advance `t` by `k·runTime`.
   - The drift check recomputes `E.ipGainLog` and `E.genMultLog(s, 0)` on a cloned state (`E.deserialize(E.serialize(s))`) with `infinities += k·infGain`, halving `k` until both change by < 5% (in linear terms, `|Δlog| < log10(1.05)`).
   - Count macro-steps.
6. **Milestones.** Record every §12.2 row: 1st Infinity; runs 2, 3 and 11; the Infinity index when the 4 automations are owned; 7;1 at t∞; each IC attempt duration; Break; the first time IP ≥ 1e6; the first Star; the finale. Print a table of name, game time, t∞, day, target, floor, and PASS/FAIL, plus the IC attempts table, the macro-step count and wall time per phase (A: start→7;1, B: →Break, C: →finale).
7. **Snapshots.** On reaching 7;1, Break and the first Star, write `.sim/phaseB-start.json`, `.sim/phaseC-start.json` and `.sim/stars-start.json` as `{ t, tInf1, save: E.serialize(s) }`, creating `.sim/` if needed. `FROM=phaseB-start` (and so on) loads that file and continues.
8. **CHECK=1.**
   - Exit code 1 if any row FAILs or wall time exceeds 300 s.
   - Then re-run the Phase B window from `.sim/phaseB-start.json` with `NOSKIP=1` and compare the Break time: a difference > 10% FAILs.
   - `OFFLINE=1` compares against a stored stepped run in the same invocation: run stepped first, then offline, and FAIL if any milestone differs by > 15%.

- [ ] **Step 1: Implement** behaviours 1–8. The file stays CommonJS, `'use strict'`, with no dependencies.
- [ ] **Step 2: Smoke test.** `MODE=layer DAYS=1 QUIET=1 node test/sim.js`. Expected:
  - It prints a milestone table with the 1st Infinity at about 3h22m and later rows either filled or `-`.
  - The final line starts with `SUMMARY ` followed by JSON.
  - Wall time is < 60 s.
- [ ] **Step 3: Regression.** `node test/sim.js` (MODE=first). Expected: the output format is unchanged and Infinity lands within ±10% of 3h22m.
- [ ] **Step 4: Snapshot.** `ls .sim/` after a `DAYS=2` run. Expected: `phaseB-start.json` exists if 7;1 was reached, and `git status` does not show `.sim/`.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "test(sim): idle-profile Infinity layer campaign with macro-steps and snapshots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 14: Pacing calibration

**Model:** opus · **Depends on:** 13

**Files:**
- Modify: `src/engine-infinity.js` (TUNE values only), the spec at `docs/superpowers/specs/2026-09-24-infinity-layer-design.md` (§11 values, new §12.4 "Calibration results" and a "Deviations" list), and `test/infinity.test.js` (only tests that hard-code a tuned constant, which should read `E.TUNE` instead)

**Interfaces:**
- Consumes: the sim.
- Produces: TUNE values that pass `CHECK=1`.

- [ ] **Step 1: Baseline.** `MODE=layer CHECK=1 node test/sim.js | tee .sim/baseline.txt`. Record which §12.2 rows fail.
- [ ] **Step 2: Calibrate phase by phase** using the lever table in spec §12.3, preferred levers first:
  - Phase A: runs 2–11 and 7;1.
  - Phase B: `FROM=phaseB-start`.
  - Break → Star: `FROM=phaseC-start`.
  - Star → finale: `FROM=stars-start`.

  After each change, re-run the affected phase from its snapshot. Once a phase passes, re-run from the new game so the downstream snapshots are regenerated. Change wiki [W] values only after the [R] levers are exhausted, and add each such change to the spec's Deviations list with the reason.
- [ ] **Step 3: Full check.** `MODE=layer CHECK=1 node test/sim.js`. Expected: exit code 0, all rows PASS, wall ≤ 300 s, and the NOSKIP comparison within ±10%.
- [ ] **Step 4: Offline honesty.** `MODE=layer OFFLINE=1 CHECK=1 node test/sim.js`. Expected: exit 0 (milestones within ±15%).
- [ ] **Step 5: Regression.** `node test/sim.js` shows the 1st Infinity at 3h22m ±10%, and `npm test` passes.
- [ ] **Step 6: Document.** Update spec §11 defaults to the tuned values. Add §12.4 with the final milestone table (game time, t∞, day). List any Deviations.
- [ ] **Step 7: Build and commit.** `node build.mjs && git add -A && git commit -m "tune: calibrate Infinity layer to mostly-idle 1-2 week pacing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Task 15: Final integration

**Model:** sonnet · **Depends on:** 12, 14

**Files:**
- Modify: `test/infinity.test.js` (tooltip-key test), `README.md`
- Regenerate: `index.html`, `dist/artifact.html`

- [ ] **Step 1: Write the tooltip-key test.** Append:
  ```js
  test('every data-tip key has TIPS copy that renders on fresh and late states', () => {
    const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');
    const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
    const win = { Engine: E, innerWidth: 400, innerHeight: 800, addEventListener() {} };
    win.window = win;
    const ctx = vm.createContext({ window: win, document: noop, localStorage: noop, navigator: noop, console, setTimeout, clearTimeout });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/help.js'), 'utf-8'), ctx);
    const TIPS = win.Help.TIPS; assert.ok(TIPS, 'Help.TIPS exported');
    const keys = new Set();
    for (const f of ['ui.js', 'ui-infinity.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../src', f), 'utf-8');
      for (const m of src.matchAll(/'data-tip':\s*'([A-Za-z0-9]+)'/g)) keys.add(m[1]);
    }
    for (const k of ['ipHeader', 'iuCard', 'genRow', 'autoPrestige', 'icCard', 'breakToggle', 'starBuy', 'sdUpg']) assert.ok(keys.has(k), `ui uses ${k}`);
    const late = E.newState(); late.infinities = 400; late.inf.ipLog = 40;
    E.UPGRADES.forEach((u) => { late.inf.upg[u.id] = true; });
    late.inf.ic.done = Array(9).fill(true); late.inf.ic.best = Array(9).fill(600); late.inf.stars.n = 1;
    const sampleI = { iuCard: 5, genRow: 0, genBuy: 1, sdUpg: 2, icCard: 4, icStart: 4 };
    for (const k of keys) {
      assert.ok(k in TIPS, `TIPS missing ${k}`);
      for (const s of [E.newState(), late]) {
        const v = TIPS[k]; const txt = typeof v === 'function' ? v(s, k in sampleI ? sampleI[k] : 0) : v;
        assert.equal(typeof txt, 'string'); assert.ok(txt.length > 0, `${k} empty`);
      }
    }
  });
  ```
- [ ] **Step 2: Run** `npm test`. Expected: PASS. If a key is missing, add its TIPS entry using the spec §10.4 copy, then re-run.
- [ ] **Step 3: Placeholder scan.** `grep -rn "Coming in Task\|TODO\|TBD" src/`. Expected: no output.
- [ ] **Step 4: README.** Add an "Infinity layer" paragraph (IP, tree, generators, automation, challenges, Break, Stars). Add rows for `src/engine-infinity.js`, `src/engine-auto.js` and `src/ui-infinity.js` to the table, and document `npm run sim:layer` and the `CHECK`, `FROM`, `NOSKIP` and `OFFLINE` flags.
- [ ] **Step 5: Full verification.**
  - `npm test` passes.
  - `node test/sim.js` shows the 1st Infinity at 3h22m ±10%.
  - `MODE=layer CHECK=1 node test/sim.js` exits 0.
  - `node build.mjs` succeeds.
  - Browser, one pass at 400×860:
    - A fresh game shows the intro.
    - A v1 save loads through Import: `loadSave(btoa(JSON.stringify({ v: 1, scoreLog: '-inf', circles: Engine.newState().circles, pMult: 1, pExp: 1, prestigeReqLog: 10, promo: [0,0,0,0], ip: 1, infinities: 1, stats: { totalLaps: 0, prestiges: 0, promotions: 0, playTime: 0, bestScoreLog: '-inf' }, savedAt: 0 })))`. The ∞ tab appears with IP 1.
    - Buying 1;1 unlocks Gens and Auto.
    - Export then Import round-trips.
    - No console errors.
- [ ] **Step 6: Commit.** `node build.mjs && git add -A && git commit -m "chore: Infinity layer integration, tooltip coverage test, README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

## Self-review record

- **Coverage (spec → task):**

  | Spec section | Task(s) |
  |---|---|
  | §2.1 (4, 8), §2.2–2.4 | 4 |
  | §3 | 3, plus contributors in 5, 6, 8, 9 |
  | §4 | 6 |
  | §5 | 5 |
  | §6 | 7 |
  | §7 | 9 |
  | §8 | 8 |
  | §9.1 | 10 |
  | §9.2–9.3 | 2 |
  | §9.4 | Shared API |
  | §10.1–10.3 | 11, 12 |
  | §10.4 | 11, 12, 15 |
  | §11 | 4–10, 14 |
  | §12 | 14 |
  | §13 | 13 |
  | §14 | 2–10, 15 |

- **Names:**
  - The contributor lists `I.MOD_FNS`, `I.IP_FNS`, `I.PRE_FNS`, `I.GEN_FNS` and `I.GPEXP_FNS`, and the hook `I.starGpLog`, are created in Tasks 4–5 and used in Tasks 6, 8 and 9.
  - The hooks `mods`, `preTick`, `auto`, `postTick` and `stepDt` are defined in Task 3 and registered in Tasks 4, 7 and 10.
  - Every export named in the Shared API is produced by exactly one task.
- **Ordering hazards checked:**
  - `resetForChallenge` exists in Task 4 before challenges use it in Task 8.
  - `sdU` fields exist from Task 2, so Tasks 4–6 can read them before Stars exist.
  - The legacy `goInfinite` is removed in Task 4, after Task 2 had kept it working.
  - Task 11's temporary "Coming in Task 12" bodies are removed in Task 12 and scanned for in Task 15.

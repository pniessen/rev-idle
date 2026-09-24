# Player Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the objective and the next action obvious to new players: objective + journey strip, next-goal card, first-minutes coach-mark tutorial, full ? guide, unlock explainer cards, target highlights.

**Architecture:** Three new files. `src/guide-goals.js` — pure goal/stage logic (no DOM), loadable in Node (`module.exports`) and browser (`window.GuideGoals`). `src/guide-content.js` — all guidance copy as data (`window.GuideContent`, also `module.exports`). `src/guide.js` — DOM layer (`window.Guide`): goal card, journey strip, coach marks, ? guide panel, unlock cards, highlights; wired from `ui.js` and `help.js`. `build.mjs`/`template.html` gain markers `/*@GUIDE_GOALS*/`, `/*@GUIDE_CONTENT*/`, `/*@GUIDE*/` loaded after `/*@HELP*/` and before `/*@UI_INF*/`.

**Tech Stack:** Vanilla ES5-style JS in IIFEs (match existing files), Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-24-player-guidance-design.md`

## Global Constraints
- Engine files (`src/engine*.js`) are NOT modified. Save format unchanged. All thresholds read from `Engine`/`Engine.TUNE` at runtime.
- No `innerHTML` with dynamic data; build DOM with the existing `el()` pattern and text nodes.
- `localStorage` only via try/catch; key `revidle.guide.v1` = `{ done: {id:true}, collapsed: bool, enabled: bool, cardsSeen: {key:true} }`; everything works without storage.
- Reuse CSS tokens and fonts from `src/styles.css`; no new palette/fonts. Works at 400 px and 375 px, no horizontal page scroll, touch targets ≥ 40 px, visible focus, `prefers-reduced-motion` respected.
- No `alert/confirm/prompt`. Never show a guidance modal over another modal or during offline catch-up.
- `node build.mjs` after src changes; commit `index.html`, `dist/artifact.html` with them. `npm test` stays green (incl. the tooltip-coverage test). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Shared contract

```js
// src/guide-goals.js  (pure)
GuideGoals.GOALS  // ordered array per spec §5: { id, stage, coach: bool, ack: bool,
                  //   done(s) -> bool (ack goals: () => false),
                  //   progress(s) -> null | { cur: number, max: number, log: bool },
                  //   target: { sel: string, tab: string|null } }
GuideGoals.STAGES // ['revolution','prestige','promotions','infinity','challenges','break','stars','finale']
GuideGoals.stageReached(s, stageId) -> bool         // spec §1 predicates
GuideGoals.currentStage(s) -> stageId               // last reached stage
GuideGoals.sync(s, doneMap) -> doneMap              // returns NEW map: marks every goal whose done(s) is true
                                                    // AND every goal before it (sticky, monotone); never unmarks
GuideGoals.current(doneMap) -> goal | null          // first goal not in doneMap; null when all done
GuideGoals.ack(id, doneMap) -> doneMap              // marks an ack goal (and all before it) done
// src/guide-content.js (data)
GuideContent.objective   // { title, body }  body may contain '{INF}' placeholder → fmtLog(INFINITY_LOG)
GuideContent.stages      // { [stageId]: { name, blurb } }
GuideContent.goals       // { [goalId]: { title, why, coach?: string } }  titles may contain {TOKENS} (see Task 2)
GuideContent.sections    // [{ id, title, unlock: goalId|null, body: string[], todo: string[] }]
GuideContent.cards       // { [seenKey]: { title, what, why, todo, goal: goalId } }
GuideContent.glossary    // [{ term, def }]
GuideContent.fill(str, s) -> string   // replaces {TOKENS} with live Engine values
// src/guide.js (DOM)
Guide.init(hooks)   // hooks: { el, toast, isModalOpen, showModal, hideModal, getState, setTab, isCatchingUp }
Guide.tick(state)   // called from ui.js domUpdate (10 Hz): sync goals, update card, re-apply highlight, run coach
Guide.showIntro()   // replaces Help.showIntro (objective + journey + 4 beats + start tutorial)
Guide.openGuide(sectionId?)
Guide.unlock(seenKey)  // called by Help.onTick instead of toast
Guide.restartTutorial()
```

---

### Task 1: Goal logic (`src/guide-goals.js`) + tests
**Model:** sonnet · **Depends on:** — · **Files:** create `src/guide-goals.js`, `test/guide.test.js`

Implement GOALS exactly per spec §5 (23 goals, same ids and order, `stage` per the journey: goals 1–7 revolution, 8–10 prestige, 11–13 promotions, 14–17 infinity, 18–20 challenges, 21 break, 22 stars, 23 finale). Use only public Engine functions/state (e.g. `Engine.canPrestige`, `Engine.promoXp`, `Engine.hasUpg`, `Engine.icDoneCount`, `Engine.levelCap`, `Engine.INFINITY_LOG`, `Engine.TUNE`). Progress for log goals uses log10 values (`cur`/`max` in log space, `log: true`). Target selectors must match existing DOM (read `src/ui.js`, `src/ui-infinity.js`; add stable `data-guide="…"` attributes in Task 3 if needed — in this task, define selectors as `[data-guide="<name>"]` and list the names in a comment for Task 3).

- [ ] Step 1: write `test/guide.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const G = require('../src/guide-goals.js');

test('23 goals in spec order, unique ids', () => {
  const ids = G.GOALS.map(g => g.id);
  assert.deepEqual(ids, ['buyRed','readMult','unlockOrange','buyOrange','buyModes','unlockGreen','ascendRed',
    'reachPrestige','prestige','unlockWhite','reachPromote','promote','promoteAll','infinity','buyGens','buyG2',
    'automate','unlockIC','firstIC','allIC','breakInf','stars','finale']);
  assert.equal(new Set(ids).size, 23);
});
test('fresh state: current goal is buyRed; coach flags', () => {
  const s = E.newState();
  const d = G.sync(s, {});
  assert.equal(G.current(d).id, 'buyRed');
  assert.ok(G.GOALS.find(g => g.id === 'buyRed').coach);
  assert.ok(G.GOALS.find(g => g.id === 'readMult').ack);
});
test('ack goal blocks until acknowledged', () => {
  const s = E.newState(); s.scoreLog = 3; E.buy(s, 0, 1);
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'readMult');
  d = G.ack('readMult', d);
  assert.equal(G.current(d).id, 'unlockOrange');
});
test('sticky: later goal done marks earlier goals, reset never regresses', () => {
  const s = E.newState(); s.stats.prestiges = 1;
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'unlockWhite');
  const fresh = E.newState();
  d = G.sync(fresh, d);
  assert.equal(G.current(d).id, 'unlockWhite');
});
test('advanced save skips ahead; all done → null', () => {
  const s = E.newState(); s.infinities = 3; s.inf.upg['1;1'] = true;
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'buyG2');
  s.inf.ipLog = E.INFINITY_LOG;
  d = G.sync(s, d);
  assert.equal(G.current(d), null);
});
test('progress shapes', () => {
  const s = E.newState();
  const p = G.GOALS.find(g => g.id === 'unlockOrange').progress(s);
  assert.deepEqual(p, { cur: 0, max: 5, log: false });
  s.scoreLog = 5;
  const q = G.GOALS.find(g => g.id === 'reachPrestige').progress(s);
  assert.ok(q.log && q.cur === 5 && q.max === E.TUNE.prestigeMinLog);
});
test('stages', () => {
  const s = E.newState();
  assert.equal(G.currentStage(s), 'revolution');
  s.stats.prestiges = 1; assert.equal(G.currentStage(s), 'prestige');
  s.infinities = 1; assert.equal(G.currentStage(s), 'infinity');
  assert.deepEqual(G.STAGES, ['revolution','prestige','promotions','infinity','challenges','break','stars','finale']);
});
test('sync returns a new map and never unmarks', () => {
  const d0 = { buyRed: true };
  const d1 = G.sync(E.newState(), d0);
  assert.notEqual(d1, d0);
  assert.ok(d1.buyRed);
});
```
- [ ] Step 2: `npm test` → new tests FAIL (module missing).
- [ ] Step 3: implement `src/guide-goals.js` (IIFE; `const Engine = typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine;` at call time for browser; export via `module.exports` or `window.GuideGoals`). `unlockOrange.progress` = `{cur: min(5, circles[0].bought), max: 5, log: false}`; after unlock done anyway.
- [ ] Step 4: `npm test` → all pass. Commit `feat(guide): goal and stage logic`.

### Task 2: Guidance copy (`src/guide-content.js`) + content test
**Model:** opus (clarity is the point) · **Depends on:** — (parallel with Task 1; different files) · **Files:** create `src/guide-content.js`, add tests to `test/guide-content.test.js`

Write all copy per spec §1, §5, §6, §7 as data. Read `src/engine*.js`, `src/help.js` (existing TIPS copy and unlock toasts), `docs/superpowers/specs/*` to be accurate. Voice: plain, second person, short sentences, no unexplained jargon (every game term used appears in the glossary). Numbers only via `{TOKENS}` filled by `GuideContent.fill(str, s)` from Engine at runtime — supported tokens: `{INF}` (fmtLog(INFINITY_LOG)), `{PRESTIGE_MIN}` (fmtLog(TUNE.prestigeMinLog)), `{PROMO_MIN}` (TUNE.promoMin formatted), `{ASC_POWER}` (promoEffects(s).p3 formatted), `{CAP}` (Red level cap), `{UNLOCK_AT}` (5). Each goal: title ≤ 50 chars, why ≤ 110 chars, coach text ≤ 160 chars for coach goals. Sections: objective, circles, mults, buying, ascension, prestige, promotions, infinity, generators, automation, challenges, break, stars, finale, glossary-intro, tips — each with 1–4 short paragraphs and a 2–4 item "What to do" list; `unlock` = the goal id at which the section first matters (objective/circles/mults/buying/tips: null). Cards for the 10 seen keys (spec §7). The "mults" section must explain the score formula concretely (score per lap = (product of ring multipliers × P.Mult) ^ exponent; income = score per lap × laps per second).

- [ ] Step 1: write `test/guide-content.test.js` asserting: every `GuideGoals`-spec goal id (list in Task 1 test) has `goals[id].title` and `.why` non-empty and within length limits; coach goals (buyRed, readMult, unlockOrange, buyOrange, buyModes) have `.coach`; every section id listed above exists with non-empty body and todo; every section `unlock` is null or a valid goal id; `cards` has exactly the 10 keys ascendSeen, prestigeSeen, promoSeen, infinitySeen, infTabSeen, gensSeen, autoSeen, icSeen, breakSeen, starsSeen, each with title/what/why/todo and a valid `goal`; `fill` replaces every token used anywhere in the content (scan all strings for `\{[A-Z_]+\}` and assert fill(str, E.newState()) contains no `{`); glossary covers at least: lap, score, multiplier, P.Mult, exponent, ascension, prestige, promotion, Infinity, IP, generator, GP, challenge, Break, Star, Stardust.
- [ ] Step 2: RED. Step 3: write content. Step 4: GREEN. Commit `feat(guide): guidance copy`.

### Task 3: Guidance UI (`src/guide.js`) + wiring
**Model:** sonnet · **Depends on:** 1, 2 · **Files:** create `src/guide.js`; modify `src/ui.js`, `src/help.js`, `src/ui-infinity.js` (data-guide attrs only), `src/styles.css`, `src/template.html`, `build.mjs`

Behaviour (spec §1–§8):
1. Markers `/*@GUIDE_GOALS*/`, `/*@GUIDE_CONTENT*/`, `/*@GUIDE*/` after HELP, before UI_INF (both outputs); build throws if missing.
2. Add `data-guide` attributes to the target elements named in `guide-goals.js`.
3. Next-goal card docked under the score box (desktop) / between canvas and panel (< 820 px): title (filled), progress bar + text (log goals show `fmtLog(cur)` / `fmtLog(max)`), why, "Show me", "Learn more", collapse chevron (collapsed = one line with title + %). Completion → toast "Goal complete: …" and slide-in of next. All goals done → closing message.
4. Highlight: `guide-pulse` class on the current goal's resolved target(s); re-resolved every tick; removed when target changes. "Show me" switches tab via `hooks.setTab`, scrolls target into view, pulses stronger for 3 s.
5. Coach marks for `coach` goals when fresh player (no save at boot) or after "Restart tutorial": dim overlay with cut-out around target (box-shadow spotlight technique), popover with coach text and "Next" (ack goals) / hint "Do it to continue" (action goals), "Skip tutorial". Never while a modal is open or during catch-up. Escape hides the spotlight for the current step.
6. `Guide.showIntro()` replaces the old intro: objective (filled), journey strip, the existing four beats, buttons "Start tutorial" (primary) and "Skip". `Help.showIntro` delegates to it; ? / H opens the **guide** (`Guide.openGuide()`), and the guide has a "Replay intro" link.
7. ? guide: modal on < 820 px, right side sheet on desktop; TOC; sections from GuideContent; locked sections (unlock goal not done) show "Unlocks when: <goal title>"; objective + journey strip at top; glossary; deep links from goal card and cards.
8. Unlock cards: `Help.onTick` calls `Guide.unlock(key)` instead of toasts when guidance is enabled (fallback to the old toast text when disabled). Queue; show when no modal and not catching up; "Show me" (closes card, highlights goal target), "Got it". Multiple queued at once after catch-up → one card listing them.
9. Settings: "Show guidance" toggle and "Restart tutorial" button.
10. Journey strip component reused in intro, guide top, and expanded goal card.
11. Keyboard: all controls focusable; Escape closes guide/card/spotlight; shortcuts don't fire while guide is open.

- [ ] Implement; `npm test` green; `node build.mjs`.
- [ ] Browser check (server `python3 -m http.server 8765` from the worktree, stop after): fresh profile → intro shows objective + journey → Start tutorial walks buyRed → readMult → unlockOrange → buyOrange → buyModes with spotlight on the right elements; goal card progresses (unlockGreen → ascendRed shows level/cap); ? guide opens with locked sections; a crafted mid-game save (via Settings Import) shows the right current goal and an unlock card; 400 px and 375 px no horizontal scroll; guidance toggle off hides it all; no console errors.
- [ ] Commit `feat(guide): goal card, tutorial, guide, unlock cards, highlights` (+ generated outputs).

### Task 4: Integration and ship (controller)
- [ ] Final review (opus) over the branch; one fix wave if needed.
- [ ] Merge to main, push, wait for Pages, verify live.

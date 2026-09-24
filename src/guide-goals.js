// src/guide-goals.js — pure goal/stage engine for the player-guidance
// feature (spec 2026-09-24-player-guidance-design.md §1, §5). No DOM, no
// timers; reads only public Engine functions/state. UMD-ish like engine.js:
// module.exports in Node, window.GuideGoals in browser.
//
// Target selectors are defined here as `[data-guide="<name>"]`; Task 3 adds
// the matching `data-guide` attribute to the DOM in src/ui.js /
// src/ui-infinity.js. Full list of names used below (add all of these):
//   red-buy         Red row's Buy button (circles tab) — goals buyRed, unlockOrange
//   multbar-red     Red chip in the multbar — goal readMult
//   orange-buy      Orange row's Buy button (circles tab) — goal buyOrange
//   buy-mode-toggle The 1/10/max buy-mode toggle (circles tab) — goal buyModes
//   next-locked-row The next locked circle row (circles tab) — goals unlockGreen, unlockWhite
//   red-ascend      Red row's Ascend button (circles tab) — goal ascendRed
//   score-box       The score display — goals reachPrestige, infinity
//   prestige-button The Prestige action button (prestige tab) — goal prestige
//   p-chip          The P.Mult chip in the multbar — goal reachPromote
//   promote-card    A Promotion card (promote tab) — goal promote
//   promote-tab     The Promote tab button — goal promoteAll
//   inf-tree        The Infinity Upgrade tree (infinity tab, Tree sub-tab) — goals buyGens, automate, unlockIC
//   inf-gens        The Generators list (infinity tab, Gens sub-tab) — goal buyG2
//   inf-ics         The Infinity Challenges list (infinity tab, ICs sub-tab) — goals firstIC, allIC
//   inf-break       The Break Infinity card (infinity tab, ICs sub-tab) — goal breakInf
//   inf-stars       The Stars panel (infinity tab, Stars sub-tab) — goal stars
//   inf-header      The Infinity header (IP / infinity count) (infinity tab) — goal finale

const GuideGoals = (() => {
  // Resolved per call (not captured at script load) so the browser build
  // picks up window.Engine even if guide-goals.js's <script> tag runs before
  // ui.js sets it up; Node tests still get the CommonJS module.
  function E() {
    return (typeof window !== 'undefined' && window.Engine) ? window.Engine : require('./engine.js');
  }

  const STAGES = [
    'revolution', 'prestige', 'promotions', 'infinity',
    'challenges', 'break', 'stars', 'finale',
  ];

  function target(sel, tab) {
    return { sel: '[data-guide="' + sel + '"]', tab: tab || null };
  }

  function unlockedCount(s, upTo) {
    let n = 0;
    for (let i = 0; i < s.circles.length && (upTo == null || i < upTo); i++) {
      if (s.circles[i].unlocked) n++;
    }
    return n;
  }

  const GOALS = [
    {
      id: 'buyRed', stage: 'revolution', coach: true, ack: false,
      done: (s) => s.circles[0].bought >= 1,
      progress: (s) => ({ cur: Math.min(1, s.circles[0].bought), max: 1, log: false }),
      target: target('red-buy', 'circles'),
    },
    {
      id: 'readMult', stage: 'revolution', coach: true, ack: true,
      done: () => false,
      progress: () => null,
      target: target('multbar-red', null),
    },
    {
      id: 'unlockOrange', stage: 'revolution', coach: true, ack: false,
      done: (s) => s.circles[1].unlocked,
      progress: (s) => ({ cur: Math.min(5, s.circles[0].bought), max: 5, log: false }),
      target: target('red-buy', 'circles'),
    },
    {
      id: 'buyOrange', stage: 'revolution', coach: true, ack: false,
      done: (s) => s.circles[1].level >= 1,
      progress: () => null,
      target: target('orange-buy', 'circles'),
    },
    {
      id: 'buyModes', stage: 'revolution', coach: true, ack: true,
      done: () => false,
      progress: () => null,
      target: target('buy-mode-toggle', 'circles'),
    },
    {
      id: 'unlockGreen', stage: 'revolution', coach: false, ack: false,
      done: (s) => s.circles[3].unlocked,
      progress: (s) => ({ cur: unlockedCount(s, 4), max: 4, log: false }),
      target: target('next-locked-row', 'circles'),
    },
    {
      id: 'ascendRed', stage: 'revolution', coach: false, ack: false,
      done: (s) => s.circles.some((c) => c.ascensions >= 1),
      progress: (s) => ({ cur: s.circles[0].level, max: E().levelCap(s.circles[0]), log: false }),
      target: target('red-ascend', 'circles'),
    },
    {
      id: 'reachPrestige', stage: 'prestige', coach: false, ack: false,
      done: (s) => E().canPrestige(s) || s.stats.prestiges >= 1,
      progress: (s) => ({ cur: s.scoreLog, max: E().TUNE.prestigeMinLog, log: true }),
      target: target('score-box', null),
    },
    {
      id: 'prestige', stage: 'prestige', coach: false, ack: false,
      done: (s) => s.stats.prestiges >= 1,
      progress: () => null,
      target: target('prestige-button', 'prestige'),
    },
    {
      id: 'unlockWhite', stage: 'prestige', coach: false, ack: false,
      done: (s) => s.circles[9].unlocked || s.stats.promotions >= 1,
      progress: (s) => ({ cur: unlockedCount(s), max: 10, log: false }),
      target: target('next-locked-row', 'circles'),
    },
    {
      id: 'reachPromote', stage: 'promotions', coach: false, ack: false,
      done: (s) => E().promoXp(s) > 0 || s.stats.promotions >= 1,
      progress: (s) => ({
        cur: Math.log10(Math.max(1, s.pMult)),
        max: Math.log10(E().TUNE.promoMin),
        log: true,
      }),
      target: target('p-chip', null),
    },
    {
      id: 'promote', stage: 'promotions', coach: false, ack: false,
      done: (s) => s.stats.promotions >= 1,
      progress: () => null,
      target: target('promote-card', 'promote'),
    },
    {
      id: 'promoteAll', stage: 'promotions', coach: false, ack: false,
      done: (s) => s.promo.every((p) => p >= 1),
      progress: (s) => ({ cur: s.promo.filter((p) => p >= 1).length, max: 4, log: false }),
      target: target('promote-tab', 'promote'),
    },
    {
      id: 'infinity', stage: 'infinity', coach: false, ack: false,
      done: (s) => s.infinities >= 1,
      progress: (s) => ({ cur: s.scoreLog, max: E().INFINITY_LOG, log: true }),
      target: target('score-box', null),
    },
    {
      id: 'buyGens', stage: 'infinity', coach: false, ack: false,
      done: (s) => E().hasUpg(s, '1;1'),
      progress: () => null,
      target: target('inf-tree', 'infinity'),
    },
    {
      id: 'buyG2', stage: 'infinity', coach: false, ack: false,
      done: (s) => s.inf.gens[1].b >= 1,
      progress: () => null,
      target: target('inf-gens', 'infinity'),
    },
    {
      id: 'automate', stage: 'infinity', coach: false, ack: false,
      done: (s) => ['1;1', '2;2', '3;2', '5;3'].every((id) => E().hasUpg(s, id)),
      progress: (s) => ({
        cur: ['1;1', '2;2', '3;2', '5;3'].filter((id) => E().hasUpg(s, id)).length,
        max: 4,
        log: false,
      }),
      target: target('inf-tree', 'infinity'),
    },
    {
      id: 'unlockIC', stage: 'challenges', coach: false, ack: false,
      done: (s) => E().hasUpg(s, '7;1'),
      progress: () => null,
      target: target('inf-tree', 'infinity'),
    },
    {
      id: 'firstIC', stage: 'challenges', coach: false, ack: false,
      done: (s) => E().icDoneCount(s) >= 1,
      progress: () => null,
      target: target('inf-ics', 'infinity'),
    },
    {
      id: 'allIC', stage: 'challenges', coach: false, ack: false,
      done: (s) => E().icDoneCount(s) === 9,
      progress: (s) => ({ cur: E().icDoneCount(s), max: 9, log: false }),
      target: target('inf-ics', 'infinity'),
    },
    {
      id: 'breakInf', stage: 'break', coach: false, ack: false,
      done: (s) => s.inf.broken,
      progress: () => null,
      target: target('inf-break', 'infinity'),
    },
    {
      id: 'stars', stage: 'stars', coach: false, ack: false,
      done: (s) => s.inf.stars.n >= 1,
      progress: () => null,
      target: target('inf-stars', 'infinity'),
    },
    {
      id: 'finale', stage: 'finale', coach: false, ack: false,
      done: (s) => s.inf.ipLog >= E().INFINITY_LOG,
      progress: (s) => ({ cur: s.inf.ipLog, max: E().INFINITY_LOG, log: true }),
      target: target('inf-header', 'infinity'),
    },
  ];

  // spec §1 stage-reached predicates
  const STAGE_PREDICATES = {
    revolution: () => true,
    prestige: (s) => s.stats.prestiges >= 1 || E().canPrestige(s),
    promotions: (s) => s.stats.promotions >= 1 || E().promoXp(s) > 0,
    infinity: (s) => s.infinities >= 1,
    challenges: (s) => E().hasUpg(s, '7;1'),
    break: (s) => s.inf.broken || E().canBreak(s),
    stars: (s) => E().hasUpg(s, '21;1'),
    finale: (s) => s.inf.ipLog >= E().INFINITY_LOG,
  };

  function stageReached(s, stageId) {
    const pred = STAGE_PREDICATES[stageId];
    return !!pred && pred(s);
  }

  function currentStage(s) {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (stageReached(s, STAGES[i])) return STAGES[i];
    }
    return STAGES[0];
  }

  // Marks a goal and every earlier goal complete once `done(s)` is true for
  // it (sticky, monotone: resets never regress, advanced saves skip ahead).
  // Never unmarks anything already true in `doneMap`; always returns a NEW
  // map.
  function sync(s, doneMap) {
    const result = Object.assign({}, doneMap);
    let mark = false;
    for (let i = GOALS.length - 1; i >= 0; i--) {
      const g = GOALS[i];
      if (g.done(s)) mark = true;
      if (mark) result[g.id] = true;
    }
    return result;
  }

  function current(doneMap) {
    for (let i = 0; i < GOALS.length; i++) {
      if (!doneMap[GOALS[i].id]) return GOALS[i];
    }
    return null;
  }

  // Marks an ack goal (and every earlier goal) complete. Returns a NEW map.
  function ack(id, doneMap) {
    const idx = GOALS.findIndex((g) => g.id === id);
    const result = Object.assign({}, doneMap);
    for (let i = 0; i <= idx; i++) result[GOALS[i].id] = true;
    return result;
  }

  return { GOALS, STAGES, stageReached, currentStage, sync, current, ack };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GuideGoals;
} else {
  window.GuideGoals = GuideGoals;
}

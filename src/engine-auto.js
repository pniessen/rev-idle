// src/engine-auto.js — automation (autobuy, auto-ascend, auto-promote, auto-prestige, auto-infinity) and adaptive step size. Pure.
(function (E) {
  'use strict';

  Object.assign(E.TUNE, { autoBuyMaxPerStep: 500, autoStepMaxIter: 200, dtRunDiv: 50, dtMin: 0.1, dtMax: 2, dtFixed: 1 });

  function autoUnlocked(s) {
    return {
      buy: E.hasUpg(s, '1;1'),
      asc: E.hasUpg(s, '2;2'),
      promote: E.hasUpg(s, '3;2'),
      prestige: E.hasUpg(s, '5;3'),
      infinity: E.hasUpg(s, '15;1'),
    };
  }

  function anyAutoOn(s) {
    const u = autoUnlocked(s);
    const a = s.inf.auto;
    return (u.buy && a.buy.on) || (u.asc && a.asc.on) || (u.promote && a.promote.on)
      || (u.prestige && a.prestige.on) || (u.infinity && a.infinity.on);
  }

  function updateStall(s) {
    const rt = s.inf.rt;
    if (s.scoreLog >= rt.markLog + 1 || s.scoreLog < rt.markLog) {
      rt.markLog = s.scoreLog;
      rt.markT = s.inf.tRun;
    }
  }

  function isStalled(s) {
    const auto = s.inf.auto;
    return auto.stallSec > 0 && s.inf.tRun - s.inf.rt.markT > auto.stallSec;
  }

  // costLog(s, i) is O(ascensions) (it re-sums the whole cost curve from
  // scratch). autoStep can call into buy/ascend logic many times per tick
  // (chained ascend->buy->ascend cycles, or several outer iterations when a
  // large adaptive dt affords multiple promotions/prestiges), and recaching
  // all 10 circles' costs from scratch on every one of those calls used to
  // dominate the offline-simulate budget. `cache` is created once per
  // autoStep() call (see below) and reused across every ascend/buy call
  // within it: only the circle that actually changed (ascended, bought a
  // level, or was newly unlocked) gets its entry refreshed. It's discarded
  // and rebuilt from scratch only when s.circles itself was replaced
  // (promote/prestige resets the whole array via resetRun()).
  function ensureBuyCache(s, cache) {
    if (cache.circlesRef === s.circles) return;
    for (let i = 0; i < cache.cost.length; i++) refreshBuyCost(s, cache, i);
    cache.circlesRef = s.circles;
  }

  function refreshBuyCost(s, cache, i) {
    const a = s.inf.auto.buy;
    const c = s.circles[i];
    if (!a.circles[i] || !c.unlocked || c.level >= E.levelCap(c)) { cache.cost[i] = Infinity; return; }
    cache.cost[i] = E.costLog(s, i);
    cache.step[i] = Math.log10(E.CIRCLES[i].costMult + 0.1 * c.ascensions);
  }

  function autoAscend(s, u, cache) {
    const a = s.inf.auto.asc;
    if (!(u.asc && a.on)) return false;
    let did = false;
    for (let i = 0; i < s.circles.length; i++) {
      if (a.circles[i] && E.canAscend(s, i)) {
        E.ascend(s, i);
        did = true;
        if (cache.circlesRef === s.circles) refreshBuyCost(s, cache, i);
      }
    }
    return did;
  }

  // log10 of sum_{j=0}^{len-1} 10^(j*rLog), via binary doubling in log-space
  // (using the already-overflow-safe logAdd) instead of the closed-form
  // geometric-series formula, which would need 10**(rLog*len) and can
  // overflow a plain JS number long before scoreLog approaches
  // INFINITY_LOG (~308). O(log len) instead of O(len).
  function geoLen(rLog, len) {
    if (len <= 0) return -Infinity;
    if (len === 1) return 0;
    const half = len >> 1;
    const s = geoLen(rLog, half);
    let s2 = E.logAdd(s, s + half * rLog);
    if (len % 2 === 1) s2 = E.logAdd(s2, 2 * half * rLog);
    return s2;
  }

  function geoCostLog(aLog, rLog, len) {
    return len <= 0 ? -Infinity : aLog + geoLen(rLog, len);
  }

  // Largest q in [0, capRoom] with geoCostLog(aLog, rLog, q) <= budget.
  function maxAffordable(aLog, rLog, budget, capRoom) {
    if (capRoom <= 0 || aLog > budget) return 0;
    let lo = 1;
    let hi = capRoom;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (geoCostLog(aLog, rLog, mid) <= budget) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return best;
  }

  // Buys the cheapest-affordable circle up to as many levels as the current
  // score affords in one shot (a closed-form "buy max"), instead of one
  // level at a time up to autoBuyMaxPerStep times. Late-game/offline states
  // can afford hundreds of levels in a single circle before another circle
  // becomes the cheapest option; buying them one-by-one (each requiring a
  // full re-scan of all 10 circles' cached costs) used to dominate the
  // offline-simulate budget (see task-10 perf notes).
  function autoBuy(s, u, m, cache) {
    const a = s.inf.auto.buy;
    if (!(u.buy && a.on)) return false;
    ensureBuyCache(s, cache);
    const n = s.circles.length;
    const cost = cache.cost;
    const step = cache.step;
    let did = false;
    for (let k = 0; k < E.TUNE.autoBuyMaxPerStep; k++) {
      let best = -1;
      let bestCost = Infinity;
      for (let i = 0; i < n; i++) {
        if (cost[i] <= s.scoreLog && cost[i] < bestCost) {
          bestCost = cost[i];
          best = i;
        }
      }
      if (best === -1) break;
      const c = s.circles[best];
      const capRoom = E.levelCap(c) - c.level;
      const q = Math.max(1, maxAffordable(cost[best], step[best], s.scoreLog, capRoom));
      const spend = geoCostLog(cost[best], step[best], q);
      s.scoreLog = E.logSub(s.scoreLog, spend);
      c.level += q;
      c.bought += q;
      did = true;
      cost[best] = c.level < E.levelCap(c) ? cost[best] + q * step[best] : Infinity;
      if (c.bought >= 5 && best + 1 < m.maxCircles) {
        const next = s.circles[best + 1];
        if (next && !next.unlocked) {
          next.unlocked = true;
          next.level = 0;
          refreshBuyCost(s, cache, best + 1);
        }
      }
    }
    return did;
  }

  function autoPromote(s, u, m) {
    const a = s.inf.auto.promote;
    if (!(u.promote && a.on)) return false;
    if (s.inf.tRun < a.minTime) return false;
    const order = a.order.filter((k) => !m.disabledPromo.includes(k));
    if (order.length === 0) return false;
    const idx = s.stats.promotions % order.length;
    const k = order[idx];
    const xp = E.promoXp(s);
    const threshold = Math.max(1, s.promo[k] * a.xFactor, s.promo[k] + 1);
    if (xp >= threshold && E.canPromote(s, k)) {
      E.promote(s, k);
      return true;
    }
    if (isStalled(s) && !E.canPrestige(s)) {
      const n = order.length;
      for (let i = 0; i < n; i++) {
        const kk = order[(idx + i) % n];
        if (E.canPromote(s, kk)) {
          E.promote(s, kk);
          return true;
        }
      }
    }
    return false;
  }

  function autoPrestige(s, u) {
    const a = s.inf.auto.prestige;
    if (!(u.prestige && a.on)) return false;
    if (!E.canPrestige(s) || s.inf.tRun < a.minTime) return false;
    const g = E.pendingPrestige(s);
    const stalled = isStalled(s);
    const should = s.pMult === 1
      || g.pMult >= a.multX * s.pMult
      || (a.expGain > 0 && g.pExp - s.pExp >= a.expGain)
      || (stalled && (g.pMult > 1.5 * s.pMult || g.pExp > s.pExp + 0.02));
    if (!should) return false;
    E.prestige(s);
    return true;
  }

  function autoInfinity(s, u) {
    const a = s.inf.auto.infinity;
    if (!(u.infinity && a.on)) return false;
    if (E.isFixed(s)) return false;
    if (!E.canInfinity(s)) return false;
    if (E.ipGainLog(s) < a.minIpLog) return false;
    if (s.inf.t < a.minTime) return false;
    E.goInfinite(s);
    return true;
  }

  // Exhausts every currently-eligible auto action (ascend/buy/promote/
  // prestige/infinity) within a single call, looping until nothing more
  // applies (bounded by autoStepMaxIter). A large adaptive dt can accrue
  // enough score for several chained promotions/prestiges at once; without
  // this loop, coarser steps would silently throttle automation to at most
  // one promote-or-prestige per tick regardless of how much progress that
  // tick represents, making outcomes depend on step size (see task-10).
  function autoStep(s, dt) {
    updateStall(s);
    // autoUnlocked(s) only reflects owned upgrades, which never change from
    // any action this loop takes (buying circle levels, ascending,
    // promoting, prestiging, going Infinity don't grant upgrades), and
    // mods(s) is unaffected by them too (aside from IC/star state this loop
    // never touches). Both are safe to compute once per autoStep call
    // instead of once per action per iteration.
    const u = autoUnlocked(s);
    const n = s.circles.length;
    const cache = { circlesRef: null, cost: new Array(n).fill(Infinity), step: new Array(n).fill(0) };
    const actions = [];
    for (let iter = 0; iter < E.TUNE.autoStepMaxIter; iter++) {
      let did = false;
      const m = E.mods(s);
      if (autoAscend(s, u, cache)) { actions.push('ascend'); did = true; }
      if (autoBuy(s, u, m, cache)) { actions.push('buy'); did = true; }
      if (autoPromote(s, u, m)) { actions.push('promote'); did = true; continue; }
      if (autoPrestige(s, u)) { actions.push('prestige'); did = true; }
      if (autoInfinity(s, u)) { actions.push('infinity'); did = true; }
      if (!did) break;
    }
    return { actions };
  }

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  function adaptiveDt(s, opts) {
    opts = opts || {};
    if (!anyAutoOn(s)) return E.TUNE.dtFixed;
    return clamp(s.inf.tRun / E.TUNE.dtRunDiv, opts.dtMin ?? E.TUNE.dtMin, opts.dtMax ?? E.TUNE.dtMax);
  }

  E.registerHooks({ auto: autoStep, stepDt: adaptiveDt });
  Object.assign(E, { autoUnlocked, anyAutoOn, updateStall, isStalled, autoStep, adaptiveDt });
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);

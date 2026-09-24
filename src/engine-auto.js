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
  // (ascend<->buy cycles within a tick), so `cache` is created once per
  // autoStep() call and reused across every ascend/buy call within it: only
  // the circle that actually changed (ascended, bought levels, or was newly
  // unlocked) gets its entry refreshed. It is rebuilt from scratch only when
  // s.circles itself was replaced (promote/prestige/Infinity reset the whole
  // array via resetRun()).
  //
  // Per circle: pre[i] is costLog without the level term and step[i] is the
  // per-level log ratio, so pre[i] + level * step[i] is bit-identical to
  // E.costLog(s, i) at that level (same float operations). den[i] is
  // log10(10^step - 1), used by the closed-form geometric sums below.
  function ensureBuyCache(s, cache) {
    if (cache.circlesRef === s.circles) return;
    for (let i = 0; i < cache.cost.length; i++) refreshBuyCost(s, cache, i);
    cache.circlesRef = s.circles;
  }

  function refreshBuyCost(s, cache, i) {
    const c = s.circles[i];
    if (!s.inf.auto.buy.circles[i] || !c.unlocked || c.level >= E.levelCap(c)) { cache.cost[i] = Infinity; return; }
    const def = E.CIRCLES[i];
    const a = c.ascensions;
    let pre = Math.log10(def.initCost);
    for (let k = 0; k < a; k++) pre += (100 + 10 * k) * Math.log10(def.costMult + 0.1 * k);
    const r = Math.log10(def.costMult + 0.1 * a);
    cache.pre[i] = pre;
    cache.step[i] = r;
    cache.den[i] = Math.log10(10 ** r - 1);
    cache.cost[i] = pre + c.level * r;
  }

  function autoAscend(s, u, m, cache) {
    const a = s.inf.auto.asc;
    if (!(u.asc && a.on) || m.noAscend) return false;
    let did = false;
    for (let i = 0; i < s.circles.length; i++) {
      const c = s.circles[i];
      // Inline precheck (same test as canAscend) so the common "not at cap"
      // case costs nothing; ascend() re-checks canAscend with the passed m.
      if (a.circles[i] && c.unlocked && c.level >= E.levelCap(c) && E.ascend(s, i, m)) {
        did = true;
        if (cache.circlesRef === s.circles) refreshBuyCost(s, cache, i);
      }
    }
    return did;
  }

  // log10 of sum_{j=0}^{len-1} 10^(j*r) for r > 0, closed form in log space:
  // r*len + log10(1 - 10^(-r*len)) - log10(10^r - 1). Never forms 10^(r*len),
  // so it cannot overflow however large the sum is. den = log10(10^r - 1).
  function geoLen(r, den, len) {
    if (len <= 0) return -Infinity;
    const x = r * len;
    return x + Math.log10(1 - 10 ** -x) - den;
  }

  // Largest len >= 0 with aLog + geoLen(r, den, len) <= budget (closed form,
  // then nudged by one either way against float rounding).
  function maxAffordable(aLog, r, den, budget) {
    if (aLog > budget) return 0;
    let len = Math.floor(E.logAdd(0, budget - aLog + den) / r);
    while (len > 0 && aLog + geoLen(r, den, len) > budget) len--;
    while (aLog + geoLen(r, den, len + 1) <= budget) len++;
    return len;
  }

  // logSub's dead zone: a score within 1e-12 (log10) of a cost counts as
  // exactly that cost, and paying it leaves nothing. In linear terms that is
  // a relative band of 1 - 10^-1e-12 (~2.3e-12). Near-ties inside the band
  // are resolved the same way here whatever the float rounding: affordable,
  // and the score is emptied.
  const DEAD = 1 - 10 ** -1e-12;
  const DEAD_HI = 1 + DEAD;
  function spend(rem, x) {
    const after = rem - x;
    return after <= rem * DEAD ? 0 : after;
  }

  // Inserts circle i into ord[0..len) kept sorted by (cost, index).
  function insertOrd(ord, len, cost, i) {
    const ci = cost[i];
    let p = len;
    while (p > 0 && (cost[ord[p - 1]] > ci || (cost[ord[p - 1]] === ci && ord[p - 1] > i))) { ord[p] = ord[p - 1]; p--; }
    ord[p] = i;
    return len + 1;
  }

  // Spec §6.1: repeatedly buy ONE level of the cheapest affordable enabled,
  // unlocked, below-cap circle (ties -> lower index), at most
  // TUNE.autoBuyMaxPerStep levels per call. The result is identical to that
  // one-level-at-a-time loop up to logSub's 1e-12 dead zone: a score within
  // it of the next cost always buys and empties here (see DEAD), where
  // E.buy's rounding may stop one level short (pinned by randomized and
  // exact-boundary tests against E.buy(s, i, 1)). It is just cheaper:
  // - Which level is next depends only on costs, never on the score, so a
  //   run of levels of the same circle is capped where another circle's next
  //   level becomes the cheapest (cost < theirs, or <= when they have a
  //   higher index), where the circle unlocks the next one (bought reaches 5;
  //   the new circle then competes), at the level cap and at the remaining
  //   level budget. The score only decides where buying stops: the first
  //   time the cheapest level is unaffordable.
  // - The score is tracked in linear space as score = rem * 10^base (base
  //   re-anchored whenever rem drops below 1e-3), so a level costs one pow
  //   instead of a logSub. Long runs are summed in closed form, with the last
  //   two levels bought one at a time so float noise in the bulk sum cannot
  //   move the stopping point.
  // The 500-level budget is per call, i.e. per pass of autoStep's loop: a
  // per-tick budget would throttle coarse offline steps (0.5-2 s) far below
  // active play (~60 ticks/s) during ascend<->buy cycles.
  function autoBuy(s, u, m, cache) {
    const a = s.inf.auto.buy;
    if (!(u.buy && a.on) || s.scoreLog === -Infinity) return false;
    ensureBuyCache(s, cache);
    const n = s.circles.length;
    const { cost, pre, step, den } = cache;
    let base = s.scoreLog;
    let rem = 1;
    let left = E.TUNE.autoBuyMaxPerStep;
    let did = false;
    // Circles with a finite cost, sorted by (cost, index). A purchase only
    // raises the bought circle's cost, so it is re-inserted further back
    // instead of re-scanning all circles for every level.
    const ord = cache.ord;
    let len = 0;
    for (let i = 0; i < n; i++) if (cost[i] !== Infinity) len = insertOrd(ord, len, cost, i);
    while (left > 0) {
      // ord[0] is the cheapest circle (ties -> lower index); ord[1] is the
      // cheapest competitor, and `strict` says whether it has the lower
      // index (then best's levels must be strictly cheaper than it).
      if (len === 0) break;
      const best = ord[0];
      const bc = cost[best];
      const cm = len > 1 ? cost[ord[1]] : Infinity;
      const strict = len > 1 && ord[1] < best;
      const x0 = 10 ** (bc - base); // level L's cost relative to the score
      if (!(x0 <= rem * DEAD_HI)) break;
      const c = s.circles[best];
      const P = pre[best], r = step[best], L = c.level;
      let q = Math.min(E.levelCap(c) - L, left);
      const next = best + 1 < m.maxCircles ? s.circles[best + 1] : null;
      if (next && !next.unlocked) q = Math.min(q, Math.max(1, 5 - c.bought));
      if (q > 1 && cm !== Infinity && !(strict ? P + (L + 1) * r < cm : P + (L + 1) * r <= cm)) {
        q = 1; // the usual case once costs interleave: level L+1 loses
      } else if (q > 1 && cm !== Infinity) {
        // k = number of levels L, L+1, ... that still beat the competitor
        // (k >= 2 here: level L was just picked and level L+1 still wins).
        let k = Math.max(2, Math.min(q, Math.floor((cm - P) / r) - L));
        while (k > 2 && !(strict ? P + (L + k - 1) * r < cm : P + (L + k - 1) * r <= cm)) k--;
        while (k < q && (strict ? P + (L + k) * r < cm : P + (L + k) * r <= cm)) k++;
        q = k;
      }
      let bought = 0;
      if (q === 1) {
        rem = spend(rem, x0);
        bought = 1;
      } else if (q >= 4) {
        const bulk = Math.min(q, maxAffordable(bc, r, den[best], base + Math.log10(rem))) - 2;
        if (bulk > 0) {
          rem -= 10 ** (bc + geoLen(r, den[best], bulk) - base);
          bought = bulk;
        }
      }
      while (bought < q) {
        const x = 10 ** (P + (L + bought) * r - base);
        if (!(x <= rem * DEAD_HI)) break;
        rem = spend(rem, x);
        bought++;
      }
      c.level += bought;
      c.bought += bought;
      left -= bought;
      did = true;
      cost[best] = c.level < E.levelCap(c) ? P + c.level * r : Infinity;
      // Drop best from the front, then re-insert it at its new cost.
      for (let p = 1; p < len; p++) ord[p - 1] = ord[p];
      len--;
      if (cost[best] !== Infinity) len = insertOrd(ord, len, cost, best);
      if (c.bought >= 5 && next && !next.unlocked) {
        next.unlocked = true;
        next.level = 0;
        refreshBuyCost(s, cache, best + 1);
        if (cost[best + 1] !== Infinity) len = insertOrd(ord, len, cost, best + 1);
      }
      // Re-anchor once the score has dropped a lot, so rem keeps full
      // relative precision (subtracting from a tiny rem loses digits). Done
      // after the bookkeeping above so an exactly emptied score (rem = 0)
      // still records the purchase and any unlock; then nothing is left.
      if (rem < 1e-3) {
        if (!(rem > 0)) { base = -Infinity; break; }
        base += Math.log10(rem);
        rem = 1;
      }
    }
    if (did) s.scoreLog = rem > 0 && base !== -Infinity ? base + Math.log10(rem) : -Infinity;
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
    const xp = E.promoXp(s, m);
    const threshold = Math.max(1, s.promo[k] * a.xFactor, s.promo[k] + 1);
    if (xp >= threshold && E.canPromote(s, k, m)) {
      E.promote(s, k);
      return true;
    }
    if (isStalled(s) && !E.canPrestige(s)) {
      const n = order.length;
      for (let i = 0; i < n; i++) {
        const kk = order[(idx + i) % n];
        if (E.canPromote(s, kk, m)) {
          E.promote(s, kk);
          return true;
        }
      }
    }
    return false;
  }

  function autoPrestige(s, u, m) {
    const a = s.inf.auto.prestige;
    if (!(u.prestige && a.on)) return false;
    if (!E.canPrestige(s) || s.inf.tRun < a.minTime) return false;
    const g = E.pendingPrestige(s, m);
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

  // Repeats ascend -> buy -> promote/prestige/infinity passes until a pass
  // does nothing (bounded by autoStepMaxIter). In practice the repeats are
  // ascend <-> buy cycles: buying a circle to its cap lets it ascend (back to
  // level 5), which makes it cheap to buy again, all within one tick, so a
  // coarse offline step is not limited to one ascension per circle per tick.
  // Promote, prestige and Infinity reset the run (score -> 0), so nothing is
  // buyable afterwards and no promote -> prestige cascade can follow in the
  // same tick; at most a prestige can be followed by a promote (promoXp reads
  // the raised pMult).
  function autoStep(s, dt) {
    updateStall(s);
    // autoUnlocked(s) only reflects owned upgrades, which nothing in this
    // loop grants, so it is computed once. mods(s) is recomputed each pass
    // because promotions change it (e.g. 14;1 reads promo[0]).
    const u = autoUnlocked(s);
    const cache = newBuyCache(s.circles.length);
    const actions = [];
    for (let iter = 0; iter < E.TUNE.autoStepMaxIter; iter++) {
      let did = false;
      const m = E.mods(s);
      // Spec §2.1: while an Infinity awaits the player's confirmation the
      // score stays capped, so nothing may spend or reset it (only a broken
      // run's Auto-Infinity can still resolve it).
      if (E.awaitingInfinity(s)) { if (autoInfinity(s, u)) { actions.push('infinity'); continue; } break; }
      if (autoAscend(s, u, m, cache)) { actions.push('ascend'); did = true; }
      if (autoBuy(s, u, m, cache)) { actions.push('buy'); did = true; }
      if (autoPromote(s, u, m)) { actions.push('promote'); did = true; continue; }
      if (autoPrestige(s, u, m)) { actions.push('prestige'); did = true; }
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
  function newBuyCache(n) {
    return {
      circlesRef: null,
      cost: new Array(n).fill(Infinity), pre: new Array(n).fill(0), step: new Array(n).fill(0), den: new Array(n).fill(0),
      ord: new Array(n).fill(0),
    };
  }

  // Test hook: one autobuy call on its own (no ascend/promote/prestige).
  function _autoBuyOnce(s) {
    return autoBuy(s, autoUnlocked(s), E.mods(s), newBuyCache(s.circles.length));
  }

  Object.assign(E, { autoUnlocked, anyAutoOn, updateStall, isStalled, autoStep, adaptiveDt, _autoBuyOnce });
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);

// src/engine-auto.js — automation (autobuy, auto-ascend, auto-promote, auto-prestige, auto-infinity) and adaptive step size. Pure.
(function (E) {
  'use strict';

  Object.assign(E.TUNE, { autoBuyMaxPerStep: 500, dtRunDiv: 20, dtMin: 0.05, dtMax: 5, dtFixed: 1 });

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

  function autoAscend(s) {
    const u = autoUnlocked(s);
    const a = s.inf.auto.asc;
    if (!(u.asc && a.on)) return false;
    let did = false;
    for (let i = 0; i < s.circles.length; i++) {
      if (a.circles[i] && E.canAscend(s, i)) {
        E.ascend(s, i);
        did = true;
      }
    }
    return did;
  }

  function autoBuy(s) {
    const u = autoUnlocked(s);
    const a = s.inf.auto.buy;
    if (!(u.buy && a.on)) return false;
    let did = false;
    for (let n = 0; n < E.TUNE.autoBuyMaxPerStep; n++) {
      let best = -1;
      let bestCost = Infinity;
      for (let i = 0; i < s.circles.length; i++) {
        const c = s.circles[i];
        if (!a.circles[i] || !c.unlocked || c.level >= E.levelCap(c)) continue;
        const cost = E.costLog(s, i);
        if (cost <= s.scoreLog && cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      }
      if (best === -1) break;
      E.buy(s, best, 1);
      did = true;
    }
    return did;
  }

  function autoPromote(s) {
    const u = autoUnlocked(s);
    const a = s.inf.auto.promote;
    if (!(u.promote && a.on)) return false;
    if (s.inf.tRun < a.minTime) return false;
    const m = E.mods(s);
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

  function autoPrestige(s) {
    const u = autoUnlocked(s);
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

  function autoInfinity(s) {
    const u = autoUnlocked(s);
    const a = s.inf.auto.infinity;
    if (!(u.infinity && a.on)) return false;
    if (E.isFixed(s)) return false;
    if (!E.canInfinity(s)) return false;
    if (E.ipGainLog(s) < a.minIpLog) return false;
    if (s.inf.t < a.minTime) return false;
    E.goInfinite(s);
    return true;
  }

  function autoStep(s, dt) {
    updateStall(s);
    const actions = [];
    if (autoAscend(s)) actions.push('ascend');
    if (autoBuy(s)) actions.push('buy');
    if (autoPromote(s)) { actions.push('promote'); return { actions }; }
    if (autoPrestige(s)) actions.push('prestige');
    if (autoInfinity(s)) actions.push('infinity');
    return { actions };
  }

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  function adaptiveDt(s, opts) {
    opts = opts || {};
    if (!anyAutoOn(s)) return E.TUNE.dtFixed;
    return clamp(s.inf.tRun / E.TUNE.dtRunDiv, opts.dtMin ?? E.TUNE.dtMin, opts.dtMax ?? E.TUNE.dtMax);
  }

  E.registerHooks({ auto: autoStep });
  Object.assign(E, { autoUnlocked, anyAutoOn, updateStall, isStalled, autoStep, adaptiveDt });
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);

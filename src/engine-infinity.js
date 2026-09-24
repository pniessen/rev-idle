// src/engine-infinity.js — Infinity layer mechanics (IP, tree, generators,
// challenges, Break Infinity, Stars). Pure; attaches to the shared Engine.
(function (E) {
  'use strict';
  const LOG2 = Math.log10(2);
  E._inf = { LOG2 }; // internal scratch shared by later sections of this file

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
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);

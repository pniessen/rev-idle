// src/engine-infinity.js — Infinity layer mechanics (IP, tree, generators,
// challenges, Break Infinity, Stars). Pure; attaches to the shared Engine.
(function (E) {
  'use strict';
  const LOG2 = Math.log10(2);
  E._inf = { LOG2 }; // internal scratch shared by later sections of this file

  Object.assign(E.TUNE, { ipBase: 1, breakStartLog: 2772, breakStepLog: 308 });
  Object.assign(E.TUNE, { ic1Boost: 1.5, ic5Nerf: 0.25, ic5Reward: 1.1, ic6Decay: 0.01, ic4Pow: 0.32, ic9Circles: 3 });
  Object.assign(E.TUNE, {
    genRate: 0.0025, gpExp0: 0.666, genSoftcapLog: 1000,
    genCost: [[Math.log10(32), Math.log10(5)], [Math.log10(150), 1], [5, 2], [9, 3], [15, 4], [21, 5], [27, 6], [33, 7], [39, 8], [45, 9]],
  });
  Object.assign(E.TUNE, {
    u51Div: 600, u51Cap: 10, u52K: 0.01, u62K: 0.01, u162K: 0.05, u8TimeDiv: 60,
    u121Pow: 0.5, u171Pow: 0.25, u161Pow: 0.2, u141K: 0.1,
    icRefSec: 36000, ctfMax: 1e4, u163Ref: 3600, passiveInfK: 2, u201Ref: 600, u201Cap: 100,
    gpExp14: 0.75, gpExp19: 0.9,
    starBaseCost: [34, 4], starExpCost: [35, 5], starExpMax: 12,
    sdUpgCost: [[1, 2], [Math.log10(20), 1], [Math.log10(50), Math.log10(3)], [2, Math.log10(2)]], sdUpgMax: [9, Infinity, 50, 85],
  });
  const I = E._inf; I.MOD_FNS = []; I.IP_FNS = []; I.PRE_FNS = []; I.GEN_FNS = []; I.GPEXP_FNS = [];
  I.starGpLog = () => 0; // Task 9 replaces this
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const icDoneCount = (s) => s.inf.ic.done.filter(Boolean).length;
  const infGain = (s) => (s.inf.ic.done[8] ? 2 : 1);

  // ===== Infinity Upgrade tree (spec §4) =====
  const UPGRADES = [
    // Phase A
    { id: '1;1', col: 1, row: 1, name: 'Infinity Generation', cost: 1, phase: 'A', req: [], desc: 'G1 ×max(1,∞). Unlocks Generators (grants 1 free G1) and Autobuy.' },
    { id: '2;1', col: 2, row: 1, name: 'Exponential Box', cost: 1, phase: 'A', req: ['1;1'], desc: 'commonExp +0.01' },
    { id: '2;2', col: 2, row: 2, name: 'Auto Ascend', cost: 1, phase: 'A', req: ['1;1'], desc: 'Unlocks Auto-Ascend' },
    { id: '3;1', col: 3, row: 1, name: 'Fast Laps', cost: 1, phase: 'A', req: 'prev', desc: 'Lap speed ×1.1' },
    { id: '3;2', col: 3, row: 2, name: 'Auto Work', cost: 1, phase: 'A', req: 'prev', desc: 'Unlocks Auto-Promote' },
    { id: '4;1', col: 4, row: 1, name: 'Even Faster Laps', cost: 3, phase: 'A', req: 'prev', desc: 'Lap speed ×1.2' },
    { id: '5;1', col: 5, row: 1, name: 'Long Term Prestiging', cost: 3, phase: 'A', req: ['4;1'], desc: 'P.Mult gain ×min(10, 1+√(t/600))' },
    { id: '5;2', col: 5, row: 2, name: 'Solid Exponent', cost: 3, phase: 'A', req: ['4;1'], desc: 'P.Exp gain ×(1 + 0.1·log2(1+∞))' },
    { id: '5;3', col: 5, row: 3, name: 'Auto Prestige', cost: 3, phase: 'A', req: ['4;1'], desc: 'Unlocks Auto-Prestige' },
    { id: '6;1', col: 6, row: 1, name: 'Mighty Ascension', cost: 3, phase: 'A', req: ['5;1', '5;2'], desc: 'Ascension power base +2' },
    { id: '6;2', col: 6, row: 2, name: 'Ascend to Ascend', cost: 3, phase: 'A', req: ['5;2', '5;3'], desc: 'Asc power ×(1 + 0.25·log10(1+∞))' },
    // Phase B
    { id: '7;1', col: 7, row: 1, name: 'Challenges!', cost: 5, phase: 'B', req: 'prev', desc: 'Unlocks Infinity Challenges' },
    { id: '8;1', col: 8, row: 1, name: 'Generator and Time', cost: 16, phase: 'B', req: ['7;1'], desc: 'G1 ×(1 + t/60)^0.5' },
    { id: '8;2', col: 8, row: 2, name: 'Generator and Power', cost: 32, phase: 'B', req: ['7;1'], desc: 'G1 ×(1 + log10(1+GP))' },
    { id: '8;3', col: 8, row: 3, name: 'Generator and Constant', cost: 16, phase: 'B', req: ['7;1'], desc: 'G1 ×5' },
    { id: '9;1', col: 9, row: 1, name: 'Generator 2 and Time', cost: 128, phase: 'B', req: 'prev', desc: 'G2 ×(1 + t/60)^0.5' },
    { id: '9;2', col: 9, row: 2, name: 'Generator 2 and Constant', cost: 128, phase: 'B', req: 'prev', desc: 'G2 ×3' },
    { id: '11;1', col: 11, row: 1, name: 'Weak Generators', cost: 300, phase: 'B', req: 'prev', desc: 'G1 ×(1 + log10(1+IP))' },
    { id: '11;2', col: 11, row: 2, name: 'Medium Generators', cost: 400, phase: 'B', req: 'prev', desc: 'G2 ×(1 + log10(1+IP))^0.5' },
    { id: '12;1', col: 12, row: 1, name: 'First, But Better', cost: 512, phase: 'B', req: 'prev', desc: 'G2 ×max(1,∞)^0.5' },
    { id: '13;1', col: 13, row: 1, name: 'A Little Gift', cost: 600, phase: 'B', req: 'prev', desc: 'Ascension power base +1' },
    { id: '14;1', col: 14, row: 1, name: 'First for the First', cost: 1024, phase: 'B', req: 'prev', desc: 'P1 variable part ×(1 + √promo0·0.1)' },
    { id: '14;2', col: 14, row: 2, name: 'Efficiency V', cost: 1024, phase: 'B', req: 'prev', desc: 'gpExp → 0.75' },
    // Phase C
    { id: '15;1', col: 15, row: 1, name: 'Auto Infinity', cost: 2048, phase: 'C', req: 'prev', desc: 'Unlocks Auto-Infinity' },
    { id: '15;2', col: 15, row: 2, name: 'Fast IP Gain', cost: 2048, phase: 'C', req: 'prev', desc: 'IP ×ctf^0.5' },
    { id: '15;3', col: 15, row: 3, name: 'First Generator Power', cost: 2048, phase: 'C', req: 'prev', desc: 'G1 ×ctf' },
    { id: '15;4', col: 15, row: 4, name: 'Second Generator Power', cost: 2048, phase: 'C', req: 'prev', desc: 'G2 ×ctf^0.75' },
    { id: '16;1', col: 16, row: 1, name: 'Infinities to IP', cost: 5000, phase: 'C', req: 'prev', desc: 'IP ×max(1,∞)^0.2' },
    { id: '16;2', col: 16, row: 2, name: 'Stronger Ascension Power', cost: 5000, phase: 'C', req: 'prev', desc: 'Asc power ×(1 + 0.05·log2(1+∞))' },
    { id: '16;3', col: 16, row: 3, name: 'Empowered Promotions', cost: 5000, phase: 'C', req: 'prev', desc: 'P4 variable part ×clamp(3600/ICbest9, 1, 10)^0.5' },
    { id: '17;1', col: 17, row: 1, name: "Third's Turn", cost: 1e6, phase: 'C', req: 'prev', desc: 'G3 ×max(1,∞)^0.25' },
    { id: '17;3', col: 17, row: 3, name: 'Boost for the First', cost: 1e6, phase: 'C', req: 'prev', desc: 'G1 ×10' },
    { id: '18;1', col: 18, row: 1, name: 'Passive Infinities', cost: 2e11, phase: 'C', req: 'prev', desc: '∞/s = passiveInfK × infGain / max(1, fastestInfinity) × sdU4mult' },
    { id: '18;3', col: 18, row: 3, name: 'Third from Second', cost: 1e11, phase: 'C', req: 'prev', desc: 'G3 ×(1 + b2)' },
    { id: '19;1', col: 19, row: 1, name: 'Almost One', cost: 1e12, phase: 'C', req: 'prev', desc: 'gpExp → 0.9' },
    { id: '19;3', col: 19, row: 3, name: 'Challenge Efficiency', cost: 1e12, phase: 'C', req: 'prev', desc: 'Lap speed ×3' },
    { id: '20;1', col: 20, row: 1, name: 'As Fast as Strong', cost: 1e21, phase: 'C', req: 'prev', desc: 'All generators ×clamp(600/fastestInfinity, 1, 100)^0.5' },
    { id: '21;1', col: 21, row: 1, name: 'A Falling Star', cost: 1e33, phase: 'C', req: ['20;1'], desc: 'Unlocks Stars' },
  ];
  const UPG_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
  const UPG_COLS = Array.from(new Set(UPGRADES.map((u) => u.col))).sort((a, b) => a - b);
  function prevCol(col) {
    let best = null;
    for (const c of UPG_COLS) { if (c < col) best = c; else break; }
    return best;
  }
  const upgById = (id) => UPG_BY_ID.get(id);
  const hasUpg = (s, id) => !!s.inf.upg[id];
  function upgReqMet(s, id) {
    const u = upgById(id);
    if (!u) return false;
    if (u.req === 'prev') {
      const pc = prevCol(u.col);
      if (pc === null) return true;
      return UPGRADES.some((v) => v.col === pc && hasUpg(s, v.id));
    }
    if (u.req.length === 0) return true;
    return u.req.some((id2) => hasUpg(s, id2));
  }
  function canBuyUpgrade(s, id) {
    const u = upgById(id);
    if (!u) return false;
    if (hasUpg(s, id)) return false;
    if (!upgReqMet(s, id)) return false;
    return s.inf.ipLog >= Math.log10(u.cost);
  }
  function buyUpgrade(s, id) {
    if (!canBuyUpgrade(s, id)) return false;
    const u = upgById(id);
    s.inf.ipLog = E.logSub(s.inf.ipLog, Math.log10(u.cost));
    s.inf.upg[id] = true;
    if (id === '1;1' && s.inf.gens[0].b === 0) s.inf.gens[0] = { b: 1, aLog: 0 };
    return true;
  }

  // ===== Helpers (spec §4/§8) =====
  function ctf(s) {
    const T = E.TUNE;
    if (!s.inf.ic.done.every(Boolean)) return 1;
    const sum = s.inf.ic.best.reduce((a, b) => a + b, 0);
    return Math.min(T.ctfMax, Math.max(1, T.icRefSec / sum));
  }
  function sdU4Mult(s) {
    return Math.min(62.62, Math.pow(1.05, s.inf.stars.sdU[3]));
  }
  function passiveInfRate(s) {
    const T = E.TUNE;
    if (!hasUpg(s, '18;1') || s.stats.fastestInfinity === null) return 0;
    return T.passiveInfK * infGain(s) / Math.max(1, s.stats.fastestInfinity) * sdU4Mult(s);
  }

  // ===== Infinity Challenges and Break Infinity (spec §8) =====
  const CHALLENGES = [
    { n: 1, name: 'Ionized Speed', handicap: 'P2 and P4 disabled', reward: 'P2 and P4 variable parts ×1.5 (permanent)' },
    { n: 2, name: 'Descent', handicap: 'Ascension power ÷4', reward: 'Ascension power ×1.2 (permanent)' },
    { n: 3, name: 'The First Root', handicap: 'commonExp −0.4', reward: 'commonExp +0.03 (permanent)' },
    { n: 4, name: 'Steep Climbs', handicap: 'Prestige and promote gains ^0.32', reward: 'Promotions start at level 1 after every Infinity; IP ×2' },
    { n: 5, name: 'Fired From Work', handicap: 'All promotion variable parts ×0.25', reward: 'All promotion variable parts ×1.1 (permanent)' },
    { n: 6, name: 'The Drain', handicap: 'Colour mult logs decay each tick', reward: 'All generators ×2 (permanent)' },
    { n: 7, name: 'Quadratic Division', handicap: 'Product of mults ÷ t²', reward: 'Product of mults × t^0.2 (permanent)' },
    { n: 8, name: 'Noscensions', handicap: 'Ascensions disabled', reward: 'Ascension power base +2 (permanent)' },
    { n: 9, name: 'Isolationism', handicap: 'Only 3 circles can unlock', reward: '∞ gain ×2; unlocks Break Infinity' },
  ];
  function canStartChallenge(s, n) {
    return !!s.inf.upg['7;1'] && s.inf.ic.active === 0 && (n === 1 || s.inf.ic.done[n - 2]);
  }
  function startChallenge(s, n) {
    if (!canStartChallenge(s, n)) return false;
    resetForChallenge(s);
    s.inf.ic.active = n;
    return true;
  }
  function exitChallenge(s) {
    if (!s.inf.ic.active) return false;
    resetForChallenge(s);
    s.inf.ic.active = 0;
    return true;
  }
  function canBreak(s) { return s.inf.ic.done.every(Boolean); }
  function setBroken(s, on) {
    if (!canBreak(s)) return false;
    s.inf.broken = !!on;
    if (!s.inf.broken && s.scoreLog > E.INFINITY_LOG) s.scoreLog = E.INFINITY_LOG;
    return true;
  }

  // ===== Contributors: MOD_FNS =====
  I.MOD_FNS.push((s, m) => {
    if (hasUpg(s, '3;1')) m.lapMult *= 1.1;
    if (hasUpg(s, '4;1')) m.lapMult *= 1.2;
    if (hasUpg(s, '19;3')) m.lapMult *= 3;
  });
  I.MOD_FNS.push((s, m) => {
    if (hasUpg(s, '2;1')) m.expAdd += 0.01 + Math.min(0.5, 0.01 * s.inf.stars.sdU[2]);
  });
  I.MOD_FNS.push((s, m) => {
    if (hasUpg(s, '6;1')) m.ascBase += 2;
    if (hasUpg(s, '13;1')) m.ascBase += 1;
  });
  I.MOD_FNS.push((s, m) => {
    const T = E.TUNE;
    if (hasUpg(s, '6;2')) m.ascMult *= (1 + T.u62K * Math.log10(1 + s.infinities));
    if (hasUpg(s, '16;2')) m.ascMult *= (1 + T.u162K * Math.log2(1 + s.infinities));
  });
  I.MOD_FNS.push((s, m) => {
    const T = E.TUNE;
    if (hasUpg(s, '5;1')) m.pMultMult *= Math.min(T.u51Cap, 1 + Math.sqrt(s.inf.t / T.u51Div));
    if (hasUpg(s, '5;2')) m.pExpMult *= 1 + T.u52K * Math.log2(1 + s.infinities);
  });
  I.MOD_FNS.push((s, m) => {
    const T = E.TUNE;
    if (hasUpg(s, '14;1')) m.v[0] *= 1 + Math.sqrt(s.promo[0]) * T.u141K;
    if (hasUpg(s, '16;3') && s.inf.ic.done[8]) {
      m.v[3] *= Math.sqrt(clamp(T.u163Ref / s.inf.ic.best[8], 1, 10));
    }
  });

  I.MOD_FNS.push((s, m) => {
    const T = E.TUNE;
    const a = s.inf.ic.active; const d = s.inf.ic.done;
    if (a === 1) m.disabledPromo = [1, 3];
    if (d[0]) { m.v[1] *= T.ic1Boost; m.v[3] *= T.ic1Boost; }
    if (a === 2) m.ascMult *= 0.25;
    if (d[1]) m.ascMult *= 1.2;
    if (a === 3) m.expAdd -= 0.4;
    if (d[2]) m.expAdd += 0.03;
    if (a === 4) m.gainPow = T.ic4Pow;
    const vAll = (d[4] ? T.ic5Reward : 1) * (a === 5 ? T.ic5Nerf : 1);
    if (vAll !== 1) for (let i = 0; i < 4; i++) m.v[i] *= vAll;
    if (a === 6) m.decay = T.ic6Decay;
    if (a === 7) m.prodLog -= 2 * Math.log10(Math.max(1, s.inf.t));
    if (d[6]) m.prodLog += 0.2 * Math.log10(Math.max(1, s.inf.t));
    if (a === 8) m.noAscend = true;
    if (d[7]) m.ascBase += 2;
    if (a === 9) m.maxCircles = T.ic9Circles;
  });

  // ===== Contributors: GEN_FNS (log10 factors) =====
  function log1p(xLog) { return E.logAdd(0, xLog); } // log10(1+x) for x = 10**xLog
  I.GEN_FNS.push((s, k) => {
    let L = 0;
    const T = E.TUNE;
    if (k === 0) {
      if (hasUpg(s, '8;1')) L += 0.5 * Math.log10(1 + s.inf.t / T.u8TimeDiv);
      if (hasUpg(s, '8;2')) L += Math.log10(1 + log1p(s.inf.gpLog));
      if (hasUpg(s, '8;3')) L += Math.log10(5);
      if (hasUpg(s, '11;1')) L += Math.log10(1 + log1p(s.inf.ipLog));
      if (hasUpg(s, '15;3')) L += Math.log10(ctf(s));
      if (hasUpg(s, '17;3')) L += 1;
    } else if (k === 1) {
      if (hasUpg(s, '9;1')) L += 0.5 * Math.log10(1 + s.inf.t / T.u8TimeDiv);
      if (hasUpg(s, '9;2')) L += Math.log10(3);
      if (hasUpg(s, '11;2')) L += 0.5 * Math.log10(1 + log1p(s.inf.ipLog));
      if (hasUpg(s, '12;1')) L += T.u121Pow * Math.log10(Math.max(1, s.infinities));
      if (hasUpg(s, '15;4')) L += 0.75 * Math.log10(ctf(s));
    } else if (k === 2) {
      if (hasUpg(s, '17;1')) L += T.u171Pow * Math.log10(Math.max(1, s.infinities));
      if (hasUpg(s, '18;3')) L += Math.log10(1 + s.inf.gens[1].b);
    }
    if (hasUpg(s, '20;1') && s.stats.fastestInfinity !== null) {
      L += 0.5 * Math.log10(clamp(T.u201Ref / s.stats.fastestInfinity, 1, T.u201Cap));
    }
    return L;
  });
  I.GEN_FNS.push((s) => (s.inf.ic.done[5] ? LOG2 : 0));

  // ===== Contributors: IP_FNS =====
  I.IP_FNS.push((s) => {
    let g = 0;
    if (hasUpg(s, '15;2')) g += 0.5 * Math.log10(ctf(s));
    if (hasUpg(s, '16;1')) g += E.TUNE.u161Pow * Math.log10(Math.max(1, s.infinities));
    return g;
  });

  // ===== Contributors: GPEXP_FNS =====
  I.GPEXP_FNS.push((s) => (hasUpg(s, '14;2') ? E.TUNE.gpExp14 : null));
  I.GPEXP_FNS.push((s) => (hasUpg(s, '19;1') ? E.TUNE.gpExp19 : null));

  // ===== Contributors: PRE_FNS (passive Infinities) =====
  I.PRE_FNS.push((s, dt) => { s.infinities += passiveInfRate(s) * dt; });

  // ===== upgEffect: current live value/multiplier for display =====
  function upgEffect(s, id) {
    const T = E.TUNE;
    const inf = Math.max(1, s.infinities);
    switch (id) {
      case '2;2': case '3;2': case '5;3': case '7;1': case '15;1': case '21;1':
        return null;
      case '1;1': return Math.max(1, s.infinities);
      case '2;1': return 0.01 + Math.min(0.5, 0.01 * s.inf.stars.sdU[2]);
      case '3;1': return 1.1;
      case '4;1': return 1.2;
      case '5;1': return Math.min(T.u51Cap, 1 + Math.sqrt(s.inf.t / T.u51Div));
      case '5;2': return 1 + T.u52K * Math.log2(1 + s.infinities);
      case '6;1': return 2;
      case '6;2': return 1 + T.u62K * Math.log10(1 + s.infinities);
      case '8;1': case '9;1': return Math.pow(1 + s.inf.t / T.u8TimeDiv, 0.5);
      case '8;2': return 1 + log1p(s.inf.gpLog);
      case '8;3': return 5;
      case '9;2': return 3;
      case '11;1': return 1 + log1p(s.inf.ipLog);
      case '11;2': return Math.sqrt(1 + log1p(s.inf.ipLog));
      case '12;1': return Math.pow(inf, T.u121Pow);
      case '13;1': return 1;
      case '14;1': return 1 + Math.sqrt(s.promo[0]) * T.u141K;
      case '14;2': return T.gpExp14;
      case '15;2': return Math.pow(ctf(s), 0.5);
      case '15;3': return ctf(s);
      case '15;4': return Math.pow(ctf(s), 0.75);
      case '16;1': return Math.pow(inf, T.u161Pow);
      case '16;2': return 1 + T.u162K * Math.log2(1 + s.infinities);
      case '16;3': return s.inf.ic.done[8] ? Math.sqrt(clamp(T.u163Ref / s.inf.ic.best[8], 1, 10)) : 1;
      case '17;1': return Math.pow(inf, T.u171Pow);
      case '17;3': return 10;
      case '18;1': return passiveInfRate(s);
      case '18;3': return 1 + s.inf.gens[1].b;
      case '19;1': return T.gpExp19;
      case '19;3': return 3;
      case '20;1': return s.stats.fastestInfinity === null ? 1
        : Math.sqrt(clamp(T.u201Ref / s.stats.fastestInfinity, 1, T.u201Cap));
      default: return null;
    }
  }

  function mods(s) {
    const d = E.DEFAULT_MODS;
    const m = Object.assign({}, d, { v: d.v.slice(), disabledPromo: d.disabledPromo.slice() });
    for (const f of I.MOD_FNS) f(s, m);
    return m;
  }
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
  const GEN_COUNT = 10;
  function genCostLog(s, k) {
    const [f, st] = E.TUNE.genCost[k];
    const p = k === 0 ? s.inf.gens[0].b - 1 : s.inf.gens[k].b;
    return f + st * p;
  }
  function canBuyGen(s, k) {
    if (!s.inf.upg['1;1']) return false;
    if (k !== 0 && s.inf.gens[k - 1].b < 1) return false;
    return s.inf.ipLog >= genCostLog(s, k);
  }
  function buyGen(s, k) {
    if (!canBuyGen(s, k)) return false;
    const cost = genCostLog(s, k);
    s.inf.ipLog = E.logSub(s.inf.ipLog, cost);
    const g = s.inf.gens[k];
    g.b += 1;
    g.aLog = E.logAdd(g.aLog, 0);
    return true;
  }
  function genMultLog(s, k) {
    const g = s.inf.gens[k];
    let L = LOG2 * Math.max(0, g.b - 1) + Math.log10(E.TUNE.genRate);
    if (s.inf.upg['1;1'] && k <= s.inf.stars.sdU[0]) L += Math.log10(Math.max(1, s.infinities));
    for (const f of I.GEN_FNS) L += f(s, k);
    return genSoftcap(L);
  }
  function genSoftcap(L) {
    const T = E.TUNE;
    return L <= T.genSoftcapLog ? L : T.genSoftcapLog * Math.sqrt(L / T.genSoftcapLog);
  }
  function gpExp(s) {
    let best = E.TUNE.gpExp0;
    for (const f of I.GPEXP_FNS) {
      const v = f(s);
      if (v !== null && v !== undefined && v > best) best = v;
    }
    return best;
  }
  function gpMultLog(s) {
    return gpExp(s) * Math.max(0, s.inf.gpLog);
  }
  function genProductionPreTick(s, dt, m) {
    const f = s.inf;
    const dtLog = Math.log10(dt);
    const M = [];
    for (let k = 0; k < GEN_COUNT; k++) M[k] = genMultLog(s, k);
    let newGp = f.gpLog;
    if (f.gens[0] && f.gens[0].aLog !== -Infinity) {
      newGp = E.logAdd(newGp, f.gens[0].aLog + M[0] + I.starGpLog(s) + dtLog);
    }
    const newA = f.gens.map((g) => g.aLog);
    for (let k = 0; k < GEN_COUNT - 1; k++) {
      const src = f.gens[k + 1];
      if (src && src.aLog !== -Infinity) {
        newA[k] = E.logAdd(newA[k], src.aLog + M[k + 1] + dtLog);
      }
    }
    f.gpLog = newGp;
    for (let k = 0; k < GEN_COUNT; k++) f.gens[k].aLog = newA[k];
  }
  I.PRE_FNS.push(genProductionPreTick);
  I.MOD_FNS.push((s, m) => { if (s.inf.gpLog > 0) m.gainLog = gpMultLog(s); });
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
  // ===== Stars and Stardust (spec §7) =====
  function starCostLog(s) {
    const n = s.inf.stars.n;
    let cost = 33;
    for (let j = 0; j < n; j++) {
      const step = j < 18 ? 3 : j < 30 ? 7 : 7 + (j - 29);
      cost += step;
    }
    return cost;
  }
  function canBuyStar(s) {
    return !!s.inf.upg['21;1'] && s.inf.ipLog >= starCostLog(s);
  }
  function buyStar(s) {
    if (!canBuyStar(s)) return false;
    s.inf.ipLog = E.logSub(s.inf.ipLog, starCostLog(s));
    s.inf.stars.n += 1;
    return true;
  }
  function starBaseCostLog(s) {
    const T = E.TUNE;
    return T.starBaseCost[0] + T.starBaseCost[1] * s.inf.stars.nb;
  }
  function buyStarBase(s) {
    if (!s.inf.upg['21;1'] || s.inf.ipLog < starBaseCostLog(s)) return false;
    s.inf.ipLog = E.logSub(s.inf.ipLog, starBaseCostLog(s));
    s.inf.stars.nb += 1;
    return true;
  }
  function starExpCostLog(s) {
    const T = E.TUNE;
    return T.starExpCost[0] + T.starExpCost[1] * s.inf.stars.ne;
  }
  function buyStarExp(s) {
    const T = E.TUNE;
    if (!s.inf.upg['21;1'] || s.inf.stars.ne >= T.starExpMax || s.inf.ipLog < starExpCostLog(s)) return false;
    s.inf.ipLog = E.logSub(s.inf.ipLog, starExpCostLog(s));
    s.inf.stars.ne += 1;
    return true;
  }
  function sdRateLog(s) {
    const n = s.inf.stars.n;
    if (n < 1) return -Infinity;
    const base = 2.75 + 0.275 * s.inf.stars.nb;
    return Math.log10(0.05) + n * Math.log10(base);
  }
  function starGpLog(s) {
    const exp = 0.4 + 0.05 * s.inf.stars.ne;
    return exp * Math.max(0, s.inf.stars.sdLog);
  }
  I.starGpLog = starGpLog;
  const SD_UPGRADES = [
    { j: 0, name: "Star Extension", max: 9, desc: "1;1's ×∞ also applies to G2 … G(1+n)" },
    { j: 1, name: "IP Multiplier", max: Infinity, desc: "IP ×(1+n)" },
    { j: 2, name: "Exponent Boost", max: 50, desc: "2;1 gives +0.01·n more commonExp" },
    { j: 3, name: "Passive Multiplier", max: 85, desc: "18;1 rate ×min(62.62, 1.05^n)" },
  ];
  function sdUpgCostLog(s, j) {
    const T = E.TUNE;
    const [f, st] = T.sdUpgCost[j];
    return f + st * s.inf.stars.sdU[j];
  }
  function canBuySdUpg(s, j) {
    const T = E.TUNE;
    return s.inf.upg['21;1'] && s.inf.stars.sdU[j] < T.sdUpgMax[j] && s.inf.stars.sdLog >= sdUpgCostLog(s, j);
  }
  function buySdUpg(s, j) {
    if (!canBuySdUpg(s, j)) return false;
    s.inf.stars.sdLog = E.logSub(s.inf.stars.sdLog, sdUpgCostLog(s, j));
    s.inf.stars.sdU[j] += 1;
    return true;
  }
  // Stardust pre-tick: accumulation (unshifted to front of PRE_FNS)
  I.PRE_FNS.unshift((s, dt) => {
    s.inf.stars.sdLog = E.logAdd(s.inf.stars.sdLog, sdRateLog(s) + Math.log10(dt));
  });

  function postTick(s) {         // spec §2.1
    if (!E.isFixed(s) || !E.canInfinity(s)) return;
    if (s.infinities === 0 || s.inf.auto.confirmInfinity) { s.inf.pendingConfirm = true; return; }
    goInfinite(s);
  }
  function preTick(s, dt, m) { for (const f of I.PRE_FNS) f(s, dt, m); }
  E.registerHooks({ mods, preTick, postTick });
  Object.assign(E, {
    goInfinite, resetForChallenge, icDoneCount, ipGainLog, infGain, breakBonusLog,
    GEN_COUNT, genCostLog, canBuyGen, buyGen, genMultLog, genSoftcap, gpExp, gpMultLog,
    UPGRADES, upgById, hasUpg, upgReqMet, canBuyUpgrade, buyUpgrade, upgEffect, ctf, passiveInfRate, sdU4Mult,
    CHALLENGES, canStartChallenge, startChallenge, exitChallenge, canBreak, setBroken,
    starCostLog, canBuyStar, buyStar, starBaseCostLog, buyStarBase, starExpCostLog, buyStarExp,
    sdRateLog, starGpLog, SD_UPGRADES, sdUpgCostLog, canBuySdUpg, buySdUpg,
  });
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);

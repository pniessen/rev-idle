// Rev Idle engine — pure state + formulas + tick + (later) serialize.
// UMD-ish: module.exports in Node, window.Engine in browser.
// Structured so Task 2 (ascension/prestige/promotions/serialize) can add
// functions and slot them into the returned Engine object below.

const Engine = (() => {
  const CIRCLES = [
    { name: 'Red', color: '#ff3b4f', initCost: 4, costMult: 1.20, baseSpeed: 0.2 },
    { name: 'Orange', color: '#ff8a2a', initCost: 100, costMult: 1.24, baseSpeed: 0.1 },
    { name: 'Yellow', color: '#ffd93b', initCost: 1e3, costMult: 1.28, baseSpeed: 1 / 15 },
    { name: 'Green', color: '#4dff6a', initCost: 1e4, costMult: 1.32, baseSpeed: 0.05 },
    { name: 'Turquoise', color: '#2affc6', initCost: 1e6, costMult: 1.36, baseSpeed: 0.04 },
    { name: 'Cyan', color: '#2ad9ff', initCost: 1e9, costMult: 1.40, baseSpeed: 1 / 30 },
    { name: 'Blue', color: '#3b6bff', initCost: 1e12, costMult: 1.44, baseSpeed: 1 / 35 },
    { name: 'Purple', color: '#a24dff', initCost: 1e15, costMult: 1.48, baseSpeed: 0.025 },
    { name: 'Pink', color: '#ff4dd2', initCost: 1e18, costMult: 1.52, baseSpeed: 1 / 45 },
    { name: 'White', color: '#f4f1ff', initCost: 1e27, costMult: 1.56, baseSpeed: 0.02 },
  ];

  const INFINITY_LOG = Math.log10(1.79e308);

  const TUNE = {
    pMultBase: 2.56,
    pMultPow: 2.25,
    pExpDiv: 225,
    prestigeMinLog: 10,
    promoMin: 2000, // tuned (spec: 1000) — see test/sim.js / task-3 report
    promoPow: 0.75,
    // log10 of a fresh circle's base mult gain. Spec/wiki: 0.01; tuned to 0.04
    // so the first prestige lands at ~10 min instead of ~28 min (task-3 report).
    multGainLog0: Math.log10(0.04),
  };

  const DEFAULT_MODS = Object.freeze({
    lapMult: 1, gainLog: 0, expAdd: 0, prodLog: 0, ascBase: 10, ascMult: 1,
    v: Object.freeze([1, 1, 1, 1]), pMultMult: 1, pExpMult: 1, gainPow: 1,
    disabledPromo: Object.freeze([]), maxCircles: 10, noAscend: false, decay: 0,
  });

  const hooks = { mods: null, preTick: null, auto: null, postTick: null, stepDt: null };

  function registerHooks(h) {
    for (const k of Object.keys(h)) if (k in hooks) hooks[k] = h[k];
  }

  function mods(s) {
    return hooks.mods ? hooks.mods(s) : DEFAULT_MODS;
  }

  function isFixed(s) {
    return !(s.inf.broken && s.inf.ic.active === 0);
  }

  // --- log-space helpers ---

  function logAdd(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    if (a < b) { const t = a; a = b; b = t; }
    return a + Math.log10(1 + 10 ** (b - a));
  }

  function logSub(a, b) {
    // requires a >= b
    if (b === -Infinity) return a;
    if (Math.abs(a - b) < 1e-12) return -Infinity;
    return a + Math.log10(1 - 10 ** (b - a));
  }

  // --- state ---

  function freshCircle(i) {
    return {
      unlocked: i === 0,
      level: i === 0 ? 5 : 0,
      bought: 0,
      ascensions: 0,
      multLog: 0,
      multGainLog: TUNE.multGainLog0,
      progress: 0,
      laps: 0,
    };
  }

  function newState() {
    return {
      v: 2,
      scoreLog: -Infinity,
      circles: CIRCLES.map((_, i) => freshCircle(i)),
      pMult: 1,
      pExp: 1,
      prestigeReqLog: TUNE.prestigeMinLog,
      promo: [0, 0, 0, 0],
      infinities: 0,
      stats: {
        totalLaps: 0, prestiges: 0, promotions: 0, playTime: 0, bestScoreLog: -Infinity,
        fastestInfinity: null, lastInfinities: [], totalIpLog: -Infinity,
      },
      savedAt: 0,
      inf: {
        ipLog: -Infinity,
        upg: {},
        gens: Array.from({ length: 10 }, () => ({ b: 0, aLog: -Infinity })),
        gpLog: -Infinity,
        t: 0, tRun: 0,
        broken: false, pendingConfirm: false, finaleSeen: false,
        ic: { active: 0, done: Array(9).fill(false), best: Array(9).fill(null) },
        stars: { n: 0, nb: 0, ne: 0, sdLog: -Infinity, sdU: [0, 0, 0, 0] },
        auto: {
          buy: { on: true, circles: Array(10).fill(true) },
          asc: { on: true, circles: Array(10).fill(true) },
          promote: { on: true, order: [0, 1, 2, 3], xFactor: 2, minTime: 1 },
          prestige: { on: true, multX: 10, expGain: 0, minTime: 0.2 },
          infinity: { on: false, minIpLog: 0, minTime: 0 },
          stallSec: 30,
          confirmInfinity: false,
        },
        rt: { markLog: -Infinity, markT: 0 },
      },
    };
  }

  // --- merge / migrate ---

  function mergeDefaults(def, obj) {
    if (Array.isArray(def)) {
      if (!Array.isArray(obj)) return def;
      if (def.length === 0) return obj.slice();
      return def.map((d, i) => (i < obj.length ? mergeDefaults(d, obj[i]) : d));
    }
    if (def !== null && typeof def === 'object') {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return def;
      const keys = Object.keys(def);
      if (keys.length === 0) return Object.assign({}, obj);
      const out = {};
      for (const k of keys) {
        out[k] = k in obj ? mergeDefaults(def[k], obj[k]) : def[k];
      }
      return out;
    }
    return obj === undefined ? def : obj;
  }

  function migrate(obj) {
    if (!obj || typeof obj !== 'object' || (obj.v !== 1 && obj.v !== 2) ||
        !Array.isArray(obj.circles) || obj.circles.length !== 10) {
      throw new Error('Invalid save');
    }
    if (obj.v === 1) {
      obj.inf = Object.assign({}, obj.inf, { ipLog: obj.ip > 0 ? Math.log10(obj.ip) : -Infinity });
    }
    return Object.assign(mergeDefaults(newState(), obj), { v: 2 });
  }

  // --- formulas ---

  function promoEffects(s) {
    const m = mods(s);
    const L = s.promo.map((x, k) => (m.disabledPromo.includes(k) ? 0 : x));
    const p4 = 1 + 0.05 * Math.pow(L[3], 0.48) * m.v[3];
    const p1 = p4 * (Math.floor(Math.pow(L[0], 1.5)) * m.v[0] + 1);
    const p2 = p4 * (1 + Math.sqrt(L[1]) * m.v[1]);
    const p3 = p4 * (m.ascBase + Math.pow(L[2], 0.82) * m.v[2]) * m.ascMult;
    return { p1, p2, p3, p4 };
  }

  function levelCap(circle) {
    return 100 + 10 * circle.ascensions;
  }

  function lapsPerSec(s, i) {
    const c = s.circles[i];
    if (!c.unlocked) return 0;
    const def = CIRCLES[i];
    const p = promoEffects(s);
    return c.level * def.baseSpeed * p.p2 * mods(s).lapMult;
  }

  function multGainPerLapLog(s, i) {
    return s.circles[i].multGainLog + Math.log10(promoEffects(s).p1) + mods(s).gainLog;
  }

  function costLog(s, i) {
    const c = s.circles[i];
    const def = CIRCLES[i];
    const a = c.ascensions;
    const m = def.costMult;
    let sum = Math.log10(def.initCost);
    for (let k = 0; k < a; k++) {
      sum += (100 + 10 * k) * Math.log10(m + 0.1 * k);
    }
    sum += c.level * Math.log10(m + 0.1 * a);
    return sum;
  }

  function buy(s, i, n) {
    const c = s.circles[i];
    if (!c.unlocked) return 0;
    const cap = levelCap(c);
    const unlimited = n === 'max';
    let count = 0;
    while ((unlimited || count < n) && c.level < cap) {
      const cost = costLog(s, i);
      if (s.scoreLog >= cost) {
        s.scoreLog = logSub(s.scoreLog, cost);
        c.level++;
        c.bought++;
        count++;
      } else {
        break;
      }
    }
    if (c.bought >= 5 && i + 1 < mods(s).maxCircles) {
      const next = s.circles[i + 1];
      if (next && !next.unlocked) {
        next.unlocked = true;
        next.level = 0;
      }
    }
    return count;
  }

  function perRevLog(s) {
    const m = mods(s);
    let sum = 0;
    for (const c of s.circles) {
      if (c.unlocked) sum += c.multLog;
    }
    sum += Math.log10(s.pMult) + m.prodLog;
    return Math.max(0.1, s.pExp + m.expAdd) * sum;
  }

  function incomeLog(s) {
    let sum = 0;
    for (let i = 0; i < s.circles.length; i++) sum += lapsPerSec(s, i);
    if (sum <= 0) return -Infinity;
    return perRevLog(s) + Math.log10(sum);
  }

  function tick(s, dt) {
    const m = mods(s);
    s.inf.t += dt;
    s.inf.tRun += dt;
    if (hooks.preTick) hooks.preTick(s, dt, m);

    const p = promoEffects(s);
    const laps = new Array(s.circles.length).fill(0);
    let N = 0;
    for (let i = 0; i < s.circles.length; i++) {
      const c = s.circles[i];
      if (!c.unlocked) continue;
      const def = CIRCLES[i];
      const lps = c.level * def.baseSpeed * p.p2 * m.lapMult;
      c.progress += lps * dt;
      const n = Math.floor(c.progress);
      c.progress -= n;
      c.laps += n;
      laps[i] = n;
      if (n > 0) {
        c.multLog = logAdd(c.multLog, Math.log10(n) + c.multGainLog + Math.log10(p.p1) + m.gainLog);
      }
      N += n;
    }

    if (m.decay > 0) {
      for (const c of s.circles) {
        c.multLog = Math.max(0, c.multLog * Math.pow(1 - m.decay, dt));
      }
    }

    if (N > 0) {
      s.scoreLog = logAdd(s.scoreLog, Math.log10(N) + perRevLog(s));
    }
    if (isFixed(s) && s.scoreLog > INFINITY_LOG) s.scoreLog = INFINITY_LOG;

    s.stats.totalLaps += N;
    s.stats.playTime += dt;
    s.stats.bestScoreLog = Math.max(s.stats.bestScoreLog, s.scoreLog);

    if (hooks.auto) hooks.auto(s, dt);
    if (hooks.postTick) hooks.postTick(s, dt);
    return { laps };
  }

  function simulate(s, seconds) {
    const scoreLogBefore = s.scoreLog;
    let remaining = seconds;
    while (remaining > 0) {
      const dt = Math.min(1, remaining);
      tick(s, dt);
      remaining -= dt;
    }
    return { scoreLogBefore, scoreLogAfter: s.scoreLog };
  }

  // --- reset helper ---

  function resetRun(s) {
    s.scoreLog = -Infinity;
    s.circles = CIRCLES.map((_, i) => freshCircle(i));
  }

  // --- ascension ---

  function canAscend(s, i) {
    const c = s.circles[i];
    return !mods(s).noAscend && c.unlocked && c.level >= levelCap(c);
  }

  function ascend(s, i) {
    if (!canAscend(s, i)) return false;
    const c = s.circles[i];
    const p3 = promoEffects(s).p3;
    c.level = 5;
    c.ascensions++;
    c.multGainLog += Math.log10(p3);
    return true;
  }

  // --- prestige ---

  function rawPendingPMult(s, m) {
    if (s.scoreLog < 3) return 1;
    return TUNE.pMultBase * (s.scoreLog - 3) ** TUNE.pMultPow * m.pMultMult;
  }

  function pendingPrestige(s) {
    const m = mods(s);
    if (s.scoreLog < 3) return { pMult: 1, pExp: 1 };
    const pMult = Math.pow(rawPendingPMult(s, m), m.gainPow);
    const pExp = 1 + (Math.max(0, s.scoreLog - 5) / TUNE.pExpDiv) * m.pExpMult * m.gainPow;
    return { pMult, pExp };
  }

  function canPrestige(s) {
    return s.scoreLog >= Math.max(TUNE.prestigeMinLog, s.prestigeReqLog);
  }

  function prestige(s) {
    if (!canPrestige(s)) return false;
    const g = pendingPrestige(s);
    s.pMult = Math.max(s.pMult, g.pMult);
    s.pExp = Math.max(s.pExp, g.pExp);
    s.prestigeReqLog = s.scoreLog;
    s.stats.prestiges++;
    resetRun(s);
    s.inf.tRun = 0;
    s.inf.rt = { markLog: -Infinity, markT: 0 };
    return true;
  }

  // --- promotions ---

  function promoXp(s) {
    const m = mods(s);
    const pending = canPrestige(s) ? rawPendingPMult(s, m) : 0;
    const mm = Math.max(s.pMult, pending);
    if (mm < TUNE.promoMin) return 0;
    return Math.floor(Math.pow((mm / TUNE.promoMin) ** TUNE.promoPow, m.gainPow));
  }

  function canPromote(s, k) {
    return !mods(s).disabledPromo.includes(k) && promoXp(s) > s.promo[k];
  }

  function promote(s, k) {
    if (!canPromote(s, k)) return false;
    const xp = promoXp(s);
    s.promo[k] = xp;
    resetRun(s);
    s.pMult = 1;
    s.pExp = 1;
    s.prestigeReqLog = TUNE.prestigeMinLog;
    s.stats.promotions++;
    s.inf.tRun = 0;
    s.inf.rt = { markLog: -Infinity, markT: 0 };
    return true;
  }

  // --- infinity ---

  function canInfinity(s) {
    return s.scoreLog >= INFINITY_LOG;
  }

  // --- serialize ---

  function serialize(s) {
    const json = JSON.stringify(s, (k, v) => (v === -Infinity ? '-inf' : v));
    if (typeof btoa === 'function') return btoa(json);
    return Buffer.from(json, 'utf-8').toString('base64');
  }

  function deserialize(str) {
    try {
      const json = typeof atob === 'function'
        ? atob(str)
        : Buffer.from(str, 'base64').toString('utf-8');
      const obj = JSON.parse(json, (k, v) => (v === '-inf' ? -Infinity : v));
      return migrate(obj);
    } catch (e) {
      throw new Error('Invalid save');
    }
  }

  function fmtLog(x) {
    if (x === -Infinity) return '0';
    if (x < 6) {
      const v = 10 ** x;
      if (v < 1000) {
        // Up to 3 significant digits, trailing zeros trimmed (e.g. 0.04,
        // 1.9, 12.5, 999) instead of flooring small values to 0.
        const str = v.toPrecision(3);
        if (str.indexOf('e') === -1 && str.indexOf('E') === -1) {
          return str.indexOf('.') === -1 ? str : str.replace(/0+$/, '').replace(/\.$/, '');
        }
        // toPrecision rounded up into exponential form (e.g. 999.99 -> 1e+3);
        // fall through to the >=1000 integer formatting below.
      }
      return Math.floor(v + 1e-9).toLocaleString('en-US');
    }
    let exp = Math.floor(x);
    let mantissa = 10 ** (x - exp);
    let mantissaStr = mantissa.toFixed(2);
    if (parseFloat(mantissaStr) >= 10) {
      exp += 1;
      mantissa = mantissa / 10;
      mantissaStr = mantissa.toFixed(2);
    }
    const expStr = exp >= 1000 ? exp.toLocaleString('en-US') : String(exp);
    return `${mantissaStr}e${expStr}`;
  }

  return {
    CIRCLES,
    INFINITY_LOG,
    TUNE,
    DEFAULT_MODS,
    registerHooks,
    _hooks: hooks,
    mods,
    isFixed,
    newState,
    migrate,
    tick,
    simulate,
    lapsPerSec,
    multGainPerLapLog,
    perRevLog,
    incomeLog,
    levelCap,
    costLog,
    buy,
    canAscend,
    ascend,
    pendingPrestige,
    canPrestige,
    prestige,
    promoXp,
    canPromote,
    promote,
    canInfinity,
    serialize,
    deserialize,
    promoEffects,
    fmtLog,
    logAdd,
    logSub,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
  require('./engine-infinity.js');
  require('./engine-auto.js');
} else {
  window.Engine = Engine;
}

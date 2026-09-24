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
      multGainLog: -2,
      progress: 0,
      laps: 0,
    };
  }

  function newState() {
    return {
      v: 1,
      scoreLog: -Infinity,
      circles: CIRCLES.map((_, i) => freshCircle(i)),
      pMult: 1,
      pExp: 1,
      prestigeReqLog: 10,
      promo: [0, 0, 0, 0],
      ip: 0,
      infinities: 0,
      stats: { totalLaps: 0, prestiges: 0, promotions: 0, playTime: 0, bestScoreLog: -Infinity },
      savedAt: 0,
    };
  }

  // --- formulas ---

  function promoEffects(s) {
    const [L1, L2, L3, L4] = s.promo;
    const p4 = 1 + 0.05 * Math.pow(L4, 0.48);
    const p1 = p4 * (Math.floor(Math.pow(L1, 1.5)) + 1);
    const p2 = p4 * (1 + Math.sqrt(L2));
    const p3 = p4 * (10 + Math.pow(L3, 0.82));
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
    return c.level * def.baseSpeed * p.p2;
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
    if (c.bought >= 5) {
      const next = s.circles[i + 1];
      if (next && !next.unlocked) {
        next.unlocked = true;
        next.level = 0;
      }
    }
    return count;
  }

  function perRevLog(s) {
    let sum = 0;
    for (const c of s.circles) {
      if (c.unlocked) sum += c.multLog;
    }
    sum += Math.log10(s.pMult);
    return s.pExp * sum;
  }

  function incomeLog(s) {
    let sum = 0;
    for (let i = 0; i < s.circles.length; i++) sum += lapsPerSec(s, i);
    if (sum <= 0) return -Infinity;
    return perRevLog(s) + Math.log10(sum);
  }

  function tick(s, dt) {
    const p = promoEffects(s);
    const laps = new Array(s.circles.length).fill(0);
    let N = 0;
    for (let i = 0; i < s.circles.length; i++) {
      const c = s.circles[i];
      if (!c.unlocked) continue;
      const def = CIRCLES[i];
      const lps = c.level * def.baseSpeed * p.p2;
      c.progress += lps * dt;
      const n = Math.floor(c.progress);
      c.progress -= n;
      c.laps += n;
      laps[i] = n;
      if (n > 0) {
        c.multLog = logAdd(c.multLog, Math.log10(n) + c.multGainLog + Math.log10(p.p1));
      }
      N += n;
    }
    if (N > 0) {
      s.scoreLog = logAdd(s.scoreLog, Math.log10(N) + perRevLog(s));
    }
    s.stats.totalLaps += N;
    s.stats.playTime += dt;
    s.stats.bestScoreLog = Math.max(s.stats.bestScoreLog, s.scoreLog);
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

  function fmtLog(x) {
    if (x === -Infinity) return '0';
    if (x < 6) {
      return Math.floor(10 ** x + 1e-9).toLocaleString('en-US');
    }
    let exp = Math.floor(x);
    let mantissa = 10 ** (x - exp);
    let mantissaStr = mantissa.toFixed(2);
    if (parseFloat(mantissaStr) >= 10) {
      exp += 1;
      mantissa = mantissa / 10;
      mantissaStr = mantissa.toFixed(2);
    }
    return `${mantissaStr}e${exp}`;
  }

  return {
    CIRCLES,
    INFINITY_LOG,
    newState,
    tick,
    simulate,
    lapsPerSec,
    perRevLog,
    incomeLog,
    levelCap,
    costLog,
    buy,
    promoEffects,
    fmtLog,
    logAdd,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
else window.Engine = Engine;

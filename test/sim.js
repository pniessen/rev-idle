// Rev Idle pacing simulation — greedy "active player" bot.
//
// Usage: node test/sim.js            (or `npm run sim`)
// Env:   DT=<seconds>   tick size (default 0.1; a full run takes < 1 s wall)
//        HOURS=<h>      stop after h simulated hours (default 12)
//        TUNE='{"k":v}' override Engine.TUNE entries for experiments
//        QUIET=1        only print the summary line
//        PRESTIGE_X, PROMO_X, PROMO_FIRST, STALL_SEC  bot knobs (below)
//
// Bot strategy (proxy for a reasonable active player), every tick:
//   1. Ascend any circle that is at its level cap.
//   2. Buy the cheapest affordable level across all unlocked circles,
//      repeatedly, until nothing is affordable.
//   3. Stall tracking: the run is "stalled" when score has not gained a
//      further decade (x10) for STALL_SEC seconds (default 30).
//   4. Infinity: stop as soon as canInfinity.
//   5. Promote, cycling Mult Gain(0) -> Lap Speed(1) -> Asc Power(2) ->
//      Promo Power(3): take the next promotion k once
//      promoXp >= max(PROMO_FIRST=1, promo[k] * PROMO_X=2, promo[k]+1), i.e.
//      wait for the level to (at least) double rather than reset for +1.
//      If stalled and no prestige is available, take any promotion that
//      raises a level (next in cycle order first).
//   6. Prestige when allowed and either pMult is still 1 (first prestige
//      after a promotion), or pending pMult >= PRESTIGE_X (10) x current, or
//      the run is stalled and the prestige improves pMult by >1.5x or pExp
//      by >0.02.
//   The naive "+1 promotion" bot (PROMO_X=1) resets for tiny gains and is
//   ~2x slower to Infinity; a human would not play that way.
'use strict';

const E = require('../src/engine.js');

if (process.env.TUNE) Object.assign(E.TUNE, JSON.parse(process.env.TUNE));

const HOURS = Number(process.env.HOURS || 12);
const FIXED_DT = process.env.DT ? Number(process.env.DT) : null;
const QUIET = !!process.env.QUIET;
const PRESTIGE_X = Number(process.env.PRESTIGE_X || 10);
const PROMO_FIRST = Number(process.env.PROMO_FIRST || 1);
const PROMO_X = Number(process.env.PROMO_X || 2);
const STALL_SEC = Number(process.env.STALL_SEC || 30);

function fmtT(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`
    : `${m}m${String(s).padStart(2, '0')}s`;
}

function buyGreedy(s) {
  for (;;) {
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < s.circles.length; i++) {
      const c = s.circles[i];
      if (!c.unlocked || c.level >= E.levelCap(c)) continue;
      const cost = E.costLog(s, i);
      if (cost <= s.scoreLog && cost < bestCost) { bestCost = cost; best = i; }
    }
    if (best < 0) return;
    E.buy(s, best, 1);
  }
}

function run() {
  const s = E.newState();
  const events = [];
  const log = (t, what) => events.push({ t, what });
  const seenUnlock = new Set([0]);
  let firstAsc = false;
  let firstPrestige = null;
  let firstPromo = null;
  let infinityAt = null;
  let t = 0;
  const end = HOURS * 3600;
  let maxScore = -Infinity;
  let nextMark = 3;
  let markLog = -Infinity;
  let markT = 0;
  const wall0 = Date.now();

  while (t < end) {
    const dt = FIXED_DT || 0.1;
    E.tick(s, dt);
    t += dt;
    maxScore = Math.max(maxScore, s.scoreLog);
    while (s.scoreLog >= nextMark && firstPrestige === null) { log(t, `score 1e${nextMark}`); nextMark += 1; }

    // 1. ascend
    for (let i = 0; i < s.circles.length; i++) {
      if (E.canAscend(s, i)) {
        E.ascend(s, i);
        if (!firstAsc) { firstAsc = true; log(t, `first ascension (${E.CIRCLES[i].name})`); }
      }
    }
    // 2. buy
    buyGreedy(s);
    for (let i = 0; i < s.circles.length; i++) {
      if (s.circles[i].unlocked && !seenUnlock.has(i)) {
        seenUnlock.add(i);
        log(t, `unlock ${E.CIRCLES[i].name}`);
      }
    }
    // stall tracking: "progress" = score gained another decade
    if (s.scoreLog >= markLog + 1 || s.scoreLog < markLog) { markLog = s.scoreLog; markT = t; }
    const stalled = t - markT > STALL_SEC;

    // 5. infinity
    if (E.canInfinity(s)) { infinityAt = t; log(t, 'INFINITY'); break; }

    // 4. promote
    const k = s.stats.promotions % 4;
    const xp = E.promoXp(s);
    const need = Math.max(PROMO_FIRST, s.promo[k] * PROMO_X, s.promo[k] + 1);
    let pk = -1;
    if (xp >= need && E.canPromote(s, k)) pk = k;
    else if (stalled && !E.canPrestige(s)) {
      // stuck and no prestige available: take any promotion that raises a level
      for (let j = 0; j < 4 && pk < 0; j++) { const kk = (k + j) % 4; if (E.canPromote(s, kk)) pk = kk; }
    }
    if (pk >= 0) {
      const k = pk;
      const before = s.promo.slice();
      E.promote(s, k);
      markLog = -Infinity; markT = t;
      if (firstPromo === null) firstPromo = t;
      log(t, `promotion #${s.stats.promotions} k=${k} xp=${xp} levels ${before.join(',')} -> ${s.promo.join(',')}`);
      continue;
    }
    // 3. prestige
    if (E.canPrestige(s)) {
      const g = E.pendingPrestige(s);
      const better = g.pMult > 1.5 * s.pMult || g.pExp > s.pExp + 0.02;
      if (s.pMult === 1 || g.pMult >= PRESTIGE_X * s.pMult || (stalled && better)) {
        E.prestige(s);
        markLog = -Infinity; markT = t;
        if (firstPrestige === null) firstPrestige = t;
        log(t, `prestige #${s.stats.prestiges} pMult=${s.pMult.toPrecision(4)} pExp=${s.pExp.toFixed(4)} (score 1e${s.prestigeReqLog.toFixed(1)})`);
      }
    }
  }

  const wall = (Date.now() - wall0) / 1000;
  if (!QUIET) {
    for (const e of events) console.log(`${fmtT(e.t).padStart(11)}  ${e.what}`);
    console.log('');
  }
  const sum = {
    firstPrestige: firstPrestige === null ? '-' : fmtT(firstPrestige),
    firstPromotion: firstPromo === null ? '-' : fmtT(firstPromo),
    whiteUnlock: (events.find((e) => e.what === 'unlock White') || {}).t,
    infinity: infinityAt === null ? `- (max score 1e${maxScore.toFixed(1)}, promo ${s.promo.join(',')}, pMult ${s.pMult.toPrecision(3)})` : fmtT(infinityAt),
    prestiges: s.stats.prestiges,
    promotions: s.stats.promotions,
    wall: `${wall.toFixed(1)}s`,
  };
  if (sum.whiteUnlock !== undefined) sum.whiteUnlock = fmtT(sum.whiteUnlock);
  console.log('SUMMARY', JSON.stringify(sum));
  return sum;
}

if (require.main === module) run();
module.exports = { run };

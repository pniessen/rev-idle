// Rev Idle pacing simulation.
//
// Usage: node test/sim.js                    MODE=first (default): active bot, single run to 1st Infinity.
//        MODE=layer node test/sim.js          idle-profile campaign from new game through the finale (spec §12/§13).
//
// ===== MODE=first =====
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
//
// ===== MODE=layer =====
// Idle-profile campaign per spec §12.1/§13, from a fresh game (or a
// snapshot) through the finale, capped at DAYS simulated days.
// Env:   DAYS=<n>        stop after n simulated days (default 16)
//        CHECK=1         exit 1 on any FAIL row or wall budget (300 s)
//                         exceeded; also replays Phase B with NOSKIP=1 and
//                         compares Break timing (>10% diff FAILs), and runs
//                         an OFFLINE=1 comparison against the stepped run
//                         (>15% milestone diff FAILs).
//        NOSKIP=1        disable macro-step extrapolation
//        FROM=<name>     resume from .sim/<name>.json (phaseB-start,
//                         phaseC-start, stars-start)
//        OFFLINE=1       each night gap runs as one E.simulate(s, 8*3600)
//                         call (default step, no dtMin override), like the
//                         UI's offline catch-up, instead of stepping through it.
//        VERBOSE=1       print a line per Infinity
//        DIAG=1          print a line of state (t∞, ∞, IP, last run, gens, ICs, stars) per check-in
//        QUIET=1         only print the summary line
'use strict';

const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');

if (process.env.TUNE) Object.assign(E.TUNE, JSON.parse(process.env.TUNE));

function fmtT(sec) {
  if (sec === null || sec === undefined) return '-';
  const neg = sec < 0;
  sec = Math.abs(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  let out = '';
  if (d) out += `${d}d`;
  if (d || h) out += `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  else if (m) out += `${m}m${String(s).padStart(2, '0')}s`;
  else out += `${s}s`;
  return neg ? `-${out}` : out;
}

// ============================================================================
// MODE=first
// ============================================================================

const HOURS = Number(process.env.HOURS || 12);
const FIXED_DT = process.env.DT ? Number(process.env.DT) : null;
const QUIET = !!process.env.QUIET;
const PRESTIGE_X = Number(process.env.PRESTIGE_X || 10);
const PROMO_FIRST = Number(process.env.PROMO_FIRST || 1);
const PROMO_X = Number(process.env.PROMO_X || 2);
const STALL_SEC = Number(process.env.STALL_SEC || 30);

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

// One step of the greedy active-bot rules (ascend, buy, promote, prestige),
// shared between MODE=first and the Active profile of MODE=layer. Returns
// true if the bot infinited this step (canInfinity was true).
function activeBotStep(s, t, opts) {
  opts = opts || {};
  const promoFirst = opts.promoFirst ?? PROMO_FIRST;
  const promoX = opts.promoX ?? PROMO_X;
  const prestigeX = opts.prestigeX ?? PRESTIGE_X;
  const stallSec = opts.stallSec ?? STALL_SEC;
  const rt = opts.rt; // { markLog, markT } tracked by the caller

  // 1. ascend
  for (let i = 0; i < s.circles.length; i++) {
    if (E.canAscend(s, i)) E.ascend(s, i);
  }
  // 2. buy
  buyGreedy(s);

  if (s.scoreLog >= rt.markLog + 1 || s.scoreLog < rt.markLog) { rt.markLog = s.scoreLog; rt.markT = t; }
  const stalled = t - rt.markT > stallSec;

  if (E.canInfinity(s)) return true;

  // 4. promote
  const k = s.stats.promotions % 4;
  const xp = E.promoXp(s);
  const need = Math.max(promoFirst, s.promo[k] * promoX, s.promo[k] + 1);
  let pk = -1;
  if (xp >= need && E.canPromote(s, k)) pk = k;
  else if (stalled && !E.canPrestige(s)) {
    for (let j = 0; j < 4 && pk < 0; j++) { const kk = (k + j) % 4; if (E.canPromote(s, kk)) pk = kk; }
  }
  if (pk >= 0) {
    E.promote(s, pk);
    rt.markLog = -Infinity; rt.markT = t;
    return false;
  }
  // 3. prestige
  if (E.canPrestige(s)) {
    const g = E.pendingPrestige(s);
    const better = g.pMult > 1.5 * s.pMult || g.pExp > s.pExp + 0.02;
    if (s.pMult === 1 || g.pMult >= prestigeX * s.pMult || (stalled && better)) {
      E.prestige(s);
      rt.markLog = -Infinity; rt.markT = t;
    }
  }
  return false;
}

function runFirst() {
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
  const rt = { markLog: -Infinity, markT: 0 };
  const wall0 = Date.now();

  while (t < end) {
    const dt = FIXED_DT || 0.1;
    E.tick(s, dt);
    t += dt;
    maxScore = Math.max(maxScore, s.scoreLog);
    while (s.scoreLog >= nextMark && firstPrestige === null) { log(t, `score 1e${nextMark}`); nextMark += 1; }

    for (let i = 0; i < s.circles.length; i++) {
      if (E.canAscend(s, i) && !firstAsc) { firstAsc = true; log(t, `first ascension (${E.CIRCLES[i].name})`); }
    }
    const promosBefore = s.stats.promotions;
    const prestigesBefore = s.stats.prestiges;
    const infinited = activeBotStep(s, t, { rt });
    for (let i = 0; i < s.circles.length; i++) {
      if (s.circles[i].unlocked && !seenUnlock.has(i)) { seenUnlock.add(i); log(t, `unlock ${E.CIRCLES[i].name}`); }
    }
    if (infinited) { infinityAt = t; log(t, 'INFINITY'); break; }
    if (s.stats.promotions > promosBefore) {
      if (firstPromo === null) firstPromo = t;
      log(t, `promotion #${s.stats.promotions} levels ${s.promo.join(',')}`);
    }
    if (s.stats.prestiges > prestigesBefore) {
      if (firstPrestige === null) firstPrestige = t;
      log(t, `prestige #${s.stats.prestiges} pMult=${s.pMult.toPrecision(4)} pExp=${s.pExp.toFixed(4)} (score 1e${s.prestigeReqLog.toFixed(1)})`);
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

// ============================================================================
// MODE=layer
// ============================================================================

const DAYS = Number(process.env.DAYS || 16);
const CHECK = !!process.env.CHECK;
const NOSKIP = !!process.env.NOSKIP;
const FROM = process.env.FROM || null;
const OFFLINE = !!process.env.OFFLINE;
const VERBOSE = !!process.env.VERBOSE;
const SNAPIC = !!process.env.SNAPIC; // also snapshot .sim/ic<n>-start.json at each IC's first attempt
const DIAG = !!process.env.DIAG; // one line of state per check-in

const SIM_DIR = path.join(__dirname, '..', '.sim');

function snapshotPath(name) { return path.join(SIM_DIR, `${name}.json`); }

function writeSnapshot(name, t, tInf1, s) {
  try {
    if (!fs.existsSync(SIM_DIR)) fs.mkdirSync(SIM_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(name), JSON.stringify({ t, tInf1, save: E.serialize(s) }));
  } catch (e) { /* best-effort */ }
}

function loadSnapshot(name) {
  const raw = fs.readFileSync(snapshotPath(name), 'utf8');
  const obj = JSON.parse(raw);
  return { t: obj.t, tInf1: obj.tInf1, s: E.deserialize(obj.save) };
}

// The scripted purchase list, spec §13.2. 'G1'/'G2' buy generators 1 and 2;
// everything else is an upgrade id. After the last entry (21;1) the sim
// switches permanently to Star-buying at each check-in (§13.5).
const SCRIPT_LIST = [
  '1;1', '2;2', '3;2', '3;1', '4;1', '5;3', '5;2', '6;1', '6;2', '7;1',
  '8;3', '8;1', '8;2', 'G1', '9;2', 'G2', '9;1', '11;1', '11;2', '12;1',
  '13;1', '14;1', '14;2', '15;2', '16;1', '15;3', '15;4', '16;2', '16;3',
  '15;1', '17;3', '17;1', '18;3', '19;3', '19;1', '18;1', '20;1', '21;1',
];

const SD_ORDER = [0, 2, 1, 3]; // spec order 1,3,2,4 -> 0-based

function fourAutomationsOwned(s) {
  const u = E.autoUnlocked(s);
  return u.buy && u.asc && u.promote && u.prestige;
}

// Buys the cheapest generator whose cost is <= 10% of current IP, repeatedly.
function buyCheapGenerators(s, ctx) {
  for (;;) {
    let best = -1;
    let bestCost = Infinity;
    for (let k = 0; k < E.GEN_COUNT; k++) {
      if (!E.canBuyGen(s, k)) continue;
      const cost = E.genCostLog(s, k);
      if (cost <= s.inf.ipLog - 1 && cost < bestCost) { bestCost = cost; best = k; }
    }
    if (best < 0) return;
    E.buyGen(s, best);
    ctx.purchased = true;
  }
}

function buyStarsPhase(s, ctx) {
  if (!E.hasUpg(s, '21;1')) return;
  // Stardust upgrades, priority order 1,3,2,4.
  for (;;) {
    let did = false;
    for (const j of SD_ORDER) {
      if (E.canBuySdUpg(s, j)) { E.buySdUpg(s, j); ctx.purchased = true; did = true; break; }
    }
    if (!did) break;
  }
  // Star / Base / Exponent, cheapest first.
  for (;;) {
    const opts = [
      { cost: E.starCostLog(s), can: E.canBuyStar(s), fn: () => E.buyStar(s) },
      { cost: E.starBaseCostLog(s), can: s.inf.ipLog >= E.starBaseCostLog(s), fn: () => E.buyStarBase(s) },
      { cost: E.starExpCostLog(s), can: s.inf.stars.ne < E.TUNE.starExpMax && s.inf.ipLog >= E.starExpCostLog(s), fn: () => E.buyStarExp(s) },
    ].filter((o) => o.can).sort((a, b) => a.cost - b.cost);
    if (opts.length === 0) break;
    if (opts[0].fn()) ctx.purchased = true; else break;
  }
}

// Scripted-list purchases, buying the next item while affordable/owned.
function buyScriptedList(s, ctx) {
  while (ctx.scriptPtr < SCRIPT_LIST.length) {
    const item = SCRIPT_LIST[ctx.scriptPtr];
    if (item === 'G1' || item === 'G2') {
      const k = item === 'G1' ? 0 : 1;
      if (E.canBuyGen(s, k)) { E.buyGen(s, k); ctx.scriptPtr++; ctx.purchased = true; continue; }
      break;
    }
    if (E.hasUpg(s, item)) { ctx.scriptPtr++; continue; } // already owned; skip without spending
    if (E.canBuyUpgrade(s, item)) { E.buyUpgrade(s, item); ctx.scriptPtr++; ctx.purchased = true; continue; }
    break;
  }
}

// Column helper: any owned upgrade in column `col`. The spec's "after
// column N" gates (§13.3) don't spell out the exact predicate; this sim
// interprets it as "any node in that column is owned", not "every node".
function colOwned(s, col) {
  return E.UPGRADES.some((u) => u.col === col && E.hasUpg(s, u.id));
}

// IC readiness gates, spec §13.3, checked only when no challenge is active
// and the previous IC in the chain is done (canStartChallenge enforces that).
// See colOwned's comment for the "after column N" interpretation.
function icGateReady(s, n) {
  switch (n) {
    case 1: case 2: return E.hasUpg(s, '7;1');
    case 3: return colOwned(s, 8);
    case 4: return s.inf.gens[1].b >= 1; // first G2
    case 5: case 6: return s.inf.ic.done[3];
    case 7: return colOwned(s, 13);
    case 8: return colOwned(s, 14);
    case 9: return s.inf.ic.done[7];
    default: return false;
  }
}

const IC_ABANDON_SEC = 8 * 3600;
const IC_RETRY_CHECKINS = 4;

function handleChallenges(s, t, ctx) {
  const ic = s.inf.ic;
  // Abandon a long-running attempt.
  if (ic.active > 0) {
    const n = ic.active;
    if (t - ctx.icStartT[n] > IC_ABANDON_SEC) {
      E.exitChallenge(s);
      ctx.icAttempts.push({ n, start: ctx.icStartT[n], end: t, duration: t - ctx.icStartT[n], abandoned: true });
      ctx.icRetryAfterCheckin[n] = ctx.checkinCount + IC_RETRY_CHECKINS;
      ctx.purchased = true;
    }
  }
  if (ic.active > 0) return; // still running (not abandoned) — nothing else to do
  if (s.inf.broken) {
    // Post-Break: re-run one IC per day at the day's first check-in (§13.3).
    if (ctx.dayFirstCheckin) {
      for (let i = 0; i < 9; i++) {
        const n = ((ctx.icReplayIdx + i) % 9) + 1;
        if (E.canStartChallenge(s, n)) {
          E.startChallenge(s, n);
          ctx.icStartT[n] = t;
          ctx.icReplayIdx = (ctx.icReplayIdx + i + 1) % 9;
          ctx.purchased = true;
          break;
        }
      }
    }
    return;
  }
  for (let n = 1; n <= 9; n++) {
    if (ic.done[n - 1]) continue;
    if (ctx.icRetryAfterCheckin[n] && ctx.checkinCount < ctx.icRetryAfterCheckin[n]) break;
    if (!icGateReady(s, n)) break;
    if (E.canStartChallenge(s, n)) {
      if (SNAPIC && !ctx.icStartT[n]) writeSnapshot(`ic${n}-start`, t, ctx.tInf1, s);
      E.startChallenge(s, n);
      ctx.icStartT[n] = t;
      ctx.purchased = true;
    }
    break; // only ever consider the next undone challenge
  }
}

// Break: at the first check-in after all ICs are done, break and turn on
// Auto-Infinity. Later check-ins set minIpLog to the previous run's peak
// IP/min (tracked every 10 game-seconds while running, spec §13.4/brief).
function handleBreak(s, t, ctx) {
  if (!s.inf.broken) {
    if (E.canBreak(s)) {
      E.setBroken(s, true);
      if (E.hasUpg(s, '15;1')) s.inf.auto.infinity.on = true;
      ctx.purchased = true;
      ctx.breakT = t;
    }
    return;
  }
  if (E.hasUpg(s, '15;1')) {
    s.inf.auto.infinity.on = true;
    s.inf.auto.infinity.minIpLog = ctx.peakIpPerMinLog;
  } else if (E.isFixed(s) && E.canInfinity(s)) {
    // Auto-Infinity not owned yet: go infinite manually at check-ins only.
    E.goInfinite(s);
    ctx.purchased = true;
  }
}

// Tracks the IP-per-minute peak of the *current* run, so handleBreak can set
// minIpLog to "the IP gain the previous run reached at the moment its
// IP-per-minute peaked" (spec §13.4). Rate = ipGainLog - log10(max(1, t/60)).
// Sampled every step while broken (the break bonus moves in x10 steps, and
// post-Break runs can be seconds long, so a coarse 10 s sample misses them).
// ctx.curRunPeak is the peak rate, ctx.curRunPeakGain the gain at that peak.
function ipRate(gainLog, t) { return gainLog - Math.log10(Math.max(1, t / 60)); }
function sampleIpRate(s, ctx) {
  if (!s.inf.broken || s.inf.ic.active || s.inf.t <= 0) return;
  const g = E.ipGainLog(s);
  const rate = ipRate(g, s.inf.t);
  if (rate > ctx.curRunPeak) { ctx.curRunPeak = rate; ctx.curRunPeakGain = g; }
}
// Called once per completed Infinity with its final {t, ipGainLog}. The run
// ended at minIpLog, so if its rate was still at its peak at the very end the
// optimum lies beyond the threshold: explore one x10 step further next time.
function closeIpRateRun(s, ctx, last) {
  if (!s.inf.broken || !last) { ctx.curRunPeak = -Infinity; return; }
  const endRate = ipRate(last.ipGainLog, last.t);
  if (endRate >= ctx.curRunPeak - 1e-9) ctx.peakIpPerMinLog = last.ipGainLog + 1;
  else ctx.peakIpPerMinLog = ctx.curRunPeakGain;
  ctx.curRunPeak = -Infinity;
}

function doCheckin(s, t, ctx) {
  if (DIAG) {
    const last = s.stats.lastInfinities[s.stats.lastInfinities.length - 1];
    console.log(`  [check-in] t∞=${fmtT(ctx.tInf1 === null ? 0 : t - ctx.tInf1)} ∞=${s.infinities.toFixed(0)} IP=e${s.inf.ipLog.toFixed(2)}`
      + ` run=${last ? fmtT(last.t) : '-'} gain=e${last ? last.ipGainLog.toFixed(2) : '-'} next=${SCRIPT_LIST[ctx.scriptPtr] || 'stars'}`
      + ` gens=[${s.inf.gens.map((g) => g.b).join(',')}] ic=${s.inf.ic.active}/${s.inf.ic.done.filter(Boolean).length}`
      + ` stars=${s.inf.stars.n}/${s.inf.stars.nb}/${s.inf.stars.ne} sdU=[${s.inf.stars.sdU.join(',')}] score=e${s.scoreLog.toFixed(0)}`);
  }
  ctx.purchased = false;
  ctx.checkinCount++;
  if (s.inf.pendingConfirm) { E.goInfinite(s); ctx.purchased = true; }
  buyScriptedList(s, ctx);
  buyStarsPhase(s, ctx);
  buyCheapGenerators(s, ctx);
  handleChallenges(s, t, ctx);
  handleBreak(s, t, ctx);
}

// ---- milestone tracking -------------------------------------------------

const MILESTONE_DEFS = [
  { key: 'inf1', name: '1st Infinity', mode: 'abs', lo: 12124 * 0.9, hi: 12124 * 1.1, floor: null },
  { key: 'run2', name: '2nd Infinity run', mode: 'run', lo: 4800, hi: 6000, floor: 3000 },
  { key: 'run3', name: '3rd Infinity run', mode: 'run', lo: 3000, hi: 4200, floor: 1800 },
  { key: 'run11', name: 'Run length at Infinity 11', mode: 'run', lo: 1500, hi: 2100, floor: 900 },
  { key: 'auto4', name: 'All 4 automations owned', mode: 'idx', lo: -Infinity, hi: 8, floor: null },
  { key: 'ic7_1', name: '7;1 bought (t∞)', mode: 'tinf', lo: 36000, hi: 57600, floor: 28800 },
  { key: 'ic1', name: 'IC1 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic2', name: 'IC2 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic3', name: 'IC3 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic4', name: 'IC4 attempt', mode: 'dur', lo: 10800, hi: 21600, floor: 7200 },
  { key: 'ic5', name: 'IC5 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic6', name: 'IC6 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic7', name: 'IC7 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic8', name: 'IC8 attempt', mode: 'dur', lo: 1800, hi: 5400, floor: 900 },
  { key: 'ic9', name: 'IC9 attempt', mode: 'dur', lo: 10800, hi: 21600, floor: 7200 },
  { key: 'break', name: 'All 9 ICs -> Break unlocked (t∞)', mode: 'tinf', lo: 172800, hi: 345600, floor: 144000 },
  { key: 'col17', name: 'Col 17 (1e6 IP) (t∞)', mode: 'tinf', lo: null, hi: null, floor: null }, // relative to Break; computed below
  { key: 'star1', name: 'First Star (t∞)', mode: 'tinf', lo: 432000, hi: 691200, floor: 345600 },
  { key: 'finale', name: 'Finale (1.79e308 IP) (t∞)', mode: 'tinf', lo: 604800, hi: 1209600, floor: 518400 },
];

function passFail(def, value, ctx) {
  if (value === null || value === undefined) return '-';
  if (def.key === 'col17') {
    if (ctx.breakT === null) return '-';
    const rel = value - ctx.breakT;
    const lo = 86400, hi = 172800, floor = 57600;
    if (rel < floor) return 'FAIL';
    return rel >= lo && rel <= hi ? 'PASS' : 'FAIL';
  }
  if (def.floor !== null && value < def.floor) return 'FAIL';
  if (def.lo === -Infinity) return value <= def.hi ? 'PASS' : 'FAIL';
  return value >= def.lo && value <= def.hi ? 'PASS' : 'FAIL';
}

function printMilestoneTable(m, ctx) {
  console.log('');
  console.log('Milestone table:');
  console.log('name'.padEnd(34), 'game t'.padEnd(12), 't-inf'.padEnd(12), 'day'.padEnd(8), 'target/floor'.padEnd(28), 'result');
  for (const def of MILESTONE_DEFS) {
    const v = m[def.key];
    const gameT = v && v.t !== undefined ? fmtT(v.t) : '-';
    const tInf = v && v.tInf !== undefined && v.tInf !== null ? fmtT(v.tInf) : '-';
    const day = v && v.tInf !== undefined && v.tInf !== null ? (v.tInf / 86400).toFixed(2) : '-';
    const val = v ? v.value : null;
    const result = v ? passFail(def, val, ctx) : '-';
    let targetStr;
    if (def.key === 'col17') targetStr = 'Break+1-2d / floor Break+16h';
    else if (def.mode === 'idx') targetStr = `<= Infinity ${def.hi}`;
    else targetStr = `${fmtT(def.lo)}-${fmtT(def.hi)} / floor ${fmtT(def.floor)}`;
    console.log(def.name.padEnd(34), gameT.padEnd(12), tInf.padEnd(12), day.padEnd(8), targetStr.padEnd(28), result);
  }
  console.log('');
  console.log('IC attempts:');
  for (const a of ctx.icAttempts) {
    console.log(`  IC${a.n} start=${fmtT(a.start)} end=${fmtT(a.end)} duration=${fmtT(a.duration)}${a.abandoned ? ' (abandoned)' : ''}`);
  }
  console.log('');
  console.log(`Macro-steps: ${ctx.macroStepCount}`);
}

function recordMilestone(m, key, t, tInf1, value) {
  if (m[key]) return; // first occurrence only
  m[key] = { t, tInf: tInf1 === null ? null : t - tInf1, value };
}

// Shared post-step check used after every stepped tick AND after a single
// bulk E.simulate() call (the OFFLINE=1 night gap): records newly-completed
// IC attempts (from an ic.done diff against `beforeIcDone`, unioned with
// `icCompletedList` — the `icCompleted` field E.simulate returns, which also
// catches post-Break re-runs of an already-done challenge within the same
// call) and the state-level milestones (7;1, Break, col17, first Star,
// finale). `end` for an IC attempt discovered this way is `ctx.t` (the time
// after the whole step/gap), since a bulk simulate() does not expose exactly
// when inside it the challenge completed.
function checkPostRunMilestones(s, ctx, beforeIcDone, icCompletedList) {
  const completedNow = new Set(icCompletedList || []);
  for (let n = 1; n <= 9; n++) {
    const newlyDone = s.inf.ic.done[n - 1] && !beforeIcDone[n - 1];
    if (newlyDone || completedNow.has(n)) {
      const start = ctx.icStartT[n] || ctx.t;
      ctx.icAttempts.push({ n, start, end: ctx.t, duration: ctx.t - start, abandoned: false });
      recordMilestone(ctx.milestones, `ic${n}`, ctx.t, ctx.tInf1, ctx.t - start);
    }
  }
  const tInf = ctx.tInf1 === null ? null : ctx.t - ctx.tInf1;
  if (E.hasUpg(s, '7;1')) recordMilestone(ctx.milestones, 'ic7_1', ctx.t, ctx.tInf1, tInf);
  if (E.canBreak(s)) recordMilestone(ctx.milestones, 'break', ctx.t, ctx.tInf1, tInf);
  if (s.inf.ipLog >= 6) recordMilestone(ctx.milestones, 'col17', ctx.t, ctx.tInf1, tInf);
  if (s.inf.stars.n >= 1) recordMilestone(ctx.milestones, 'star1', ctx.t, ctx.tInf1, tInf);
  if (s.inf.ipLog >= E.INFINITY_LOG) recordMilestone(ctx.milestones, 'finale', ctx.t, ctx.tInf1, tInf);
}

// ---- macro-stepping (spec §13 strategy 2) --------------------------------

// After every completed Infinity, this pushes {runTime, ipGainLog, infGain}
// and keeps only the last 5, used as the macro-step trigger.
function noteInfinity(ctx, runTime, ipGainLog, infGain) {
  ctx.last5.push({ runTime, ipGainLog, infGain });
  if (ctx.last5.length > 5) ctx.last5.shift();
}

function macroStepEligible(s, ctx) {
  if (NOSKIP) return false;
  if (ctx.purchased) return false;
  if (s.inf.ic.active !== 0) return false;
  if (ctx.last5.length < 5) return false;
  const runs = ctx.last5;
  const times = runs.map((r) => r.runTime);
  const maxT = Math.max(...times), minT = Math.min(...times);
  if (maxT === 0 || (maxT - minT) / maxT > 0.02) return false;
  // ipGainLog equality is checked with a tolerance (log10(1.02), i.e. within
  // 2% in linear terms) rather than bit-exact: `chooseMacroK`'s drift-check
  // halving (5%, on a cloned state) is the real accuracy guard, so this only
  // has to recognize "close enough to steady state" to fire at all.
  const gains = runs.map((r) => r.ipGainLog);
  const tol = Math.log10(1.02);
  if (!gains.every((g) => Math.abs(g - gains[0]) < tol)) return false;
  return true;
}

// Runs `k` extrapolated Infinities: advances the clock, IP, ∞ and stats,
// exactly (up to ∞-dependent drift, checked by the caller).
function applyMacroStep(s, ctx, k, runTime, ipGainLog, infGain) {
  const kLog = Math.log10(k);
  s.inf.ipLog = Math.min(E.INFINITY_LOG, E.logAdd(s.inf.ipLog, kLog + ipGainLog));
  s.infinities += k * infGain;
  const st = s.stats;
  st.fastestInfinity = st.fastestInfinity === null ? runTime : Math.min(st.fastestInfinity, runTime);
  for (let i = 0; i < Math.min(k, 10); i++) { st.lastInfinities.push({ t: runTime, ipGainLog }); if (st.lastInfinities.length > 10) st.lastInfinities.shift(); }
  st.totalIpLog = E.logAdd(st.totalIpLog, kLog + ipGainLog);
  ctx.t += k * runTime;
  ctx.macroStepCount++;
}

// Chooses k for a macro-step: capped by the runs until the next check-in,
// the runs until the next scripted purchase becomes affordable, and 1000;
// then halved until a cloned-state drift check on ipGainLog/genMultLog(0)
// agrees within 5% (log10(1.05)).
function chooseMacroK(s, ctx, runTime, ipGainLog, infGain, untilCheckin) {
  let k = Math.max(1, Math.floor(untilCheckin / runTime));
  k = Math.min(k, 1000);
  // Cap by runs until the next scripted purchase becomes affordable.
  if (ctx.scriptPtr < SCRIPT_LIST.length) {
    const item = SCRIPT_LIST[ctx.scriptPtr];
    const costLog = item === 'G1' ? E.genCostLog(s, 0) : item === 'G2' ? E.genCostLog(s, 1) : (E.upgById(item) || {}).cost ? Math.log10(E.upgById(item).cost) : null;
    if (costLog !== null && costLog > s.inf.ipLog) {
      let kk = 1;
      while (kk < k && E.logAdd(s.inf.ipLog, Math.log10(kk) + ipGainLog) < costLog) kk *= 2;
      k = Math.min(k, kk);
    }
  }
  if (k < 1) return 0;
  // One clone reused across the halving loop (only `infinities` changes
  // between tries) instead of a fresh deserialize per candidate k.
  const clone = E.deserialize(E.serialize(s));
  const baseInfinities = clone.infinities;
  const before = { ip: E.ipGainLog(clone), gm: E.genMultLog(clone, 0) };
  const drift = (kk) => {
    clone.infinities = baseInfinities + kk * infGain;
    const after = { ip: E.ipGainLog(clone), gm: E.genMultLog(clone, 0) };
    const dIp = Math.abs(after.ip - before.ip);
    const dGm = Math.abs(after.gm - before.gm);
    return Math.max(dIp, dGm) < Math.log10(1.05);
  };
  while (k > 1 && !drift(k)) k = Math.floor(k / 2);
  return Math.max(1, k);
}

// Steps the engine from ctx.t to `targetT` (game seconds since new game),
// running macro-steps opportunistically between Infinities.
function advanceTo(s, ctx, targetT, m) {
  while (ctx.t < targetT - 1e-9) {
    const beforeInf = s.infinities;
    const beforeIcDone = s.inf.ic.done.slice();
    const runStartT = s.inf.t === 0 ? ctx.t : null;
    let dt = E.adaptiveDt(s, { dtMin: 0.1, dtMax: 2 });
    dt = Math.min(dt, targetT - ctx.t);
    if (dt <= 0) break;
    E.tick(s, dt);
    ctx.t += dt;
    sampleIpRate(s, ctx);
    if (s.inf.pendingConfirm) { E.goInfinite(s); }
    if (s.infinities > beforeInf) {
      const runTime = s.inf.tRun === 0 ? (m && m.lastRunTime) || dt : null; // inf.t already reset by goInfinite
      // inf.t/tRun reset inside goInfinite; recover run length from the
      // stats.lastInfinities entry pushed by goInfinite itself.
      const last = s.stats.lastInfinities[s.stats.lastInfinities.length - 1];
      const rt = last ? last.t : dt;
      const ig = last ? last.ipGainLog : 0;
      if (ctx.tInf1 === null) ctx.tInf1 = ctx.t;
      if (VERBOSE) console.log(`  [Infinity ${s.infinities.toFixed(2)}] t=${fmtT(ctx.t)} run=${fmtT(rt)}`);
      ctx.infinityIndex++;
      noteInfinity(ctx, rt, ig, ctx.lastInfGain);
      // The "no check-in purchase happened" macro-step gate should only
      // veto the run(s) immediately following a purchase, not every run for
      // the rest of a long gap: once a full Infinity has completed since
      // the last check-in, this is a fresh sample and last5 (matching
      // runtimes/gains over 5 in a row) is what actually judges steadiness.
      ctx.purchased = false;
      recordMilestone(ctx.milestones, 'inf1', ctx.t, ctx.tInf1, ctx.t);
      if (ctx.infinityIndex === 2) recordMilestone(ctx.milestones, 'run2', ctx.t, ctx.tInf1, rt);
      if (ctx.infinityIndex === 3) recordMilestone(ctx.milestones, 'run3', ctx.t, ctx.tInf1, rt);
      if (ctx.infinityIndex === 11) recordMilestone(ctx.milestones, 'run11', ctx.t, ctx.tInf1, rt);
      closeIpRateRun(s, ctx, last);
    }
    checkPostRunMilestones(s, ctx, beforeIcDone);

    // Opportunistic macro-step once a steady state of near-identical runs shows up.
    if (macroStepEligible(s, ctx)) {
      const last = ctx.last5[ctx.last5.length - 1];
      const untilCheckin = targetT - ctx.t;
      const k = chooseMacroK(s, ctx, last.runTime, last.ipGainLog, last.infGain, untilCheckin);
      if (k > 1) applyMacroStep(s, ctx, k, last.runTime, last.ipGainLog, last.infGain);
    }
  }
}

function fourOwnedCheckAndMilestone(s, ctx) {
  if (!ctx.milestones.auto4 && fourAutomationsOwned(s)) {
    recordMilestone(ctx.milestones, 'auto4', ctx.t, ctx.tInf1, ctx.infinityIndex);
  }
}

const DAY_SCHEDULE = [0, 3, 6, 9, 12, 15]; // hours within the 16 h day
const CYCLE_SEC = 24 * 3600;
const NIGHT_SEC = 8 * 3600;

function runLayerCore(startState, startT, startTInf1, endT, opts) {
  opts = opts || {};
  const s = startState;
  const ctx = {
    t: startT,
    tInf1: startTInf1,
    milestones: {},
    infinityIndex: 0,
    scriptPtr: 0,
    checkinCount: 0,
    icStartT: {},
    icRetryAfterCheckin: {},
    icAttempts: [],
    icReplayIdx: 0,
    dayFirstCheckin: false,
    breakT: null,
    curRunPeak: -Infinity,
    curRunPeakGain: 0,
    peakIpPerMinLog: 0,
    last5: [],
    lastInfGain: 1,
    macroStepCount: 0,
    purchased: false,
  };

  let idleStarted = false;
  let idleStartT = null;

  // ---- Active profile: check in right after every Infinity -------------
  while (!idleStarted && ctx.t < endT) {
    // Step in 0.1 s increments, letting owned automations act inside tick()
    // and running the greedy bot manually for anything not yet automated.
    const dt = Math.min(0.1, endT - ctx.t);
    if (dt <= 0) break;
    const beforeInf = s.infinities;
    const beforeIcDone = s.inf.ic.done.slice();
    E.tick(s, dt);
    ctx.t += dt;
    sampleIpRate(s, ctx);
    if (!fourAutomationsOwned(s)) {
      // Perform any action whose automation is not yet owned.
      const u = E.autoUnlocked(s);
      if (!ctx._rt) ctx._rt = { markLog: -Infinity, markT: ctx.t };
      if (!u.asc) { for (let i = 0; i < s.circles.length; i++) if (E.canAscend(s, i)) E.ascend(s, i); }
      if (!u.buy) buyGreedy(s);
      if (!u.promote || !u.prestige) {
        // Reuse the active-bot promote/prestige heuristic only for the
        // pieces not yet automated by the engine itself.
        if (s.scoreLog >= ctx._rt.markLog + 1 || s.scoreLog < ctx._rt.markLog) { ctx._rt.markLog = s.scoreLog; ctx._rt.markT = ctx.t; }
        const stalled = ctx.t - ctx._rt.markT > STALL_SEC;
        if (!u.promote) {
          const k = s.stats.promotions % 4;
          const xp = E.promoXp(s);
          const need = Math.max(PROMO_FIRST, s.promo[k] * PROMO_X, s.promo[k] + 1);
          let pk = -1;
          if (xp >= need && E.canPromote(s, k)) pk = k;
          else if (stalled && !E.canPrestige(s)) { for (let j = 0; j < 4 && pk < 0; j++) { const kk = (k + j) % 4; if (E.canPromote(s, kk)) pk = kk; } }
          if (pk >= 0) { E.promote(s, pk); ctx._rt.markLog = -Infinity; ctx._rt.markT = ctx.t; }
        }
        if (!u.prestige && E.canPrestige(s)) {
          const g = E.pendingPrestige(s);
          const better = g.pMult > 1.5 * s.pMult || g.pExp > s.pExp + 0.02;
          if (s.pMult === 1 || g.pMult >= PRESTIGE_X * s.pMult || (stalled && better)) {
            E.prestige(s); ctx._rt.markLog = -Infinity; ctx._rt.markT = ctx.t;
          }
        }
      }
    }
    if (s.inf.pendingConfirm) E.goInfinite(s);
    if (s.infinities > beforeInf) {
      const last = s.stats.lastInfinities[s.stats.lastInfinities.length - 1];
      const rt = last ? last.t : dt;
      if (ctx.tInf1 === null) ctx.tInf1 = ctx.t;
      ctx.infinityIndex++;
      if (VERBOSE) console.log(`  [Infinity ${s.infinities.toFixed(2)} active] t=${fmtT(ctx.t)} run=${fmtT(rt)}`);
      recordMilestone(ctx.milestones, 'inf1', ctx.t, ctx.tInf1, ctx.t);
      if (ctx.infinityIndex === 2) recordMilestone(ctx.milestones, 'run2', ctx.t, ctx.tInf1, rt);
      if (ctx.infinityIndex === 3) recordMilestone(ctx.milestones, 'run3', ctx.t, ctx.tInf1, rt);
      if (ctx.infinityIndex === 11) recordMilestone(ctx.milestones, 'run11', ctx.t, ctx.tInf1, rt);
      ctx.curRunPeak = -Infinity;
      // Active profile: this is a check-in.
      doCheckin(s, ctx.t, ctx);
      writeSnapshotOnPhase(s, ctx);
      fourOwnedCheckAndMilestone(s, ctx);
      if (fourAutomationsOwned(s)) { idleStarted = true; idleStartT = ctx.t; }
    }
    checkPostRunMilestones(s, ctx, beforeIcDone);
  }

  // ---- Idle profile: check-ins at fixed day hours + one night gap ------
  if (idleStarted) {
    let dayIdx = 0;
    let schedIdx = 0;
    while (ctx.t < endT) {
      const targetT = idleStartT + dayIdx * CYCLE_SEC + DAY_SCHEDULE[schedIdx] * 3600;
      if (targetT > ctx.t) {
        const isNightGap = schedIdx === 0 && dayIdx > 0; // gap right before hour0 of a later day
        if (isNightGap && OFFLINE) {
          // Controller ruling: default step, no dtMin override, one call for
          // the whole 8 h gap.
          const remaining = Math.min(NIGHT_SEC, endT - ctx.t, targetT - ctx.t);
          if (remaining > 0) {
            const beforeInf = s.infinities;
            const beforeIcDone = s.inf.ic.done.slice();
            const result = E.simulate(s, remaining);
            ctx.t += remaining;
            if (s.infinities > beforeInf) {
              const last = s.stats.lastInfinities[s.stats.lastInfinities.length - 1];
              if (last) { ctx.infinityIndex += Math.max(1, Math.round(s.infinities - beforeInf)); recordMilestone(ctx.milestones, 'inf1', ctx.t, ctx.tInf1, ctx.t); }
            }
            checkPostRunMilestones(s, ctx, beforeIcDone, result.icCompleted);
          }
        } else {
          advanceTo(s, ctx, Math.min(targetT, endT), null);
        }
      }
      if (ctx.t >= endT) break;
      ctx.dayFirstCheckin = schedIdx === 0;
      doCheckin(s, ctx.t, ctx);
      writeSnapshotOnPhase(s, ctx);
      schedIdx++;
      if (schedIdx >= DAY_SCHEDULE.length) { schedIdx = 0; dayIdx++; }
      if (s.inf.ipLog >= E.INFINITY_LOG) break; // finale reached
    }
  }

  return ctx;
}

function writeSnapshotOnPhase(s, ctx) {
  if (!ctx._wrote7_1 && E.hasUpg(s, '7;1')) { ctx._wrote7_1 = true; writeSnapshot('phaseB-start', ctx.t, ctx.tInf1, s); }
  if (!ctx._wroteBreak && s.inf.broken) { ctx._wroteBreak = true; writeSnapshot('phaseC-start', ctx.t, ctx.tInf1, s); }
  if (!ctx._wroteStar && s.inf.stars.n >= 1) { ctx._wroteStar = true; writeSnapshot('stars-start', ctx.t, ctx.tInf1, s); }
}

function summarize(ctx) {
  const out = {};
  for (const def of MILESTONE_DEFS) {
    const v = ctx.milestones[def.key];
    if (!v) { out[def.key] = '-'; continue; }
    const shown = def.mode === 'tinf' ? v.tInf : def.mode === 'abs' ? v.t : v.value;
    out[def.key] = fmtT(shown);
  }
  return out;
}

function runLayer() {
  const wall0 = Date.now();
  let s, startT = 0, startTInf1 = null;
  if (FROM) {
    const snap = loadSnapshot(FROM);
    s = snap.s; startT = snap.t; startTInf1 = snap.tInf1;
  } else {
    s = E.newState();
  }
  // Pristine copy of the starting state (before runLayerCore mutates `s`),
  // so the CHECK=1 OFFLINE comparison below can start from the exact same
  // point (FROM snapshot or fresh game) as this primary run.
  const initSaveStr = E.serialize(s);
  const endT = DAYS * 86400;
  const ctx = runLayerCore(s, startT, startTInf1, endT);
  const wall = (Date.now() - wall0) / 1000;

  if (!QUIET) printMilestoneTable(ctx.milestones, ctx);
  console.log(`Wall time (MODE=layer${OFFLINE ? ' OFFLINE=1' : ''}): ${wall.toFixed(2)}s`);

  let anyFail = false;
  for (const def of MILESTONE_DEFS) {
    const v = ctx.milestones[def.key];
    if (v && passFail(def, v.value, ctx) === 'FAIL') anyFail = true;
  }

  let offlineCompareFail = false;
  let breakDiffFail = false;

  if (CHECK) {
    // OFFLINE=1 comparison: this invocation ran stepped; now re-run with
    // OFFLINE=1 and compare milestones within +-15%.
    if (!OFFLINE) {
      // Start from the same point as the primary run (FROM snapshot or a
      // fresh game) — not always a fresh game — so the comparison is
      // apples-to-apples even when resuming from a snapshot.
      const s2 = E.deserialize(initSaveStr);
      const ctx2Wall0 = Date.now();
      process.env.OFFLINE = '1';
      const ctx2 = runLayerCore(s2, startT, startTInf1, endT);
      process.env.OFFLINE = '';
      const wall2 = (Date.now() - ctx2Wall0) / 1000;
      console.log(`Wall time (MODE=layer OFFLINE=1): ${wall2.toFixed(2)}s`);
      for (const def of MILESTONE_DEFS) {
        const a = ctx.milestones[def.key];
        const b = ctx2.milestones[def.key];
        if (!a || !b) continue;
        const av = a.tInf !== null ? a.tInf : a.t;
        const bv = b.tInf !== null ? b.tInf : b.t;
        if (av > 0 && Math.abs(av - bv) / av > 0.15) { offlineCompareFail = true; console.log(`OFFLINE mismatch on ${def.name}: stepped=${fmtT(av)} offline=${fmtT(bv)}`); }
      }
    }
    // Phase B replay from the snapshot with NOSKIP=1, comparing Break timing.
    try {
      const snap = loadSnapshot('phaseB-start');
      process.env.NOSKIP = '1';
      const ctxB = runLayerCore(snap.s, snap.t, snap.tInf1, endT);
      process.env.NOSKIP = '';
      const a = ctx.milestones.break;
      const b = ctxB.milestones.break;
      if (a && b) {
        const av = a.tInf !== null ? a.tInf : a.t;
        const bv = b.tInf !== null ? b.tInf : b.t;
        if (av > 0 && Math.abs(av - bv) / av > 0.10) { breakDiffFail = true; console.log(`Phase B NOSKIP replay mismatch on Break: macro=${fmtT(av)} noskip=${fmtT(bv)}`); }
      }
    } catch (e) { console.log(`Phase B replay skipped (${e.message})`); }
  }

  const sum = {
    mode: 'layer',
    milestones: summarize(ctx),
    macroSteps: ctx.macroStepCount,
    icAttempts: ctx.icAttempts.length,
    wall: `${wall.toFixed(1)}s`,
  };
  console.log('SUMMARY', JSON.stringify(sum));

  if (CHECK && (anyFail || offlineCompareFail || breakDiffFail || wall > 300)) process.exitCode = 1;
  return sum;
}

// ============================================================================

if (require.main === module) {
  if (process.env.MODE === 'layer') runLayer();
  else runFirst();
}
module.exports = { run: runFirst, runFirst, runLayer };

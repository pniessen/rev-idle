'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);
const b64 = (o) => Buffer.from(JSON.stringify(o, (k, v) => (v === -Infinity ? '-inf' : v))).toString('base64');
function v1Save(extra) {
  const s = E.newState();
  return Object.assign({
    v: 1, scoreLog: -Infinity, circles: s.circles, pMult: 1, pExp: 1, prestigeReqLog: 10, promo: [0, 0, 0, 0],
    ip: 0, infinities: 0, stats: { totalLaps: 5, prestiges: 2, promotions: 1, playTime: 100, bestScoreLog: 12 }, savedAt: 123,
  }, extra);
}

test('newState is v2 with Infinity defaults', () => {
  const s = E.newState();
  assert.equal(s.v, 2); assert.ok(!('ip' in s));
  assert.equal(s.inf.ipLog, -Infinity);
  assert.equal(s.inf.gens.length, 10);
  assert.deepEqual(s.inf.gens[0], { b: 0, aLog: -Infinity });
  assert.deepEqual(s.inf.ic, { active: 0, done: Array(9).fill(false), best: Array(9).fill(null) });
  assert.deepEqual(s.inf.stars, { n: 0, nb: 0, ne: 0, sdLog: -Infinity, sdU: [0, 0, 0, 0] });
  assert.deepEqual(s.inf.auto.prestige, { on: true, multX: 10, expGain: 0, minTime: 0.2 });
  assert.deepEqual(s.inf.auto.promote, { on: true, order: [0, 1, 2, 3], xFactor: 2, minTime: 1 });
  assert.equal(s.inf.auto.confirmInfinity, false);
  assert.equal(s.stats.fastestInfinity, null);
  assert.deepEqual(s.stats.lastInfinities, []);
});

test('v1 save with ip 1 migrates to ipLog 0 and keeps v1 fields', () => {
  const s = E.deserialize(b64(v1Save({ ip: 1, infinities: 1 })));
  assert.equal(s.v, 2); assert.equal(s.inf.ipLog, 0); assert.ok(!('ip' in s));
  assert.equal(s.infinities, 1); assert.equal(s.stats.prestiges, 2); assert.equal(s.savedAt, 123);
  assert.equal(s.inf.auto.promote.xFactor, 2); assert.equal(s.stats.totalIpLog, -Infinity);
});

test('v1 save with ip 0 migrates to ipLog -Infinity', () => {
  assert.equal(E.deserialize(b64(v1Save({}))).inf.ipLog, -Infinity);
});

test('v2 save missing nested fields gets defaults; unknown keys dropped', () => {
  const s = E.newState();
  s.inf.ipLog = 3; delete s.inf.stars; s.inf.auto.promote = { on: false }; s.inf.upg = { '1;1': true }; s.junk = 7;
  const t = E.deserialize(b64(s));
  assert.equal(t.inf.ipLog, 3); assert.equal(t.inf.auto.promote.on, false); assert.equal(t.inf.auto.promote.xFactor, 2);
  assert.deepEqual(t.inf.stars.sdU, [0, 0, 0, 0]); assert.deepEqual(t.inf.upg, { '1;1': true }); assert.ok(!('junk' in t));
});

test('v2 round trip is lossless', () => {
  const s = E.newState(); s.inf.gpLog = 5.5; s.inf.ic.best[2] = 321; s.stats.lastInfinities.push({ t: 60, ipGainLog: 0 });
  assert.deepEqual(E.deserialize(E.serialize(s)), s);
});

test('invalid saves are rejected', () => {
  assert.throws(() => E.deserialize(b64({ v: 3, circles: [] })), /Invalid save/);
  assert.throws(() => E.deserialize(b64(v1Save({ circles: [] }))), /Invalid save/);
  assert.throws(() => E.deserialize('garbage'), /Invalid save/);
});

test('fmtLog groups large exponents', () => {
  assert.equal(E.fmtLog(3080), '1.00e3,080');
  assert.equal(E.fmtLog(308.25), '1.78e308');
  assert.equal(E.fmtLog(12345.5), '3.16e12,345');
});

function withMods(over, fn) {
  const saved = E._hooks.mods;
  E.registerHooks({ mods: () => Object.assign({}, E.DEFAULT_MODS, over) });
  try { fn(); } finally { E.registerHooks({ mods: saved }); }
}

test('fresh state mods equal DEFAULT_MODS', () => {
  assert.deepEqual(E.mods(E.newState()), E.DEFAULT_MODS);
  assert.ok(Object.isFrozen(E.DEFAULT_MODS));
});

test('default mods keep shipped promotion formulas', () => {
  const s = E.newState(); s.promo = [4, 9, 16, 25];
  const p = E.promoEffects(s);
  const p4 = 1 + 0.05 * Math.pow(25, 0.48);
  close(p.p4, p4);
  close(p.p1, p4 * (Math.floor(Math.pow(4, 1.5)) + 1));
  close(p.p2, p4 * (1 + Math.sqrt(9)));
  close(p.p3, p4 * (10 + Math.pow(16, 0.82)));
});

test('mods.lapMult scales lapsPerSec', () => {
  const s = E.newState(); const base = E.lapsPerSec(s, 0);
  withMods({ lapMult: 2 }, () => close(E.lapsPerSec(s, 0), 2 * base));
});

test('mods.expAdd and prodLog enter perRevLog', () => {
  const s = E.newState(); s.circles[0].multLog = 2; s.pMult = 10; s.pExp = 1.5;
  withMods({ expAdd: 0.5, prodLog: 1 }, () => close(E.perRevLog(s), 2.0 * (2 + 1 + 1)));
  withMods({ expAdd: -5 }, () => close(E.perRevLog(s), 0.1 * (2 + 1)));
});

test('mods.gainLog enters multGainPerLapLog', () => {
  const s = E.newState(); const base = E.multGainPerLapLog(s, 0);
  close(base, E.TUNE.multGainLog0);
  withMods({ gainLog: 3 }, () => close(E.multGainPerLapLog(s, 0), base + 3));
});

test('pMultMult, pExpMult, gainPow enter pendingPrestige and promoXp', () => {
  const s = E.newState(); s.scoreLog = 20;
  const raw = E.pendingPrestige(s);
  withMods({ pMultMult: 2, pExpMult: 3, gainPow: 0.5 }, () => {
    const g = E.pendingPrestige(s);
    close(g.pMult, Math.pow(raw.pMult * 2, 0.5));
    close(g.pExp, 1 + (raw.pExp - 1) * 3 * 0.5);
  });
  s.scoreLog = -Infinity; s.pMult = 16 * E.TUNE.promoMin;
  withMods({ gainPow: 0.4 }, () => assert.equal(E.promoXp(s), Math.floor(Math.pow(Math.pow(16, E.TUNE.promoPow), 0.4))));
});

test('disabled promotions read as level 0 and cannot be chosen', () => {
  const s = E.newState(); s.promo = [4, 9, 16, 25]; s.pMult = 1e9;
  withMods({ disabledPromo: [1, 3] }, () => {
    const p = E.promoEffects(s);
    close(p.p4, 1); close(p.p2, 1);
    assert.ok(!E.canPromote(s, 1)); assert.ok(!E.canPromote(s, 3)); assert.ok(E.canPromote(s, 0));
  });
});

test('ascBase, ascMult and v scale p3', () => {
  const s = E.newState(); s.promo = [0, 0, 16, 0];
  withMods({ ascBase: 12, ascMult: 2, v: [1, 1, 0.5, 1] }, () => close(E.promoEffects(s).p3, (12 + Math.pow(16, 0.82) * 0.5) * 2));
});

test('maxCircles stops the unlock chain; noAscend blocks ascension', () => {
  const s = E.newState();
  for (let i = 0; i < 4; i++) { s.circles[i].unlocked = true; s.circles[i].bought = 4; s.circles[i].level = 4; }
  s.scoreLog = 50;
  withMods({ maxCircles: 4 }, () => { E.buy(s, 3, 1); assert.ok(!s.circles[4].unlocked); });
  s.circles[0].level = 100;
  withMods({ noAscend: true }, () => assert.ok(!E.canAscend(s, 0)));
  assert.ok(E.canAscend(s, 0));
});

test('decay shrinks colour mult logs toward 0', () => {
  const s = E.newState(); s.circles[1].unlocked = true; s.circles[1].level = 0; s.circles[1].multLog = 10;
  withMods({ decay: 0.01 }, () => E.tick(s, 1));
  close(s.circles[1].multLog, 9.9);
});

test('score capped at INFINITY_LOG unless broken outside a challenge', () => {
  const s = E.newState(); s.scoreLog = 400; E.tick(s, 0.01); assert.equal(s.scoreLog, E.INFINITY_LOG);
  const b = E.newState(); b.inf.broken = true; b.scoreLog = 400; E.tick(b, 0.01); assert.ok(b.scoreLog >= 400);
  const c = E.newState(); c.inf.broken = true; c.inf.ic.active = 3; c.scoreLog = 400; E.tick(c, 0.01);
  assert.equal(c.scoreLog, E.INFINITY_LOG);
  assert.ok(!E.isFixed(b)); assert.ok(E.isFixed(c)); assert.ok(E.isFixed(s));
});

test('timers advance; prestige and promote reset tRun and the stall tracker', () => {
  const s = E.newState();
  E.tick(s, 0.5); close(s.inf.t, 0.5); close(s.inf.tRun, 0.5);
  s.scoreLog = 10; s.inf.rt = { markLog: 9, markT: 0.3 };
  assert.ok(E.prestige(s));
  assert.equal(s.inf.tRun, 0); assert.deepEqual(s.inf.rt, { markLog: -Infinity, markT: 0 }); close(s.inf.t, 0.5);
  E.tick(s, 0.25); s.pMult = 16 * E.TUNE.promoMin;
  assert.ok(E.promote(s, 0)); assert.equal(s.inf.tRun, 0);
});

test('promoXp applies gainPow once to raw pending pMult (spec §3)', () => {
  const s = E.newState(); s.scoreLog = 100; // canPrestige(s) is true
  const raw = E.TUNE.pMultBase * (100 - 3) ** E.TUNE.pMultPow; // pMultMult = 1, no gainPow yet
  const mm = Math.max(s.pMult, raw);
  const expected = Math.floor(Math.pow((mm / E.TUNE.promoMin) ** E.TUNE.promoPow, 0.4));
  withMods({ gainPow: 0.4 }, () => assert.equal(E.promoXp(s), expected));
});

test('registerHooks runs preTick, auto, postTick in order', () => {
  const saved = Object.assign({}, E._hooks); const seen = [];
  E.registerHooks({ preTick: () => seen.push('pre'), auto: () => seen.push('auto'), postTick: () => seen.push('post') });
  try { E.tick(E.newState(), 0.1); } finally { E.registerHooks(saved); }
  assert.deepEqual(seen, ['pre', 'auto', 'post']);
});

const atInfinity = (s) => { s.scoreLog = E.INFINITY_LOG; return s; };

test('ipGainLog: flat 1, x2 from the 5th Infinity, +1 per IC, x2 after IC4', () => {
  const s = E.newState();
  close(E.ipGainLog(s), 0);
  s.infinities = 4; close(E.ipGainLog(s), Math.log10(2));
  s.infinities = 0; s.inf.ic.done = [true, true, true, false, false, false, false, false, false];
  close(E.ipGainLog(s), Math.log10(4)); assert.equal(E.icDoneCount(s), 3);
  s.inf.ic.done[3] = true; close(E.ipGainLog(s), Math.log10(5) + Math.log10(2));
  s.inf.stars.sdU[1] = 3; close(E.ipGainLog(s), Math.log10(5) + Math.log10(2) + Math.log10(4));
});

test('infGain doubles after IC9', () => {
  const s = E.newState(); assert.equal(E.infGain(s), 1); s.inf.ic.done[8] = true; assert.equal(E.infGain(s), 2);
});

test('breakBonusLog: x10 at e3080, x100 at e3388; only broken and outside challenges', () => {
  const s = E.newState(); s.inf.broken = true;
  s.scoreLog = 3079.9; assert.equal(E.breakBonusLog(s), 0);
  s.scoreLog = 3080; assert.equal(E.breakBonusLog(s), 1);
  s.scoreLog = 3388; assert.equal(E.breakBonusLog(s), 2);
  s.inf.ic.active = 2; assert.equal(E.breakBonusLog(s), 0);
  s.inf.ic.active = 0; s.inf.broken = false; assert.equal(E.breakBonusLog(s), 0);
});

test('goInfinite grants IP and an Infinity, records stats, resets the run', () => {
  const s = atInfinity(E.newState());
  s.promo = [3, 3, 3, 3]; s.pMult = 1e6; s.inf.t = 100; s.inf.gpLog = 4; s.inf.gens[0] = { b: 2, aLog: 3 }; s.inf.stars.sdLog = 2;
  s.inf.upg['2;1'] = true; s.inf.pendingConfirm = true;
  assert.ok(E.goInfinite(s));
  assert.equal(s.inf.ipLog, 0); assert.equal(s.infinities, 1); assert.equal(s.stats.totalIpLog, 0);
  assert.equal(s.stats.fastestInfinity, 100); assert.deepEqual(s.stats.lastInfinities, [{ t: 100, ipGainLog: 0 }]);
  assert.deepEqual(s.promo, [0, 0, 0, 0]); assert.equal(s.pMult, 1); assert.equal(s.scoreLog, -Infinity);
  assert.equal(s.inf.t, 0); assert.equal(s.inf.tRun, 0); assert.equal(s.inf.gpLog, -Infinity);
  close(s.inf.gens[0].aLog, Math.log10(2)); assert.equal(s.inf.gens[0].b, 2); assert.equal(s.inf.gens[1].aLog, -Infinity);
  assert.equal(s.inf.stars.sdLog, -Infinity); assert.ok(s.inf.upg['2;1']); assert.equal(s.inf.pendingConfirm, false);
  assert.ok(!E.goInfinite(s));
});

test('IC4 done: promotions restart at level 1', () => {
  const s = atInfinity(E.newState()); s.inf.ic.done[3] = true; E.goInfinite(s); assert.deepEqual(s.promo, [1, 1, 1, 1]);
});

test('lastInfinities keeps 10; IP is capped at INFINITY_LOG', () => {
  // NOTE: the brief's fixture subtracted 1e-6 here, but at this magnitude (~308)
  // a float64 delta of 1e-6 is many orders of magnitude too large to be closed by
  // these per-Infinity gains through correct logAdd (log10(10^a+10^b) is exactly
  // `a` again whenever b is more than ~16 orders of magnitude below a, which any
  // gain up to log10(2) always is against a ~308). No real ipGainLog magnitude
  // could ever close that gap, so the assertion below was unsatisfiable as
  // written; starting already at the cap keeps the same intent (cap holds under
  // repeated Infinities) without relying on an impossible float crossing.
  const s = E.newState(); s.inf.ipLog = E.INFINITY_LOG;
  for (let i = 0; i < 12; i++) { atInfinity(s); s.inf.t = i + 1; E.goInfinite(s); }
  assert.equal(s.stats.lastInfinities.length, 10); assert.equal(s.stats.lastInfinities[9].t, 12);
  assert.equal(s.inf.ipLog, E.INFINITY_LOG); assert.equal(s.stats.fastestInfinity, 1);
});

test('goInfinite clamps ipLog at INFINITY_LOG when a single gain would cross it', () => {
  // Starting already at the cap (as above) can't distinguish "clamped" from
  // "no-op float addition" — logAdd(cap, anything small) is cap either way.
  // This test starts just BELOW the cap and forces a huge, real ipGainLog
  // (via the Break bonus, §8) that is provably large enough to push the sum
  // past INFINITY_LOG without the Math.min clamp in goInfinite.
  const s = E.newState();
  s.inf.ipLog = E.INFINITY_LOG - 0.05;
  s.inf.broken = true;
  s.scoreLog = E.TUNE.breakStartLog + E.TUNE.breakStepLog * 320; // breakBonusLog(s) === 320
  assert.equal(E.breakBonusLog(s), 320);
  assert.ok(E.canInfinity(s));
  assert.ok(E.goInfinite(s));
  assert.equal(s.inf.ipLog, E.INFINITY_LOG);
});

test('fixed Infinity: first waits for confirmation, later ones are automatic', () => {
  const s = atInfinity(E.newState());
  E.tick(s, 0.01);
  assert.equal(s.infinities, 0); assert.equal(s.inf.pendingConfirm, true); assert.equal(s.scoreLog, E.INFINITY_LOG);
  E.goInfinite(s); assert.equal(s.inf.pendingConfirm, false);
  atInfinity(s); E.tick(s, 0.01); assert.equal(s.infinities, 2);
  s.inf.auto.confirmInfinity = true; atInfinity(s); E.tick(s, 0.01);
  assert.equal(s.infinities, 2); assert.equal(s.inf.pendingConfirm, true);
});

test('broken: no automatic Infinity', () => {
  const s = E.newState(); s.infinities = 3; s.inf.broken = true; s.scoreLog = 400;
  E.tick(s, 0.01); assert.equal(s.infinities, 3); assert.ok(E.canInfinity(s));
});

test('resetForChallenge resets the run without reward', () => {
  const s = E.newState(); s.scoreLog = 200; s.pMult = 50; s.inf.ipLog = 1; s.inf.t = 9;
  E.resetForChallenge(s);
  assert.equal(s.scoreLog, -Infinity); assert.equal(s.pMult, 1); assert.equal(s.inf.ipLog, 1);
  assert.equal(s.infinities, 0); assert.equal(s.inf.t, 0);
});

const withGens = (s) => { s.inf.upg['1;1'] = true; s.inf.gens[0] = { b: 1, aLog: 0 }; return s; };

test('generator costs follow the table', () => {
  const s = withGens(E.newState());
  close(E.genCostLog(s, 0), Math.log10(32));
  s.inf.gens[0].b = 3; close(E.genCostLog(s, 0), Math.log10(32 * 25), 1e-5);
  close(E.genCostLog(s, 1), Math.log10(150), 1e-5);
  s.inf.gens[1].b = 2; close(E.genCostLog(s, 1), Math.log10(15000), 1e-5);
  close(E.genCostLog(s, 2), 5); close(E.genCostLog(s, 3), 9);
  close(E.genCostLog(s, 4), 15); s.inf.gens[4].b = 1; close(E.genCostLog(s, 4), 19);
  close(E.genCostLog(s, 9), 45);
});

test('buyGen needs 1;1, the previous tier and IP', () => {
  const n = E.newState(); n.inf.ipLog = 5; assert.ok(!E.canBuyGen(n, 0));
  const s = withGens(E.newState()); s.inf.ipLog = Math.log10(200);
  assert.ok(!E.canBuyGen(s, 2));
  assert.ok(E.buyGen(s, 1));
  close(s.inf.ipLog, Math.log10(50), 1e-5); assert.equal(s.inf.gens[1].b, 1); close(s.inf.gens[1].aLog, 0);
  assert.ok(E.canBuyGen(s, 0)); assert.ok(!E.canBuyGen(s, 1));
});

test('generator mult: x2 per purchase; 1;1 gives G1 x Infinities', () => {
  const s = withGens(E.newState()); s.infinities = 8;
  close(E.genMultLog(s, 0), Math.log10(8));
  s.inf.gens[0].b = 3; close(E.genMultLog(s, 0), Math.log10(8) + 2 * Math.log10(2));
  s.inf.gens[1].b = 1; close(E.genMultLog(s, 1), 0);
});

test('genSoftcap is continuous at 1000', () => {
  assert.equal(E.genSoftcap(999), 999); assert.equal(E.genSoftcap(1000), 1000); close(E.genSoftcap(4000), 2000);
});

test('G1 alone: GP = a * m * t', () => {
  const s = withGens(E.newState()); s.infinities = 1;
  for (let i = 0; i < 100; i++) E.tick(s, 0.1);
  close(10 ** s.inf.gpLog, 10, 1e-6);
});

test('two tiers: G2 feeds G1', () => {
  const s = withGens(E.newState()); s.infinities = 1; s.inf.gens[1] = { b: 1, aLog: 0 };
  for (let i = 0; i < 1000; i++) E.tick(s, 0.001);
  close(10 ** s.inf.gens[0].aLog, 2, 1e-6);
  close(10 ** s.inf.gpLog, 1.5, 1e-3);
});

test('GP multiplies mult gain by GP^0.666 (wiki: GP 16 -> ~6.35)', () => {
  const s = withGens(E.newState()); s.inf.gpLog = Math.log10(16);
  close(E.gpExp(s), 0.666);
  close(10 ** E.gpMultLog(s), Math.pow(16, 0.666));
  assert.ok(Math.abs(10 ** E.gpMultLog(s) - 6.35) < 0.02);
  close(E.multGainPerLapLog(s, 0), E.TUNE.multGainLog0 + E.gpMultLog(s));
  s.inf.gpLog = -2; assert.equal(E.gpMultLog(s), 0);
});

const own = (s, ...ids) => { for (const id of ids) s.inf.upg[id] = true; return s; };

test('tree: 38 unique nodes with wiki costs; trimmed nodes absent', () => {
  assert.equal(E.UPGRADES.length, 38);
  assert.equal(new Set(E.UPGRADES.map((u) => u.id)).size, 38);
  const cost = (id) => E.upgById(id).cost;
  assert.equal(cost('1;1'), 1); assert.equal(cost('3;2'), 1); assert.equal(cost('4;1'), 3); assert.equal(cost('7;1'), 5);
  assert.equal(cost('8;2'), 32); assert.equal(cost('11;2'), 400); assert.equal(cost('14;2'), 1024);
  assert.equal(cost('16;3'), 5000); assert.equal(cost('17;1'), 1e6); assert.equal(cost('18;1'), 2e11);
  assert.equal(cost('19;1'), 1e12); assert.equal(cost('20;1'), 1e21); assert.equal(cost('21;1'), 1e33);
  for (const gone of ['10;1', '17;2', '18;2', '19;2', '20;2']) assert.equal(E.upgById(gone), undefined);
  assert.deepEqual(['A', 'B', 'C'].map((p) => E.UPGRADES.filter((u) => u.phase === p).length), [11, 12, 15]);
});

test('prerequisites', () => {
  const s = E.newState();
  assert.ok(E.upgReqMet(s, '1;1')); assert.ok(!E.upgReqMet(s, '2;1'));
  own(s, '1;1', '2;2'); assert.ok(E.upgReqMet(s, '3;1')); assert.ok(E.upgReqMet(s, '3;2'));
  own(s, '3;2', '4;1', '5;3');
  assert.ok(!E.upgReqMet(s, '6;1')); assert.ok(E.upgReqMet(s, '6;2'));
  own(s, '6;2'); assert.ok(E.upgReqMet(s, '7;1'));
  own(s, '7;1', '8;3'); assert.ok(E.upgReqMet(s, '9;1')); assert.ok(!E.upgReqMet(s, '11;1'));
  own(s, '9;2'); assert.ok(E.upgReqMet(s, '11;1'));
  assert.ok(!E.upgReqMet(s, '21;1')); own(s, '20;1'); assert.ok(E.upgReqMet(s, '21;1'));
});

test('buyUpgrade spends IP; 1;1 grants a free G1', () => {
  const s = E.newState(); s.inf.ipLog = Math.log10(3);
  assert.ok(!E.canBuyUpgrade(s, '2;1'));
  assert.ok(E.buyUpgrade(s, '1;1'));
  close(s.inf.ipLog, Math.log10(2)); assert.deepEqual(s.inf.gens[0], { b: 1, aLog: 0 });
  assert.ok(!E.buyUpgrade(s, '1;1'));
  assert.ok(E.buyUpgrade(s, '2;1')); assert.ok(E.buyUpgrade(s, '2;2'));
  assert.equal(s.inf.ipLog, -Infinity); assert.ok(!E.canBuyUpgrade(s, '3;1'));
});

test('Revolution-side effects', () => {
  const s = E.newState();
  own(s, '3;1', '4;1'); close(E.mods(s).lapMult, 1.32);
  own(s, '19;3'); close(E.mods(s).lapMult, 3.96);
  own(s, '2;1'); close(E.mods(s).expAdd, 0.01);
  own(s, '6;1'); assert.equal(E.mods(s).ascBase, 12); own(s, '13;1'); assert.equal(E.mods(s).ascBase, 13);
  s.infinities = 9; own(s, '6;2'); close(E.mods(s).ascMult, 1.25);
  s.infinities = 3; own(s, '16;2'); close(E.mods(s).ascMult, (1 + 0.25 * Math.log10(4)) * 1.1);
  s.inf.t = 600; own(s, '5;1'); close(E.mods(s).pMultMult, 2);
  own(s, '5;2'); close(E.mods(s).pExpMult, 1.2);
  s.promo = [16, 0, 0, 0]; own(s, '14;1'); close(E.mods(s).v[0], 1.4);
});

test('generator-side effects', () => {
  const s = withGens(E.newState()); s.infinities = 16;
  const g1 = () => E.genMultLog(s, 0), g2 = () => E.genMultLog(s, 1), g3 = () => E.genMultLog(s, 2);
  let b = g1();
  own(s, '8;3'); close(g1(), b + Math.log10(5)); b = g1();
  s.inf.t = 60; own(s, '8;1'); close(g1(), b + Math.log10(Math.SQRT2)); b = g1();
  s.inf.gpLog = Math.log10(99); own(s, '8;2'); close(g1(), b + Math.log10(3)); b = g1();
  s.inf.ipLog = Math.log10(99); own(s, '11;1'); close(g1(), b + Math.log10(3)); b = g1();
  own(s, '17;3'); close(g1(), b + 1);
  b = g2();
  own(s, '9;2'); close(g2(), b + Math.log10(3)); b = g2();
  own(s, '9;1'); close(g2(), b + Math.log10(Math.SQRT2)); b = g2();
  own(s, '11;2'); close(g2(), b + 0.5 * Math.log10(3)); b = g2();
  own(s, '12;1'); close(g2(), b + Math.log10(4));
  b = g3();
  own(s, '17;1'); close(g3(), b + Math.log10(2)); b = g3();
  s.inf.gens[1].b = 4; own(s, '18;3'); close(g3(), b + Math.log10(5));
  own(s, '14;2'); close(E.gpExp(s), 0.75); own(s, '19;1'); close(E.gpExp(s), 0.9);
});

test('Break-era effects: ctf, IP upgrades, 16;3, 20;1, 18;1', () => {
  const s = withGens(E.newState());
  assert.equal(E.ctf(s), 1);
  s.inf.ic.done = Array(9).fill(true); s.inf.ic.best = [337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 337.5, 900];
  close(E.ctf(s), 10);
  let ip = E.ipGainLog(s); own(s, '15;2'); close(E.ipGainLog(s), ip + 0.5);
  s.infinities = 32; ip = E.ipGainLog(s); own(s, '16;1'); close(E.ipGainLog(s), ip + Math.log10(2));
  const g1 = E.genMultLog(s, 0); own(s, '15;3'); close(E.genMultLog(s, 0), g1 + 1);
  s.inf.gens[1].b = 1; const g2 = E.genMultLog(s, 1); own(s, '15;4'); close(E.genMultLog(s, 1), g2 + 0.75);
  const v3 = E.mods(s).v[3]; own(s, '16;3'); close(E.mods(s).v[3], v3 * 2);
  const all = [0, 1, 2].map((k) => E.genMultLog(s, k));
  s.stats.fastestInfinity = 6; own(s, '20;1'); [0, 1, 2].forEach((k) => close(E.genMultLog(s, k), all[k] + 1));
  assert.equal(E.passiveInfRate(s), 0); own(s, '18;1');
  const rate = E.passiveInfRate(s); close(rate, E.TUNE.passiveInfK * E.infGain(s) / 6);
  const inf0 = s.infinities; E.tick(s, 3); close(s.infinities, inf0 + 3 * rate);
  assert.equal(E.sdU4Mult(s), 1);
});

test('upgEffect reports live values', () => {
  const s = own(E.newState(), '3;1'); close(E.upgEffect(s, '3;1'), 1.1); assert.equal(E.upgEffect(s, '2;2'), null);
});

const autoState = (...ids) => { const s = own(withGens(E.newState()), ...ids); s.infinities = 1; return s; };

test('autoUnlocked follows upgrades; anyAutoOn', () => {
  assert.deepEqual(E.autoUnlocked(autoState('1;1', '2;2', '3;2')), { buy: true, asc: true, promote: true, prestige: false, infinity: false });
  assert.ok(!E.anyAutoOn(E.newState())); assert.ok(E.anyAutoOn(autoState('1;1')));
  const off = autoState('1;1'); off.inf.auto.buy.on = false; assert.ok(!E.anyAutoOn(off));
});

test('autobuy: cheapest first until nothing affordable; toggles respected', () => {
  const s = autoState('1;1'); s.scoreLog = 4; E.autoStep(s, 0.1);
  for (let i = 0; i < 10; i++) {
    const c = s.circles[i];
    if (c.unlocked && c.level < E.levelCap(c)) assert.ok(E.costLog(s, i) > s.scoreLog, `circle ${i} still affordable`);
  }
  assert.ok(s.circles[0].level > 5);
  const t = autoState('1;1'); t.scoreLog = 4; t.inf.auto.buy.circles[0] = false; E.autoStep(t, 0.1); assert.equal(t.circles[0].level, 5);
  const u = autoState('1;1'); u.scoreLog = 4; u.inf.auto.buy.on = false; E.autoStep(u, 0.1); assert.equal(u.circles[0].level, 5);
});

test('auto-ascend', () => {
  const s = autoState('1;1', '2;2'); s.inf.auto.buy.on = false; s.circles[0].level = 100;
  E.autoStep(s, 0.1); assert.equal(s.circles[0].ascensions, 1);
  const t = autoState('1;1', '2;2'); t.inf.auto.buy.on = false; t.circles[0].level = 100; t.inf.auto.asc.circles[0] = false;
  E.autoStep(t, 0.1); assert.equal(t.circles[0].ascensions, 0);
});

test('auto-promote: order, xFactor, minTime, stall fallback', () => {
  const s = autoState('1;1', '3;2'); s.inf.auto.buy.on = false; s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 0.5;
  E.autoStep(s, 0.1); assert.deepEqual(s.promo, [0, 0, 0, 0]);
  s.inf.tRun = 2; E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 0, 0, 0]);
  s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 2; E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 0, 0]);
  s.stats.promotions = 4; s.pMult = 16 * E.TUNE.promoMin; s.inf.tRun = 2; s.scoreLog = 5; s.inf.rt = { markLog: 5, markT: 1.5 };
  E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 0, 0]);
  s.inf.tRun = 40; s.inf.rt = { markLog: 5, markT: 0 };
  E.autoStep(s, 0.1); assert.deepEqual(s.promo, [8, 8, 8, 0]);
});

test('auto-prestige thresholds', () => {
  const mk = () => { const s = autoState('1;1', '4;1', '5;3'); s.inf.auto.buy.on = false; s.inf.tRun = 1; s.scoreLog = 20; return s; };
  let s = mk(); E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
  s = mk(); s.pMult = 100; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
  s = mk(); s.pMult = 1000; s.pExp = 2; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 0);
  s = mk(); s.pMult = 900; s.pExp = 2; s.inf.tRun = 40; s.inf.rt = { markLog: 20, markT: 0 };
  E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
  s = mk(); s.pMult = 1e6; s.inf.auto.prestige.expGain = 0.05; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 1);
  s = mk(); s.inf.tRun = 0.1; E.autoStep(s, 0.1); assert.equal(s.stats.prestiges, 0);
});

test('stall tracker', () => {
  const s = autoState('1;1'); s.inf.tRun = 31; s.inf.rt = { markLog: 5, markT: 0 }; s.scoreLog = 5.5;
  assert.ok(E.isStalled(s)); E.updateStall(s); assert.ok(E.isStalled(s));
  s.scoreLog = 6.2; E.updateStall(s); assert.equal(s.inf.rt.markLog, 6.2); assert.equal(s.inf.rt.markT, 31); assert.ok(!E.isStalled(s));
  s.inf.auto.stallSec = 0; s.inf.tRun = 1000; assert.ok(!E.isStalled(s));
});

test('auto-infinity: broken, owned, thresholds met', () => {
  const s = autoState('1;1', '15;1'); s.inf.auto.buy.on = false; s.inf.broken = true; s.inf.auto.infinity.on = true;
  s.scoreLog = 400; s.inf.t = 5; s.inf.auto.infinity.minIpLog = 5;
  E.autoStep(s, 0.1); assert.equal(s.infinities, 1);
  s.inf.auto.infinity.minIpLog = 0; s.inf.auto.infinity.minTime = 10; E.autoStep(s, 0.1); assert.equal(s.infinities, 1);
  s.inf.auto.infinity.minTime = 0; E.autoStep(s, 0.1); assert.equal(s.infinities, 2);
});

test('tick runs autoStep', () => {
  const s = autoState('1;1'); s.scoreLog = 4; E.tick(s, 0.001); assert.ok(s.circles[0].level > 5);
});

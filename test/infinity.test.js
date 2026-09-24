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

test('registerHooks runs preTick, auto, postTick in order', () => {
  const saved = Object.assign({}, E._hooks); const seen = [];
  E.registerHooks({ preTick: () => seen.push('pre'), auto: () => seen.push('auto'), postTick: () => seen.push('post') });
  try { E.tick(E.newState(), 0.1); } finally { E.registerHooks(saved); }
  assert.deepEqual(seen, ['pre', 'auto', 'post']);
});

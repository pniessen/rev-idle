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

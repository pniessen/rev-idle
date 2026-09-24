const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('new state: red level 5 unlocked, others locked', () => {
  const s = E.newState();
  assert.equal(s.circles.length, 10);
  assert.equal(s.circles[0].level, 5);
  assert.ok(s.circles[0].unlocked);
  assert.ok(!s.circles[1].unlocked);
  assert.equal(s.scoreLog, -Infinity);
});

test('costLog matches wiki example: orange asc1 lv10', () => {
  const s = E.newState();
  s.circles[1].ascensions = 1; s.circles[1].level = 10;
  close(E.costLog(s, 1), Math.log10(100) + 100 * Math.log10(1.24) + 10 * Math.log10(1.34));
});

test('red first cost is 4 * 1.2^5', () => {
  close(E.costLog(E.newState(), 0), Math.log10(4 * 1.2 ** 5));
});

test('buy spends score and unlocks next after 5 bought', () => {
  const s = E.newState();
  s.scoreLog = 6;
  assert.equal(E.buy(s, 0, 4), 4);
  assert.ok(!s.circles[1].unlocked);
  assert.equal(E.buy(s, 0, 1), 1);
  assert.ok(s.circles[1].unlocked);
  assert.equal(s.circles[1].level, 0);
  assert.equal(s.circles[0].level, 10);
  assert.ok(s.scoreLog < 6);
});

test('buy stops at cap and when unaffordable', () => {
  const s = E.newState();
  s.scoreLog = 0; // 1 point
  assert.equal(E.buy(s, 0, 'max'), 0);
  s.scoreLog = 400;
  E.buy(s, 0, 'max');
  assert.equal(s.circles[0].level, 100);
});

test('lapsPerSec and tick produce laps, mult and score', () => {
  const s = E.newState();
  close(E.lapsPerSec(s, 0), 1.0); // 5 * 0.2
  const r = E.tick(s, 2.5);
  assert.deepEqual(r.laps.slice(0, 2), [2, 0]);
  close(s.circles[0].progress, 0.5);
  close(s.circles[0].multLog, Math.log10(1 + 2 * 0.01));
  close(s.scoreLog, Math.log10(2) + Math.log10(1.02));
  assert.equal(s.stats.totalLaps, 2);
});

test('promoEffects at level 0 are neutral, asc power 10', () => {
  const p = E.promoEffects(E.newState());
  close(p.p1, 1); close(p.p2, 1); close(p.p3, 10); close(p.p4, 1);
});

test('promoEffects formulas', () => {
  const s = E.newState(); s.promo = [4, 9, 16, 1];
  const p4 = 1.05;
  close(E.promoEffects(s).p1, p4 * 9);
  close(E.promoEffects(s).p2, p4 * 4);
  close(E.promoEffects(s).p3, p4 * (10 + 16 ** 0.82));
});

test('fmtLog', () => {
  assert.equal(E.fmtLog(-Infinity), '0');
  assert.equal(E.fmtLog(Math.log10(1234)), '1,234');
  assert.equal(E.fmtLog(Math.log10(1.234e7)), '1.23e7');
  assert.equal(E.fmtLog(Math.log10(9.999e7)), '1.00e8');
});

test('simulate equals many ticks roughly', () => {
  const a = E.newState(), b = E.newState();
  E.simulate(a, 100);
  for (let i = 0; i < 100; i++) E.tick(b, 1);
  close(a.scoreLog, b.scoreLog, 1e-6);
});

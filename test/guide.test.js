const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const G = require('../src/guide-goals.js');

test('23 goals in spec order, unique ids', () => {
  const ids = G.GOALS.map(g => g.id);
  assert.deepEqual(ids, ['buyRed','readMult','unlockOrange','buyOrange','buyModes','unlockGreen','ascendRed',
    'reachPrestige','prestige','unlockWhite','reachPromote','promote','promoteAll','infinity','buyGens','buyG2',
    'automate','unlockIC','firstIC','allIC','breakInf','stars','finale']);
  assert.equal(new Set(ids).size, 23);
});
test('fresh state: current goal is buyRed; coach flags', () => {
  const s = E.newState();
  const d = G.sync(s, {});
  assert.equal(G.current(d).id, 'buyRed');
  assert.ok(G.GOALS.find(g => g.id === 'buyRed').coach);
  assert.ok(G.GOALS.find(g => g.id === 'readMult').ack);
});
test('ack goal blocks until acknowledged', () => {
  const s = E.newState(); s.scoreLog = 3; E.buy(s, 0, 1);
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'readMult');
  d = G.ack('readMult', d);
  assert.equal(G.current(d).id, 'unlockOrange');
});
test('sticky: later goal done marks earlier goals, reset never regresses', () => {
  const s = E.newState(); s.stats.prestiges = 1;
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'unlockWhite');
  const fresh = E.newState();
  d = G.sync(fresh, d);
  assert.equal(G.current(d).id, 'unlockWhite');
});
test('advanced save skips ahead; all done → null', () => {
  const s = E.newState(); s.infinities = 3; s.inf.upg['1;1'] = true;
  let d = G.sync(s, {});
  assert.equal(G.current(d).id, 'buyG2');
  s.inf.ipLog = E.INFINITY_LOG;
  d = G.sync(s, d);
  assert.equal(G.current(d), null);
});
test('progress shapes', () => {
  const s = E.newState();
  const p = G.GOALS.find(g => g.id === 'unlockOrange').progress(s);
  assert.deepEqual(p, { cur: 0, max: 5, log: false });
  s.scoreLog = 5;
  const q = G.GOALS.find(g => g.id === 'reachPrestige').progress(s);
  assert.ok(q.log && q.cur === 5 && q.max === E.TUNE.prestigeMinLog);
});
test('stages', () => {
  const s = E.newState();
  assert.equal(G.currentStage(s), 'revolution');
  s.stats.prestiges = 1; assert.equal(G.currentStage(s), 'prestige');
  s.infinities = 1; assert.equal(G.currentStage(s), 'infinity');
  assert.deepEqual(G.STAGES, ['revolution','prestige','promotions','infinity','challenges','break','stars','finale']);
});
test('sync returns a new map and never unmarks', () => {
  const d0 = { buyRed: true };
  const d1 = G.sync(E.newState(), d0);
  assert.notEqual(d1, d0);
  assert.ok(d1.buyRed);
});

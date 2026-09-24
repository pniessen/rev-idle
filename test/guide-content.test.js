'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const C = require('../src/guide-content.js');

// Same list as test/guide.test.js (spec §5).
const GOAL_IDS = ['buyRed', 'readMult', 'unlockOrange', 'buyOrange', 'buyModes', 'unlockGreen', 'ascendRed',
  'reachPrestige', 'prestige', 'unlockWhite', 'reachPromote', 'promote', 'promoteAll', 'infinity', 'buyGens', 'buyG2',
  'automate', 'unlockIC', 'firstIC', 'allIC', 'breakInf', 'stars', 'finale'];
const COACH_IDS = ['buyRed', 'readMult', 'unlockOrange', 'buyOrange', 'buyModes'];
const SECTION_IDS = ['objective', 'circles', 'mults', 'buying', 'ascension', 'prestige', 'promotions', 'infinity',
  'generators', 'automation', 'challenges', 'break', 'stars', 'finale', 'glossary-intro', 'tips'];
const ALWAYS_OPEN = ['objective', 'circles', 'mults', 'buying', 'tips'];
const CARD_KEYS = ['ascendSeen', 'prestigeSeen', 'promoSeen', 'infinitySeen', 'infTabSeen', 'gensSeen', 'autoSeen',
  'icSeen', 'breakSeen', 'starsSeen'];
const STAGES = ['revolution', 'prestige', 'promotions', 'infinity', 'challenges', 'break', 'stars', 'finale'];
const GLOSSARY_MIN = ['lap', 'score', 'multiplier', 'p.mult', 'exponent', 'ascension', 'prestige', 'promotion',
  'infinity', 'ip', 'generator', 'gp', 'challenge', 'break', 'star', 'stardust'];

const nonEmpty = (x) => typeof x === 'string' && x.trim().length > 0;
const fresh = () => E.newState();

// Every string anywhere in the content tree.
function allStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => allStrings(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => allStrings(n, out));
  return out;
}
const content = () => ({
  objective: C.objective, stages: C.stages, goals: C.goals, sections: C.sections, cards: C.cards, glossary: C.glossary,
});

test('objective has a title and a body that states the Infinity target', () => {
  assert.ok(nonEmpty(C.objective.title));
  assert.ok(nonEmpty(C.objective.body));
  assert.ok(C.objective.body.includes('{INF}'));
  assert.ok(C.fill(C.objective.body, fresh()).includes(E.fmtLog(E.INFINITY_LOG)));
});

test('every journey stage has a name and blurb', () => {
  assert.deepEqual(Object.keys(C.stages), STAGES);
  for (const id of STAGES) {
    assert.ok(nonEmpty(C.stages[id].name), id);
    assert.ok(nonEmpty(C.stages[id].blurb), id);
  }
});

test('every goal has title/why within length limits (raw and filled)', () => {
  assert.deepEqual(Object.keys(C.goals).sort(), GOAL_IDS.slice().sort());
  const s = fresh();
  for (const id of GOAL_IDS) {
    const g = C.goals[id];
    assert.ok(g, id);
    assert.ok(nonEmpty(g.title), id + ' title');
    assert.ok(nonEmpty(g.why), id + ' why');
    for (const str of [g.title, C.fill(g.title, s)]) assert.ok(str.length <= 50, `${id} title too long: ${str}`);
    for (const str of [g.why, C.fill(g.why, s)]) assert.ok(str.length <= 110, `${id} why too long (${str.length}): ${str}`);
  }
});

test('coach goals have coach text ≤ 160 chars; others do not', () => {
  const s = fresh();
  for (const id of GOAL_IDS) {
    const g = C.goals[id];
    if (COACH_IDS.includes(id)) {
      assert.ok(nonEmpty(g.coach), id);
      for (const str of [g.coach, C.fill(g.coach, s)]) assert.ok(str.length <= 160, `${id} coach too long (${str.length})`);
    } else {
      assert.equal(g.coach, undefined, id);
    }
  }
});

test('every goal links to a valid guide section', () => {
  for (const id of GOAL_IDS) assert.ok(SECTION_IDS.includes(C.goals[id].section), `${id} → ${C.goals[id].section}`);
});

test('sections: all ids present, in order, each with 1–4 paragraphs and a 2–4 item todo list', () => {
  assert.deepEqual(C.sections.map((x) => x.id), SECTION_IDS);
  for (const sec of C.sections) {
    assert.ok(nonEmpty(sec.title), sec.id);
    assert.ok(Array.isArray(sec.body) && sec.body.length >= 1 && sec.body.length <= 4, sec.id + ' body');
    sec.body.forEach((p) => assert.ok(nonEmpty(p), sec.id + ' paragraph'));
    assert.ok(Array.isArray(sec.todo) && sec.todo.length >= 2 && sec.todo.length <= 4, sec.id + ' todo');
    sec.todo.forEach((t) => assert.ok(nonEmpty(t), sec.id + ' todo item'));
  }
});

test('section unlock is null or a valid goal id; basics are always open', () => {
  for (const sec of C.sections) {
    assert.ok(sec.unlock === null || GOAL_IDS.includes(sec.unlock), `${sec.id}: ${sec.unlock}`);
    if (ALWAYS_OPEN.includes(sec.id)) assert.equal(sec.unlock, null, sec.id);
  }
  // A section never unlocks after a goal whose "Learn more" points at it.
  const idx = (id) => GOAL_IDS.indexOf(id);
  for (const id of GOAL_IDS) {
    const sec = C.sections.find((x) => x.id === C.goals[id].section);
    if (sec.unlock !== null) assert.ok(idx(sec.unlock) < idx(id), `${sec.id} unlocks after goal ${id}`);
  }
});

test('mults section spells out the score formula', () => {
  const text = C.sections.find((x) => x.id === 'mults').body.join(' ');
  assert.match(text, /score per lap/i);
  assert.match(text, /P\.Mult/);
  assert.match(text, /exponent/i);
  assert.match(text, /laps per second/i);
});

test('cards: exactly the 10 unlock keys, each complete with a valid goal', () => {
  assert.deepEqual(Object.keys(C.cards).sort(), CARD_KEYS.slice().sort());
  for (const k of CARD_KEYS) {
    const c = C.cards[k];
    for (const f of ['title', 'what', 'why', 'todo']) assert.ok(nonEmpty(c[f]), `${k}.${f}`);
    assert.ok(GOAL_IDS.includes(c.goal), `${k}.goal`);
    assert.ok(SECTION_IDS.includes(c.section), `${k}.section`);
  }
});

test('glossary covers the core terms, each defined', () => {
  const terms = C.glossary.map((g) => g.term.toLowerCase());
  for (const t of GLOSSARY_MIN) assert.ok(terms.includes(t), 'missing glossary term: ' + t);
  assert.equal(new Set(terms).size, terms.length, 'duplicate glossary term');
  for (const g of C.glossary) {
    assert.ok(nonEmpty(g.def), g.term);
    assert.ok(g.unlock === null || GOAL_IDS.includes(g.unlock), g.term + ' unlock');
  }
});

test('fill replaces every token used anywhere in the content', () => {
  const strs = allStrings(content());
  const tokens = new Set();
  for (const str of strs) for (const m of str.matchAll(/\{[A-Z_]+\}/g)) tokens.add(m[0]);
  assert.ok(tokens.size > 0);
  const s = fresh();
  for (const str of strs) {
    const out = C.fill(str, s);
    assert.ok(!out.includes('{'), 'unfilled token in: ' + out);
  }
});

test('fill uses live Engine values', () => {
  const s = fresh();
  assert.equal(C.fill('{INF}', s), E.fmtLog(E.INFINITY_LOG));
  assert.equal(C.fill('{PRESTIGE_MIN}', s), E.fmtLog(E.TUNE.prestigeMinLog));
  assert.equal(C.fill('{PROMO_MIN}', s), E.fmtLog(Math.log10(E.TUNE.promoMin)));
  assert.equal(C.fill('{ASC_POWER}', s), E.fmtLog(Math.log10(E.promoEffects(s).p3)));
  assert.equal(C.fill('{CAP}', s), String(E.levelCap(s.circles[0])));
  assert.equal(C.fill('{UNLOCK_AT}', s), '5');
  s.circles[0].ascensions = 2;
  assert.equal(C.fill('cap {CAP}', s), 'cap ' + E.levelCap(s.circles[0]));
  // Works without a state (falls back to a fresh one) and leaves unknown tokens alone.
  assert.equal(C.fill('{INF} {NOPE}'), E.fmtLog(E.INFINITY_LOG) + ' {NOPE}');
});

test('no hardcoded tuned numbers in the copy', () => {
  const strs = allStrings(content());
  const banned = [E.fmtLog(E.INFINITY_LOG), '1.79e308', '1e10', E.fmtLog(E.TUNE.prestigeMinLog),
    String(E.TUNE.promoMin), E.fmtLog(Math.log10(E.TUNE.promoMin))];
  for (const str of strs) for (const b of banned) assert.ok(!str.includes(b), `hardcoded "${b}" in: ${str}`);
});

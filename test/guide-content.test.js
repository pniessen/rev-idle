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
const TOPIC_IDS = ['overview', 'rings', 'mults', 'buying', 'controls', 'ascension', 'prestige', 'promotions',
  'infinity', 'generators', 'automation', 'challenges', 'break', 'stars', 'finale', 'glossary'];
const ALWAYS_OPEN = ['overview', 'rings', 'mults', 'buying', 'controls', 'glossary'];
const GROUPS = ['basics', 'resets', 'infinity', 'reference'];
const SPECIAL = ['overview', 'glossary']; // rendered specially by the UI: summary only
const CARD_KEYS = ['ascendSeen', 'prestigeSeen', 'promoSeen', 'infinitySeen', 'infTabSeen', 'gensSeen', 'autoSeen',
  'icSeen', 'breakSeen', 'starsSeen'];
const STAGES = ['revolution', 'prestige', 'promotions', 'infinity', 'challenges', 'break', 'stars', 'finale'];
const GLOSSARY_MIN = ['lap', 'score', 'multiplier', 'p.mult', 'exponent', 'ascension', 'prestige', 'promotion',
  'infinity', 'infinity points (ip)', 'generator', 'gp', 'challenge', 'break', 'star', 'stardust'];

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
  overview: C.overview, stages: C.stages, goals: C.goals, topics: C.topics, cards: C.cards,
  glossary: C.glossary, upgradePlain: C.upgradePlain,
});
const topic = (id) => C.topics.find((x) => x.id === id);
const words = (str) => str.trim().split(/\s+/).filter(Boolean).length;
const topicText = (t) => [t.summary, ...t.how, ...t.todo].join(' ');
const norm = (str) => str.toLowerCase().replace(/\s+/g, ' ').trim();
function sentences(str) {
  return String(str).split(/(?<=[.!?])\s+|;\s+/).map(norm).filter((x) => words(x) >= 6);
}
function overviewText() {
  const o = C.overview;
  return [o.objective, ...o.how.map((h) => h.title + ' ' + h.body), o.shape, o.job].join(' ');
}

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

test('every goal links to a valid guide topic', () => {
  for (const id of GOAL_IDS) {
    assert.ok(TOPIC_IDS.includes(C.goals[id].topic), `${id} → ${C.goals[id].topic}`);
  }
});

test('overview: objective, four how-steps, shape and job, with the Infinity token', () => {
  const o = C.overview;
  assert.ok(nonEmpty(o.objective) && o.objective.includes('{INF}'));
  assert.equal(o.how.length, 4);
  o.how.forEach((h, i) => { assert.ok(nonEmpty(h.title), 'how ' + i); assert.ok(nonEmpty(h.body), 'how ' + i); });
  assert.ok(nonEmpty(o.shape));
  assert.ok(nonEmpty(o.job));
  for (const k of ['objective', 'how', 'shape', 'job']) assert.ok(nonEmpty(o.labels[k]), 'label ' + k);
  assert.ok(C.fill(o.objective, fresh()).includes(E.fmtLog(E.INFINITY_LOG)));
  assert.match(o.objective, /Infinity Points \(IP\)/);
  assert.equal(o.job, 'invest well, and choose when to reset.');
});

test('topics: ids unique and in order, overview first, glossary last, groups valid', () => {
  assert.deepEqual(C.topics.map((x) => x.id), TOPIC_IDS);
  assert.equal(new Set(C.topics.map((x) => x.id)).size, C.topics.length);
  assert.equal(C.topics[0].id, 'overview');
  assert.equal(C.topics[0].group, 'basics');
  assert.equal(C.topics[C.topics.length - 1].id, 'glossary');
  let lastGroup = 0;
  for (const t of C.topics) {
    assert.ok(GROUPS.includes(t.group), t.id + ' group');
    assert.ok(GROUPS.indexOf(t.group) >= lastGroup, t.id + ' groups out of order');
    lastGroup = GROUPS.indexOf(t.group);
  }
});

test('topics: summary + 2–4 how + 1–3 todo, ≤ 90 words each', () => {
  for (const t of C.topics) {
    assert.ok(nonEmpty(t.title), t.id);
    assert.ok(nonEmpty(t.summary), t.id + ' summary');
    assert.ok(Array.isArray(t.how) && Array.isArray(t.todo), t.id);
    if (SPECIAL.includes(t.id)) {
      assert.equal(t.how.length, 0, t.id);
      assert.equal(t.todo.length, 0, t.id);
    } else {
      assert.ok(t.how.length >= 2 && t.how.length <= 4, t.id + ' how');
      assert.ok(t.todo.length >= 1 && t.todo.length <= 3, t.id + ' todo');
    }
    [...t.how, ...t.todo].forEach((b) => assert.ok(nonEmpty(b), t.id + ' bullet'));
    const n = words(C.fill(topicText(t), fresh()));
    assert.ok(n <= 90, `${t.id}: ${n} words`);
  }
});

test('topic unlock is null or a valid goal id; basics are always open', () => {
  for (const t of C.topics) {
    assert.ok(t.unlock === null || GOAL_IDS.includes(t.unlock), `${t.id}: ${t.unlock}`);
    if (ALWAYS_OPEN.includes(t.id)) assert.equal(t.unlock, null, t.id);
  }
  // A topic never unlocks after a goal whose "Learn more" points at it.
  const idx = (id) => GOAL_IDS.indexOf(id);
  for (const id of GOAL_IDS) {
    const t = topic(C.goals[id].topic);
    if (t.unlock !== null) assert.ok(idx(t.unlock) < idx(id), `${t.id} unlocks after goal ${id}`);
  }
});

test('no sentence is repeated across the overview and topics', () => {
  const seen = new Map();
  const add = (where, str) => {
    for (const sen of sentences(C.fill(str, fresh()))) {
      assert.ok(!seen.has(sen), `"${sen}" in ${where} repeats ${seen.get(sen)}`);
      seen.set(sen, where);
    }
  };
  add('overview', overviewText());
  for (const t of C.topics) for (const str of [t.summary, ...t.how, ...t.todo]) add(t.id, str);
});

test('the overview never names a topic that unlocks later (no spoilers)', () => {
  const text = C.fill(overviewText(), fresh()).toLowerCase();
  for (const t of C.topics) {
    if (t.unlock === null) continue;
    assert.ok(!text.includes(t.title.toLowerCase()), `overview names locked topic "${t.title}"`);
  }
});

test('mults topic spells out the score formula', () => {
  const text = topicText(topic('mults'));
  assert.match(text, /score per lap/i);
  assert.match(text, /product of ring multipliers × P\.Mult\) \^ exponent/);
  assert.match(text, /laps per second/i);
});

test('upgradePlain: exactly the 38 upgrade ids, short, filled, formula-free', () => {
  const ids = E.UPGRADES.map((u) => u.id);
  assert.equal(ids.length, 38);
  assert.deepEqual(Object.keys(C.upgradePlain).sort(), ids.slice().sort());
  const s = fresh();
  const banned = ['×max', '^', '→', 'ctf', 'gpExp', 'commonExp', '√', 'log', 'clamp', '{', '}'];
  for (const id of ids) {
    const out = C.fill(C.upgradePlain[id], s);
    assert.ok(nonEmpty(out), id);
    assert.ok(out.length <= 70, `${id} too long (${out.length}): ${out}`);
    for (const b of banned) assert.ok(!out.includes(b), `${id} contains "${b}": ${out}`);
  }
});

test('upgradePlain tokens read live TUNE values', () => {
  assert.equal(C.fill('{LTP_CAP}', fresh()), String(E.TUNE.u51Cap));
  assert.equal(C.fill('{FAST_GEN_MAX}', fresh()), String(Math.sqrt(E.TUNE.u201Cap)));
});

test('cards: exactly the 10 unlock keys, each complete with a valid goal', () => {
  assert.deepEqual(Object.keys(C.cards).sort(), CARD_KEYS.slice().sort());
  for (const k of CARD_KEYS) {
    const c = C.cards[k];
    for (const f of ['title', 'what', 'why', 'todo']) assert.ok(nonEmpty(c[f]), `${k}.${f}`);
    assert.ok(GOAL_IDS.includes(c.goal), `${k}.goal`);
    assert.ok(TOPIC_IDS.includes(c.topic), `${k}.topic`);
  }
});

// For each unlock card: the latest goal that is necessarily done (GuideGoals.sync
// marks it and every earlier goal) when src/help.js onTick fires the card.
const CARD_FIRES_AFTER = {
  ascendSeen: 'unlockOrange', // canAscend: some ring at cap (100) → Red bought ≥ 95 ≥ 5 → Orange unlocked
  prestigeSeen: 'reachPrestige', // canPrestige
  promoSeen: 'reachPromote', // promoXp > 0
  infinitySeen: 'reachPromote', // first canInfinity: score = INF ≥ prestige req → canPrestige; pending P.Mult ≫ promoMin
  infTabSeen: 'infinity', // infinities ≥ 1
  gensSeen: 'buyGens', // hasUpg 1;1
  autoSeen: 'buyGens', // any automation: 1;1 itself unlocks Autobuy (every other one needs 1;1 first)
  icSeen: 'unlockIC', // hasUpg 7;1
  breakSeen: 'allIC', // canBreak: all 9 done
  // hasUpg 21;1: by code only unlockIC is implied (the Tree chain passes 7;1), but 21;1 costs 1e33 IP,
  // unreachable with pre-Break IP gains, so Break is treated as done.
  starsSeen: 'breakInf',
};

test('an unlock card never deep-links into a topic that is still locked', () => {
  const idx = (id) => GOAL_IDS.indexOf(id);
  assert.deepEqual(Object.keys(CARD_FIRES_AFTER).sort(), CARD_KEYS.slice().sort());
  for (const k of CARD_KEYS) {
    const t = topic(C.cards[k].topic);
    if (t.unlock !== null) {
      assert.ok(idx(t.unlock) <= idx(CARD_FIRES_AFTER[k]), `${k} → ${t.id} unlocks at ${t.unlock}`);
    }
  }
});

test('glossary covers the core terms, each defined', () => {
  const terms = C.glossary.map((g) => g.term.toLowerCase());
  for (const t of GLOSSARY_MIN) assert.ok(terms.includes(t), 'missing glossary term: ' + t);
  assert.equal(new Set(terms).size, terms.length, 'duplicate glossary term');
  for (const g of C.glossary) {
    assert.ok(nonEmpty(g.def), g.term);
    assert.ok('unlock' in g, g.term + ' has no unlock');
    assert.ok(g.unlock === null || GOAL_IDS.includes(g.unlock), g.term + ' unlock');
  }
  const def = (term) => C.glossary.find((g) => g.term === term);
  assert.equal(def('Score').def, 'What rings earn. You spend it on upgrades, and reaching score milestones unlocks resets.');
  assert.equal(def('Infinity Points (IP)').def,
    'Earned each time your score reaches Infinity; spent on permanent Infinity Upgrades.');
  assert.equal(def('Infinity Points (IP)').unlock, 'reachPromote'); // opens when the `infinity` goal is current
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

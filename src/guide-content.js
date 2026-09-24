// src/guide-content.js — all player-guidance copy (overview, topics, goals,
// unlock cards, glossary, plain-English upgrade lines) as plain data. No DOM.
// Tuned numbers never appear in the copy: they are written as {TOKENS} and
// filled from Engine at runtime by GuideContent.fill(str, state).
//
// Tokens: {INF} Infinity (score cap), {PRESTIGE_MIN} first Prestige score,
// {PROMO_MIN} P.Mult needed for Promotion XP, {ASC_POWER} current ascension
// power, {CAP} Red's current level cap, {UNLOCK_AT} levels bought to unlock
// the next ring, {LTP_CAP} max boost of upgrade 5;1, {FAST_GEN_MAX} max boost
// of upgrade 20;1.
//
// Shape (Guide v2):
//   overview            — { labels, objective, how: [{title, body}] ×4, shape, job }
//   topics[]            — { id, group, title, summary, how[], todo[], unlock }
//   goals[id].topic     — topic for the goal's "Learn more" (.section = alias)
//   cards[key].topic    — topic for the card's "Learn more" (.section = alias)
//   glossary[i].unlock  — goal id after which the term is relevant (null = always)
//   upgradePlain[id]    — plain-English line for each Engine.UPGRADES id
//   sections, objective — deprecated, kept only for the pre-v2 UI
// A topic's / term's `unlock` is the goal whose completion makes it matter:
// it opens exactly when the first goal pointing at it becomes current.
(function () {
  'use strict';

  function engine() {
    if (typeof module !== 'undefined' && module.exports) return require('./engine.js');
    return window.Engine;
  }

  // ---------- objective + journey ----------

  var objective = {
    title: 'Your goal',
    body: 'Grow your score to Infinity ({INF}) — then go beyond. Each new layer resets your progress in exchange for permanent power. The goal card under your score always shows your next step.',
  };

  var stages = {
    revolution: { name: 'Revolution', blurb: 'Buy levels, grow ring multipliers, unlock all ten rings.' },
    prestige: { name: 'Prestige', blurb: 'Reset your rings for a lasting P.Mult and P.Exp boost.' },
    promotions: { name: 'Promotions', blurb: 'Reset P.Mult for four boosts that survive every Prestige.' },
    infinity: { name: 'Infinity', blurb: 'Reach {INF} score, earn IP, and buy upgrades that are never lost.' },
    challenges: { name: 'Challenges', blurb: 'Reach Infinity under a handicap for permanent rewards.' },
    break: { name: 'Break', blurb: 'Let your score pass {INF} and earn far more IP.' },
    stars: { name: 'Stars', blurb: 'Buy Stars with IP. They make Stardust to power your Generators.' },
    finale: { name: 'Finale', blurb: 'Reach {INF} IP — the end of this version.' },
  };

  // ---------- goals (spec §5) ----------

  var goals = {
    buyRed: {
      title: 'Buy a Red level',
      why: 'Levels make Red lap faster. Every lap earns score, and score buys more levels.',
      coach: 'This is the Red ring. Press Buy to add a level. More levels mean more laps per second, and every lap earns score.',
      topic: 'buying',
    },
    readMult: {
      title: 'Meet your multipliers',
      why: 'Score per lap is every ring multiplier multiplied together. They grow as rings lap.',
      coach: 'Red’s ×mult grows a little every lap. Your score per lap is all ring mults multiplied together, so bigger mults mean much more score.',
      topic: 'mults',
    },
    unlockOrange: {
      title: 'Buy {UNLOCK_AT} Red levels to unlock Orange',
      why: 'A second ring adds its own laps and its own multiplier to every lap’s score.',
      coach: 'Buying {UNLOCK_AT} levels of a ring unlocks the next one. Red starts at level 5, but only levels you buy count. Keep buying Red.',
      topic: 'buying',
    },
    buyOrange: {
      title: 'Buy an Orange level',
      why: 'New rings start at level 0 and do not move. One level gets Orange lapping.',
      coach: 'Orange is unlocked but sits at level 0, so it is not moving. Buy one level to start its laps and grow its multiplier.',
      topic: 'buying',
    },
    buyModes: {
      title: 'Buy in bulk',
      why: 'Buying many levels at once saves clicks. Max buys everything you can afford.',
      coach: 'Switch between ×1, ×10 and Max here (key M). Keys 1–9 and 0 buy levels for rings 1 to 10.',
      topic: 'buying',
    },
    unlockGreen: {
      title: 'Unlock Green (the 4th ring)',
      why: 'Each new ring adds a multiplier to every lap. More rings means much faster growth.',
      topic: 'buying',
    },
    ascendRed: {
      title: 'Get Red to level {CAP}, then Ascend it',
      why: 'Ascending sends Red back to level 5 but makes its multiplier grow ×{ASC_POWER} faster.',
      topic: 'ascension',
    },
    reachPrestige: {
      title: 'Reach {PRESTIGE_MIN} score',
      why: 'At {PRESTIGE_MIN} score you can Prestige: reset your rings for a lasting score boost.',
      topic: 'prestige',
    },
    prestige: {
      title: 'Prestige for a lasting ×P.Mult',
      why: 'P.Mult multiplies every lap’s score and is kept. Your next run grows much faster.',
      topic: 'prestige',
    },
    unlockWhite: {
      title: 'Unlock all 10 rings',
      why: 'Prestige and rebuild until you can afford every ring. White, the tenth, is the last.',
      topic: 'buying',
    },
    reachPromote: {
      title: 'Grow P.Mult to ×{PROMO_MIN}',
      why: 'Prestige again and again to raise P.Mult. At ×{PROMO_MIN} you earn Promotion XP.',
      topic: 'promotions',
    },
    promote: {
      title: 'Promote once',
      why: 'Promoting resets P.Mult but gives a boost that lasts through every Prestige.',
      topic: 'promotions',
    },
    promoteAll: {
      title: 'Level all four Promotions',
      why: 'Each Promotion boosts something different. Promotion Power boosts the other three.',
      topic: 'promotions',
    },
    infinity: {
      title: 'Reach Infinity ({INF} score)',
      why: 'Infinity is the first big milestone. It pays Infinity Points (IP) for upgrades you keep.',
      topic: 'infinity',
    },
    buyGens: {
      title: 'Buy your first Infinity Upgrade',
      why: 'Infinity Generation unlocks Generators and Autobuy. Upgrades are never lost.',
      topic: 'infinity',
    },
    buyG2: {
      title: 'Buy Generator 2',
      why: 'G2 makes G1s, and G1 makes Generator Power, which speeds up every ring’s multiplier.',
      topic: 'generators',
    },
    automate: {
      title: 'Buy all four automation upgrades',
      why: 'Autobuy came with Infinity Generation. Buy Auto Ascend, Auto Work and Auto Prestige in the Tree.',
      topic: 'automation',
    },
    unlockIC: {
      title: 'Unlock Infinity Challenges',
      why: 'Buy the Challenges! upgrade. Each Challenge you beat gives a permanent reward and more IP.',
      topic: 'challenges',
    },
    firstIC: {
      title: 'Complete Challenge 1',
      why: 'Reach {INF} score under the Challenge’s handicap to earn its reward.',
      topic: 'challenges',
    },
    allIC: {
      title: 'Complete all 9 Challenges',
      why: 'Each one is harder than the last. Beating all nine unlocks Break Infinity.',
      topic: 'challenges',
    },
    breakInf: {
      title: 'Break Infinity',
      why: 'Once broken, your score can pass {INF}, and very high scores multiply your IP.',
      topic: 'break',
    },
    stars: {
      title: 'Buy A Falling Star, then a Star',
      why: 'Climb the Tree to its last upgrade. Stars make Stardust, which boosts Generator Power.',
      topic: 'stars',
    },
    finale: {
      title: 'Reach {INF} IP',
      why: 'The final goal of this version. IP stops at {INF} — Eternity is coming later.',
      topic: 'finale',
    },
  };

  // ---------- game overview (Guide v2 brief, approved text, verbatim) ----------
  // Rendered inside the `overview` topic. `labels` are the bold lead-ins;
  // each how-step renders as a bold title followed by its body.

  var overview = {
    labels: { objective: 'The objective', how: 'How you play', shape: 'The shape of the game', job: 'Your job' },
    objective: 'reach ever-bigger score milestones, all the way to Infinity ({INF}). Each time you get there, you earn Infinity Points (IP) and your score starts over. You spend IP on permanent Infinity Upgrades, which make every run faster, automate the routine buying and resetting, and unlock new features. The game ends when your IP reaches Infinity too.',
    how: [
      { title: 'Rings earn score.', body: 'Dots circle ten coloured rings; every completed lap pays out score.' },
      { title: 'Invest your score.', body: 'Spending score lowers it for now, but levels make rings lap faster and new rings add more laps, so your score climbs back faster than before.' },
      { title: 'Multipliers compound.', body: 'Every lap also raises that ring’s multiplier, and all multipliers multiply together, so growth keeps speeding up.' },
      { title: 'Reset at milestones.', body: 'Reaching certain scores lets you trade your whole run for a permanent boost; the next run climbs much faster and reaches the next milestone.' },
    ],
    shape: 'it’s built in layers. Each layer repeats that loop — invest, grow, reset for a boost — and opens the next layer, with new things to earn and buy. Later layers add automation, so the game increasingly plays itself, even while you’re away.',
    job: 'invest well, and choose when to reset.',
  };

  // ---------- guide topics (Guide v2) ----------
  // One topic is shown at a time: summary, "How it works" (how), "What to
  // do" (todo). `overview` and `glossary` are summary-only: the UI renders
  // GuideContent.overview / GuideContent.glossary inside them. A topic is
  // hidden until its `unlock` goal is done (null = always shown).

  var topics = [
    {
      id: 'overview', group: 'basics', title: 'Overview', unlock: null,
      summary: 'What the game is about, and your next step.',
      how: [], todo: [],
    },
    {
      id: 'rings', group: 'basics', title: 'Rings, laps and score', unlock: null,
      summary: 'How rings move, and what makes them faster.',
      how: [
        'Each of the ten coloured circles is a ring. A dot orbits it; one full trip around is a lap.',
        'A ring’s level sets its speed: laps per second = level × the ring’s base speed × speed boosts.',
        'Outer rings are slower and cost more, but each one brings its own multiplier.',
      ],
      todo: [
        'Watch which rings lap fastest: they pay out most often.',
      ],
    },
    {
      id: 'mults', group: 'basics', title: 'Multipliers and score per lap', unlock: null,
      summary: 'Multipliers decide how much score each lap pays.',
      how: [
        'Each ring’s ×mult starts at ×1 and grows by its mult gain every lap.',
        'Score per lap = (product of ring multipliers × P.Mult) ^ exponent. P.Mult and the exponent start at 1; later resets raise them.',
        'Income = score per lap × laps per second, summed over all rings.',
        'Example: Red ×3, Orange ×2, P.Mult ×10, exponent 1 → 60 per lap; at 5 laps per second, 300 score per second.',
      ],
      todo: [
        'Level slow outer rings too, so their multipliers grow.',
      ],
    },
    {
      id: 'buying', group: 'basics', title: 'Levels and new rings', unlock: null,
      summary: 'What levels cost, and how new rings open.',
      how: [
        'Each level costs a little more score than the one before.',
        'Buying {UNLOCK_AT} levels of a ring unlocks the next one. Red starts at level 5, but only levels you buy count.',
        'A new ring starts at level 0 and stays still until you buy it a level.',
      ],
      todo: [
        'Buy Red until Orange unlocks, then work outward to White, the tenth.',
        'Switch to Max buying once score piles up.',
      ],
    },
    {
      id: 'controls', group: 'basics', title: 'Controls and tips', unlock: null,
      summary: 'Shortcuts and habits that save time.',
      how: [
        'Hover or long-press almost anything for its live numbers.',
        'The buy-mode switch picks ×1, ×10 or Max (all you can afford); M cycles it.',
        'Keys 1–9 and 0 buy levels for rings 1–10. ? or H opens this guide.',
        'The game keeps running while you’re away, for up to several hours.',
      ],
      todo: [
        'Unsure where to click? Press “Show me” on the goal card.',
        'Export your save from Settings now and then.',
      ],
    },
    {
      id: 'ascension', group: 'resets', title: 'Ascension', unlock: 'unlockOrange',
      summary: 'Ascending trades a maxed ring’s levels for much faster multiplier growth.',
      how: [
        'At its level cap ({CAP} for Red now), a ring shows an Ascend button.',
        'Ascending resets it to level 5 and multiplies its mult gain by your ascension power (×{ASC_POWER} now).',
        'Its cap rises by 10 and levels cost more; the multiplier it built is kept.',
        'Bigger resets undo Ascensions.',
      ],
      todo: [
        'Max Red, Ascend, then buy its levels back.',
        'Ascend every ring that hits its cap.',
      ],
    },
    {
      id: 'prestige', group: 'resets', title: 'Prestige', unlock: 'ascendRed',
      summary: 'Prestige resets score and rings for a lasting P.Mult and P.Exp.',
      how: [
        'It opens at {PRESTIGE_MIN} score on the Prestige tab; each one needs at least your last Prestige score.',
        'Gains grow with your score. P.Mult only changes if the new value is higher — gains don’t stack.',
        'P.Exp is the exponent on score per lap, so small increases matter a lot.',
        'Both survive every Prestige; later layers reset them.',
      ],
      todo: [
        'Press Prestige twice once the gain shown clearly beats your current P.Mult.',
      ],
    },
    {
      id: 'promotions', group: 'resets', title: 'Promotions', unlock: 'unlockWhite',
      summary: 'Promotions are four boosts that survive every Prestige.',
      how: [
        'From ×{PROMO_MIN} P.Mult (current or pending) you earn Promotion XP; more P.Mult, more XP.',
        'Promoting sets a card below your XP to your XP, then resets rings, score, P.Mult and P.Exp.',
        'Mult Gain grows multipliers faster, Lap Speed speeds rings up, Ascension Power strengthens Ascension, and Promotion Power boosts the other three.',
      ],
      todo: [
        'Promote on the Promote tab, then Prestige back up for more XP.',
        'Rotate through all four cards.',
      ],
    },
    {
      id: 'infinity', group: 'infinity', title: 'Going Infinite', unlock: 'reachPromote',
      summary: 'Going Infinite resets everything so far: rings, P.Mult, P.Exp and Promotions.',
      how: [
        'The first one asks you to confirm; later ones happen by themselves (see Settings → Confirm each Infinity).',
        'Each adds 1 to your Infinities (∞) count, which several upgrades grow with.',
        'Upgrades are on the ∞ tab’s Tree; most need one from the column before.',
        'IP and Infinity Upgrades are never lost.',
      ],
      todo: [
        'Go Infinite, then buy Infinity Generation on the ∞ tab.',
        'Keep going Infinite to collect IP.',
      ],
    },
    {
      id: 'generators', group: 'infinity', title: 'Generators', unlock: 'buyGens',
      summary: 'Generators, bought with IP, build Generator Power (GP) during each Infinity.',
      how: [
        'G1 makes GP. G2 makes G1s, G3 makes G2s, and so on up to G10.',
        'GP multiplies every ring’s mult gain, so multipliers climb faster as a run goes on.',
        'Each Generator you buy doubles that tier’s output. Bought ones are kept; GP and produced ones reset each Infinity.',
      ],
      todo: [
        'Buy G2 on ∞ → Gens as soon as you can.',
        'Spend spare IP on the cheapest useful Generator or upgrade.',
      ],
    },
    {
      id: 'automation', group: 'infinity', title: 'Automating runs', unlock: 'buyGens',
      summary: 'Tree upgrades unlock helpers that do the routine parts of each run for you.',
      how: [
        'Autobuy buys levels. Auto-Ascend, Auto-Promote and Auto-Prestige do what their names say.',
        'Set each one up on ∞ → Auto: which rings it touches and when it acts.',
        'A fifth helper, Auto-Infinity, comes much later.',
      ],
      todo: [
        'Buy Auto Ascend, Auto Work and Auto Prestige in the Tree.',
        'Check in now and then to spend IP while runs play out.',
      ],
    },
    {
      id: 'challenges', group: 'infinity', title: 'Infinity Challenges', unlock: 'automate',
      summary: 'Nine Challenges each add a handicap; reach {INF} score despite it for a permanent reward.',
      how: [
        'The Challenges! upgrade unlocks them on ∞ → ICs. They must be beaten in order.',
        'Starting or leaving a Challenge resets your run without paying IP.',
        'Each one beaten gives its reward and raises the IP from every Infinity.',
        'Beating all nine unlocks Break Infinity.',
      ],
      todo: [
        'Start Challenge 1 and let automation run; some take hours.',
        'Replay finished Challenges later to beat your best times.',
      ],
    },
    {
      id: 'break', group: 'infinity', title: 'Break Infinity', unlock: 'allIC',
      summary: 'Break lets your score pass {INF}, and scores far beyond it multiply your IP.',
      how: [
        'Press Break on ∞ → ICs. Fix puts the limit back.',
        'While broken, you choose when to go Infinite. The bar on the Prestige tab shows the next IP boost.',
        'Auto-Infinity works only while broken, and Challenges still stop at {INF}.',
      ],
      todo: [
        'Set up Auto-Infinity once you own it.',
        'Save IP for the Tree’s final upgrade.',
      ],
    },
    {
      id: 'stars', group: 'infinity', title: 'Stars and Stardust', unlock: 'breakInf',
      summary: 'Stars, bought with IP, make Stardust every second.',
      how: [
        'A Falling Star unlocks them on ∞ → Stars. Each Star costs more than the last.',
        'Stardust boosts Generator Power and buys four Stardust upgrades, which are kept.',
        'Stardust itself resets at each Infinity.',
      ],
      todo: [
        'Spend Stardust on its upgrades before every Infinity.',
        'Keep buying Stars as IP allows.',
      ],
    },
    {
      id: 'finale', group: 'infinity', title: 'The finale', unlock: 'stars',
      summary: 'IP stops at {INF}, and the game marks the moment you get there.',
      how: [
        'You can keep playing afterwards.',
        'The next layer, Eternity, is not in this version yet.',
      ],
      todo: [
        'Push IP up with more Stars and Stardust upgrades.',
      ],
    },
    {
      id: 'glossary', group: 'reference', title: 'Glossary', unlock: null,
      summary: 'Short definitions of every term you have met so far.',
      how: [], todo: [],
    },
  ];

  // Compatibility alias for the pre-v2 UI (src/guide.js): the old section
  // shape, { id, title, unlock, body: [paragraphs], todo }.
  var sections = topics.map(function (t) {
    return { id: t.id, title: t.title, unlock: t.unlock, body: [t.summary].concat(t.how), todo: t.todo.slice() };
  });

  // ---------- plain-English Infinity Upgrade descriptions ----------
  // One line per Engine.UPGRADES id, ≤ 70 chars once filled. The exact
  // formula stays in Engine.UPGRADES[i].desc (shown as the tooltip).
  // "This Infinity" = time since your last Infinity (Engine s.inf.t).
  // "Challenge records" = best times over all nine Challenges (Engine ctf,
  // which is 1 until all nine are done).

  var upgradePlain = {
    '1;1': 'Unlocks Generators (1 free G1) and Autobuy; G1 × your Infinities',
    '2;1': 'Score exponent +0.01: every lap pays a bit more',
    '2;2': 'Unlocks Auto-Ascend: ascends rings at their cap for you',
    '3;1': 'All rings lap 10% faster',
    '3;2': 'Unlocks Auto-Promote: promotes for you',
    '4;1': 'All rings lap 20% faster',
    '5;1': 'More P.Mult per Prestige the longer this Infinity runs (up to ×{LTP_CAP})',
    '5;2': 'More P.Exp per Prestige; grows with your Infinities',
    '5;3': 'Unlocks Auto-Prestige: prestiges for you when it pays off',
    '6;1': 'Ascension power +2: each Ascension boosts mult gain more',
    '6;2': 'Ascension power up a little; grows with your Infinities',
    '7;1': 'Unlocks Infinity Challenges: nine handicapped runs with rewards',
    '8;1': 'G1 stronger the longer this Infinity runs',
    '8;2': 'G1 stronger the more Generator Power you have',
    '8;3': 'G1 5× stronger',
    '9;1': 'G2 stronger the longer this Infinity runs',
    '9;2': 'G2 3× stronger',
    '11;1': 'G1 stronger the more IP you have',
    '11;2': 'G2 stronger the more IP you have',
    '12;1': 'G2 stronger with every Infinity you have',
    '13;1': 'Ascension power +1',
    '14;1': 'Mult Gain Promotion stronger the higher its level',
    '14;2': 'Generator Power boosts ring mult gain more strongly',
    '15;1': 'Unlocks Auto-Infinity: goes Infinite for you (needs Break)',
    '15;2': 'More IP per Infinity; bigger the faster your Challenge records',
    '15;3': 'G1 stronger; bigger the faster your Challenge records',
    '15;4': 'G2 stronger; bigger the faster your Challenge records',
    '16;1': 'More IP per Infinity; grows with your Infinities',
    '16;2': 'Ascension power up more; grows with your Infinities',
    '16;3': 'Promotion Power stronger if your Challenge 9 record is fast',
    '17;1': 'G3 stronger with every Infinity you have',
    '17;3': 'G1 10× stronger',
    '18;1': 'Earn Infinities every second; more if your fastest Infinity is quick',
    '18;3': 'G3 stronger for every G2 you have bought',
    '19;1': 'Generator Power boosts ring mult gain even more strongly',
    '19;3': 'All rings lap 3× faster',
    '20;1': 'All Generators stronger if your fastest Infinity is quick (max ×{FAST_GEN_MAX})',
    '21;1': 'Unlocks Stars: buy them with IP to make Stardust',
  };

  // ---------- unlock cards (spec §7) ----------

  var cards = {
    ascendSeen: {
      title: 'Ascension ready',
      what: 'A ring hit its level cap. Ascending sends it back to level 5 and makes its multiplier grow ×{ASC_POWER} faster per lap.',
      why: 'Faster multiplier growth is the main way to push your score higher before Prestige.',
      todo: 'Press Ascend on the maxed ring, then buy its levels back.',
      goal: 'ascendRed',
      topic: 'ascension',
    },
    prestigeSeen: {
      title: 'Prestige ready',
      what: 'Prestige resets your score and rings for P.Mult and P.Exp, which multiply every lap’s score. They only go up and are kept through every Prestige.',
      why: 'Each Prestige makes the next climb much faster. It is the path toward Infinity.',
      todo: 'Open the Prestige tab, check the gain, then press Prestige twice to confirm.',
      goal: 'prestige',
      topic: 'prestige',
    },
    promoSeen: {
      title: 'Promotions ready',
      what: 'Your P.Mult (or the P.Mult your next Prestige would give) has reached ×{PROMO_MIN}, so you earn Promotion XP. Promoting sets one of four boosts to your XP level.',
      why: 'Promotions survive every Prestige. They boost mult gain, lap speed, Ascension and each other.',
      todo: 'Open the Promote tab and promote one card. It resets P.Mult, so Prestige again after.',
      goal: 'promote',
      topic: 'promotions',
    },
    infinitySeen: {
      title: 'Infinity reached',
      what: 'Your score hit {INF}, the largest number the game can hold. Going Infinite resets the Revolution stage.',
      why: 'You earn Infinity Points (IP) to buy upgrades that are never lost.',
      todo: 'Press Go Infinite, then open the new ∞ tab.',
      goal: 'infinity',
      topic: 'infinity',
    },
    infTabSeen: {
      title: 'The ∞ tab',
      what: 'The ∞ tab holds the Infinity Upgrade Tree. Upgrades cost IP and are kept forever.',
      why: 'These upgrades are how you get stronger from now on — every run to Infinity gets faster.',
      todo: 'Buy Infinity Generation, the first upgrade in the Tree.',
      goal: 'buyGens',
      topic: 'infinity',
    },
    gensSeen: {
      title: 'Generators online',
      what: 'Generators make Generator Power (GP). G1 makes GP; each higher Generator makes the one below it.',
      why: 'GP multiplies every ring’s mult gain per lap, so runs speed up as they go.',
      todo: 'Open ∞ → Gens and buy Generator 2 when you can afford it.',
      goal: 'buyG2',
      topic: 'generators',
    },
    autoSeen: {
      title: 'Automation unlocked',
      what: 'Some Tree upgrades unlock automations that buy levels, ascend, promote and prestige for you.',
      why: 'With automation, runs to Infinity play themselves while you spend IP.',
      todo: 'Check ∞ → Auto, then buy the other automation upgrades in the Tree.',
      goal: 'automate',
      topic: 'automation',
    },
    icSeen: {
      title: 'Infinity Challenges unlocked',
      what: 'Nine Challenges each add a handicap. Reach {INF} score while one is on to complete it.',
      why: 'Each one gives a permanent reward and more IP per Infinity. All nine unlock Break Infinity.',
      todo: 'Open ∞ → ICs and start Challenge 1.',
      goal: 'firstIC',
      topic: 'challenges',
    },
    breakSeen: {
      title: 'Break Infinity available',
      what: 'You beat all nine Challenges. Break lets your score pass {INF}.',
      why: 'Scores far past {INF} multiply the IP you earn, which you need for Stars.',
      todo: 'Press Break on ∞ → ICs.',
      goal: 'breakInf',
      topic: 'break',
    },
    starsSeen: {
      title: 'Stars unlocked',
      what: 'Stars cost IP and make Stardust every second. Stardust boosts Generator Power and buys its own upgrades.',
      why: 'Stars drive your IP toward the final goal of {INF} IP.',
      todo: 'Open ∞ → Stars and buy your first Star. Spend Stardust before each Infinity.',
      goal: 'stars',
      topic: 'stars',
    },
  };

  // ---------- glossary ----------

  var glossary = [
    { term: 'Ring', unlock: null, def: 'One of the ten coloured circles, Red to White. Each has a dot that orbits it.' },
    { term: 'Lap', unlock: null, def: 'One full trip of a ring’s dot around its circle. Every lap earns score.' },
    { term: 'Score', unlock: null, def: 'What rings earn. You spend it on upgrades, and reaching score milestones unlocks resets.' },
    { term: 'Level', unlock: null, def: 'How fast a ring spins. Laps per second = level × the ring’s base speed × speed boosts.' },
    { term: 'Level cap', unlock: null, def: 'The highest level a ring can reach ({CAP} for Red right now). Ascending raises it.' },
    { term: 'Laps per second', unlock: null, def: 'How often a ring completes a lap. Your income adds these up across all rings.' },
    { term: 'Multiplier', unlock: null, def: 'Each ring’s ×mult. It starts at ×1 and grows every time that ring laps. All ring multipliers multiply together.' },
    { term: 'Mult gain', unlock: null, def: 'How much a ring’s multiplier grows per lap. Ascension, Promotions and GP raise it.' },
    { term: 'Score per lap', unlock: null, def: '(All ring multipliers multiplied together × P.Mult) ^ exponent. Every lap of any ring earns this.' },
    { term: 'Income', unlock: null, def: 'Score per second: score per lap × laps per second across all rings.' },
    { term: 'Bulk buy', unlock: null, def: 'The ×1 / ×10 / Max switch (key M). Max buys as many levels as you can afford.' },
    { term: 'Run', unlock: null, def: 'Your progress since the last reset. Each Prestige, Promotion or Infinity starts a new run.' },
    { term: 'Ascension', unlock: 'unlockOrange', def: 'Resetting a maxed ring to level 5. Its mult gain grows ×ascension power, and its level cap rises by 10.' },
    { term: 'Ascension power', unlock: 'unlockOrange', def: 'How much each Ascension multiplies a ring’s mult gain (×{ASC_POWER} now).' },
    { term: 'Prestige', unlock: 'ascendRed', def: 'Resetting score and rings, from {PRESTIGE_MIN} score, for a lasting P.Mult and P.Exp.' },
    { term: 'P.Mult', unlock: 'ascendRed', def: 'Prestige multiplier. It multiplies score per lap and only goes up through Prestiges. Promotion and Infinity reset it.' },
    { term: 'P.Exp', unlock: 'ascendRed', def: 'Prestige exponent. Your score per lap is raised to this power, so small gains matter a lot. Promotion and Infinity reset it.' },
    { term: 'Exponent', unlock: null, def: 'The power score per lap is raised to: P.Exp plus bonuses from later upgrades. It starts at 1.' },
    { term: 'Promotion', unlock: 'unlockWhite', def: 'One of four boosts (Mult Gain, Lap Speed, Ascension Power, Promotion Power). Promoting resets P.Mult.' },
    { term: 'Promotion XP', unlock: 'unlockWhite', def: 'Earned once P.Mult reaches ×{PROMO_MIN}. Promoting sets one Promotion’s level to your XP.' },
    { term: 'Infinity', unlock: 'reachPromote', def: 'The score limit, {INF}. Going Infinite resets the Revolution stage for IP.' },
    { term: 'Infinity Points (IP)', unlock: 'reachPromote', def: 'Earned each time your score reaches Infinity; spent on permanent Infinity Upgrades.' },
    { term: 'Infinities (∞)', unlock: 'reachPromote', def: 'How many times you have gone Infinite. Several upgrades grow stronger with more.' },
    { term: 'Infinity Upgrade', unlock: 'reachPromote', def: 'A permanent boost bought with IP on the ∞ tab’s Tree. Most need an upgrade from an earlier column first.' },
    { term: 'Generator', unlock: 'buyGens', def: 'Bought with IP. G1 makes GP; every higher Generator makes more of the one below it.' },
    { term: 'GP', unlock: 'buyGens', def: 'Generator Power. It multiplies every ring’s mult gain per lap. Resets each Infinity.' },
    { term: 'Automation', unlock: 'buyGens', def: 'Upgrades that buy, ascend, promote, prestige and (after Break) go Infinite for you.' },
    { term: 'Challenge', unlock: 'automate', def: 'An Infinity Challenge: reach {INF} score under a handicap for a permanent reward.' },
    { term: 'Handicap', unlock: 'automate', def: 'The penalty a Challenge applies while it is running.' },
    { term: 'Break', unlock: 'allIC', def: 'Break Infinity: lets score pass {INF}. Very high scores multiply the IP you earn.' },
    { term: 'Star', unlock: 'breakInf', def: 'Bought with IP after the A Falling Star upgrade. Each Star makes Stardust.' },
    { term: 'Stardust', unlock: 'breakInf', def: 'Made by Stars. Boosts Generator Power and buys Stardust upgrades. Resets each Infinity.' },
  ];

  // ---------- token filling ----------

  function fmtPlain(E, x) {
    return x > 0 ? E.fmtLog(Math.log10(x)) : '0';
  }

  var TOKENS = {
    INF: function (E) { return E.fmtLog(E.INFINITY_LOG); },
    PRESTIGE_MIN: function (E) { return E.fmtLog(E.TUNE.prestigeMinLog); },
    PROMO_MIN: function (E) { return fmtPlain(E, E.TUNE.promoMin); },
    ASC_POWER: function (E, s) { return fmtPlain(E, E.promoEffects(s).p3); },
    CAP: function (E, s) { return String(E.levelCap(s.circles[0])); },
    UNLOCK_AT: function () { return '5'; }, // engine.js buy(): 5 levels bought unlock the next ring
    LTP_CAP: function (E) { return String(E.TUNE.u51Cap); }, // 5;1 Long Term Prestiging cap
    FAST_GEN_MAX: function (E) { return fmtPlain(E, Math.sqrt(E.TUNE.u201Cap)); }, // 20;1 max multiplier
  };

  function fill(str, s) {
    var E = engine();
    var state = s || null;
    return String(str).replace(/\{([A-Z_]+)\}/g, function (m, key) {
      var f = TOKENS[key];
      if (!f) return m;
      if (!state) state = E.newState();
      return f(E, state);
    });
  }

  // `section` is kept as a deprecated alias of `topic` for the pre-v2 UI.
  Object.keys(goals).forEach(function (k) { goals[k].section = goals[k].topic; });
  Object.keys(cards).forEach(function (k) { cards[k].section = cards[k].topic; });

  var GuideContent = {
    objective: objective, // deprecated: pre-v2 intro/guide header only
    overview: overview,
    stages: stages,
    goals: goals,
    topics: topics,
    sections: sections, // deprecated alias of topics in the old shape
    upgradePlain: upgradePlain,
    cards: cards,
    glossary: glossary,
    fill: fill,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GuideContent;
  else window.GuideContent = GuideContent;
})();

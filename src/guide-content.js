// src/guide-content.js — all player-guidance copy (goals, guide sections,
// unlock cards, glossary) as plain data. No DOM. Tuned numbers never appear
// in the copy: they are written as {TOKENS} and filled from Engine at
// runtime by GuideContent.fill(str, state).
//
// Tokens: {INF} Infinity (score cap), {PRESTIGE_MIN} first Prestige score,
// {PROMO_MIN} P.Mult needed for Promotion XP, {ASC_POWER} current ascension
// power, {CAP} Red's current level cap, {UNLOCK_AT} levels bought to unlock
// the next ring.
//
// Extra fields beyond the shared contract (all additive):
//   goals[id].section  — guide section for the goal's "Learn more"
//   cards[key].section — guide section for the card's "Learn more"
//   glossary[i].unlock — goal id after which the term is relevant (null = always)
// A section's / term's `unlock` is the goal whose completion makes it matter:
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
      section: 'buying',
    },
    readMult: {
      title: 'Meet your multipliers',
      why: 'Score per lap is every ring multiplier multiplied together. They grow as rings lap.',
      coach: 'Red’s ×mult grows a little every lap. Your score per lap is all ring mults multiplied together, so bigger mults mean much more score.',
      section: 'mults',
    },
    unlockOrange: {
      title: 'Buy {UNLOCK_AT} Red levels to unlock Orange',
      why: 'A second ring adds its own laps and its own multiplier to every lap’s score.',
      coach: 'Buying {UNLOCK_AT} levels of a ring unlocks the next one. Red starts at level 5, but only levels you buy count. Keep buying Red.',
      section: 'buying',
    },
    buyOrange: {
      title: 'Buy an Orange level',
      why: 'New rings start at level 0 and do not move. One level gets Orange lapping.',
      coach: 'Orange is unlocked but sits at level 0, so it is not moving. Buy one level to start its laps and grow its multiplier.',
      section: 'buying',
    },
    buyModes: {
      title: 'Buy in bulk',
      why: 'Buying many levels at once saves clicks. Max buys everything you can afford.',
      coach: 'Switch between ×1, ×10 and Max here (key M). Keys 1–9 and 0 buy levels for rings 1 to 10.',
      section: 'buying',
    },
    unlockGreen: {
      title: 'Buy {UNLOCK_AT} Yellow levels to unlock Green',
      why: 'Each new ring adds a multiplier to every lap. More rings means much faster growth.',
      section: 'buying',
    },
    ascendRed: {
      title: 'Get Red to level {CAP}, then Ascend it',
      why: 'Ascending sends Red back to level 5 but makes its multiplier grow ×{ASC_POWER} faster.',
      section: 'ascension',
    },
    reachPrestige: {
      title: 'Reach {PRESTIGE_MIN} score',
      why: 'At {PRESTIGE_MIN} score you can Prestige: reset your rings for a lasting score boost.',
      section: 'prestige',
    },
    prestige: {
      title: 'Prestige for a lasting ×P.Mult',
      why: 'P.Mult multiplies every lap’s score and is kept. Your next run grows much faster.',
      section: 'prestige',
    },
    unlockWhite: {
      title: 'Unlock all 10 rings',
      why: 'Prestige and rebuild until you can afford every ring. White, the tenth, is the last.',
      section: 'buying',
    },
    reachPromote: {
      title: 'Grow P.Mult to ×{PROMO_MIN}',
      why: 'Prestige again and again to raise P.Mult. At ×{PROMO_MIN} you earn Promotion XP.',
      section: 'promotions',
    },
    promote: {
      title: 'Promote once',
      why: 'Promoting resets P.Mult but gives a boost that lasts through every Prestige.',
      section: 'promotions',
    },
    promoteAll: {
      title: 'Level all four Promotions',
      why: 'Each Promotion boosts something different. Promotion Power boosts the other three.',
      section: 'promotions',
    },
    infinity: {
      title: 'Reach Infinity ({INF} score)',
      why: 'Infinity is the first big milestone. It pays Infinity Points (IP) for upgrades you keep.',
      section: 'infinity',
    },
    buyGens: {
      title: 'Buy your first Infinity Upgrade',
      why: 'Infinity Generation unlocks Generators and Autobuy. Upgrades are never lost.',
      section: 'infinity',
    },
    buyG2: {
      title: 'Buy Generator 2',
      why: 'G2 makes G1s, and G1 makes Generator Power, which speeds up every ring’s multiplier.',
      section: 'generators',
    },
    automate: {
      title: 'Buy all four automation upgrades',
      why: 'Autobuy came with Infinity Generation. Buy Auto Ascend, Auto Work and Auto Prestige in the Tree.',
      section: 'automation',
    },
    unlockIC: {
      title: 'Unlock Infinity Challenges',
      why: 'Buy the Challenges! upgrade. Each Challenge you beat gives a permanent reward and more IP.',
      section: 'challenges',
    },
    firstIC: {
      title: 'Complete Challenge 1',
      why: 'Reach {INF} score under the Challenge’s handicap to earn its reward.',
      section: 'challenges',
    },
    allIC: {
      title: 'Complete all 9 Challenges',
      why: 'Each one is harder than the last. Beating all nine unlocks Break Infinity.',
      section: 'challenges',
    },
    breakInf: {
      title: 'Break Infinity',
      why: 'Once broken, your score can pass {INF}, and very high scores multiply your IP.',
      section: 'break',
    },
    stars: {
      title: 'Buy A Falling Star, then a Star',
      why: 'Climb the Tree to its last upgrade. Stars make Stardust, which boosts Generator Power.',
      section: 'stars',
    },
    finale: {
      title: 'Reach {INF} IP',
      why: 'The final goal of this version. IP stops at {INF} — Eternity is coming later.',
      section: 'finale',
    },
  };

  // ---------- guide sections (spec §6) ----------

  var sections = [
    {
      id: 'objective',
      title: 'The goal',
      unlock: null,
      body: [
        'Your goal is to grow your score to Infinity ({INF}), then go beyond it.',
        'Rev Idle is an idle game. Your rings spin on their own and earn score, even while you are away. You spend score to make them earn faster.',
        'Every so often you reset for power. Each new layer — Prestige, Promotions, Infinity and more — wipes some progress but gives a lasting boost, so the next climb is much faster.',
        'The journey strip above shows where you are and what comes next. The goal card always shows your next step.',
      ],
      todo: [
        'Follow the goal card under your score. It always shows one next step.',
        'Press “Show me” on the card to see where to click.',
        'When something new unlocks, read its card — it explains what to do.',
      ],
    },
    {
      id: 'circles',
      title: 'Rings, laps and score',
      unlock: null,
      body: [
        'Each coloured circle is a ring. A dot orbits each ring. One full trip around is a lap.',
        'Every lap, on any ring, earns score. Your score is also your money: you spend it to buy levels.',
        'A ring’s level sets its speed: laps per second = level × the ring’s base speed × speed boosts. Outer rings are slower and cost more, but each one adds a new multiplier.',
      ],
      todo: [
        'Buy levels to make rings lap faster.',
        'Unlock more rings — each one multiplies your score per lap.',
        'Hover or long-press any number to see what it means.',
      ],
    },
    {
      id: 'mults',
      title: 'Multipliers: how score per lap works',
      unlock: null,
      body: [
        'Every ring has a multiplier (its ×mult). It starts at ×1. Each time that ring finishes a lap, its multiplier grows by its mult gain.',
        'Score per lap = (every unlocked ring’s multiplier, multiplied together, × P.Mult) ^ exponent. P.Mult and the exponent start at 1 and grow when you Prestige.',
        'Every lap of any ring earns that full score per lap. So your income = score per lap × laps per second (all rings added together).',
        'Example: Red ×3, Orange ×2, P.Mult ×10, exponent 1. Score per lap = (3 × 2 × 10)^1 = 60. At 5 laps per second you earn 60 × 5 = 300 score per second.',
      ],
      todo: [
        'Watch the ×mult chips — they are where most of your growth comes from.',
        'Unlock new rings: a new ring’s multiplier multiplies all the others.',
        'Keep slow rings leveled too — their laps grow their own multiplier.',
      ],
    },
    {
      id: 'buying',
      title: 'Buying levels and unlocking rings',
      unlock: null,
      body: [
        'Press a ring’s Buy button to add levels. Each level costs score, and each one costs a bit more than the last.',
        'Buy {UNLOCK_AT} levels of a ring to unlock the next ring. Red starts at level 5, but only levels you buy count. A new ring starts at level 0, so buy it a level to get it moving.',
        'The buy-mode switch picks ×1, ×10 or Max (as many as you can afford). Press M to cycle it. Keys 1–9 and 0 buy for rings 1 to 10.',
        'Each ring has a level cap ({CAP} for Red right now). At the cap you can Ascend it.',
      ],
      todo: [
        'Buy Red levels until Orange unlocks, then keep going ring by ring.',
        'Switch to Max once you have lots of score.',
        'Aim to unlock all 10 rings — White is the last.',
      ],
    },
    {
      id: 'ascension',
      title: 'Ascension',
      unlock: 'unlockOrange',
      body: [
        'When a ring reaches its level cap ({CAP} for Red right now), an Ascend button appears on it.',
        'Ascending sends the ring back to level 5. In return its mult gain per lap is multiplied by your ascension power (×{ASC_POWER} now), its level cap rises by 10, and its levels cost more. The multiplier it has already built is kept.',
        'Ascensions last until your next Prestige, Promotion or Infinity.',
      ],
      todo: [
        'Max Red’s level, then press Ascend.',
        'Ascend any ring that hits its cap — faster multiplier growth pays off quickly.',
        'Rebuy levels afterwards so the ring laps fast again.',
      ],
    },
    {
      id: 'prestige',
      title: 'Prestige',
      unlock: 'ascendRed',
      body: [
        'Once your score reaches {PRESTIGE_MIN}, you can Prestige on the Prestige tab.',
        'Prestige resets your score and every ring (levels, multipliers and ascensions). In return you get P.Mult and P.Exp, based on the score you reached. Your P.Mult becomes the new value only if it’s higher — gains don’t stack. Both only go up and are kept through every Prestige; a later layer resets them.',
        'P.Mult multiplies every lap’s score. P.Exp is the exponent on your score per lap, so even small increases matter a lot.',
        'Each Prestige needs at least the score you last prestiged at. The Prestige tab shows what you would gain right now.',
      ],
      todo: [
        'Reach {PRESTIGE_MIN} score, then open the Prestige tab.',
        'Press Prestige, then press it again to confirm.',
        'Prestige again when the gain shown is clearly bigger than your current P.Mult.',
      ],
    },
    {
      id: 'promotions',
      title: 'Promotions',
      unlock: 'unlockWhite',
      body: [
        'When your P.Mult (or the P.Mult your next Prestige would give) reaches ×{PROMO_MIN}, you earn Promotion XP. More P.Mult means more XP.',
        'On the Promote tab, promoting sets one of four Promotions to a level equal to your XP. It then resets your rings, score, P.Mult and P.Exp. You can only promote a card whose level is below your XP.',
        'Mult Gain: bigger mult gain per lap. Lap Speed: every ring laps faster. Ascension Power: each Ascension counts for more. Promotion Power: boosts the other three.',
        'Promotion levels are kept through every Prestige. They reset at Infinity (a Challenge reward softens this later).',
      ],
      todo: [
        'Push P.Mult to ×{PROMO_MIN} with Prestiges.',
        'Promote a card, then rebuild with Prestiges to earn more XP.',
        'Rotate through all four cards so each keeps rising.',
      ],
    },
    {
      id: 'infinity',
      title: 'Infinity',
      unlock: 'reachPromote',
      body: [
        'Your score cannot go past Infinity ({INF}). When it gets there, you go Infinite. The first time, a window asks you to confirm. After that it happens by itself (turn on Settings → Confirm each Infinity to be asked each time).',
        'Going Infinite resets the whole Revolution stage: score, rings, P.Mult, P.Exp and Promotions. You earn Infinity Points (IP) and +1 Infinity (∞) — a later Challenge reward makes it +2.',
        'IP buys Infinity Upgrades on the ∞ tab’s Tree. Upgrades, IP, Generators you bought and Challenge results are never lost.',
        'Some upgrades grow stronger the more Infinities you have, so every Infinity helps.',
      ],
      todo: [
        'Reach {INF} score and press Go Infinite.',
        'Open the ∞ tab and buy Infinity Generation first.',
        'Keep going Infinite to collect IP for the next upgrades.',
      ],
    },
    {
      id: 'generators',
      title: 'Generators',
      unlock: 'buyGens',
      body: [
        'Generators (∞ → Gens) are bought with IP. G1 makes Generator Power (GP). G2 makes G1s, G3 makes G2s, and so on up to G10.',
        'GP multiplies every ring’s mult gain per lap, so rings build multipliers much faster.',
        'Each Generator you buy doubles that tier’s output. Bought Generators are kept. GP and the Generators they produce reset at each Infinity, so a run speeds up as it goes.',
      ],
      todo: [
        'Buy G2 as soon as you can afford it.',
        'Spend spare IP on the cheapest useful Generator or Tree upgrade.',
        'Watch the GP boost on the ∞ tab grow during a run.',
      ],
    },
    {
      id: 'automation',
      title: 'Automation',
      unlock: 'buyGens',
      body: [
        'Tree upgrades unlock automations: Autobuy (buys levels), Auto-Ascend, Auto-Promote and Auto-Prestige. Auto-Infinity comes later and works only after Break.',
        'Set them up on ∞ → Auto. You can choose which rings they touch and when they act.',
        'With all four on, each run to Infinity plays itself. That is how the game is meant to be played from here: check in, spend IP, let it run.',
      ],
      todo: [
        'Buy Auto Ascend, Auto Work and Auto Prestige in the Tree.',
        'Check ∞ → Auto to see each automation is on.',
        'Let runs play out and come back to spend IP.',
      ],
    },
    {
      id: 'challenges',
      title: 'Infinity Challenges',
      unlock: 'automate',
      body: [
        'The Challenges! upgrade unlocks nine Infinity Challenges (∞ → ICs). Each one adds a handicap. You complete it by reaching {INF} score while it is on.',
        'Starting a Challenge resets your current run with no IP. You can leave at any time, which resets the run again.',
        'Each completed Challenge gives a permanent reward and raises the IP you earn from every Infinity. You must beat them in order.',
        'Beating all nine unlocks Break Infinity.',
      ],
      todo: [
        'Buy Challenges! in the Tree, then start Challenge 1.',
        'Let automation run inside the Challenge — some take hours.',
        'Replay a finished Challenge later to beat your best time.',
      ],
    },
    {
      id: 'break',
      title: 'Break Infinity',
      unlock: 'allIC',
      body: [
        'After all nine Challenges, a Break card appears on ∞ → ICs. Break lets your score pass {INF}. Fix puts the limit back.',
        'While broken, you choose when to go Infinite with the Go Infinite button. Far past {INF}, your score multiplies the IP you earn, and the bar on the Prestige tab shows the next boost.',
        'Auto-Infinity works only while broken. Challenges always stop at {INF}.',
      ],
      todo: [
        'Press Break on ∞ → ICs.',
        'Set up Auto-Infinity once you own it.',
        'Let runs grow past {INF} for bigger IP, then save up for Stars.',
      ],
    },
    {
      id: 'stars',
      title: 'Stars and Stardust',
      unlock: 'breakInf',
      body: [
        'The last Tree upgrade, A Falling Star, unlocks Stars (∞ → Stars). Stars cost IP, and each one costs more.',
        'Stars make Stardust every second. Stardust boosts Generator Power. You also spend it on four Stardust upgrades, which are kept.',
        'Stardust itself resets at each Infinity, so spend it before you go Infinite. You can also buy upgrades that raise how much Stardust each Star makes and how strongly it boosts GP.',
      ],
      todo: [
        'Buy A Falling Star, then your first Star.',
        'Spend Stardust on its upgrades before each Infinity.',
        'Keep buying Stars as IP allows.',
      ],
    },
    {
      id: 'finale',
      title: 'The finale',
      unlock: 'stars',
      body: [
        'The final goal of this version is {INF} IP. IP cannot go past that.',
        'When you reach it, the game says so. You can keep playing, but the next layer, Eternity, is not in this version yet.',
      ],
      todo: [
        'Keep buying Stars and Stardust upgrades to raise your IP.',
        'Check in, spend IP, and let automation do the rest.',
      ],
    },
    {
      id: 'glossary-intro',
      title: 'Glossary',
      unlock: null,
      body: [
        'Short definitions of every game term. New terms appear here as you unlock them.',
      ],
      todo: [
        'Look up any word you do not recognise.',
        'Hover or long-press a number in the game for its live value.',
      ],
    },
    {
      id: 'tips',
      title: 'Tips and controls',
      unlock: null,
      body: [
        'Hover (or long-press on touch) almost anything to see a tooltip with live numbers.',
        'Keys: M cycles the buy mode. 1–9 and 0 buy levels for rings 1 to 10. ? or H opens this guide.',
        'The game keeps running while you are away, for up to several hours, and catches up when you return. Save backups from Settings → Export.',
      ],
      todo: [
        'Use Max buy with the number keys to spend fast.',
        'Resets like Prestige ask for a second press to confirm.',
        'Export your save now and then as a backup.',
      ],
    },
  ];

  // ---------- unlock cards (spec §7) ----------

  var cards = {
    ascendSeen: {
      title: 'Ascension ready',
      what: 'A ring hit its level cap. Ascending sends it back to level 5 and makes its multiplier grow ×{ASC_POWER} faster per lap.',
      why: 'Faster multiplier growth is the main way to push your score higher before Prestige.',
      todo: 'Press Ascend on the maxed ring, then buy its levels back.',
      goal: 'ascendRed',
      section: 'ascension',
    },
    prestigeSeen: {
      title: 'Prestige ready',
      what: 'Prestige resets your score and rings for P.Mult and P.Exp, which multiply every lap’s score. They only go up and are kept through every Prestige.',
      why: 'Each Prestige makes the next climb much faster. It is the path toward Infinity.',
      todo: 'Open the Prestige tab, check the gain, then press Prestige twice to confirm.',
      goal: 'prestige',
      section: 'prestige',
    },
    promoSeen: {
      title: 'Promotions ready',
      what: 'Your P.Mult (or the P.Mult your next Prestige would give) has reached ×{PROMO_MIN}, so you earn Promotion XP. Promoting sets one of four boosts to your XP level.',
      why: 'Promotions survive every Prestige. They boost mult gain, lap speed, Ascension and each other.',
      todo: 'Open the Promote tab and promote one card. It resets P.Mult, so Prestige again after.',
      goal: 'promote',
      section: 'promotions',
    },
    infinitySeen: {
      title: 'Infinity reached',
      what: 'Your score hit {INF}, the largest number the game can hold. Going Infinite resets the Revolution stage.',
      why: 'You earn Infinity Points (IP) to buy upgrades that are never lost.',
      todo: 'Press Go Infinite, then open the new ∞ tab.',
      goal: 'infinity',
      section: 'infinity',
    },
    infTabSeen: {
      title: 'The ∞ tab',
      what: 'The ∞ tab holds the Infinity Upgrade Tree. Upgrades cost IP and are kept forever.',
      why: 'These upgrades are how you get stronger from now on — every run to Infinity gets faster.',
      todo: 'Buy Infinity Generation, the first upgrade in the Tree.',
      goal: 'buyGens',
      section: 'infinity',
    },
    gensSeen: {
      title: 'Generators online',
      what: 'Generators make Generator Power (GP). G1 makes GP; each higher Generator makes the one below it.',
      why: 'GP multiplies every ring’s mult gain per lap, so runs speed up as they go.',
      todo: 'Open ∞ → Gens and buy Generator 2 when you can afford it.',
      goal: 'buyG2',
      section: 'generators',
    },
    autoSeen: {
      title: 'Automation unlocked',
      what: 'Some Tree upgrades unlock automations that buy levels, ascend, promote and prestige for you.',
      why: 'With automation, runs to Infinity play themselves while you spend IP.',
      todo: 'Check ∞ → Auto, then buy the other automation upgrades in the Tree.',
      goal: 'automate',
      section: 'automation',
    },
    icSeen: {
      title: 'Infinity Challenges unlocked',
      what: 'Nine Challenges each add a handicap. Reach {INF} score while one is on to complete it.',
      why: 'Each one gives a permanent reward and more IP per Infinity. All nine unlock Break Infinity.',
      todo: 'Open ∞ → ICs and start Challenge 1.',
      goal: 'firstIC',
      section: 'challenges',
    },
    breakSeen: {
      title: 'Break Infinity available',
      what: 'You beat all nine Challenges. Break lets your score pass {INF}.',
      why: 'Scores far past {INF} multiply the IP you earn, which you need for Stars.',
      todo: 'Press Break on ∞ → ICs.',
      goal: 'breakInf',
      section: 'break',
    },
    starsSeen: {
      title: 'Stars unlocked',
      what: 'Stars cost IP and make Stardust every second. Stardust boosts Generator Power and buys its own upgrades.',
      why: 'Stars drive your IP toward the final goal of {INF} IP.',
      todo: 'Open ∞ → Stars and buy your first Star. Spend Stardust before each Infinity.',
      goal: 'stars',
      section: 'stars',
    },
  };

  // ---------- glossary ----------

  var glossary = [
    { term: 'Ring', unlock: null, def: 'One of the ten coloured circles, Red to White. Each has a dot that orbits it.' },
    { term: 'Lap', unlock: null, def: 'One full trip of a ring’s dot around its circle. Every lap earns score.' },
    { term: 'Score', unlock: null, def: 'What laps earn. You spend it on levels, and reaching score targets unlocks resets.' },
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
    { term: 'IP', unlock: 'reachPromote', def: 'Infinity Points, earned by going Infinite. Spent on upgrades, Generators and Stars. Never lost.' },
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

  var GuideContent = {
    objective: objective,
    stages: stages,
    goals: goals,
    sections: sections,
    cards: cards,
    glossary: glossary,
    fill: fill,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GuideContent;
  else window.GuideContent = GuideContent;
})();

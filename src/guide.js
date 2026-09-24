// src/guide.js — player-guidance DOM: objective + journey strip, next-goal
// card, first-minutes coach spotlight, the full ? guide, and unlock cards.
// Reads GuideGoals (pure goal engine) and GuideContent (copy) as globals;
// only touches the rest of the app through the hooks passed to Guide.init.
(function () {
  'use strict';

  var STORAGE_KEY = 'revidle.guide.v1';
  var STRONG_PULSE_MS = 3000;
  var COACH_RETRY_MS = 220;

  var GuideGoals = window.GuideGoals;
  var GuideContent = window.GuideContent;

  // ---------- hooks (wired by ui.js via Guide.init) ----------

  var hooks = {
    el: null,
    toast: function () {},
    isModalOpen: function () { return null; },
    showModal: function () {},
    hideModal: function () {},
    getState: function () { return null; },
    setTab: function () {},
    isCatchingUp: function () { return false; },
    hadSave: false,
  };

  // ---------- persisted store ----------

  var store = { done: {}, collapsed: false, enabled: true, cardsSeen: {} };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          return {
            done: obj.done && typeof obj.done === 'object' ? obj.done : {},
            collapsed: !!obj.collapsed,
            enabled: obj.enabled !== false,
            cardsSeen: obj.cardsSeen && typeof obj.cardsSeen === 'object' ? obj.cardsSeen : {},
          };
        }
      }
    } catch (e) { /* ignore: guidance state is best-effort */ }
    return { done: {}, collapsed: false, enabled: true, cardsSeen: {} };
  }

  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  // ---------- small helpers ----------

  function el(tag, attrs, children) {
    return hooks.el(tag, attrs, children);
  }

  function fill(str, state) {
    return GuideContent.fill(str, state);
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function coachGoalIds() {
    return GuideGoals.GOALS.filter(function (g) { return g.coach; }).map(function (g) { return g.id; });
  }

  // Extracts the data-guide name out of a `[data-guide="name"]` selector.
  function guideName(sel) {
    var m = /data-guide="([^"]+)"/.exec(sel);
    return m ? m[1] : null;
  }

  var SUBTAB_FOR_NAME = {
    'inf-tree': 'tree', 'inf-gens': 'gens', 'inf-ics': 'ics', 'inf-break': 'ics', 'inf-stars': 'stars',
  };

  // Resolves a goal's target element(s) in the live DOM. Never throws: an
  // unresolved target (wrong tab, sub-tab not built yet) just yields an
  // empty NodeList/array.
  function findTargetEls(goal) {
    var t = goal.target;
    var nodes = document.querySelectorAll(t.sel);
    if (nodes.length === 0 && goal.id === 'stars') {
      // The Stars sub-tab doesn't exist until 'A Falling Star' is bought;
      // fall back to that Tree upgrade's own card.
      nodes = document.querySelectorAll('[data-id="21;1"]');
    }
    return nodes;
  }

  // Switches to a goal's tab (and ∞ sub-tab, if any) so its target will be
  // in the DOM on the next render, then calls back once it should be there.
  function navigateToTarget(goal, cb) {
    var t = goal.target;
    if (t.tab) hooks.setTab(t.tab);
    var name = guideName(t.sel);
    var subtab = SUBTAB_FOR_NAME[name];
    if (subtab && window.InfinityUI && typeof window.InfinityUI.setSubTab === 'function') {
      window.InfinityUI.setSubTab(subtab);
    }
    if (cb) setTimeout(cb, COACH_RETRY_MS);
  }

  // ---------- goal-complete detection ----------

  var currentGoalId = null;
  var lastDoneCount = -1;

  function syncGoals(state) {
    var next = GuideGoals.sync(state, store.done);
    var nextCount = Object.keys(next).length;
    var changed = nextCount !== lastDoneCount;
    store.done = next;
    lastDoneCount = nextCount;
    if (changed) saveStore();
    return changed;
  }

  // ---------- goal card ----------

  var cardEl = null;
  var cardGoalId; // undefined = never rendered
  var cardCollapsed;

  function ensureCard() {
    if (cardEl) return cardEl;
    cardEl = el('div', { id: 'guide-card', class: 'guide-card', role: 'complementary', 'aria-label': 'Current goal' });
    var scorebox = document.getElementById('scorebox');
    (scorebox || document.body).appendChild(cardEl);
    return cardEl;
  }

  function progressText(p) {
    if (!p) return null;
    var E = window.Engine;
    var curTxt = p.log ? E.fmtLog(p.cur) : String(Math.round(p.cur));
    var maxTxt = p.log ? E.fmtLog(p.max) : String(Math.round(p.max));
    return curTxt + ' / ' + maxTxt;
  }

  function progressPct(p) {
    if (!p || !(p.max > 0)) return 0;
    return Math.max(0, Math.min(1, p.cur / p.max));
  }

  function buildCard(state, goal) {
    var card = ensureCard();
    card.innerHTML = '';
    card.hidden = false;
    card.classList.toggle('collapsed', !!store.collapsed);
    var content = GuideContent.goals[goal.id];
    var p = goal.progress(state);
    var pct = progressPct(p);

    var chevron = el('button', {
      class: 'guide-card-collapse',
      'aria-label': store.collapsed ? 'Expand goal card' : 'Collapse goal card',
      'aria-expanded': String(!store.collapsed),
      onclick: function () {
        store.collapsed = !store.collapsed;
        saveStore();
        buildCard(hooks.getState(), goal);
      },
    }, [store.collapsed ? '▸' : '▾']);

    var head = el('div', { class: 'guide-card-head' }, [
      chevron,
      el('div', { class: 'guide-card-title' }, [fill(content.title, state)]),
      el('div', { class: 'guide-card-pct' }, [p ? Math.round(pct * 100) + '%' : '']),
    ]);
    card.appendChild(head);

    if (store.collapsed) return;

    var body = el('div', { class: 'guide-card-body' });
    if (p) {
      body.appendChild(el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', style: 'width:' + (pct * 100) + '%' }),
      ]));
      body.appendChild(el('div', { class: 'guide-card-progress-text' }, [progressText(p)]));
    }
    body.appendChild(el('p', { class: 'help guide-card-why' }, [fill(content.why, state)]));
    body.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', onclick: function () { showMe(goal); } }, ['Show me']),
      el('button', {
        class: 'btn',
        onclick: function () { openGuide(content.section); },
      }, ['Learn more']),
    ]));
    body.appendChild(journeyStrip(state));
    card.appendChild(body);
  }

  function renderCard(state) {
    var card = ensureCard();
    if (!isEnabled()) { card.hidden = true; return; }
    card.hidden = false;

    var goal = GuideGoals.current(store.done);
    currentGoalId = goal ? goal.id : null;

    if (!goal) {
      if (cardGoalId !== null) {
        card.innerHTML = '';
        card.classList.remove('collapsed');
        card.appendChild(el('div', { class: 'guide-card-done' },
          ['All goals complete — you’ve reached the end of this version.']));
        cardGoalId = null;
        cardCollapsed = store.collapsed;
      }
      return;
    }

    if (goal.id === cardGoalId && store.collapsed === cardCollapsed) {
      // Patch in place: progress bar/text only, to avoid rebuilding (and
      // losing focus on) the card every 100ms tick.
      var p = goal.progress(state);
      if (p) {
        var pct = progressPct(p);
        var fillEl = card.querySelector('.progress-fill');
        if (fillEl) fillEl.style.width = (pct * 100) + '%';
        var textEl = card.querySelector('.guide-card-progress-text');
        if (textEl) textEl.textContent = progressText(p);
        var pctEl = card.querySelector('.guide-card-pct');
        if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';
      }
      return;
    }

    buildCard(state, goal);
    cardGoalId = goal.id;
    cardCollapsed = store.collapsed;
  }

  // ---------- "Show me" / highlight ----------

  var pulsedEls = [];
  var strongUntil = 0;

  function clearPulse() {
    pulsedEls.forEach(function (n) {
      if (n && n.classList) { n.classList.remove('guide-pulse'); n.classList.remove('guide-pulse-strong'); }
    });
    pulsedEls = [];
  }

  function updatePulse(state) {
    clearPulse();
    if (!isEnabled()) return;
    var goal = GuideGoals.current(store.done);
    if (!goal) return;
    var strong = Date.now() < strongUntil;
    var nodes = findTargetEls(goal);
    Array.prototype.forEach.call(nodes, function (n) {
      n.classList.add('guide-pulse');
      if (strong) n.classList.add('guide-pulse-strong');
      pulsedEls.push(n);
    });
  }

  function showMe(goal) {
    if (hooks.isCatchingUp()) return;
    navigateToTarget(goal, function () {
      var nodes = findTargetEls(goal);
      if (!nodes.length) return; // fail gracefully: nothing to scroll to / pulse
      strongUntil = Date.now() + STRONG_PULSE_MS;
      if (typeof nodes[0].scrollIntoView === 'function') {
        nodes[0].scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      updatePulse(hooks.getState());
      setTimeout(function () { updatePulse(hooks.getState()); }, STRONG_PULSE_MS + 50);
    });
  }

  // ---------- journey strip (shared by intro, guide, goal card) ----------

  function journeyStrip(state) {
    var stageIdx = GuideGoals.STAGES.indexOf(GuideGoals.currentStage(state));
    var row = el('div', { class: 'guide-journey', role: 'list', 'aria-label': 'Journey' });
    GuideGoals.STAGES.forEach(function (id, i) {
      var reached = i <= stageIdx;
      var isNext = i === stageIdx + 1;
      var label = (reached || isNext) ? GuideContent.stages[id].name : '???';
      var cls = 'guide-journey-stage' + (reached ? ' reached' : '') + (i === stageIdx ? ' current' : '');
      row.appendChild(el('span', { class: cls, role: 'listitem' }, [label]));
    });
    return row;
  }

  // ---------- objective block ----------

  function objectiveBlock(state) {
    return el('div', { class: 'guide-objective' }, [
      el('h2', { class: 'modal-title' }, [GuideContent.objective.title]),
      el('p', { class: 'help' }, [fill(GuideContent.objective.body, state)]),
    ]);
  }

  // ---------- intro ----------

  function glyph(color) {
    return el('span', { class: 'help-glyph', style: 'border-color:' + color + ';box-shadow:0 0 8px 1px ' + color });
  }

  function beat(color, title, body) {
    return el('div', { class: 'help-beat' }, [
      glyph(color),
      el('div', {}, [
        el('div', { class: 'help-beat-title' }, [title]),
        el('div', { class: 'help-beat-body' }, [body]),
      ]),
    ]);
  }

  function showIntro() {
    if (hooks.isModalOpen()) return;
    var state = hooks.getState();
    var panel = el('div', { class: 'modal-panel guide-intro' }, [
      objectiveBlock(state),
      journeyStrip(state),
      beat('#ff3b4f', 'Orbit', 'Every lap of a dot earns score. Faster rings lap more often.'),
      beat('#ffd93b', 'Buy', 'Levels make a ring faster; buying 5 levels of a ring unlocks the next.'),
      beat('#2affc6', 'Multiply', 'Each lap also grows that ring’s ×mult; all mults multiply your score per lap.'),
      beat('#a24dff', 'Reset for power', 'Max a ring to Ascend it. Later, Prestige and Promotions trade progress for permanent boosts. They unlock as you go.'),
      el('div', { class: 'row help-intro-actions' }, [
        el('button', {
          class: 'btn primary',
          id: 'guide-intro-start',
          onclick: function () {
            tutorialActive = true;
            hooks.hideModal();
          },
        }, ['Start tutorial']),
        el('button', {
          class: 'btn',
          onclick: function () {
            tutorialActive = false;
            hooks.hideModal();
          },
        }, ['Skip']),
      ]),
    ]);
    hooks.showModal(panel);
    var startBtn = panel.querySelector('#guide-intro-start');
    if (startBtn) startBtn.focus();
  }

  // ---------- full guide ----------

  function sectionBlock(sec, state) {
    var locked = sec.unlock && !store.done[sec.unlock];
    var wrap = el('div', { class: 'guide-section' + (locked ? ' locked' : ''), id: 'guide-sec-' + sec.id });
    wrap.appendChild(el('h3', { class: 'guide-section-title' }, [sec.title]));
    if (locked) {
      var goalTitle = fill(GuideContent.goals[sec.unlock].title, state);
      wrap.appendChild(el('p', { class: 'help' }, ['Unlocks when: ' + goalTitle]));
      return wrap;
    }
    sec.body.forEach(function (p) {
      wrap.appendChild(el('p', { class: 'help' }, [fill(p, state)]));
    });
    var todo = el('ul', { class: 'guide-todo' });
    sec.todo.forEach(function (t) {
      todo.appendChild(el('li', {}, [fill(t, state)]));
    });
    wrap.appendChild(todo);
    return wrap;
  }

  function glossaryBlock(state) {
    var wrap = el('div', { class: 'guide-section', id: 'guide-sec-glossary-terms' });
    var list = el('dl', { class: 'guide-glossary' });
    GuideContent.glossary.forEach(function (g) {
      if (g.unlock && !store.done[g.unlock]) return;
      list.appendChild(el('dt', {}, [g.term]));
      list.appendChild(el('dd', {}, [fill(g.def, state)]));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function openGuide(sectionId) {
    if (hooks.isModalOpen()) return;
    var state = hooks.getState();
    var body = el('div', { class: 'guide-panel-body' });
    body.appendChild(objectiveBlock(state));
    body.appendChild(journeyStrip(state));

    var toc = el('nav', { class: 'guide-toc', 'aria-label': 'Guide sections' });
    GuideContent.sections.forEach(function (sec) {
      var locked = sec.unlock && !store.done[sec.unlock];
      toc.appendChild(el('button', {
        class: 'guide-toc-link' + (locked ? ' locked' : ''),
        onclick: function () { scrollToSection(sec.id); },
      }, [sec.title]));
    });
    body.appendChild(toc);

    GuideContent.sections.forEach(function (sec) {
      body.appendChild(sectionBlock(sec, state));
    });
    body.appendChild(glossaryBlock(state));

    body.appendChild(el('button', {
      class: 'btn',
      onclick: function () { hooks.hideModal(); showIntro(); },
    }, ['Replay intro']));

    var closeBtn = el('button', { class: 'btn guide-panel-close', 'aria-label': 'Close guide', onclick: hooks.hideModal }, ['×']);
    var panel = el('div', { class: 'modal-panel guide-panel', role: 'dialog', 'aria-label': 'How to play' }, [
      el('div', { class: 'guide-panel-head' }, [el('h2', { class: 'modal-title' }, ['Guide']), closeBtn]),
      body,
    ]);
    hooks.showModal(panel);
    if (sectionId) {
      setTimeout(function () { scrollToSection(sectionId); }, 0);
    }
  }

  function scrollToSection(id) {
    var node = document.getElementById('guide-sec-' + id);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }

  // ---------- unlock cards ----------

  var cardQueue = [];

  function unlock(seenKey) {
    if (!isEnabled()) return;
    if (store.cardsSeen[seenKey]) return;
    store.cardsSeen[seenKey] = true;
    saveStore();
    cardQueue.push(seenKey);
  }

  function showUnlockCard(keys, state) {
    var first = GuideContent.cards[keys[0]];
    var items = keys.map(function (k) { return GuideContent.cards[k]; }).filter(Boolean);
    if (!items.length) return;

    var body = [];
    items.forEach(function (c, idx) {
      if (idx > 0) body.push(el('hr', { class: 'guide-card-sep' }));
      body.push(el('h3', { class: 'guide-section-title' }, [c.title]));
      body.push(el('p', { class: 'help' }, [fill(c.what, state)]));
      body.push(el('p', { class: 'help' }, [fill(c.why, state)]));
      body.push(el('p', { class: 'guide-card-todo' }, [fill(c.todo, state)]));
    });

    var goal = GuideGoals.GOALS.find(function (g) { return g.id === first.goal; });
    var actions = [
      el('button', {
        class: 'btn',
        onclick: function () {
          hooks.hideModal();
          if (goal) showMe(goal);
        },
      }, ['Show me']),
      el('button', { class: 'btn primary', onclick: hooks.hideModal }, ['Got it']),
    ];

    var panel = el('div', { class: 'modal-panel guide-unlock-card' },
      [el('h2', { class: 'modal-title' }, [items.length > 1 ? 'New unlocks' : items[0].title])]
        .concat(items.length > 1 ? body : body.slice(1))
        .concat([el('div', { class: 'row' }, actions)]));
    hooks.showModal(panel);
  }

  function processCardQueue(state) {
    if (!isEnabled()) return;
    if (hooks.isModalOpen() || hooks.isCatchingUp()) return;
    if (!cardQueue.length) return;
    var keys = cardQueue.slice();
    cardQueue = [];
    showUnlockCard(keys, state);
  }

  // ---------- first-minutes coach ----------

  var tutorialActive = false;
  var spotlightEl = null;
  var spotlightGoalId = null;

  function hideSpotlight() {
    if (spotlightEl && spotlightEl.parentNode) spotlightEl.parentNode.removeChild(spotlightEl);
    spotlightEl = null;
    spotlightGoalId = null;
  }

  function positionSpotlight(target) {
    if (!spotlightEl) return;
    var hole = spotlightEl.querySelector('.guide-spotlight-hole');
    var pop = spotlightEl.querySelector('.guide-spotlight-pop');
    var r = target.getBoundingClientRect();
    var pad = 6;
    if (hole) {
      hole.style.left = Math.max(0, r.left - pad) + 'px';
      hole.style.top = Math.max(0, r.top - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';
    }
    if (pop) {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var popRect = pop.getBoundingClientRect();
      var top = r.bottom + 14;
      if (top + popRect.height > vh - 8) top = Math.max(8, r.top - popRect.height - 14);
      var left = Math.min(Math.max(8, r.left), vw - popRect.width - 8);
      pop.style.top = Math.round(top) + 'px';
      pop.style.left = Math.round(left) + 'px';
    }
  }

  function ackGoal(id) {
    store.done = GuideGoals.ack(id, store.done);
    saveStore();
    hideSpotlight();
  }

  function skipTutorial() {
    var ids = coachGoalIds();
    var last = ids[ids.length - 1];
    store.done = GuideGoals.ack(last, store.done);
    saveStore();
    tutorialActive = false;
    hideSpotlight();
  }

  function showSpotlight(goal, state) {
    hideSpotlight();
    spotlightGoalId = goal.id;
    var content = GuideContent.goals[goal.id];
    var popKids = [
      el('div', { class: 'guide-spotlight-title' }, [fill(content.title, state)]),
      el('div', { class: 'guide-spotlight-text' }, [fill(content.coach, state)]),
    ];
    if (goal.ack) {
      popKids.push(el('div', { class: 'row' }, [
        el('button', { class: 'btn primary', onclick: function () { ackGoal(goal.id); } }, ['Next']),
      ]));
    } else {
      popKids.push(el('div', { class: 'help guide-spotlight-hint' }, ['Do it to continue']));
    }
    popKids.push(el('button', {
      class: 'btn guide-skip-tutorial',
      onclick: skipTutorial,
    }, ['Skip tutorial']));

    var overlay = el('div', { class: 'guide-spotlight-overlay', 'aria-hidden': 'true' }, [
      el('div', { class: 'guide-spotlight-hole' }),
      el('div', { class: 'guide-spotlight-pop', role: 'dialog', 'aria-label': 'Tutorial step' }, popKids),
    ]);
    document.body.appendChild(overlay);
    spotlightEl = overlay;

    navigateToTarget(goal, function () {
      var nodes = findTargetEls(goal);
      if (!nodes.length || spotlightGoalId !== goal.id) return; // fail gracefully
      positionSpotlight(nodes[0]);
    });
  }

  function runCoach(state) {
    if (!isEnabled() || !tutorialActive) { hideSpotlight(); return; }
    if (hooks.isModalOpen() || hooks.isCatchingUp()) { hideSpotlight(); return; }
    var goal = GuideGoals.current(store.done);
    if (!goal || !goal.coach) {
      tutorialActive = false;
      hideSpotlight();
      return;
    }
    if (spotlightGoalId !== goal.id) {
      showSpotlight(goal, state);
    } else {
      var nodes = findTargetEls(goal);
      if (nodes.length) {
        positionSpotlight(nodes[0]);
      } else {
        // The player navigated away from the target's tab mid-coach; steer
        // back to it (spec §3: "coach switches to the needed tab").
        navigateToTarget(goal, function () {
          var again = findTargetEls(goal);
          if (again.length) positionSpotlight(again[0]);
        });
      }
    }
  }

  // The main loop (and Guide.tick with it) is paused for the whole hidden
  // period / catch-up run, so a stale spotlight would otherwise sit on top
  // of the catch-up overlay until ticking resumes; hide it immediately.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hideSpotlight();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (spotlightGoalId) { hideSpotlight(); return; }
    if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') hooks.hideModal();
  });

  // ---------- settings toggle API ----------

  function isEnabled() {
    return store.enabled !== false;
  }

  function setEnabled(v) {
    store.enabled = !!v;
    saveStore();
    if (!store.enabled) {
      clearPulse();
      hideSpotlight();
      tutorialActive = false;
      cardQueue = [];
      if (cardEl) cardEl.hidden = true;
      if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') hooks.hideModal();
    }
  }

  function restartTutorial() {
    var ids = coachGoalIds();
    ids.forEach(function (id) { delete store.done[id]; });
    saveStore();
    lastDoneCount = -1;
    tutorialActive = true;
    if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') hooks.hideModal();
    hooks.setTab('circles');
  }

  // ---------- public API ----------

  function init(h) {
    if (h) {
      for (var k in h) {
        if (Object.prototype.hasOwnProperty.call(h, k)) hooks[k] = h[k];
      }
    }
    store = loadStore();
    var s = hooks.getState();
    if (s) {
      store.done = GuideGoals.sync(s, store.done);
      lastDoneCount = Object.keys(store.done).length;
      var g = GuideGoals.current(store.done);
      currentGoalId = g ? g.id : null;
    }
    // Fresh players (no save at boot) get the coach tutorial by default;
    // returning players (any save, however early) never get it automatically.
    tutorialActive = !hooks.hadSave;
    saveStore();
  }

  function tick(state) {
    if (!state) return;
    var completedId = currentGoalId;
    var changed = syncGoals(state);
    var goal = GuideGoals.current(store.done);
    currentGoalId = goal ? goal.id : null;
    if (changed && completedId && completedId !== currentGoalId && !hooks.isCatchingUp()) {
      var doneContent = GuideContent.goals[completedId];
      if (doneContent) hooks.toast('Goal complete: ' + fill(doneContent.title, state));
    }
    renderCard(state);
    updatePulse(state);
    runCoach(state);
    processCardQueue(state);
  }

  window.Guide = {
    init: init,
    tick: tick,
    showIntro: showIntro,
    openGuide: openGuide,
    unlock: unlock,
    restartTutorial: restartTutorial,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
  };
})();

// src/guide.js — player-guidance DOM: intro card + journey line, next-goal
// card, first-minutes coach spotlight, the compact indexed ? guide (one
// topic at a time), and unlock cards.
// Reads GuideGoals (pure goal engine) and GuideContent (copy) as globals;
// only touches the rest of the app through the hooks passed to Guide.init.
(function () {
  'use strict';

  var STORAGE_KEY = 'revidle.guide.v1';
  var STRONG_PULSE_MS = 3000;
  var COACH_RETRY_MS = 220;
  // The ? guide opens as a right-hand side sheet at this width and up
  // (matching the app's own layout breakpoint, see isCardCollapsed()); below
  // it, it stays the centered modal.
  var GUIDE_SHEET_BREAKPOINT = 820;

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

  // `collapsed` is tri-state: null/undefined = no explicit choice yet (the
  // card defaults to collapsed on narrow viewports, expanded on wide ones —
  // see isCardCollapsed()); true/false = the user toggled it, which then
  // wins on every viewport.
  var store = { done: {}, collapsed: null, enabled: true, cardsSeen: {} };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          return {
            done: obj.done && typeof obj.done === 'object' ? obj.done : {},
            collapsed: obj.collapsed === undefined || obj.collapsed === null ? null : !!obj.collapsed,
            enabled: obj.enabled !== false,
            cardsSeen: obj.cardsSeen && typeof obj.cardsSeen === 'object' ? obj.cardsSeen : {},
          };
        }
      }
    } catch (e) { /* ignore: guidance state is best-effort */ }
    return { done: {}, collapsed: null, enabled: true, cardsSeen: {} };
  }

  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  // Effective collapsed state: an explicit user choice always wins; with no
  // choice made yet, narrow viewports (<=820px, matching the panel's own
  // breakpoint) default to collapsed so the card never covers the rings.
  function isCardCollapsed() {
    if (store.collapsed === null || store.collapsed === undefined) {
      try { return window.innerWidth <= 820; } catch (e) { return false; }
    }
    return !!store.collapsed;
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

  // ---------- focus management (modals + the coach popover) ----------

  function focusableIn(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll('button, [href], input, select, textarea, [tabindex]'),
      function (n) { return !n.disabled && n.tabIndex !== -1 && n.offsetParent !== null; }
    );
  }

  // Moves focus into `container` (first focusable, or `preferredFocus` when
  // given — e.g. the primary action rather than whatever happens to be
  // first in DOM order), traps Tab/Shift+Tab inside it, and returns a
  // release() that restores the focus the page had before the container
  // opened. Callers keep the release function and call it exactly once,
  // when the container closes.
  function trapFocus(container, preferredFocus) {
    var previouslyFocused = document.activeElement;
    if (preferredFocus && typeof preferredFocus.focus === 'function') {
      preferredFocus.focus();
    } else {
      var list = focusableIn(container);
      if (list.length) list[0].focus();
    }
    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var f = focusableIn(container);
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    container.addEventListener('keydown', onKeydown);
    return function release() {
      container.removeEventListener('keydown', onKeydown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }

  // The one release() for whichever Guide-owned hooks.showModal panel is
  // currently open (intro / full guide / unlock card — never more than one
  // at a time, since hooks.isModalOpen() gates opening a second one).
  var releaseModalFocus = null;

  function isDesktopSheetWidth() {
    try { return window.innerWidth >= GUIDE_SHEET_BREAKPOINT; } catch (e) { return false; }
  }

  // The #modal backdrop container, reached directly (Guide already touches
  // `document` elsewhere — spotlight overlay, keydown/visibilitychange —
  // rather than through hooks, which only cover showModal/hideModal
  // themselves). May be null in tests that don't build the full page.
  function modalBackdropEl() {
    return document.getElementById('modal');
  }

  function closeGuideModal() {
    hooks.hideModal();
    // Only the full guide panel ever sets this (see openGuide); clearing it
    // unconditionally on every Guide-owned modal close keeps it from
    // leaking onto the next, unrelated modal (offline/infinity/finale use
    // hooks.hideModal's underlying implementation directly, never this
    // class).
    var backdrop = modalBackdropEl();
    if (backdrop) backdrop.classList.remove('modal-sheet-open');
    if (releaseModalFocus) {
      var r = releaseModalFocus;
      releaseModalFocus = null;
      r();
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
    var collapsed = isCardCollapsed();
    card.classList.toggle('collapsed', collapsed);
    var content = GuideContent.goals[goal.id];
    var p = goal.progress(state);
    var pct = progressPct(p);

    var chevron = el('button', {
      class: 'guide-card-collapse',
      'aria-label': collapsed ? 'Expand goal card' : 'Collapse goal card',
      'aria-expanded': String(!collapsed),
      onclick: function () {
        store.collapsed = !isCardCollapsed();
        saveStore();
        buildCard(hooks.getState(), goal);
      },
    }, [collapsed ? '▸' : '▾']);

    var head = el('div', { class: 'guide-card-head' }, [
      chevron,
      el('div', { class: 'guide-card-title' }, [fill(content.title, state)]),
      el('div', { class: 'guide-card-pct' }, [p ? Math.round(pct * 100) + '%' : '']),
    ]);
    card.appendChild(head);

    if (collapsed) {
      // Collapsed still gets a one-tap "Show me" (spec: "collapsed = one
      // line with title + %"), kept minimal — no full action row.
      head.appendChild(el('button', {
        class: 'btn guide-card-collapsed-showme',
        onclick: function (e) { e.stopPropagation(); showMe(goal); },
      }, ['Show me']));
      return;
    }

    var body = el('div', { class: 'guide-card-body' });
    if (p) {
      body.appendChild(el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', style: 'width:' + (pct * 100) + '%' }),
      ]));
      body.appendChild(el('div', { class: 'guide-card-progress-text' }, [progressText(p)]));
    }
    body.appendChild(el('p', { class: 'help guide-card-why' }, [fill(content.why, state)]));
    var rowKids = [
      el('button', { class: 'btn', onclick: function () { showMe(goal); } }, ['Show me']),
      el('button', {
        class: 'btn',
        onclick: function () { openGuide(content.topic); },
      }, ['Learn more']),
    ];
    if (goal.ack) {
      // ack goals (readMult, buyModes) only complete through the coach
      // popover's "Next"; players who skipped the tutorial, or an existing
      // save that's already past them, need another way to clear them.
      rowKids.push(el('button', {
        class: 'btn primary',
        onclick: function () { ackGoal(goal.id); },
      }, ['Got it']));
    }
    body.appendChild(el('div', { class: 'row' }, rowKids));
    body.appendChild(journeyLineEl(state));
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
        cardCollapsed = isCardCollapsed();
      }
      return;
    }

    var collapsedNow = isCardCollapsed();
    if (goal.id === cardGoalId && collapsedNow === cardCollapsed) {
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
    cardCollapsed = collapsedNow;
  }

  // A resize can cross the 820px breakpoint while the card has no explicit
  // collapse choice yet (store.collapsed === null): force the next
  // renderCard to re-evaluate rather than staying on a stale layout.
  window.addEventListener('resize', function () {
    if (store.collapsed === null || store.collapsed === undefined) cardGoalId = undefined;
  });

  // ---------- "Show me" / highlight ----------

  var pulsedEls = [];
  var strongUntil = 0;
  // While a "Show me" explicitly named a goal (e.g. an unlock card's own
  // goal, which may differ from the actual current goal) and the strong
  // window hasn't expired, that goal wins over GuideGoals.current — see
  // showMe().
  var forcedPulseGoal = null;
  var forcedPulseUntil = 0;

  function clearPulse() {
    pulsedEls.forEach(function (n) {
      if (n && n.classList) { n.classList.remove('guide-pulse'); n.classList.remove('guide-pulse-strong'); }
    });
    pulsedEls = [];
  }

  function updatePulse(state) {
    clearPulse();
    if (!isEnabled()) return;
    var strong = Date.now() < strongUntil;
    var goal = (forcedPulseGoal && Date.now() < forcedPulseUntil) ? forcedPulseGoal : GuideGoals.current(store.done);
    if (!goal) return;
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
      forcedPulseGoal = goal;
      forcedPulseUntil = Date.now() + STRONG_PULSE_MS;
      if (typeof nodes[0].scrollIntoView === 'function') {
        nodes[0].scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      updatePulse(hooks.getState());
      setTimeout(function () { updatePulse(hooks.getState()); }, STRONG_PULSE_MS + 50);
    });
  }

  // ---------- journey line (shared by intro, guide overview, goal card) ----------
  // Compact text, e.g. "Revolution (now) → Prestige → …": stages before the
  // current one are completed (✓ — a stage is completed once the next one
  // is reached), the current stage is highlighted with "(now)", then the
  // next stage (no marker), then an ellipsis if more remain. No "???"
  // pills — nothing after the next stage is named.

  function journeyLine(state) {
    var stageIdx = GuideGoals.STAGES.indexOf(GuideGoals.currentStage(state));
    var parts = [];
    GuideGoals.STAGES.forEach(function (id, i) {
      if (i < stageIdx) parts.push(GuideContent.stages[id].name + ' ✓');
      else if (i === stageIdx) parts.push(GuideContent.stages[id].name + ' (now)');
      else if (i === stageIdx + 1) parts.push(GuideContent.stages[id].name);
    });
    if (stageIdx + 2 < GuideGoals.STAGES.length) parts.push('…');
    return parts.join(' → ');
  }

  function journeyLineEl(state) {
    return el('div', { class: 'guide-journey-line', role: 'note', 'aria-label': 'Journey' }, [journeyLine(state)]);
  }

  // ---------- rich text (bold specific substrings, no innerHTML) ----------

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Splits `text` on any of `terms` and returns an array of strings/`<strong>`
  // nodes suitable as `el()` children — used to bold fixed phrases (e.g.
  // "Infinity Points (IP)") inside otherwise-plain approved copy.
  function richText(text, terms) {
    if (!terms || !terms.length) return [text];
    var re = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')');
    return text.split(re).filter(function (s) { return s !== ''; }).map(function (part) {
      return terms.indexOf(part) !== -1 ? el('strong', {}, [part]) : part;
    });
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

  function closeIntro() {
    if (window.Help && typeof window.Help.markIntroSeen === 'function') window.Help.markIntroSeen();
    closeGuideModal();
  }

  // Bolded per the brief's approved overview wording.
  var OVERVIEW_BOLD_TERMS = ['Infinity Points (IP)', 'Infinity Upgrades'];

  function objectiveParagraph(state) {
    var o = GuideContent.overview;
    return el('p', { class: 'help' },
      [el('strong', {}, [o.labels.objective + ':']), ' ']
        .concat(richText(fill(o.objective, state), OVERVIEW_BOLD_TERMS)));
  }

  function showIntro() {
    if (hooks.isModalOpen()) return;
    var state = hooks.getState();
    var o = GuideContent.overview;
    var colors = ['#ff3b4f', '#ffd93b', '#2affc6', '#a24dff'];
    var beats = o.how.map(function (h, i) { return beat(colors[i], h.title, fill(h.body, state)); });
    var panel = el('div', { class: 'modal-panel guide-intro' },
      [el('h2', { class: 'modal-title' }, ['How to play']), objectiveParagraph(state)]
        .concat(beats)
        .concat([
          journeyLineEl(state),
          el('div', { class: 'row help-intro-actions' }, [
            el('button', {
              class: 'btn primary',
              id: 'guide-intro-start',
              onclick: function () {
                tutorialActive = true;
                closeIntro();
              },
            }, ['Start tutorial']),
            el('button', {
              class: 'btn',
              onclick: function () {
                tutorialActive = false;
                closeIntro();
              },
            }, ['Skip']),
          ]),
        ]));
    hooks.showModal(panel);
    releaseModalFocus = trapFocus(panel);
  }

  // ---------- full guide (Guide v2: compact index + one topic at a time) ----------

  // Remembers the last topic shown, for this session only (not persisted):
  // reopening the guide (including via a deep link with no explicit topic)
  // returns to where the player left off.
  var lastTopicId = 'overview';

  var GROUP_ORDER = ['basics', 'resets', 'infinity', 'reference'];
  var GROUP_LABELS = { basics: 'Basics', resets: 'Resets', infinity: 'Infinity', reference: 'Reference' };

  function visibleTopics() {
    return GuideContent.topics.filter(function (t) { return !t.unlock || store.done[t.unlock]; });
  }

  function overviewBlock(state) {
    var o = GuideContent.overview;
    var howList = el('ol', { class: 'guide-overview-how' }, o.how.map(function (h) {
      return el('li', {}, [el('strong', {}, [h.title]), ' ' + fill(h.body, state)]);
    }));
    return el('div', { class: 'guide-overview' }, [
      objectiveParagraph(state),
      el('div', { class: 'guide-overview-label' }, [o.labels.how]),
      howList,
      el('p', { class: 'help' }, [el('strong', {}, [o.labels.shape + ':']), ' ' + fill(o.shape, state)]),
      el('p', { class: 'help' }, [el('strong', {}, [o.labels.job + ':']), ' ' + fill(o.job, state)]),
    ]);
  }

  function rightNowBlock(state) {
    var wrap = el('div', { class: 'guide-rightnow' }, [el('h3', { class: 'guide-topic-heading' }, ['Right now'])]);
    var goal = GuideGoals.current(store.done);
    if (!goal) {
      wrap.appendChild(el('p', { class: 'help' }, ['All goals complete — you’ve reached the end of this version.']));
      wrap.appendChild(journeyLineEl(state));
      return wrap;
    }
    var content = GuideContent.goals[goal.id];
    var p = goal.progress(state);
    wrap.appendChild(el('div', { class: 'guide-rightnow-title' }, [fill(content.title, state)]));
    if (p) {
      var pct = progressPct(p);
      wrap.appendChild(el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', style: 'width:' + (pct * 100) + '%' }),
      ]));
      wrap.appendChild(el('div', { class: 'guide-card-progress-text' }, [progressText(p)]));
    }
    wrap.appendChild(el('p', { class: 'help' }, [fill(content.why, state)]));
    wrap.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', onclick: function () { closeGuideModal(); showMe(goal); } }, ['Show me']),
    ]));
    wrap.appendChild(journeyLineEl(state));
    return wrap;
  }

  function glossaryBlock(state) {
    var list = el('dl', { class: 'guide-glossary' });
    GuideContent.glossary.forEach(function (g) {
      if (g.unlock && !store.done[g.unlock]) return;
      list.appendChild(el('dt', {}, [g.term]));
      list.appendChild(el('dd', {}, [fill(g.def, state)]));
    });
    return list;
  }

  // Renders exactly one topic into `pane` (cleared first): title, then
  // either the special overview/glossary content or the common summary +
  // "How it works" + "What to do" shape.
  function renderTopicPane(pane, topicId, state) {
    pane.innerHTML = '';
    var t = GuideContent.topics.find(function (x) { return x.id === topicId; }) || GuideContent.topics[0];
    pane.appendChild(el('h2', { class: 'modal-title guide-topic-title' }, [t.title]));
    if (t.id === 'overview') {
      pane.appendChild(overviewBlock(state));
      pane.appendChild(rightNowBlock(state));
      return;
    }
    if (t.id === 'glossary') {
      pane.appendChild(el('p', { class: 'help guide-topic-summary' }, [fill(t.summary, state)]));
      pane.appendChild(glossaryBlock(state));
      return;
    }
    pane.appendChild(el('p', { class: 'help guide-topic-summary' }, [fill(t.summary, state)]));
    if (t.how.length) {
      pane.appendChild(el('h3', { class: 'guide-topic-heading' }, ['How it works']));
      pane.appendChild(el('ul', { class: 'guide-how' }, t.how.map(function (h) {
        return el('li', {}, [fill(h, state)]);
      })));
    }
    if (t.todo.length) {
      pane.appendChild(el('h3', { class: 'guide-topic-heading' }, ['What to do']));
      pane.appendChild(el('ul', { class: 'guide-todo' }, t.todo.map(function (td) {
        return el('li', {}, [fill(td, state)]);
      })));
    }
  }

  function buildTopicButton(t, activeId, small, onSelect) {
    var active = t.id === activeId;
    return el('button', {
      class: (small ? 'guide-tab' : 'guide-index-btn') + (active ? ' active' : ''),
      'data-topic-id': t.id,
      'aria-current': active ? 'true' : 'false',
      onclick: function () { onSelect(t.id); },
    }, [t.title]);
  }

  // Builds the desktop left index (grouped, with group labels) or the
  // mobile single-row tab strip (flat, no group labels) — same topics, same
  // order, same "+N more as you play" tail for whatever is hidden.
  function buildTopicNav(activeId, grouped, onSelect) {
    var visible = visibleTopics();
    var hiddenCount = GuideContent.topics.length - visible.length;
    var moreNode = hiddenCount > 0
      ? el('div', { class: grouped ? 'guide-index-more' : 'guide-index-more guide-tabs-more' },
        ['+' + hiddenCount + ' more as you play'])
      : null;
    var nav;
    if (grouped) {
      var kids = [];
      GROUP_ORDER.forEach(function (g) {
        var inGroup = visible.filter(function (t) { return t.group === g; });
        if (!inGroup.length) return;
        kids.push(el('div', { class: 'guide-index-group-label' }, [GROUP_LABELS[g]]));
        inGroup.forEach(function (t) { kids.push(buildTopicButton(t, activeId, false, onSelect)); });
      });
      if (moreNode) kids.push(moreNode);
      nav = el('nav', { class: 'guide-index', 'aria-label': 'Guide topics' }, kids);
    } else {
      var kids2 = visible.map(function (t) { return buildTopicButton(t, activeId, true, onSelect); });
      if (moreNode) kids2.push(moreNode);
      nav = el('nav', { class: 'guide-tabs', 'aria-label': 'Guide topics' }, kids2);
    }
    return nav;
  }

  function refreshNavActive(nav, activeId) {
    Array.prototype.forEach.call(nav.querySelectorAll('[data-topic-id]'), function (b) {
      var active = b.getAttribute('data-topic-id') === activeId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  // Left/Right always move between topics; Up/Down do too (spec: "Left/Right
  // (or Up/Down on desktop)") — both work on either layout, since the topic
  // order is a single flat list regardless of how it's displayed.
  function attachTopicArrowNav(nav, getActiveId, onSelect) {
    nav.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      var ids = visibleTopics().map(function (t) { return t.id; });
      var idx = ids.indexOf(getActiveId());
      if (idx === -1) return;
      var dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
      var nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= ids.length) return;
      e.preventDefault();
      var nextId = ids[nextIdx];
      onSelect(nextId);
      var btn = nav.querySelector('[data-topic-id="' + nextId + '"]');
      if (btn) btn.focus();
    });
  }

  function openGuide(topicId) {
    if (hooks.isModalOpen()) return;
    var sheet = isDesktopSheetWidth();
    var visible = visibleTopics();
    var activeId = topicId || lastTopicId || 'overview';
    if (!visible.some(function (t) { return t.id === activeId; })) activeId = 'overview';
    lastTopicId = activeId;

    var contentPane = el('div', { class: 'guide-panel-content' });
    renderTopicPane(contentPane, activeId, hooks.getState());

    function select(id) {
      if (id === lastTopicId) return;
      lastTopicId = id;
      renderTopicPane(contentPane, id, hooks.getState());
      refreshNavActive(nav, id);
    }

    var nav = buildTopicNav(activeId, sheet, select);
    attachTopicArrowNav(nav, function () { return lastTopicId; }, select);

    var closeBtn = el('button', { class: 'btn guide-panel-close', 'aria-label': 'Close guide', onclick: closeGuideModal }, ['×']);
    var head = el('div', { class: 'guide-panel-head' }, [el('h2', { class: 'modal-title' }, ['How to play']), closeBtn]);
    var layout = el('div', { class: 'guide-panel-layout' + (sheet ? '' : ' guide-panel-layout-mobile') }, [nav, contentPane]);

    // >= GUIDE_SHEET_BREAKPOINT: right-hand side sheet with a left index
    // (spec §1). Below it: a centered modal with one sticky tab row.
    var panel = el('div', {
      class: 'modal-panel guide-panel' + (sheet ? ' guide-panel-sheet' : ''),
      role: 'dialog',
      'aria-label': 'How to play',
    }, [head, layout]);
    hooks.showModal(panel);
    var backdrop = modalBackdropEl();
    if (backdrop) backdrop.classList.toggle('modal-sheet-open', sheet);
    releaseModalFocus = trapFocus(panel);
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
      // A combined card can list several unlocks at once (e.g. after
      // catch-up); once the player is already past a listed goal, its
      // "what to do now" line is stale noise rather than guidance.
      if (!store.done[c.goal]) {
        body.push(el('p', { class: 'guide-card-todo' }, [fill(c.todo, state)]));
      }
    });

    var goal = GuideGoals.GOALS.find(function (g) { return g.id === first.goal; });
    var actions = [
      el('button', {
        class: 'btn',
        onclick: function () {
          closeGuideModal();
          if (goal) showMe(goal);
        },
      }, ['Show me']),
      el('button', {
        class: 'btn',
        onclick: function () {
          closeGuideModal();
          openGuide(first.topic);
        },
      }, ['Learn more']),
      el('button', { class: 'btn primary', onclick: closeGuideModal }, ['Got it']),
    ];

    var panel = el('div', { class: 'modal-panel guide-unlock-card' },
      [el('h2', { class: 'modal-title' }, [items.length > 1 ? 'New unlocks' : items[0].title])]
        .concat(items.length > 1 ? body : body.slice(1))
        .concat([el('div', { class: 'row' }, actions)]));
    hooks.showModal(panel);
    releaseModalFocus = trapFocus(panel);
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
  // Escape dismisses the current step's spotlight without completing it
  // (spec §3); dismissedStepId keeps runCoach from immediately rebuilding
  // it on the next tick. Cleared as soon as the current goal moves on.
  var dismissedStepId = null;
  var lastCoachGoalId = null;

  // Set while "Restart tutorial" is replaying the coach steps for a player
  // who has already completed some or all of them (spec: restarting must
  // still walk through the steps, independent of store.done, and land back
  // on whatever the real current goal is once the replay ends).
  var replayGoals = null;
  var replayIndex = 0;
  var releaseSpotlightFocus = null;

  function hideSpotlight() {
    if (spotlightEl && spotlightEl.parentNode) spotlightEl.parentNode.removeChild(spotlightEl);
    spotlightEl = null;
    spotlightGoalId = null;
    if (releaseSpotlightFocus) {
      var r = releaseSpotlightFocus;
      releaseSpotlightFocus = null;
      r();
    }
  }

  function currentCoachGoal() {
    if (replayGoals) {
      var id = replayGoals[replayIndex];
      return GuideGoals.GOALS.find(function (g) { return g.id === id; }) || null;
    }
    return GuideGoals.current(store.done);
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

  // Advances a replay to its next coach step (or ends the replay, landing
  // back on the real current goal per store.done — replay never mutates
  // store.done itself, so whatever that is is already correct).
  function replayNext() {
    hideSpotlight();
    if (!replayGoals) return;
    replayIndex++;
    if (replayIndex >= replayGoals.length) {
      replayGoals = null;
      tutorialActive = false;
    }
  }

  function skipTutorial() {
    if (replayGoals) {
      replayGoals = null;
      tutorialActive = false;
      hideSpotlight();
      return;
    }
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
    var titleText = fill(content.title, state);
    var popKids = [
      el('div', { class: 'guide-spotlight-title' }, [titleText]),
      el('div', { class: 'guide-spotlight-text' }, [fill(content.coach, state)]),
    ];
    // The primary action, when there is one — kept so we can focus it
    // explicitly below, rather than relying on it merely being first in
    // DOM order.
    var primaryBtn = null;
    if (replayGoals) {
      // Replaying: walk every coach step for teaching purposes only, so
      // even an action step advances on "Next" rather than waiting for
      // done(state) — which, for an advanced player, may already be true
      // or may never become true again (e.g. buyRed once bought).
      primaryBtn = el('button', { class: 'btn primary', onclick: replayNext }, ['Next']);
      popKids.push(el('div', { class: 'row' }, [primaryBtn]));
    } else if (goal.ack) {
      primaryBtn = el('button', { class: 'btn primary', onclick: function () { ackGoal(goal.id); } }, ['Next']);
      popKids.push(el('div', { class: 'row' }, [primaryBtn]));
    } else {
      popKids.push(el('div', { class: 'help guide-spotlight-hint' }, ['Do it to continue']));
    }
    // Skip tutorial is always the last control in tab order, and never the
    // one that gets initial focus (see trapFocus call below) — an
    // accidental Enter/Space on popover open must never skip the tutorial.
    popKids.push(el('button', {
      class: 'btn guide-skip-tutorial',
      onclick: skipTutorial,
    }, ['Skip tutorial']));

    // aria-hidden lives on the dim/cutout layer only — the popover is the
    // actual dialog and must stay reachable to assistive tech. tabindex=-1
    // lets it take focus programmatically (action steps, below) without
    // joining the Tab order itself.
    var pop = el('div', { class: 'guide-spotlight-pop', role: 'dialog', tabindex: '-1', 'aria-label': titleText }, popKids);
    var overlay = el('div', { class: 'guide-spotlight-overlay' }, [
      el('div', { class: 'guide-spotlight-hole', 'aria-hidden': 'true' }),
      pop,
    ]);
    document.body.appendChild(overlay);
    spotlightEl = overlay;
    // Ack/replay steps: focus the primary "Next" action. Action steps (no
    // Next button) have nothing safe to focus but Skip, so focus the
    // popover container itself instead.
    releaseSpotlightFocus = trapFocus(pop, primaryBtn || pop);

    navigateToTarget(goal, function () {
      var nodes = findTargetEls(goal);
      if (!nodes.length || spotlightGoalId !== goal.id) return; // fail gracefully
      positionSpotlight(nodes[0]);
    });
  }

  function runCoach(state) {
    if (!isEnabled() || !tutorialActive) { hideSpotlight(); return; }
    if (hooks.isModalOpen() || hooks.isCatchingUp()) { hideSpotlight(); return; }
    var goal = currentCoachGoal();
    if (!goal || (!replayGoals && !goal.coach)) {
      tutorialActive = false;
      replayGoals = null;
      hideSpotlight();
      return;
    }
    if (goal.id !== lastCoachGoalId) {
      dismissedStepId = null;
      lastCoachGoalId = goal.id;
    }
    if (dismissedStepId === goal.id) {
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

  // The guide side sheet's scrim: a click that lands on the backdrop
  // itself (not one that bubbled up from the panel) closes the sheet.
  // Inert for every other modal, since only openGuide's sheet path ever
  // sets 'modal-sheet-open'.
  document.addEventListener('click', function (e) {
    var backdrop = modalBackdropEl();
    if (!backdrop || backdrop.hidden) return;
    if (!backdrop.classList.contains('modal-sheet-open')) return;
    if (e.target === backdrop) closeGuideModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (spotlightGoalId) {
      if (replayGoals) {
        // Escaping a Restart-tutorial replay ends the replay cleanly, the
        // same as finishing it (see replayNext) — dismissing only the
        // current step would leave the replay stuck on it (currentCoachGoal
        // keeps returning the same replay step, and runCoach's
        // dismissedStepId check keeps suppressing it) until Restart is
        // pressed again. Ending it drops straight back to the real current
        // goal, since replay never touches store.done.
        replayGoals = null;
        tutorialActive = false;
        hideSpotlight();
        return;
      }
      dismissedStepId = spotlightGoalId;
      hideSpotlight();
      return;
    }
    if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') closeGuideModal();
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
      if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') closeGuideModal();
    }
  }

  // Restarting must still teach every coach step even when some (or all)
  // are already done — sync would otherwise instantly re-mark them and
  // make this a no-op — so it replays them independent of store.done and
  // lands back on the real current goal once done (see replayNext).
  function restartTutorial() {
    replayGoals = coachGoalIds();
    replayIndex = 0;
    tutorialActive = true;
    dismissedStepId = null;
    lastCoachGoalId = null;
    hideSpotlight();
    if (hooks.isModalOpen && hooks.isModalOpen() === 'guide') closeGuideModal();
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

  // Clears learned progress (done goals, seen unlock cards) without
  // touching the enabled/collapsed preferences. Called on hard reset (the
  // player's whole save is gone, so buyRed is the current goal again) and
  // on Import (a loaded save may be less advanced than store.done already
  // claims — sync is monotonic and never unmarks, so the done map has to
  // be rebuilt from scratch against whatever was just imported).
  function reset() {
    store.done = {};
    store.cardsSeen = {};
    saveStore();
    lastDoneCount = -1;
    currentGoalId = null;
    cardGoalId = undefined;
    cardQueue = [];
    hideSpotlight();
    clearPulse();
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
    reset: reset,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
  };
})();

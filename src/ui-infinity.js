// src/ui-infinity.js — the ∞ tab (Tree, Gens, Auto, ICs, Stars). DOM only via
// kit.el; reads state and Engine directly, never window/localStorage except
// the try/catch-wrapped sub-tab preference below.
(function () {
  'use strict';

  var Engine = window.Engine;
  var GuideContent = window.GuideContent;
  var STORAGE_KEY = 'revidle.infTab';

  var SUBTABS = [
    { id: 'tree', label: 'Tree', visible: function () { return true; } },
    { id: 'gens', label: 'Gens', visible: function (s) { return Engine.hasUpg(s, '1;1'); } },
    { id: 'auto', label: 'Auto', visible: function (s) { return Engine.hasUpg(s, '1;1'); } },
    { id: 'ics', label: 'ICs', visible: function (s) { return Engine.hasUpg(s, '7;1'); } },
    { id: 'stars', label: 'Stars', visible: function (s) { return Engine.hasUpg(s, '21;1'); } },
  ];

  var subTab = loadSubTab();

  function loadSubTab() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && SUBTABS.some(function (t) { return t.id === v; })) return v;
    } catch (e) { /* ignore: sub-tab memory is best-effort */ }
    return 'tree';
  }

  function saveSubTab(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* ignore */ }
  }

  function visibleSubTabs(state) {
    return SUBTABS.filter(function (t) { return t.visible(state); });
  }

  // ---------- small formatters ----------

  function fmt(x) {
    return Engine.fmtLog(x);
  }

  // Formats a plain (non-log) count such as state.infinities: usually an
  // integer, but passive-Infinity upgrades (18;1) can make it fractional.
  function fmtInfNumber(n) {
    var frac = Math.abs(n - Math.round(n)) > 1e-9;
    try {
      return n.toLocaleString('en-US', frac ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    } catch (e) {
      return String(n);
    }
  }

  // Formats a plain (non-log) multiplier/value shown on a Tree card, e.g. the
  // 1.1 in "Lap speed ×1.1" or the 32 in "×32".
  function fmtNum(x) {
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    var abs = Math.abs(x);
    if (abs >= 1000 || abs < 0.001) return x.toExponential(2);
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(abs < 10 ? 3 : 2);
  }

  // ---------- header ----------

  function ipLineText(state) {
    // At the IP cap (the finale) further gains are clamped away: no "+X next".
    if (state.inf.ipLog >= Engine.INFINITY_LOG) return 'IP ' + fmt(state.inf.ipLog);
    return 'IP ' + fmt(state.inf.ipLog) + ' · +' + fmt(Engine.ipGainLog(state)) + ' next';
  }

  function infLineText(state) {
    return '∞ ' + fmtInfNumber(state.infinities);
  }

  function renderHeader(kit, state) {
    return kit.el('div', { id: 'inf-header', class: 'inf-header', 'data-guide': 'inf-header' }, [
      kit.el('span', { class: 'inf-ip', tabindex: '0', 'data-tip': 'ipHeader' }, [ipLineText(state)]),
      kit.el('span', {}, [' · ']),
      kit.el('span', { class: 'inf-count', tabindex: '0', 'data-tip': 'infCount' }, [infLineText(state)]),
    ]);
  }

  function updateHeader(header, state) {
    var ipSpan = header.querySelector('.inf-ip');
    if (ipSpan) ipSpan.textContent = ipLineText(state);
    var cntSpan = header.querySelector('.inf-count');
    if (cntSpan) cntSpan.textContent = infLineText(state);
  }

  // ---------- sub-tab row ----------

  function renderSubTabRow(kit, state, container) {
    var vis = visibleSubTabs(state);
    if (vis.map(function (t) { return t.id; }).indexOf(subTab) === -1) subTab = 'tree';
    var row = kit.el('div', { class: 'inf-subtabs', role: 'tablist' });
    vis.forEach(function (t) {
      var btn = kit.el('button', {
        class: 'tab-btn sub-tab-btn',
        role: 'tab',
        'aria-selected': String(t.id === subTab),
        onclick: function () {
          if (subTab === t.id) return;
          subTab = t.id;
          saveSubTab(t.id);
          render(container, state, kit);
        },
      }, [t.label]);
      row.appendChild(btn);
    });
    return row;
  }

  // ---------- Tree ----------

  function columnsOf(upgrades) {
    var cols = [];
    upgrades.forEach(function (u) { if (cols.indexOf(u.col) === -1) cols.push(u.col); });
    cols.sort(function (a, b) { return a - b; });
    return cols;
  }

  function prevColOf(cols, col) {
    var best = null;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i] < col) best = cols[i];
      else break;
    }
    return best;
  }

  // Every column up to and including the first column with no owned node,
  // plus one dimmed preview column after it (per the Task 11 brief).
  function revealColumns(state, cols) {
    var firstEmptyIdx = -1;
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      var owned = Engine.UPGRADES.some(function (u) { return u.col === col && Engine.hasUpg(state, u.id); });
      if (!owned) { firstEmptyIdx = i; break; }
    }
    if (firstEmptyIdx === -1) return { shown: cols.slice(), previewCol: null };
    var shown = cols.slice(0, firstEmptyIdx + 1);
    var previewCol = firstEmptyIdx + 1 < cols.length ? cols[firstEmptyIdx + 1] : null;
    if (previewCol !== null) shown.push(previewCol);
    return { shown: shown, previewCol: previewCol };
  }

  function lockedText(cols, u) {
    if (u.req === 'prev') {
      var pc = prevColOf(cols, u.col);
      return pc === null ? 'Needs an earlier upgrade' : 'Needs a C' + pc + ' upgrade';
    }
    return 'Needs ' + u.req.join(' or ');
  }

  // Some upgrade effects aren't a plain "×N" multiplier: 2;1/6;1/13;1 add a
  // flat amount, 14;2/19;1 assign gpExp outright, and 18;1 is a rate. This
  // hint map lets the effect line (and help.js's iuCard tooltip) say the
  // right thing instead of a blanket "now ×N" for all of them.
  var EFFECT_FORMAT = {
    '2;1': function (v) { return 'now +' + fmtNum(v); },
    '6;1': function (v) { return 'now +' + fmtNum(v); },
    '13;1': function (v) { return 'now +' + fmtNum(v); },
    '14;2': function (v) { return 'now GP exponent ' + v.toFixed(3); },
    '19;1': function (v) { return 'now GP exponent ' + v.toFixed(3); },
    '18;1': function (v) { return 'now +' + fmtNum(v) + ' ∞/s'; },
  };

  function effectSuffix(u, effect) {
    if (effect === null) return '';
    var f = EFFECT_FORMAT[u.id];
    return ' · ' + (f ? f(effect) : ('now ×' + fmtNum(effect)));
  }

  function buildCard(kit, state, cols, u, idx, dimmed) {
    var owned = Engine.hasUpg(state, u.id);
    var reqMet = Engine.upgReqMet(state, u.id);
    var buyable = !owned && reqMet && Engine.canBuyUpgrade(state, u.id);
    // Requirement met but not enough IP yet is a different state from an
    // unmet requirement: it doesn't get the "Needs X" text, since the card
    // isn't blocked on anything but affordability.
    var unaffordable = !owned && reqMet && !buyable;
    var effect = Engine.upgEffect(state, u.id);
    var stateCls = owned ? 'owned' : buyable ? 'buyable' : (unaffordable ? 'unaffordable' : 'locked');

    var kids = [
      kit.el('div', { class: 'card-title' }, [u.name]),
      kit.el('div', { class: 'iu-cost' }, [fmt(Math.log10(u.cost)) + ' IP']),
      kit.el('div', { class: 'iu-effect' }, [GuideContent.fill(GuideContent.upgradePlain[u.id], state) + effectSuffix(u, effect)]),
    ];
    if (!owned && !reqMet) {
      kids.push(kit.el('div', { class: 'iu-locked' }, [lockedText(cols, u)]));
    } else if (unaffordable) {
      var shortLog = Engine.logSub(Math.log10(u.cost), state.inf.ipLog);
      kids.push(kit.el('div', { class: 'iu-locked' }, ['Need ' + fmt(shortLog) + ' more IP']));
    }

    var attrs = {
      class: 'card iu-card ' + stateCls + (dimmed ? ' preview' : ''),
      'data-tip': 'iuCard',
      'data-tip-i': String(idx),
      'data-id': u.id,
      tabindex: '0',
    };

    if (buyable) {
      var btn = kit.el('button', attrs, kids);
      btn.addEventListener('click', function () {
        if (Engine.buyUpgrade(state, u.id)) {
          kit.markDirty();
          kit.save();
        }
      });
      return btn;
    }
    return kit.el('div', attrs, kids);
  }

  function renderTree(kit, state) {
    var cols = columnsOf(Engine.UPGRADES);
    var reveal = revealColumns(state, cols);
    var wrap = kit.el('div', { class: 'inf-tree', 'data-guide': 'inf-tree' });
    reveal.shown.forEach(function (col) {
      var dimmed = col === reveal.previewCol;
      var grid = kit.el('div', { class: 'iu-grid' });
      Engine.UPGRADES.forEach(function (u, idx) {
        if (u.col !== col) return;
        grid.appendChild(buildCard(kit, state, cols, u, idx, dimmed));
      });
      wrap.appendChild(kit.el('div', { class: 'iu-col' + (dimmed ? ' preview' : ''), 'data-col': String(col) }, [
        kit.el('div', { class: 'iu-col-label' }, ['C' + col]),
        grid,
      ]));
    });
    return wrap;
  }

  // Patches card text in place; only asks for a full re-render (via
  // kit.markDirty, which the outer tab dispatch honors on the next domUpdate)
  // when a card's owned/buyable/locked state — or the revealed column set —
  // actually changed, since those need different DOM structure (only a
  // buyable card is a <button>) or a different set of columns.
  function updateTree(root, kit, state) {
    var needsRebuild = false;
    var treeCols = columnsOf(Engine.UPGRADES);
    var cards = root.querySelectorAll('.iu-card');
    for (var i = 0; i < cards.length; i++) {
      var node = cards[i];
      var id = node.getAttribute('data-id');
      var u = Engine.upgById(id);
      if (!u) continue;
      var owned = Engine.hasUpg(state, id);
      var reqMet = Engine.upgReqMet(state, id);
      var buyable = !owned && reqMet && Engine.canBuyUpgrade(state, id);
      // owned/buyable each need a different DOM tag (only buyable is a
      // <button>), so those transitions force a full rebuild. locked <->
      // unaffordable is div-to-div and just needs its class/text patched.
      if (owned !== node.classList.contains('owned') || buyable !== node.classList.contains('buyable')) {
        needsRebuild = true;
        break;
      }
      var unaffordable = !owned && reqMet && !buyable;
      node.classList.toggle('unaffordable', unaffordable);
      node.classList.toggle('locked', !owned && !buyable && !unaffordable);

      var effect = Engine.upgEffect(state, id);
      var effLine = node.querySelector('.iu-effect');
      if (effLine) effLine.textContent = GuideContent.fill(GuideContent.upgradePlain[u.id], state) + effectSuffix(u, effect);

      var lockedLine = node.querySelector('.iu-locked');
      if (!owned && !reqMet) {
        if (lockedLine) lockedLine.textContent = lockedText(treeCols, u);
      } else if (unaffordable) {
        var shortLog = Engine.logSub(Math.log10(u.cost), state.inf.ipLog);
        if (lockedLine) lockedLine.textContent = 'Need ' + fmt(shortLog) + ' more IP';
      }
    }
    if (!needsRebuild) {
      var reveal = revealColumns(state, treeCols);
      var shownCols = Array.prototype.map.call(root.querySelectorAll('.iu-col'), function (n) {
        return Number(n.getAttribute('data-col'));
      });
      if (shownCols.length !== reveal.shown.length
        || shownCols.some(function (c, idx) { return c !== reveal.shown[idx]; })) {
        needsRebuild = true;
      }
    }
    if (needsRebuild) kit.markDirty();
  }

  // ---------- Gens ----------

  function highestBoughtTier(state) {
    var h = 0;
    for (var k = 0; k < Engine.GEN_COUNT; k++) {
      if (state.inf.gens[k].b > 0) h = k + 1;
    }
    return h;
  }

  function visibleGenCount(state) {
    return Math.min(10, highestBoughtTier(state) + 1);
  }

  // The log10 rate this generator currently produces: G(k+1) feeds G(k), and
  // G1 (k=0) feeds Generator Power (plus any Star bonus to that GP feed).
  function genRateLog(state, k) {
    var g = state.inf.gens[k];
    if (g.aLog === -Infinity) return -Infinity;
    var L = g.aLog + Engine.genMultLog(state, k);
    if (k === 0 && typeof Engine.starGpLog === 'function') L += Engine.starGpLog(state);
    return L;
  }

  function gpLineText(state) {
    return 'GP ' + fmt(state.inf.gpLog) + ' → Mult Gain ×' + fmt(Engine.gpMultLog(state))
      + ' (^' + Engine.gpExp(state).toFixed(3) + ')';
  }

  function buildGenRow(kit, state, k) {
    var n = k + 1;
    var row = kit.el('div', {
      class: 'gen-row', 'data-k': String(k), tabindex: '0', 'data-tip': 'genRow', 'data-tip-i': String(k),
    }, [
      kit.el('div', { class: 'gen-name' }, ['G' + n]),
      kit.el('div', { class: 'gen-meta' }, [
        kit.el('span', { class: 'gen-amount' }, [fmt(state.inf.gens[k].aLog)]),
        kit.el('span', { class: 'gen-mult' }, ['×' + fmt(Engine.genMultLog(state, k))]),
        kit.el('span', { class: 'gen-rate' }, ['+' + fmt(genRateLog(state, k)) + '/s']),
      ]),
    ]);
    var buyBtn = kit.el('button', {
      class: 'btn gen-buy', 'data-tip': 'genBuy', 'data-tip-i': String(k),
    }, [fmt(Engine.genCostLog(state, k)) + ' IP']);
    buyBtn.disabled = !Engine.canBuyGen(state, k);
    buyBtn.addEventListener('click', function () {
      if (Engine.buyGen(state, k)) {
        kit.markDirty();
        kit.save();
      }
    });
    row.appendChild(buyBtn);
    return row;
  }

  function renderGens(kit, state) {
    var wrap = kit.el('div', { class: 'inf-gens', 'data-guide': 'inf-gens' });
    wrap.appendChild(kit.el('div', { class: 'stat-line gp-line', tabindex: '0', 'data-tip': 'gpLine' }, [
      kit.el('span', { id: 'gp-line-value' }, [gpLineText(state)]),
    ]));

    var count = visibleGenCount(state);
    var maxMult = -Infinity;
    for (var k = 0; k < count; k++) {
      wrap.appendChild(buildGenRow(kit, state, k));
      maxMult = Math.max(maxMult, Engine.genMultLog(state, k));
    }
    var softcapLog = Engine.TUNE.genSoftcapLog;
    if (maxMult >= softcapLog) {
      wrap.appendChild(kit.el('p', { class: 'help' }, ['Generator Mult softcapped above e' + softcapLog.toLocaleString('en-US')]));
    }
    return wrap;
  }

  function updateGens(root, kit, state) {
    var gpValue = root.querySelector('#gp-line-value');
    if (gpValue) gpValue.textContent = gpLineText(state);

    var rows = root.querySelectorAll('.gen-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var k = Number(row.getAttribute('data-k'));
      var amt = row.querySelector('.gen-amount');
      if (amt) amt.textContent = fmt(state.inf.gens[k].aLog);
      var multEl = row.querySelector('.gen-mult');
      if (multEl) multEl.textContent = '×' + fmt(Engine.genMultLog(state, k));
      var rateEl = row.querySelector('.gen-rate');
      if (rateEl) rateEl.textContent = '+' + fmt(genRateLog(state, k)) + '/s';
      var buyBtn = row.querySelector('.gen-buy');
      if (buyBtn) {
        buyBtn.textContent = fmt(Engine.genCostLog(state, k)) + ' IP';
        buyBtn.disabled = !Engine.canBuyGen(state, k);
      }
    }
    if (rows.length !== visibleGenCount(state)) kit.markDirty();
  }

  // ---------- shared small helpers (Auto / ICs / Stars) ----------

  // m:ss for challenge best times; null (never completed) -> em dash.
  function fmtMMSS(sec) {
    if (sec === null || sec === undefined) return '—';
    var s = Math.round(sec);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  // ---------- Auto ----------

  var PROMO_NAMES = ['Mult Gain', 'Lap Speed', 'Ascension Power', 'Promotion Power'];

  function buildMasterToggle(kit, tipAttrs, getOn, setOn) {
    var attrs = {
      class: 'btn toggle auto-master',
      'aria-pressed': String(getOn()),
      tabindex: '0',
    };
    for (var key in tipAttrs) attrs[key] = tipAttrs[key];
    var btn = kit.el('button', attrs, [getOn() ? 'On' : 'Off']);
    btn.addEventListener('click', function () {
      setOn(!getOn());
      btn.setAttribute('aria-pressed', String(getOn()));
      btn.textContent = getOn() ? 'On' : 'Off';
      kit.save();
    });
    return btn;
  }

  function buildColorGrid(kit, circlesArr, onToggle) {
    var grid = kit.el('div', { class: 'auto-dot-grid' });
    for (var i = 0; i < 10; i++) {
      (function (i) {
        var color = Engine.CIRCLES[i].color;
        var dot = kit.el('button', {
          class: 'auto-dot' + (circlesArr[i] ? ' active' : ''),
          style: 'border-color:' + color + ';color:' + color,
          'aria-pressed': String(!!circlesArr[i]),
          'aria-label': Engine.CIRCLES[i].name,
          tabindex: '0',
        });
        dot.addEventListener('click', function () {
          circlesArr[i] = !circlesArr[i];
          dot.classList.toggle('active', circlesArr[i]);
          dot.setAttribute('aria-pressed', String(circlesArr[i]));
          onToggle();
        });
        grid.appendChild(dot);
      })(i);
    }
    return grid;
  }

  // A single committed-on-change numeric/text field. `stored` starts as the
  // engine value; format() renders it as input text, parse() turns raw text
  // back into a candidate value (or null if unparseable). An invalid commit
  // (parse failure, or below `min`) reverts the input and toasts, per the
  // brief's "Inputs commit on change ... invalid reverts + toast" rule.
  function buildNumberField(kit, label, extraAttrs, initialStored, format, parse, min, apply) {
    var wrap = kit.el('div', { class: 'auto-field' });
    wrap.appendChild(kit.el('label', { class: 'auto-field-label' }, [label]));
    var stored = initialStored;
    var attrs = Object.assign({ type: 'text', class: 'auto-input', value: format(stored) }, extraAttrs || {});
    var input = kit.el('input', attrs);
    input.addEventListener('change', function () {
      var parsed = parse(input.value);
      if (parsed === null || parsed === undefined || isNaN(parsed) || !isFinite(parsed)
        || (min !== undefined && parsed < min)) {
        input.value = format(stored);
        kit.toast('Invalid value');
        return;
      }
      stored = parsed;
      input.value = format(stored);
      apply(parsed);
      kit.save();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function plainFormat(v) { return String(v); }
  function plainParse(raw) {
    var n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }
  // Auto-Infinity's min-IP field: accepts "1e20" or "100000", stored as log10.
  function formatMinIp(log) {
    if (!isFinite(log)) return '0';
    if (log === 0) return '1';
    return '1e' + (Number.isInteger(log) ? log : log.toFixed(2));
  }
  function parseMinIp(raw) {
    var v = Number(String(raw).trim());
    if (!isFinite(v) || v <= 0) return null;
    return Math.log10(v);
  }

  function buildAutoBuyCard(kit, state) {
    var auto = state.inf.auto.buy;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'buy' });
    var head = kit.el('div', { class: 'row auto-card-head' }, [kit.el('div', { class: 'card-title' }, ['Autobuy'])]);
    head.appendChild(buildMasterToggle(kit, { 'data-tip': 'autoBuy' }, function () { return auto.on; }, function (v) { auto.on = v; }));
    card.appendChild(head);
    card.appendChild(buildColorGrid(kit, auto.circles, function () { kit.save(); }));
    return card;
  }

  function buildAutoAscCard(kit, state) {
    var auto = state.inf.auto.asc;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'asc' });
    var head = kit.el('div', { class: 'row auto-card-head' }, [kit.el('div', { class: 'card-title' }, ['Auto-Ascend'])]);
    head.appendChild(buildMasterToggle(kit, { 'data-tip': 'autoAsc' }, function () { return auto.on; }, function (v) { auto.on = v; }));
    card.appendChild(head);
    card.appendChild(buildColorGrid(kit, auto.circles, function () { kit.save(); }));
    return card;
  }

  function buildAutoPromoteCard(kit, state) {
    var auto = state.inf.auto.promote;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'promote' });
    var head = kit.el('div', { class: 'row auto-card-head' }, [kit.el('div', { class: 'card-title' }, ['Auto-Promote'])]);
    head.appendChild(buildMasterToggle(kit, { 'data-tip': 'autoPromote' }, function () { return auto.on; }, function (v) { auto.on = v; }));
    card.appendChild(head);

    var orderRow = kit.el('div', { class: 'auto-order-row' });
    function renderOrderChips() {
      orderRow.innerHTML = '';
      auto.order.forEach(function (k, idx) {
        var chip = kit.el('button', { class: 'btn order-chip' }, [PROMO_NAMES[k]]);
        chip.addEventListener('click', function () {
          var prevIdx = (idx - 1 + auto.order.length) % auto.order.length;
          var tmp = auto.order[idx];
          auto.order[idx] = auto.order[prevIdx];
          auto.order[prevIdx] = tmp;
          renderOrderChips();
          kit.save();
        });
        orderRow.appendChild(chip);
      });
    }
    renderOrderChips();
    card.appendChild(orderRow);

    card.appendChild(buildNumberField(kit, '×', {}, auto.xFactor, plainFormat, plainParse, 1.1, function (v) { auto.xFactor = v; }));
    card.appendChild(buildNumberField(kit, 'Min time (s)', {}, auto.minTime, plainFormat, plainParse, 0, function (v) { auto.minTime = v; }));
    return card;
  }

  function buildAutoPrestigeCard(kit, state) {
    var auto = state.inf.auto.prestige;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'prestige' });
    var head = kit.el('div', { class: 'row auto-card-head' }, [kit.el('div', { class: 'card-title' }, ['Auto-Prestige'])]);
    head.appendChild(buildMasterToggle(kit, { 'data-tip': 'autoPrestige' }, function () { return auto.on; }, function (v) { auto.on = v; }));
    card.appendChild(head);
    card.appendChild(buildNumberField(kit, 'multX', {}, auto.multX, plainFormat, plainParse, 1, function (v) { auto.multX = v; }));
    card.appendChild(buildNumberField(kit, 'expGain', {}, auto.expGain, plainFormat, plainParse, 0, function (v) { auto.expGain = v; }));
    card.appendChild(buildNumberField(kit, 'Min time (s)', {}, auto.minTime, plainFormat, plainParse, 0, function (v) { auto.minTime = v; }));
    return card;
  }

  function buildAutoInfinityCard(kit, state) {
    var auto = state.inf.auto.infinity;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'infinity' });
    var head = kit.el('div', { class: 'row auto-card-head' }, [kit.el('div', { class: 'card-title' }, ['Auto-Infinity'])]);
    head.appendChild(buildMasterToggle(kit, { 'data-tip': 'autoInfinity' }, function () { return auto.on; }, function (v) { auto.on = v; }));
    card.appendChild(head);
    card.appendChild(buildNumberField(kit, 'Min IP', {}, auto.minIpLog, formatMinIp, parseMinIp, undefined, function (v) { auto.minIpLog = v; }));
    card.appendChild(buildNumberField(kit, 'Min time (s)', {}, auto.minTime, plainFormat, plainParse, 0, function (v) { auto.minTime = v; }));
    return card;
  }

  function buildStallField(kit, state) {
    var auto = state.inf.auto;
    var card = kit.el('div', { class: 'card auto-card', 'data-auto': 'shared' }, [
      kit.el('div', { class: 'card-title' }, ['Shared']),
    ]);
    card.appendChild(buildNumberField(kit, 'Stall seconds', { 'data-tip': 'stallSec', tabindex: '0' }, auto.stallSec, plainFormat, plainParse, 0, function (v) { auto.stallSec = v; }));
    return card;
  }

  function renderAuto(kit, state) {
    var wrap = kit.el('div', { class: 'inf-auto' });
    var u = Engine.autoUnlocked(state);
    if (u.buy) wrap.appendChild(buildAutoBuyCard(kit, state));
    if (u.asc) wrap.appendChild(buildAutoAscCard(kit, state));
    if (u.promote) wrap.appendChild(buildAutoPromoteCard(kit, state));
    if (u.prestige) wrap.appendChild(buildAutoPrestigeCard(kit, state));
    if (u.infinity) wrap.appendChild(buildAutoInfinityCard(kit, state));
    wrap.appendChild(buildStallField(kit, state));
    return wrap;
  }

  function autoUnlockedKey(state) {
    var u = Engine.autoUnlocked(state);
    return ['buy', 'asc', 'promote', 'prestige', 'infinity'].filter(function (k) { return u[k]; }).join(',');
  }

  // Auto's cards have no live-computed numbers besides the inputs the player
  // owns, so the only thing that can go stale under it without a rebuild is
  // which cards are unlocked (buying an upgrade elsewhere while this sub-tab
  // is open) — everything else is driven by direct DOM mutation in the click
  // handlers above.
  function updateAuto(root, kit, state) {
    var cards = root.querySelectorAll('[data-auto]');
    var present = Array.prototype.map.call(cards, function (c) { return c.getAttribute('data-auto'); })
      .filter(function (k) { return k !== 'shared'; }).join(',');
    if (present !== autoUnlockedKey(state)) kit.markDirty();
  }

  // ---------- ICs ----------

  // The status label: active beats done (a challenge stays "done" once it's
  // ever completed) beats available beats locked.
  function icCardLabel(state, n) {
    if (state.inf.ic.active === n) return 'active';
    if (state.inf.ic.done[n - 1]) return 'done';
    if (Engine.canStartChallenge(state, n)) return 'available';
    return 'locked';
  }
  // Engine.canStartChallenge doesn't exclude an already-done challenge (it
  // only needs no challenge active and the previous one done), so a done
  // card can still be replayed for a better best time — this is tracked
  // separately from the label so "Done ✓" and a Start button can coexist.
  function icCardKey(state, n) {
    return icCardLabel(state, n) + (Engine.canStartChallenge(state, n) ? '+start' : '');
  }

  function buildBreakCard(kit, state) {
    var card = kit.el('div', { class: 'card ic-break-card', 'data-broken': String(state.inf.broken), 'data-guide': 'inf-break' }, [
      kit.el('div', { class: 'card-title' }, ['Break Infinity']),
    ]);
    var btn = kit.el('button', { class: 'btn full-width', 'data-tip': 'breakToggle', tabindex: '0' }, [state.inf.broken ? 'Fix' : 'Break']);
    btn.addEventListener('click', function () {
      Engine.setBroken(state, !state.inf.broken);
      kit.markDirty();
      kit.save();
    });
    card.appendChild(btn);
    return card;
  }

  function buildIcCard(kit, state, c) {
    var n = c.n;
    var label = icCardLabel(state, n);
    var canStart = Engine.canStartChallenge(state, n);
    var best = state.inf.ic.best[n - 1];
    var statusText = label === 'done' ? 'Done ✓' : label === 'active' ? 'Active' : label === 'available' ? 'Available' : 'Locked';
    var cls = label === 'done' ? ' owned' : label === 'active' ? ' buyable' : '';
    var card = kit.el('div', {
      class: 'card ic-card' + cls,
      'data-n': String(n),
      'data-state': icCardKey(state, n),
      tabindex: '0',
      'data-tip': 'icCard',
      'data-tip-i': String(n),
    }, [
      kit.el('div', { class: 'card-title' }, ['IC' + n + ' ' + c.name]),
      kit.el('div', { class: 'iu-effect' }, ['Handicap: ' + c.handicap]),
      kit.el('div', { class: 'iu-effect' }, ['Reward: ' + c.reward]),
      kit.el('div', { class: 'stat-line' }, [kit.el('span', { class: 'label' }, ['Status']), kit.el('span', {}, [statusText])]),
      kit.el('div', { class: 'stat-line' }, [kit.el('span', { class: 'label' }, ['Best']), kit.el('span', {}, [fmtMMSS(best)])]),
    ]);
    if (label === 'active') {
      var exitBtn = kit.el('button', { class: 'btn full-width' }, []);
      kit.twoStepConfirm(exitBtn, 'Exit', 'Reset run?', function () {
        Engine.exitChallenge(state);
        kit.markDirty();
        kit.save();
      });
      card.appendChild(exitBtn);
    } else if (canStart) {
      var startBtn = kit.el('button', { class: 'btn full-width', 'data-tip': 'icStart', 'data-tip-i': String(n) }, []);
      kit.twoStepConfirm(startBtn, 'Start', 'Reset run?', function () {
        Engine.startChallenge(state, n);
        kit.markDirty();
        kit.save();
      });
      card.appendChild(startBtn);
    }
    return card;
  }

  function renderICs(kit, state) {
    var wrap = kit.el('div', { class: 'inf-ics', 'data-guide': 'inf-ics' });
    if (Engine.canBreak(state)) wrap.appendChild(buildBreakCard(kit, state));
    Engine.CHALLENGES.forEach(function (c) { wrap.appendChild(buildIcCard(kit, state, c)); });
    if (Engine.icDoneCount(state) === 9) {
      var sum = state.inf.ic.best.reduce(function (a, b) { return a + b; }, 0);
      wrap.appendChild(kit.el('div', { class: 'stat-line', id: 'ic-sigma' }, [
        kit.el('span', { class: 'label' }, ['ΣIC']),
        kit.el('span', {}, [fmtMMSS(sum)]),
      ]));
    }
    return wrap;
  }

  // Every visible number on an IC card (status, best time) is a direct
  // function of icCardState + best, both of which only change together with
  // the state that this diff already checks — so a state match means nothing
  // on the card is stale, and a mismatch (or a Break-card/ΣIC-line
  // appearance change) is handled by a full rebuild via markDirty.
  function updateICs(root, kit, state) {
    var wantBreak = Engine.canBreak(state);
    var breakCard = root.querySelector('.ic-break-card');
    if (wantBreak !== !!breakCard) { kit.markDirty(); return; }
    if (breakCard && breakCard.getAttribute('data-broken') !== String(state.inf.broken)) { kit.markDirty(); return; }
    var cards = root.querySelectorAll('.ic-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var n = Number(card.getAttribute('data-n'));
      if (card.getAttribute('data-state') !== icCardKey(state, n)) { kit.markDirty(); return; }
    }
    var wantSigma = Engine.icDoneCount(state) === 9;
    if (wantSigma !== !!root.querySelector('#ic-sigma')) kit.markDirty();
  }

  // ---------- Stars ----------

  function starLineText(state) {
    return 'SD ' + fmt(state.inf.stars.sdLog) + ' (+' + fmt(Engine.sdRateLog(state)) + '/s) → GP gain ×' + fmt(Engine.starGpLog(state));
  }

  function starRowText(kind, state) {
    if (kind === 'star') return 'Star (n=' + state.inf.stars.n + ')';
    if (kind === 'base') return 'Base ' + (2.75 + 0.275 * state.inf.stars.nb).toFixed(3);
    return 'Exponent ' + (0.4 + 0.05 * state.inf.stars.ne).toFixed(3);
  }
  function starRowCostLog(kind, state) {
    if (kind === 'star') return Engine.starCostLog(state);
    if (kind === 'base') return Engine.starBaseCostLog(state);
    return Engine.starExpCostLog(state);
  }
  function starRowCanBuy(kind, state) {
    if (!state.inf.upg['21;1']) return false;
    if (kind === 'star') return Engine.canBuyStar(state);
    if (kind === 'exp' && state.inf.stars.ne >= Engine.TUNE.starExpMax) return false;
    return state.inf.ipLog >= starRowCostLog(kind, state);
  }
  function starRowBuy(kind, state) {
    if (kind === 'star') return Engine.buyStar(state);
    if (kind === 'base') return Engine.buyStarBase(state);
    return Engine.buyStarExp(state);
  }

  function buildStarRow(kit, state, kind, tipAttrs) {
    var rowAttrs = { class: 'star-buy-row', 'data-star': kind, tabindex: '0' };
    for (var key in tipAttrs) rowAttrs[key] = tipAttrs[key];
    var row = kit.el('div', rowAttrs, [
      kit.el('div', { class: 'star-buy-label' }, [starRowText(kind, state)]),
    ]);
    var btn = kit.el('button', { class: 'btn star-buy-btn' }, [fmt(starRowCostLog(kind, state)) + ' IP']);
    btn.disabled = !starRowCanBuy(kind, state);
    btn.addEventListener('click', function () {
      if (starRowBuy(kind, state)) {
        kit.markDirty();
        kit.save();
      }
    });
    row.appendChild(btn);
    return row;
  }

  function updateStarRow(row, state) {
    var kind = row.getAttribute('data-star');
    var label = row.querySelector('.star-buy-label');
    if (label) label.textContent = starRowText(kind, state);
    var btn = row.querySelector('.star-buy-btn');
    if (btn) {
      btn.textContent = fmt(starRowCostLog(kind, state)) + ' IP';
      btn.disabled = !starRowCanBuy(kind, state);
    }
  }

  function sdRowText(state, j) {
    var u = Engine.SD_UPGRADES[j];
    var level = state.inf.stars.sdU[j];
    var max = u.max === Infinity ? '∞' : String(u.max);
    return u.name + ' — Lv ' + level + '/' + max;
  }

  function buildSdRow(kit, state, j) {
    var row = kit.el('div', { class: 'card sd-row', 'data-j': String(j), tabindex: '0', 'data-tip': 'sdUpg', 'data-tip-i': String(j) }, [
      kit.el('div', { class: 'card-title sd-title' }, [sdRowText(state, j)]),
      kit.el('div', { class: 'iu-effect' }, [Engine.SD_UPGRADES[j].desc]),
    ]);
    var btn = kit.el('button', { class: 'btn full-width sd-buy-btn' }, [fmt(Engine.sdUpgCostLog(state, j)) + ' SD']);
    btn.disabled = !Engine.canBuySdUpg(state, j);
    btn.addEventListener('click', function () {
      if (Engine.buySdUpg(state, j)) {
        kit.markDirty();
        kit.save();
      }
    });
    row.appendChild(btn);
    return row;
  }

  function updateSdRow(row, state, j) {
    var title = row.querySelector('.sd-title');
    if (title) title.textContent = sdRowText(state, j);
    var btn = row.querySelector('.sd-buy-btn');
    if (btn) {
      btn.textContent = fmt(Engine.sdUpgCostLog(state, j)) + ' SD';
      btn.disabled = !Engine.canBuySdUpg(state, j);
    }
  }

  function renderStars(kit, state) {
    var wrap = kit.el('div', { class: 'inf-stars', 'data-guide': 'inf-stars' });
    wrap.appendChild(kit.el('div', { class: 'stat-line', id: 'star-line', tabindex: '0', 'data-tip': 'sdAmount' }, [
      kit.el('span', { id: 'star-line-value' }, [starLineText(state)]),
    ]));
    wrap.appendChild(buildStarRow(kit, state, 'star', { 'data-tip': 'starBuy' }));
    wrap.appendChild(buildStarRow(kit, state, 'base', { 'data-tip': 'starBase' }));
    wrap.appendChild(buildStarRow(kit, state, 'exp', { 'data-tip': 'starExp' }));
    for (var j = 0; j < Engine.SD_UPGRADES.length; j++) {
      wrap.appendChild(buildSdRow(kit, state, j));
    }
    wrap.appendChild(kit.el('p', { class: 'help' }, ['Stardust resets on Infinity — spend it first.']));
    return wrap;
  }

  function updateStars(root, kit, state) {
    var lineValue = root.querySelector('#star-line-value');
    if (lineValue) lineValue.textContent = starLineText(state);
    var starRows = root.querySelectorAll('.star-buy-row');
    Array.prototype.forEach.call(starRows, function (row) { updateStarRow(row, state); });
    var sdRows = root.querySelectorAll('.sd-row');
    Array.prototype.forEach.call(sdRows, function (row) {
      var j = Number(row.getAttribute('data-j'));
      updateSdRow(row, state, j);
    });
  }

  // ---------- tab dispatch ----------

  function renderBody(kit, state) {
    if (subTab === 'gens') return renderGens(kit, state);
    if (subTab === 'tree') return renderTree(kit, state);
    if (subTab === 'auto') return renderAuto(kit, state);
    if (subTab === 'ics') return renderICs(kit, state);
    if (subTab === 'stars') return renderStars(kit, state);
    return kit.el('div');
  }

  function render(container, state, kit) {
    container.innerHTML = '';
    var wrap = kit.el('div', { class: 'tab-body-inner inf-tab' });
    wrap.appendChild(renderHeader(kit, state));
    wrap.appendChild(renderSubTabRow(kit, state, container));
    wrap.appendChild(kit.el('div', { id: 'inf-subbody' }, [renderBody(kit, state)]));
    container.appendChild(wrap);
  }

  function update(container, state, kit) {
    var header = container.querySelector('#inf-header');
    var body = container.querySelector('#inf-subbody');
    if (!header || !body) {
      render(container, state, kit);
      return;
    }
    updateHeader(header, state);
    if (subTab === 'tree') updateTree(body, kit, state);
    else if (subTab === 'gens') updateGens(body, kit, state);
    else if (subTab === 'auto') updateAuto(body, kit, state);
    else if (subTab === 'ics') updateICs(body, kit, state);
    else if (subTab === 'stars') updateStars(body, kit, state);
  }

  // Lets Guide (Task 3) drive the ∞ sub-tab when a goal's target lives in a
  // specific one (Gens, ICs, Stars, ...). Only sets the in-memory selection;
  // the next render (kit.markDirty / the outer tab dispatch) picks it up.
  function setSubTab(id) {
    if (SUBTABS.some(function (t) { return t.id === id; })) {
      subTab = id;
      saveSubTab(id);
    }
  }
  function getSubTab() { return subTab; }

  window.InfinityUI = {
    render: render,
    update: update,
    setSubTab: setSubTab,
    getSubTab: getSubTab,
  };
})();

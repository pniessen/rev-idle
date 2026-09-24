// src/ui-infinity.js — the ∞ tab (Tree, Gens, Auto, ICs, Stars). DOM only via
// kit.el; reads state and Engine directly, never window/localStorage except
// the try/catch-wrapped sub-tab preference below.
(function () {
  'use strict';

  var Engine = window.Engine;
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
    return 'IP ' + fmt(state.inf.ipLog) + ' · +' + fmt(Engine.ipGainLog(state)) + ' next';
  }

  function infLineText(state) {
    return '∞ ' + fmtInfNumber(state.infinities);
  }

  function renderHeader(kit, state) {
    return kit.el('div', { id: 'inf-header', class: 'inf-header' }, [
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
      kit.el('div', { class: 'iu-effect' }, [u.desc + effectSuffix(u, effect)]),
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
    var wrap = kit.el('div', { class: 'inf-tree' });
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
      if (effLine) effLine.textContent = u.desc + effectSuffix(u, effect);

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
    var wrap = kit.el('div', { class: 'inf-gens' });
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

  // ---------- Auto / ICs / Stars (placeholders until Task 12) ----------

  function renderComingSoon(kit) {
    return kit.el('div', { class: 'inf-coming-soon' }, [
      kit.el('p', { class: 'help' }, ['Coming in Task 12']),
    ]);
  }

  // ---------- tab dispatch ----------

  function renderBody(kit, state) {
    if (subTab === 'gens') return renderGens(kit, state);
    if (subTab === 'tree') return renderTree(kit, state);
    return renderComingSoon(kit);
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
  }

  window.InfinityUI = {
    render: render,
    update: update,
  };
})();

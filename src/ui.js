// src/ui.js \u2014 DOM panel, buy modes, prestige/promotion/infinity screens,
// loop, save/load/offline. Only calls the Shared Engine API on window.Engine
// and window.Renderer.
(function () {
  'use strict';

  var SAVE_KEY = 'revidle.save.v1';
  var DOM_INTERVAL = 100; // ms, ~10Hz
  var AUTOSAVE_INTERVAL = 10000; // ms
  var OFFLINE_CAP_SEC = 8 * 3600;
  var CONFIRM_WINDOW = 3000; // ms

  var Engine = window.Engine;

  var state = null;
  var renderer = null;
  var canvas = null;

  var buyMode = '1'; // '1' | '10' | 'max'
  var currentTab = 'circles';
  var dirty = true;
  var lastVisibleTabIds = '';
  var modalOpen = null; // 'offline' | 'infinity' | null

  var els = {};

  var TABS = [
    { id: 'circles', label: 'Circles', visible: function () { return true; } },
    {
      id: 'prestige',
      label: 'Prestige',
      visible: function (s) { return s.scoreLog >= 8 || s.stats.prestiges > 0; },
    },
    {
      id: 'promote',
      label: 'Promote',
      visible: function (s) {
        var pending = Engine.canPrestige(s) ? Engine.pendingPrestige(s).pMult : 0;
        if (s.pMult >= Engine.TUNE.promoMin || pending >= Engine.TUNE.promoMin) return true;
        for (var i = 0; i < s.promo.length; i++) if (s.promo[i] > 0) return true;
        return false;
      },
    },
    { id: 'stats', label: 'Stats', visible: function () { return true; } },
    { id: 'settings', label: 'Settings', visible: function () { return true; } },
  ];

  var PROMO_META = [
    { key: 'p1', name: 'Mult Gain' },
    { key: 'p2', name: 'Lap Speed' },
    { key: 'p3', name: 'Ascension Power' },
    { key: 'p4', name: 'Promotion Power' },
  ];

  // ---------- small helpers ----------

  function cloneState(s) {
    return Engine.deserialize(Engine.serialize(s));
  }

  function fmt(x) {
    return Engine.fmtLog(x);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] === false || attrs[k] === null || attrs[k] === undefined) {
          // skip
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var parts = [];
    if (h > 0) parts.push(h + 'h');
    if (h > 0 || m > 0) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function markDirty() {
    dirty = true;
  }

  function twoStepConfirm(btn, label, confirmLabel, action) {
    var confirming = false;
    var timer = null;
    btn.textContent = label;
    btn.addEventListener('click', function () {
      if (!confirming) {
        confirming = true;
        btn.textContent = confirmLabel;
        btn.classList.add('confirming');
        timer = setTimeout(function () {
          confirming = false;
          btn.textContent = label;
          btn.classList.remove('confirming');
        }, CONFIRM_WINDOW);
      } else {
        clearTimeout(timer);
        confirming = false;
        btn.textContent = label;
        btn.classList.remove('confirming');
        action();
      }
    });
  }

  // ---------- toast ----------

  var toastTimer = null;

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.hidden = false;
    requestAnimationFrame(function () { els.toast.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
      setTimeout(function () { els.toast.hidden = true; }, 220);
    }, 2500);
  }

  // ---------- modal ----------

  function showModal(node) {
    els.modal.innerHTML = '';
    els.modal.appendChild(node);
    els.modal.hidden = false;
  }

  function hideModal() {
    els.modal.hidden = true;
    els.modal.innerHTML = '';
    modalOpen = null;
  }

  function showOfflineModal(info) {
    modalOpen = 'offline';
    var gainLog = info.before === -Infinity ? info.after : Engine.logSub(info.after, info.before);
    var panel = el('div', { class: 'modal-panel' }, [
      el('h2', { class: 'modal-title' }, ['While you were away']),
      el('p', { class: 'help' }, [
        'You were gone for ' + fmtTime(info.seconds) + '.',
      ]),
      el('p', { class: 'stat-line' }, [
        el('span', { class: 'label' }, ['Score gained']),
        el('span', {}, [fmt(gainLog)]),
      ]),
      el('button', { class: 'btn primary full-width', onclick: hideModal }, ['Continue']),
    ]);
    showModal(panel);
  }

  function doGoInfinite() {
    if (Engine.goInfinite(state)) {
      toast('Infinity reached \u2014 welcome back');
      hideModal();
      markDirty();
    }
  }

  function showInfinityModal() {
    modalOpen = 'infinity';
    var s = state.stats;
    var panel = el('div', { class: 'modal-panel' }, [
      el('h2', { class: 'modal-title' }, ['Infinity reached']),
      el('p', { class: 'help' }, [
        'Score has exceeded what a number can hold. Going infinite resets your ' +
          'progress and keeps 1 Infinity Point (IP) for a future update.',
      ]),
      el('div', { class: 'kv-list' }, [
        statLine('Play time', fmtTime(s.playTime)),
        statLine('Total laps', String(s.totalLaps)),
        statLine('Prestiges', String(s.prestiges)),
        statLine('Promotions', String(s.promotions)),
      ]),
      el('button', {
        class: 'btn primary full-width',
        onclick: doGoInfinite,
      }, ['Go Infinite']),
    ]);
    showModal(panel);
  }

  function statLine(label, value) {
    return el('div', { class: 'stat-line' }, [
      el('span', { class: 'label' }, [label]),
      el('span', {}, [value]),
    ]);
  }

  // ---------- multbar ----------

  function renderMultbar() {
    var frag = document.createDocumentFragment();
    var p = Engine.promoEffects(state);
    for (var i = 0; i < state.circles.length; i++) {
      var c = state.circles[i];
      if (!c.unlocked) continue;
      var def = Engine.CIRCLES[i];
      var chip = el('span', { class: 'chip', style: 'color:' + def.color + ';border-color:' + def.color }, [
        '\u00D7' + fmt(c.multLog),
      ]);
      frag.appendChild(chip);
    }
    frag.appendChild(el('span', { class: 'chip grey' }, ['P \u00D7' + fmt(Math.log10(state.pMult))]));
    if (state.pExp > 1) {
      frag.appendChild(el('span', { class: 'chip grey' }, ['^' + state.pExp.toFixed(3)]));
    }
    if (state.infinities > 0) {
      frag.appendChild(el('span', { class: 'chip grey' }, ['\u221E ' + state.infinities]));
    }
    els.multbar.innerHTML = '';
    els.multbar.appendChild(frag);
  }

  // ---------- scorebox ----------

  function updateScorebox() {
    els.score.textContent = fmt(state.scoreLog);
    var income = Engine.incomeLog(state);
    els.income.textContent = fmt(income) + ' /s';
  }

  // ---------- nav / tabs ----------

  function computeVisibleTabs() {
    return TABS.filter(function (t) { return t.visible(state); });
  }

  function syncFromHash() {
    var id = (location.hash || '#circles').replace('#', '');
    var visible = computeVisibleTabs().map(function (t) { return t.id; });
    currentTab = visible.indexOf(id) !== -1 ? id : 'circles';
    markDirty();
    renderNav();
  }

  function renderNav() {
    var visible = computeVisibleTabs();
    els.tabs.innerHTML = '';
    visible.forEach(function (t) {
      var btn = el('button', {
        class: 'tab-btn',
        role: 'tab',
        'aria-selected': String(t.id === currentTab),
        onclick: function () { location.hash = '#' + t.id; },
      }, [t.label]);
      els.tabs.appendChild(btn);
    });
  }

  function checkTabsVisibility() {
    var ids = computeVisibleTabs().map(function (t) { return t.id; }).join(',');
    if (ids !== lastVisibleTabIds) {
      lastVisibleTabIds = ids;
      renderNav();
      if (computeVisibleTabs().map(function (t) { return t.id; }).indexOf(currentTab) === -1) {
        currentTab = 'circles';
      }
      markDirty();
    }
  }

  // ---------- circles tab ----------

  function buyPreview(i, mode) {
    var targetN = mode === 'max' ? Infinity : Number(mode);
    var clone = cloneState(state);
    var totalCostLog = -Infinity;
    var count = 0;
    while (count < targetN) {
      var costLog = Engine.costLog(clone, i);
      var bought = Engine.buy(clone, i, 1);
      if (bought === 0) break;
      totalCostLog = Engine.logAdd(totalCostLog, costLog);
      count++;
    }
    return { count: count, totalCostLog: totalCostLog };
  }

  function renderCirclesTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });

    var modeRow = el('div', { id: 'buy-mode', role: 'group', 'aria-label': 'Buy mode' });
    ['1', '10', 'max'].forEach(function (m) {
      var label = m === 'max' ? 'Max' : '\u00D7' + m;
      var btn = el('button', {
        'aria-pressed': String(buyMode === m),
        onclick: function () {
          buyMode = m;
          markDirty();
        },
      }, [label]);
      modeRow.appendChild(btn);
    });
    wrap.appendChild(modeRow);

    var firstLocked = -1;
    for (var i = 0; i < state.circles.length; i++) {
      var c = state.circles[i];
      if (c.unlocked) {
        wrap.appendChild(renderCircleRow(i));
      } else if (firstLocked === -1) {
        firstLocked = i;
      }
    }
    if (firstLocked > 0) {
      var prevName = Engine.CIRCLES[firstLocked - 1].name;
      wrap.appendChild(el('div', { class: 'circle-row locked' }, [
        el('div', { class: 'swatch', style: 'color:' + Engine.CIRCLES[firstLocked].color }),
        el('div', { class: 'circle-info' }, [
          el('div', { class: 'circle-name' }, [Engine.CIRCLES[firstLocked].name]),
          el('div', { class: 'circle-meta' }, ['Unlocks at 5 ' + prevName + ' levels bought']),
        ]),
      ]));
    }

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function renderCircleRow(i) {
    var c = state.circles[i];
    var def = Engine.CIRCLES[i];
    var cap = Engine.levelCap(c);
    var p = Engine.promoEffects(state);
    var lps = Engine.lapsPerSec(state, i);
    var gainLog = c.multGainLog + Math.log10(p.p1);

    var row = el('div', { class: 'circle-row', 'data-i': String(i) });
    row.appendChild(el('div', { class: 'swatch', style: 'color:' + def.color }));

    var info = el('div', { class: 'circle-info' }, [
      el('div', { class: 'circle-name', style: 'color:' + def.color }, [def.name]),
      el('div', { class: 'circle-meta' }, [
        el('span', { class: 'lv' }, ['Lv ' + c.level + '/' + cap]),
        el('span', { class: 'lps' }, [lps.toFixed(2) + ' laps/s']),
        el('span', { class: 'gain' }, ['+' + fmt(gainLog) + '/lap']),
      ]),
    ]);
    row.appendChild(info);

    var actions = el('div', { class: 'circle-actions' });
    var buyBtn = el('button', { class: 'btn buy-btn', 'data-i': String(i) });
    buyBtn.style.setProperty('--circle', def.color);
    buyBtn.addEventListener('click', function () {
      var wasUnlockedNext = state.circles[i + 1] ? state.circles[i + 1].unlocked : true;
      var n = buyMode === 'max' ? 'max' : Number(buyMode);
      var bought = Engine.buy(state, i, n);
      if (bought > 0) {
        markDirty();
        var isNowUnlocked = state.circles[i + 1] ? state.circles[i + 1].unlocked : true;
        if (!wasUnlockedNext && isNowUnlocked) {
          toast(Engine.CIRCLES[i + 1].name + ' unlocked');
        }
      }
    });
    actions.appendChild(buyBtn);
    updateBuyButton(buyBtn, i);

    if (Engine.canAscend(state, i)) {
      var ascendBtn = el('button', { class: 'btn ascend' }, ['Ascend']);
      ascendBtn.addEventListener('click', function () {
        if (Engine.ascend(state, i)) {
          toast(def.name + ' ascended');
          markDirty();
        }
      });
      actions.appendChild(ascendBtn);
    }

    row.appendChild(actions);
    return row;
  }

  function updateBuyButton(btn, i) {
    var c = state.circles[i];
    var cap = Engine.levelCap(c);
    if (c.level >= cap) {
      btn.textContent = 'Maxed';
      btn.disabled = true;
      btn.classList.remove('affordable');
      return;
    }
    var preview = buyPreview(i, buyMode);
    var costLog = preview.count > 0 ? preview.totalCostLog : Engine.costLog(state, i);
    // Show the actual affordable count (which may be less than the buy
    // mode's target, e.g. only 3 affordable in x10 mode) rather than always
    // claiming the mode's nominal count.
    var labelN = preview.count > 0 ? preview.count : (buyMode === 'max' ? 'Max' : Number(buyMode));
    btn.textContent = 'Buy \u00D7' + labelN + ' \u2014 ' + fmt(costLog);
    btn.disabled = preview.count === 0;
    btn.classList.toggle('affordable', preview.count > 0);
  }

  function updateCirclesTab(root) {
    var modeRow = root.querySelector('#buy-mode');
    if (modeRow) {
      var btns = modeRow.querySelectorAll('button');
      var modes = ['1', '10', 'max'];
      btns.forEach(function (b, idx) {
        b.setAttribute('aria-pressed', String(buyMode === modes[idx]));
      });
    }
    var rows = root.querySelectorAll('.circle-row[data-i]');
    rows.forEach(function (row) {
      var i = Number(row.getAttribute('data-i'));
      var btn = row.querySelector('.buy-btn');
      if (btn) updateBuyButton(btn, i);
    });
  }

  // ---------- prestige tab ----------

  function renderPrestigeTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Prestige']));
    wrap.appendChild(el('p', { class: 'help' }, [
      'Reset your circles for a permanent multiplier and exponent boost based on your score.',
    ]));

    if (Engine.canInfinity(state)) {
      wrap.appendChild(el('button', {
        id: 'prestige-infinity-btn',
        class: 'btn primary full-width',
        onclick: doGoInfinite,
      }, ['Go Infinite']));
    }

    var reqLog = Math.max(Engine.TUNE.prestigeMinLog, state.prestigeReqLog);
    wrap.appendChild(el('div', { id: 'prestige-req', class: 'stat-line' }, [
      el('span', { class: 'label' }, ['Requirement']),
      el('span', {}, ['score \u2265 ' + fmt(reqLog)]),
    ]));

    wrap.appendChild(el('div', { id: 'prestige-current', class: 'stat-line' }, [
      el('span', { class: 'label' }, ['Current']),
      el('span', {}, ['\u00D7' + fmt(Math.log10(state.pMult)) + '  ^' + state.pExp.toFixed(3)]),
    ]));

    wrap.appendChild(el('div', { id: 'prestige-pending', class: 'stat-line' }, [
      el('span', { class: 'label' }, ['Pending']),
      el('span', {}, [pendingPrestigeText()]),
    ]));

    var btn = el('button', { id: 'prestige-btn', class: 'btn primary full-width' });
    btn.disabled = !Engine.canPrestige(state);
    twoStepConfirm(btn, 'Prestige', 'Confirm reset?', function () {
      if (Engine.prestige(state)) {
        toast('Prestiged');
        markDirty();
      }
    });
    wrap.appendChild(btn);

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function pendingPrestigeText() {
    var g = Engine.pendingPrestige(state);
    return '\u00D7' + fmt(Math.log10(g.pMult)) + '  ^' + g.pExp.toFixed(3);
  }

  function updatePrestigeTab(root) {
    var pending = root.querySelector('#prestige-pending span:last-child');
    if (pending) pending.textContent = pendingPrestigeText();
    var btn = root.querySelector('#prestige-btn');
    if (btn) btn.disabled = !Engine.canPrestige(state);
    var infinityBtn = root.querySelector('#prestige-infinity-btn');
    if (Engine.canInfinity(state) && !infinityBtn) {
      markDirty(); // re-render to insert the Go Infinite button
    }
  }

  // ---------- promote tab ----------

  function effectAt(k, xp) {
    var arr = state.promo.slice();
    arr[k] = xp;
    return Engine.promoEffects({ promo: arr })[PROMO_META[k].key];
  }

  function renderPromoteTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Promote']));
    wrap.appendChild(el('div', { id: 'promo-xp', class: 'stat-line' }, [
      el('span', { class: 'label' }, ['XP available']),
      el('span', {}, [String(Engine.promoXp(state))]),
    ]));

    PROMO_META.forEach(function (meta, k) {
      var level = state.promo[k];
      var xp = Engine.promoXp(state);
      var cur = Engine.promoEffects(state)[meta.key];
      var next = effectAt(k, xp);
      var card = el('div', { class: 'card', 'data-k': String(k) }, [
        el('div', { class: 'card-title' }, [meta.name + ' \u2014 Lv ' + level]),
        el('div', { class: 'stat-line' }, [
          el('span', { class: 'label' }, ['Effect']),
          el('span', { class: 'effect-text' }, [cur.toFixed(3) + ' \u2192 ' + next.toFixed(3)]),
        ]),
      ]);
      var btn = el('button', { class: 'btn full-width' });
      btn.disabled = !Engine.canPromote(state, k);
      twoStepConfirm(btn, 'Promote', 'Confirm reset?', (function (kk) {
        return function () {
          if (Engine.promote(state, kk)) {
            toast(PROMO_META[kk].name + ' promoted');
            markDirty();
          }
        };
      })(k));
      card.appendChild(btn);
      wrap.appendChild(card);
    });

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function updatePromoteTab(root) {
    var xpEl = root.querySelector('#promo-xp span:last-child');
    var xp = Engine.promoXp(state);
    if (xpEl) xpEl.textContent = String(xp);
    var cards = root.querySelectorAll('.card[data-k]');
    cards.forEach(function (card) {
      var k = Number(card.getAttribute('data-k'));
      var meta = PROMO_META[k];
      var cur = Engine.promoEffects(state)[meta.key];
      var next = effectAt(k, xp);
      var effectEl = card.querySelector('.effect-text');
      if (effectEl) effectEl.textContent = cur.toFixed(3) + ' \u2192 ' + next.toFixed(3);
      var btn = card.querySelector('button');
      if (btn) btn.disabled = !Engine.canPromote(state, k);
    });
  }

  // ---------- stats tab ----------

  function renderStatsTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Stats']));
    var list = el('div', { id: 'stats-list', class: 'kv-list' }, [
      statLine('Play time', fmtTime(state.stats.playTime)),
      statLine('Total laps', String(state.stats.totalLaps)),
      statLine('Best score', fmt(state.stats.bestScoreLog)),
      statLine('Prestiges', String(state.stats.prestiges)),
      statLine('Promotions', String(state.stats.promotions)),
      statLine('Infinities', String(state.infinities)),
    ]);
    wrap.appendChild(list);
    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function updateStatsTab(root) {
    var list = root.querySelector('#stats-list');
    if (!list) return;
    var rows = list.children;
    var values = [
      fmtTime(state.stats.playTime),
      String(state.stats.totalLaps),
      fmt(state.stats.bestScoreLog),
      String(state.stats.prestiges),
      String(state.stats.promotions),
      String(state.infinities),
    ];
    for (var i = 0; i < rows.length; i++) {
      var span = rows[i].querySelector('span:last-child');
      if (span) span.textContent = values[i];
    }
  }

  // ---------- settings tab ----------

  function renderSettingsTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Settings']));

    wrap.appendChild(el('h2', { class: 'section-title' }, ['Export']));
    var exportArea = el('textarea', { class: 'save-area', readonly: 'true' });
    exportArea.value = Engine.serialize(state);
    var copyBtn = el('button', { class: 'btn' }, ['Copy']);
    copyBtn.addEventListener('click', function () {
      var text = exportArea.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          toast('Copied to clipboard');
        }, function () {
          exportArea.select();
          toast('Selected \u2014 press Ctrl/Cmd+C to copy');
        });
      } else {
        exportArea.select();
        toast('Selected \u2014 press Ctrl/Cmd+C to copy');
      }
    });
    wrap.appendChild(exportArea);
    wrap.appendChild(el('div', { class: 'row' }, [copyBtn]));

    wrap.appendChild(el('h2', { class: 'section-title' }, ['Import']));
    var importArea = el('textarea', { class: 'save-area' });
    var importErr = el('div', { class: 'error-text' });
    var loadBtn = el('button', { class: 'btn' }, ['Load']);
    loadBtn.addEventListener('click', function () {
      try {
        var loaded = Engine.deserialize(importArea.value.trim());
        state = loaded;
        importErr.textContent = '';
        markDirty();
        toast('Save loaded');
      } catch (e) {
        importErr.textContent = 'Invalid save string.';
      }
    });
    wrap.appendChild(importArea);
    wrap.appendChild(el('div', { class: 'row' }, [loadBtn]));
    wrap.appendChild(importErr);

    wrap.appendChild(el('h2', { class: 'section-title' }, ['Hard reset']));
    wrap.appendChild(el('p', { class: 'help' }, ['Erases all progress. This cannot be undone.']));
    var resetBtn = el('button', { class: 'btn full-width' });
    twoStepConfirm(resetBtn, 'Hard reset', 'Confirm reset?', function () {
      state = Engine.newState();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      markDirty();
      toast('Progress reset');
      location.hash = '#circles';
    });
    wrap.appendChild(resetBtn);

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  // ---------- tab dispatch ----------

  var TAB_RENDER = {
    circles: renderCirclesTab,
    prestige: renderPrestigeTab,
    promote: renderPromoteTab,
    stats: renderStatsTab,
    settings: renderSettingsTab,
  };

  var TAB_UPDATE = {
    circles: updateCirclesTab,
    prestige: updatePrestigeTab,
    promote: updatePromoteTab,
    stats: updateStatsTab,
    settings: function () {},
  };

  function renderActiveTabBody() {
    (TAB_RENDER[currentTab] || renderCirclesTab)(els.tabBody);
  }

  function updateActiveTabBody() {
    (TAB_UPDATE[currentTab] || function () {})(els.tabBody);
  }

  // ---------- keyboard ----------

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (modalOpen) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'm' || e.key === 'M') {
      var modes = ['1', '10', 'max'];
      buyMode = modes[(modes.indexOf(buyMode) + 1) % modes.length];
      markDirty();
      return;
    }
    var digit = e.key;
    var idx = -1;
    if (digit >= '1' && digit <= '9') idx = Number(digit) - 1;
    else if (digit === '0') idx = 9;
    if (idx >= 0 && idx < state.circles.length) {
      var n = buyMode === 'max' ? 'max' : Number(buyMode);
      var wasUnlockedNext = state.circles[idx + 1] ? state.circles[idx + 1].unlocked : true;
      var bought = Engine.buy(state, idx, n);
      if (bought > 0) {
        markDirty();
        var isNowUnlocked = state.circles[idx + 1] ? state.circles[idx + 1].unlocked : true;
        if (!wasUnlockedNext && isNowUnlocked) {
          toast(Engine.CIRCLES[idx + 1].name + ' unlocked');
        }
      }
    }
  }

  // ---------- save / load ----------

  function save() {
    try {
      state.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, Engine.serialize(state));
    } catch (e) { /* ignore: game must run without localStorage */ }
  }

  function loadFromLocalStorage() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return Engine.deserialize(raw);
    } catch (e) {
      return null;
    }
  }

  // ---------- infinity check ----------

  function checkInfinity() {
    var can = Engine.canInfinity(state);
    if (els.infinityBtn) els.infinityBtn.style.display = can ? '' : 'none';
    if (can && !modalOpen) {
      showInfinityModal();
    }
  }

  // ---------- main loop ----------

  var rafId = null;
  var lastFrame = 0;
  var lastDomUpdate = 0;
  var lastAutosave = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    dt = Math.min(dt, 0.25);

    var result = Engine.tick(state, dt);
    if (renderer) renderer.draw(state, dt, result.laps);

    if (now - lastDomUpdate >= DOM_INTERVAL) {
      lastDomUpdate = now;
      domUpdate();
    }
    if (now - lastAutosave >= AUTOSAVE_INTERVAL) {
      lastAutosave = now;
      save();
    }
  }

  function domUpdate() {
    updateScorebox();
    renderMultbar();
    checkTabsVisibility();
    if (dirty) {
      renderNav();
      renderActiveTabBody();
      dirty = false;
    } else {
      updateActiveTabBody();
    }
    checkInfinity();
  }

  // ---------- boot ----------

  function initDom() {
    els.multbar = document.getElementById('multbar');
    els.stage = document.getElementById('stage');
    els.score = document.getElementById('score');
    els.income = document.getElementById('income');
    els.tabs = document.getElementById('tabs');
    els.tabBody = document.getElementById('tab-body');
    els.modal = document.getElementById('modal');
    els.toast = document.getElementById('toast');
    canvas = document.getElementById('orbits');

    els.scorebox = document.getElementById('scorebox');
    els.infinityBtn = el('button', {
      id: 'infinity-btn',
      class: 'btn primary',
      style: 'display:none',
      onclick: doGoInfinite,
    }, ['Go Infinite']);
    if (els.scorebox) els.scorebox.appendChild(els.infinityBtn);
  }

  function init(offlineInfo) {
    initDom();

    if (window.Renderer && typeof window.Renderer.create === 'function') {
      renderer = window.Renderer.create(canvas);
    }
    window.addEventListener('resize', function () {
      if (renderer) renderer.resize();
    });

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', syncFromHash);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        save();
      } else {
        var hiddenSec = Math.min((Date.now() - state.savedAt) / 1000, OFFLINE_CAP_SEC);
        if (hiddenSec > 0) {
          var sim = Engine.simulate(state, hiddenSec);
          if (hiddenSec > 10 && !modalOpen) {
            showOfflineModal({ seconds: hiddenSec, before: sim.scoreLogBefore, after: sim.scoreLogAfter });
          }
          state.savedAt = Date.now();
          save();
          markDirty();
        }
        // Reset the frame clock so the next rAF frame doesn't see a huge dt
        // (which frame() clamps to 0.25s anyway) on top of the time we just
        // simulated here.
        lastFrame = 0;
      }
    });

    syncFromHash();
    lastVisibleTabIds = computeVisibleTabs().map(function (t) { return t.id; }).join(',');
    renderNav();
    renderActiveTabBody();
    dirty = false;
    updateScorebox();
    renderMultbar();

    if (offlineInfo) {
      showOfflineModal(offlineInfo);
    }

    lastFrame = 0;
    lastDomUpdate = 0;
    lastAutosave = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function start(data) {
    state = null;

    if (data && data.save) {
      try { state = Engine.deserialize(data.save); } catch (e) { state = null; }
    }
    if (!state) {
      state = loadFromLocalStorage();
    }

    var offlineInfo = null;
    if (state && state.savedAt) {
      var offlineSec = Math.min((Date.now() - state.savedAt) / 1000, OFFLINE_CAP_SEC);
      if (offlineSec > 10) {
        var sim = Engine.simulate(state, offlineSec);
        offlineInfo = { seconds: offlineSec, before: sim.scoreLogBefore, after: sim.scoreLogAfter };
        state.savedAt = Date.now();
        save();
      }
    }

    if (!state) state = Engine.newState();

    init(offlineInfo);
  }

  if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') {
    window.claude.hot.snapshot(function () {
      state.savedAt = Date.now();
      return { save: Engine.serialize(state) };
    });
  }

  if (window.claude && window.claude.hot && window.claude.hot.ready) {
    window.claude.hot.ready(start);
  } else {
    start((window.claude && window.claude.hot && window.claude.hot.data) || {});
  }
})();

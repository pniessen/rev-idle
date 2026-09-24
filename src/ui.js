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
  var Help = window.Help;

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
    {
      id: 'infinity',
      label: '∞',
      visible: function (s) { return s.infinities >= 1 || s.inf.ipLog > -Infinity; },
    },
    { id: 'stats', label: 'Stats', visible: function () { return true; } },
    { id: 'settings', label: 'Settings', visible: function () { return true; } },
  ];

  var ICONS = {
    stats: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

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

  // Formats a plain (non-log) count such as state.infinities: an integer
  // most of the time, but passive-Infinity upgrades (18;1) can make it
  // fractional, so it gets 2 decimals only then.
  function fmtInf(n) {
    var frac = Math.abs(n - Math.round(n)) > 1e-9;
    try {
      return n.toLocaleString('en-US', frac ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    } catch (e) {
      return String(n);
    }
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
    // The run may have been reset while away (prestige/promote/Infinity), so
    // the end score can be lower than the start: logSub needs after > before
    // (it returns NaN otherwise), so only a real gain is shown as one.
    var gained = info.after > info.before;
    var scoreLine = gained
      ? ['Score gained', fmt(info.before === -Infinity ? info.after : Engine.logSub(info.after, info.before))]
      : ['Score now', fmt(info.after)];
    var lines = [
      el('p', { class: 'help' }, [
        'You were gone for ' + fmtTime(info.seconds) + '.',
      ]),
      el('p', { class: 'stat-line' }, [
        el('span', { class: 'label' }, [scoreLine[0]]),
        el('span', {}, [scoreLine[1]]),
      ]),
    ];
    if (info.ipGainedLog !== undefined && info.ipGainedLog !== -Infinity) {
      lines.push(el('p', { class: 'stat-line' }, [
        el('span', { class: 'label' }, ['IP gained']),
        el('span', {}, ['+' + fmt(info.ipGainedLog)]),
      ]));
    }
    if (info.infinitiesGained) {
      lines.push(el('p', { class: 'stat-line' }, [
        el('span', { class: 'label' }, ['Infinities']),
        el('span', {}, ['+' + fmtInf(info.infinitiesGained)]),
      ]));
    }
    if (info.icCompleted && info.icCompleted.length) {
      info.icCompleted.forEach(function (n) {
        lines.push(el('p', { class: 'help' }, ['Challenge ' + n + ' completed']));
      });
    }
    var panel = el('div', { class: 'modal-panel' },
      [el('h2', { class: 'modal-title' }, ['While you were away'])]
        .concat(lines)
        .concat([el('button', { class: 'btn primary full-width', onclick: hideModal }, ['Continue'])]));
    showModal(panel);
  }

  // Closes the Infinity modal even when goInfinite refuses (the score is no
  // longer at the cap), so its button can never be a dead end.
  function doGoInfinite() {
    var ok = Engine.goInfinite(state);
    if (!ok && !Engine.canInfinity(state)) state.inf.pendingConfirm = false;
    if (modalOpen === 'infinity') hideModal();
    if (ok) markDirty();
  }

  function showInfinityModal() {
    modalOpen = 'infinity';
    var s = state.stats;
    var isFirst = state.infinities === 0;
    var panel;
    if (isFirst) {
      panel = el('div', { class: 'modal-panel' }, [
        el('h2', { class: 'modal-title' }, ['Infinity reached']),
        el('p', { class: 'help' }, [
          'You gained 1 Infinity Point. Spend it in the new \u221e tab.',
        ]),
        el('button', {
          class: 'btn primary full-width',
          onclick: doGoInfinite,
        }, ['Go Infinite']),
      ]);
    } else {
      panel = el('div', { class: 'modal-panel' }, [
        el('h2', { class: 'modal-title' }, ['Infinity reached']),
        el('p', { class: 'help' }, [
          'Score has exceeded what a number can hold. Going infinite resets your ' +
            'progress and keeps your upgrades, generators and Infinity Points.',
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
    }
    showModal(panel);
  }

  // D15: shown once, the first time inf.ipLog crosses the Infinity cap.
  function showFinaleModal() {
    modalOpen = 'finale';
    var s = state.stats;
    var panel = el('div', { class: 'modal-panel' }, [
      el('h2', { class: 'modal-title' }, ['Eternity — coming soon']),
      el('div', { class: 'kv-list' }, [
        statLine('Play time', fmtTime(s.playTime)),
        statLine('Infinities', fmtInf(state.infinities)),
        statLine('Fastest Infinity', s.fastestInfinity === null ? '—' : fmtTime(s.fastestInfinity)),
      ]),
      el('button', {
        class: 'btn primary full-width',
        onclick: function () {
          state.inf.finaleSeen = true;
          save();
          hideModal();
        },
      }, ['Close']),
    ]);
    showModal(panel);
  }

  function statLine(label, value) {
    return el('div', { class: 'stat-line' }, [
      el('span', { class: 'label' }, [label]),
      el('span', {}, [value]),
    ]);
  }

  // Passed to InfinityUI so src/ui-infinity.js never touches window.Engine
  // for anything DOM/save-related; it only reads state and calls these.
  var kit = {
    el: el,
    fmt: fmt,
    toast: function (msg) { toast(msg); },
    twoStepConfirm: function (btn, label, confirmLabel, action) { twoStepConfirm(btn, label, confirmLabel, action); },
    statLine: statLine,
    markDirty: function () { markDirty(); },
    save: function () { save(); },
  };

  // ---------- multbar ----------

  function renderMultbar() {
    var frag = document.createDocumentFragment();
    var p = Engine.promoEffects(state);
    for (var i = 0; i < state.circles.length; i++) {
      var c = state.circles[i];
      if (!c.unlocked) continue;
      var def = Engine.CIRCLES[i];
      var chipAttrs = {
        class: 'chip',
        style: 'color:' + def.color + ';border-color:' + def.color,
        'data-tip': 'circleChip',
        'data-tip-i': String(i),
        tabindex: '0',
      };
      if (i === 0) chipAttrs['data-guide'] = 'multbar-red';
      var chip = el('span', chipAttrs, [
        '\u00D7' + fmt(c.multLog),
      ]);
      frag.appendChild(chip);
    }
    frag.appendChild(el('span', { class: 'chip grey', 'data-tip': 'pMultChip', 'data-guide': 'p-chip', tabindex: '0' }, ['P \u00D7' + fmt(Math.log10(state.pMult))]));
    if (state.pExp > 1) {
      frag.appendChild(el('span', { class: 'chip grey', 'data-tip': 'pExpChip', tabindex: '0' }, ['^' + state.pExp.toFixed(3)]));
    }
    if (state.inf.gpLog > 0) {
      frag.appendChild(el('span', { class: 'chip grey', 'data-tip': 'gpChip', tabindex: '0' }, ['GP ×' + fmt(Engine.gpMultLog(state))]));
    }
    if (state.inf.ic.active) {
      frag.appendChild(el('span', {
        class: 'chip', style: 'color:var(--warn);border-color:var(--warn)', 'data-tip': 'icChip', tabindex: '0',
      }, ['IC ' + state.inf.ic.active]));
    }
    if (state.infinities > 0) {
      frag.appendChild(el('span', { class: 'chip grey' }, ['\u221E ' + fmtInf(state.infinities)]));
    }
    els.multbarChips.innerHTML = '';
    els.multbarChips.appendChild(frag);
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
      var attrs = {
        class: 'tab-btn',
        role: 'tab',
        'aria-selected': String(t.id === currentTab),
        onclick: function () { location.hash = '#' + t.id; },
      };
      if (t.id === 'promote') attrs['data-guide'] = 'promote-tab';
      // Only Stats/Settings get the label/icon pair the <420px media query
      // swaps between; other tabs keep a plain text child so that query
      // (which only targets .tab-label/.tab-icon) never touches them.
      var kids;
      if (ICONS[t.id]) {
        attrs['aria-label'] = t.label;
        kids = [
          el('span', { class: 'tab-label' }, [t.label]),
          el('span', { class: 'tab-icon', 'aria-hidden': 'true', html: ICONS[t.id] }),
        ];
      } else {
        kids = [t.label];
      }
      els.tabs.appendChild(el('button', attrs, kids));
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

    var modeRow = el('div', { id: 'buy-mode', role: 'group', 'aria-label': 'Buy mode', 'data-tip': 'buyMode', 'data-guide': 'buy-mode-toggle' });
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
      wrap.appendChild(el('div', { class: 'circle-row locked', tabindex: '0', 'data-tip': 'lockedRow', 'data-guide': 'next-locked-row' }, [
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
        el('span', { class: 'lv', tabindex: '0', 'data-tip': 'circleLevel', 'data-tip-i': String(i) }, ['Lv ' + c.level + '/' + cap]),
        el('span', { class: 'lps', tabindex: '0', 'data-tip': 'circleLps', 'data-tip-i': String(i) }, [lps.toFixed(2) + ' laps/s']),
        el('span', { class: 'gain', tabindex: '0', 'data-tip': 'circleGain', 'data-tip-i': String(i) }, ['+' + fmt(gainLog) + '/lap']),
      ]),
    ]);
    row.appendChild(info);

    var actions = el('div', { class: 'circle-actions' });
    var buyAttrs = { class: 'btn buy-btn', 'data-i': String(i), 'data-tip': 'buyBtn', 'data-tip-i': String(i) };
    if (i === 0) buyAttrs['data-guide'] = 'red-buy';
    else if (i === 1) buyAttrs['data-guide'] = 'orange-buy';
    var buyBtn = el('button', buyAttrs);
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
      var ascendAttrs = { class: 'btn ascend', 'data-tip': 'ascendBtn', 'data-tip-i': String(i) };
      if (i === 0) ascendAttrs['data-guide'] = 'red-ascend';
      var ascendBtn = el('button', ascendAttrs, ['Ascend']);
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

    if (state.inf.broken && Engine.canInfinity(state)) {
      wrap.appendChild(el('button', {
        id: 'prestige-infinity-btn',
        class: 'btn primary full-width',
        'data-tip': 'goInfinite',
        onclick: doGoInfinite,
      }, ['Go Infinite (+' + fmt(Engine.ipGainLog(state)) + ' IP)']));
    }

    if (state.inf.ic.active) {
      wrap.appendChild(el('div', { id: 'ic-banner', class: 'help' }, [icBannerText()]));
    }

    if (state.inf.broken) {
      wrap.appendChild(el('div', { id: 'ip-bar-row', tabindex: '0', 'data-tip': 'ipBar' }, [
        el('div', { class: 'stat-line' }, [
          el('span', { class: 'label' }, ['IP bonus']),
          el('span', { id: 'ip-bar-label' }, [ipBarText()]),
        ]),
        el('div', { class: 'progress-bar' }, [
          el('div', { class: 'progress-fill', id: 'ip-bar-fill', style: 'width:' + (ipBarProgress() * 100) + '%' }),
        ]),
      ]));
    }

    var reqLog = Math.max(Engine.TUNE.prestigeMinLog, state.prestigeReqLog);
    wrap.appendChild(el('div', { id: 'prestige-req', class: 'stat-line', tabindex: '0', 'data-tip': 'prestigeReq' }, [
      el('span', { class: 'label' }, ['Requirement']),
      el('span', {}, ['score \u2265 ' + fmt(reqLog)]),
    ]));

    wrap.appendChild(el('div', { id: 'prestige-current', class: 'stat-line', tabindex: '0', 'data-tip': 'prestigeCurrent' }, [
      el('span', { class: 'label' }, ['Current']),
      el('span', {}, ['\u00D7' + fmt(Math.log10(state.pMult)) + '  ^' + state.pExp.toFixed(3)]),
    ]));

    wrap.appendChild(el('div', { id: 'prestige-pending', class: 'stat-line', tabindex: '0', 'data-tip': 'prestigePending' }, [
      el('span', { class: 'label' }, ['Pending']),
      el('span', {}, [pendingPrestigeText()]),
    ]));

    var btn = el('button', { id: 'prestige-btn', class: 'btn primary full-width', 'data-guide': 'prestige-button' });
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

  // Break Infinity IP bar (spec \u00A78, \u00A710.3): progress from the last \u00D710
  // threshold to the next one, once scoreLog has passed the first threshold.
  function ipBarText() {
    var T = Engine.TUNE;
    var k = Engine.breakBonusLog(state);
    var threshold = T.breakStartLog + T.breakStepLog * (k + 1);
    return 'IP \u00D710^' + k + ' \u00B7 next \u00D710 at e' + threshold.toLocaleString('en-US');
  }
  function ipBarProgress() {
    var T = Engine.TUNE;
    if (state.scoreLog < T.breakStartLog) return 0;
    var mod = (state.scoreLog - T.breakStartLog) % T.breakStepLog;
    return Math.max(0, Math.min(1, mod / T.breakStepLog));
  }
  function icBannerText() {
    var c = Engine.CHALLENGES[state.inf.ic.active - 1];
    if (!c) return '';
    return 'IC' + c.n + ' ' + c.name + ' \u2014 reach ' + fmt(Engine.INFINITY_LOG);
  }

  function updatePrestigeTab(root) {
    var pending = root.querySelector('#prestige-pending span:last-child');
    if (pending) pending.textContent = pendingPrestigeText();
    var btn = root.querySelector('#prestige-btn');
    if (btn) btn.disabled = !Engine.canPrestige(state);

    var infinityBtn = root.querySelector('#prestige-infinity-btn');
    var wantInfinityBtn = state.inf.broken && Engine.canInfinity(state);
    if (wantInfinityBtn !== !!infinityBtn) {
      markDirty(); // insert/remove the Go Infinite button
    } else if (infinityBtn) {
      infinityBtn.textContent = 'Go Infinite (+' + fmt(Engine.ipGainLog(state)) + ' IP)';
    }

    var banner = root.querySelector('#ic-banner');
    var wantBanner = !!state.inf.ic.active;
    if (wantBanner !== !!banner) {
      markDirty();
    } else if (banner) {
      banner.textContent = icBannerText();
    }

    var ipBarRow = root.querySelector('#ip-bar-row');
    if (state.inf.broken !== !!ipBarRow) {
      markDirty();
    } else if (ipBarRow) {
      var label = ipBarRow.querySelector('#ip-bar-label');
      if (label) label.textContent = ipBarText();
      var fill = ipBarRow.querySelector('#ip-bar-fill');
      if (fill) fill.style.width = (ipBarProgress() * 100) + '%';
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
    wrap.appendChild(el('div', { id: 'promo-xp', class: 'stat-line', tabindex: '0', 'data-tip': 'promoXp' }, [
      el('span', { class: 'label' }, ['XP available']),
      el('span', {}, [String(Engine.promoXp(state))]),
    ]));

    PROMO_META.forEach(function (meta, k) {
      var level = state.promo[k];
      var xp = Engine.promoXp(state);
      var cur = Engine.promoEffects(state)[meta.key];
      var next = effectAt(k, xp);
      var card = el('div', { class: 'card', 'data-k': String(k), tabindex: '0', 'data-tip': 'promoCard', 'data-tip-i': String(k), 'data-guide': 'promote-card' }, [
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

  function renderInfHistoryRows() {
    var hist = state.stats.lastInfinities;
    if (!hist.length) return [el('p', { class: 'help' }, ['No Infinities yet.'])];
    return hist.slice().reverse().map(function (rec) {
      return statLine(fmtTime(rec.t), '+' + fmt(rec.ipGainLog) + ' IP');
    });
  }

  function renderIcStatsRows() {
    var rows = Engine.CHALLENGES.map(function (c) {
      var best = state.inf.ic.best[c.n - 1];
      return statLine('IC' + c.n + ' ' + c.name, best === null ? '—' : fmtTime(best));
    });
    if (Engine.icDoneCount(state) === 9) {
      var sum = state.inf.ic.best.reduce(function (a, b) { return a + b; }, 0);
      rows.push(statLine('ΣIC', fmtTime(sum)));
    }
    return rows;
  }

  function renderStatsTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Stats']));
    var list = el('div', { id: 'stats-list', class: 'kv-list' }, [
      statLine('Play time', fmtTime(state.stats.playTime)),
      statLine('Total laps', String(state.stats.totalLaps)),
      statLine('Best score', fmt(state.stats.bestScoreLog)),
      statLine('Prestiges', String(state.stats.prestiges)),
      statLine('Promotions', String(state.stats.promotions)),
      statLine('Infinities', fmtInf(state.infinities)),
      statLine('Total IP', fmt(state.stats.totalIpLog)),
      statLine('Fastest Infinity', state.stats.fastestInfinity === null ? '—' : fmtTime(state.stats.fastestInfinity)),
    ]);
    wrap.appendChild(list);

    wrap.appendChild(el('h2', { class: 'section-title' }, ['Last Infinities']));
    wrap.appendChild(el('div', { id: 'inf-history', class: 'kv-list' }, renderInfHistoryRows()));

    wrap.appendChild(el('h2', { class: 'section-title' }, ['Infinity Challenges']));
    wrap.appendChild(el('div', { id: 'ic-stats-list', class: 'kv-list' }, renderIcStatsRows()));

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
      fmtInf(state.infinities),
      fmt(state.stats.totalIpLog),
      state.stats.fastestInfinity === null ? '—' : fmtTime(state.stats.fastestInfinity),
    ];
    for (var i = 0; i < rows.length; i++) {
      var span = rows[i].querySelector('span:last-child');
      if (span) span.textContent = values[i];
    }
    var histWrap = root.querySelector('#inf-history');
    if (histWrap) {
      histWrap.innerHTML = '';
      renderInfHistoryRows().forEach(function (r) { histWrap.appendChild(r); });
    }
    var icWrap = root.querySelector('#ic-stats-list');
    if (icWrap) {
      icWrap.innerHTML = '';
      renderIcStatsRows().forEach(function (r) { icWrap.appendChild(r); });
    }
  }

  // ---------- settings tab ----------

  function renderSettingsTab(root) {
    var wrap = el('div', { class: 'tab-body-inner' });
    wrap.appendChild(el('h2', { class: 'section-title' }, ['Settings']));

    wrap.appendChild(el('div', { class: 'row' }, [
      el('button', {
        id: 'confirm-inf-toggle',
        class: 'btn toggle',
        'aria-pressed': String(state.inf.auto.confirmInfinity),
        'data-tip': 'confirmInfinity',
        tabindex: '0',
        onclick: function () {
          state.inf.auto.confirmInfinity = !state.inf.auto.confirmInfinity;
          save();
          markDirty();
        },
      }, ['Confirm each Infinity: ' + (state.inf.auto.confirmInfinity ? 'On' : 'Off')]),
    ]));

    if (window.Guide) {
      wrap.appendChild(el('h2', { class: 'section-title' }, ['Guidance']));
      wrap.appendChild(el('div', { class: 'row' }, [
        el('button', {
          id: 'guide-toggle',
          class: 'btn toggle',
          'aria-pressed': String(window.Guide.isEnabled()),
          onclick: function () {
            window.Guide.setEnabled(!window.Guide.isEnabled());
            markDirty();
          },
        }, ['Show guidance: ' + (window.Guide.isEnabled() ? 'On' : 'Off')]),
        el('button', {
          class: 'btn',
          onclick: function () { window.Guide.restartTutorial(); },
        }, ['Restart tutorial']),
      ]));
    }

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
      if (catchingUp) { toast('Catching up…'); return; }
      try {
        var loaded = Engine.deserialize(importArea.value.trim());
        state = loaded;
        syncKnown();
        // The imported save may be less advanced than the current goal
        // progress claims (GuideGoals.sync is monotonic and never
        // unmarks), so rebuild guidance progress from scratch against it.
        if (window.Guide) window.Guide.reset();
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
      if (catchingUp) { toast('Catching up…'); return; }
      state = Engine.newState();
      syncKnown();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      if (window.Guide) window.Guide.reset();
      markDirty();
      toast('Progress reset');
      location.hash = '#circles';
    });
    wrap.appendChild(resetBtn);

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function updateSettingsTab(root) {
    var btn = root.querySelector('#confirm-inf-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(state.inf.auto.confirmInfinity));
      btn.textContent = 'Confirm each Infinity: ' + (state.inf.auto.confirmInfinity ? 'On' : 'Off');
    }
    var guideBtn = root.querySelector('#guide-toggle');
    if (guideBtn && window.Guide) {
      guideBtn.setAttribute('aria-pressed', String(window.Guide.isEnabled()));
      guideBtn.textContent = 'Show guidance: ' + (window.Guide.isEnabled() ? 'On' : 'Off');
    }
  }

  // ---------- tab dispatch ----------

  var TAB_RENDER = {
    circles: renderCirclesTab,
    prestige: renderPrestigeTab,
    promote: renderPromoteTab,
    infinity: function (root) { if (window.InfinityUI) window.InfinityUI.render(root, state, kit); },
    stats: renderStatsTab,
    settings: renderSettingsTab,
  };

  var TAB_UPDATE = {
    circles: updateCirclesTab,
    prestige: updatePrestigeTab,
    promote: updatePromoteTab,
    infinity: function (root) { if (window.InfinityUI) window.InfinityUI.update(root, state, kit); },
    stats: updateStatsTab,
    settings: updateSettingsTab,
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
    if (e.key === '?' || e.key === 'h' || e.key === 'H') {
      if (window.Guide) window.Guide.openGuide();
      else if (Help) Help.showIntro();
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

  // Real Infinities are detected by the stats.lastInfinities entry
  // goInfinite pushes (a new object each time), not by the Infinity count,
  // which passive Infinities (18;1) raise fractionally every tick. IC
  // completions are detected by diffing ic.done. syncKnown() adopts the
  // current state without toasting (boot, import, reset, catch-up — the
  // offline summary lists what happened while away).
  var lastKnownInfEntry = null;
  var lastKnownIcDone = [];

  function lastInfEntry() {
    var h = state.stats.lastInfinities;
    return h.length ? h[h.length - 1] : null;
  }

  function syncKnown() {
    lastKnownInfEntry = lastInfEntry();
    lastKnownIcDone = state.inf.ic.done.slice();
  }

  // The modal is shown only while an Infinity can actually be confirmed; if
  // that stops being true (the score dropped below the cap) it is closed.
  function checkInfinity() {
    var can = Engine.canInfinity(state);
    if (els.infinityBtn) els.infinityBtn.style.display = can ? '' : 'none';
    var pending = state.inf.pendingConfirm && can;
    if (pending && !modalOpen) {
      showInfinityModal();
    } else if (!pending && modalOpen === 'infinity') {
      hideModal();
    }
  }

  // Fires for both the automatic path (postTick calls goInfinite directly,
  // with no modal) and the confirmed path (the modal's button calls
  // goInfinite then hides itself) — either way, by the next domUpdate the
  // count is up and no modal is open, which is exactly the condition the
  // brief specifies.
  function checkInfinityToast() {
    if (modalOpen) return;
    var msgs = [];
    var last = lastInfEntry();
    if (last && last !== lastKnownInfEntry) {
      msgs.push('Infinity! +' + fmt(last.ipGainLog) + ' IP (∞ ' + fmtInf(state.infinities) + ')');
    }
    var done = state.inf.ic.done;
    for (var i = 0; i < done.length; i++) {
      if (done[i] && !lastKnownIcDone[i]) msgs.push('Challenge ' + (i + 1) + ' completed');
    }
    if (msgs.length) toast(msgs.join(' \u00B7 '));
    syncKnown();
  }

  function updateIcCanvasBanner() {
    if (!els.icBanner) return;
    var n = state.inf.ic.active;
    if (!n) { els.icBanner.style.display = 'none'; return; }
    var c = Engine.CHALLENGES[n - 1];
    els.icBanner.textContent = 'IC' + n + ' ' + (c ? c.name : '');
    els.icBanner.style.display = '';
  }

  function checkFinale() {
    if (modalOpen) return;
    if (state.inf.ipLog >= Engine.INFINITY_LOG && !state.inf.finaleSeen) {
      showFinaleModal();
    }
  }

  // ---------- catch-up (offline / hidden-tab, non-blocking) ----------
  //
  // Per the Task 11 controller ruling: offline and hidden-tab catch-up use
  // Engine's DEFAULT step (no dtMin override, unlike the brief's original
  // dtMin:0.5) and run across animation frames in chunks sized to keep each
  // frame around 30–50ms, rather than blocking on one huge Engine.simulate
  // call. A "Catching up…" overlay tracks progress; the main loop is paused
  // (rAF cancelled) until it finishes, then savedAt/save() run exactly once,
  // matching the double-count protection the unchunked path used to get for
  // free from running before the loop ever started.

  var catchingUp = false;
  var CATCHUP_INITIAL_CHUNK = 300; // seconds of sim time per frame, to start
  var CATCHUP_TARGET_MS = 40; // aim for the middle of the 30–50ms band

  // The real-world instant `state` has actually been simulated up through,
  // mid-catch-up. Checkpointed every chunk so that if the page is hidden (or
  // closed) before catch-up finishes, the hidden-tab save below can stamp
  // this instead of "now" — otherwise the un-simulated remainder between
  // this checkpoint and "now" would be silently dropped on the next load
  // (savedAt=now would claim the gap was already accounted for).
  var catchupCheckpointMs = null;

  function showCatchupOverlay() {
    modalOpen = 'catchup';
    var panel = el('div', { class: 'modal-panel', role: 'status', 'aria-live': 'polite' }, [
      el('h2', { class: 'modal-title' }, ['Catching up…']),
      el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-fill', id: 'catchup-fill' }),
      ]),
      el('p', { class: 'help', id: 'catchup-pct' }, ['Catching up… 0%']),
    ]);
    showModal(panel);
  }

  function updateCatchupOverlay(pct) {
    pct = Math.max(0, Math.min(100, pct));
    var fill = els.modal.querySelector('#catchup-fill');
    var label = els.modal.querySelector('#catchup-pct');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = 'Catching up… ' + Math.floor(pct) + '%';
  }

  // Runs `seconds` of simulated time in non-blocking chunks, then calls
  // `cb(info)` with the aggregated deltas. Guarded against overlap: a second
  // call (e.g. a visibilitychange firing mid-catch-up) is dropped rather than
  // racing the first.
  function runCatchup(seconds, cb) {
    if (catchingUp || seconds <= 0) return;
    catchingUp = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // The overlay borrows the modal slot; whatever modal was open (Infinity,
    // finale, intro, an unread offline summary) is put back afterwards
    // instead of being silently closed.
    var prevModal = modalOpen && els.modal.firstChild ? { kind: modalOpen, node: els.modal.firstChild } : null;
    showCatchupOverlay();

    var total = seconds;
    var remaining = seconds;
    var chunk = Math.min(remaining, CATCHUP_INITIAL_CHUNK);
    var before = state.scoreLog;
    // state.savedAt right now is the real instant this catch-up's simulated
    // time starts counting from (0 s simulated so far).
    var startMs = state.savedAt;
    catchupCheckpointMs = startMs;
    var aggIpLog = -Infinity;
    var aggInf = 0;
    var icSeen = {};

    function step() {
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      var thisChunk = Math.min(chunk, remaining);
      var res = Engine.simulate(state, thisChunk);
      var elapsed = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
      remaining -= thisChunk;

      if (res.ipGainedLog !== -Infinity) {
        aggIpLog = aggIpLog === -Infinity ? res.ipGainedLog : Engine.logAdd(aggIpLog, res.ipGainedLog);
      }
      aggInf += res.infinitiesGained;
      res.icCompleted.forEach(function (n) { icSeen[n] = true; });

      catchupCheckpointMs = startMs + (total - remaining) * 1000;
      updateCatchupOverlay(((total - remaining) / total) * 100);

      // Adapt the chunk size toward the target frame time so a fast device
      // covers more sim-seconds per frame and a slow one backs off.
      if (elapsed < CATCHUP_TARGET_MS * 0.75 && remaining > 0) {
        chunk = chunk * 1.5;
      } else if (elapsed > CATCHUP_TARGET_MS * 1.25) {
        chunk = Math.max(1, chunk * 0.5);
      }

      if (remaining > 1e-6) {
        requestAnimationFrame(step);
      } else {
        finish();
      }
    }

    function finish() {
      catchingUp = false;
      catchupCheckpointMs = null;
      hideModal();
      if (prevModal) {
        showModal(prevModal.node);
        modalOpen = prevModal.kind;
      }
      state.savedAt = Date.now();
      save();
      markDirty();
      syncKnown();
      var icCompleted = Object.keys(icSeen).map(Number).sort(function (a, b) { return a - b; });
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
      cb({
        seconds: total,
        before: before,
        after: state.scoreLog,
        ipGainedLog: aggIpLog,
        infinitiesGained: aggInf,
        icCompleted: icCompleted,
      });
    }

    requestAnimationFrame(step);
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

  // An offline summary never replaces an open modal: it waits until the
  // modal is closed and is shown on the next DOM update.
  var queuedOffline = null;

  function showOrQueueOfflineModal(info) {
    if (modalOpen) queuedOffline = info;
    else showOfflineModal(info);
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
    if (queuedOffline && !modalOpen) {
      var q = queuedOffline;
      queuedOffline = null;
      showOfflineModal(q);
    }
    checkInfinity();
    checkInfinityToast();
    checkFinale();
    updateIcCanvasBanner();
    if (Help) {
      Help.onTick(state);
      Help.refresh();
    }
    if (window.Guide) window.Guide.tick(state);
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

    if (els.score) {
      els.score.setAttribute('tabindex', '0');
      els.score.setAttribute('data-tip', 'score');
    }
    if (els.income) {
      els.income.setAttribute('tabindex', '0');
      els.income.setAttribute('data-tip', 'income');
    }

    // The multbar holds a scrollable chip strip plus a fixed "?" help button
    // at the right end, so the button never scrolls out of view.
    els.multbar.innerHTML = '';
    els.multbarChips = el('div', { class: 'multbar-chips' });
    els.helpBtn = el('button', {
      class: 'help-btn',
      'aria-label': 'How to play',
      'data-tip': 'helpBtn',
      onclick: function () { if (window.Guide) window.Guide.openGuide(); else if (Help) Help.showIntro(); },
    }, ['?']);
    els.multbar.appendChild(els.multbarChips);
    els.multbar.appendChild(els.helpBtn);

    els.icBanner = el('div', { id: 'ic-canvas-banner', 'aria-hidden': 'true' });
    els.icBanner.style.display = 'none';
    if (els.stage) els.stage.appendChild(els.icBanner);

    els.scorebox = document.getElementById('scorebox');
    if (els.scorebox) els.scorebox.setAttribute('data-guide', 'score-box');
    els.infinityBtn = el('button', {
      id: 'infinity-btn',
      class: 'btn primary',
      style: 'display:none',
      'data-tip': 'goInfinite',
      onclick: doGoInfinite,
    }, ['Go Infinite']);
    if (els.scorebox) els.scorebox.appendChild(els.infinityBtn);
  }

  function init(offlineInfo, hadSave) {
    initDom();

    if (Help) {
      Help.init({
        toast: toast,
        isModalOpen: function () { return modalOpen; },
        showModal: function (node) { modalOpen = 'intro'; showModal(node); },
        hideModal: hideModal,
        getState: function () { return state; },
      });
    }

    if (window.Guide) {
      window.Guide.init({
        el: el,
        toast: toast,
        isModalOpen: function () { return modalOpen; },
        showModal: function (node) { modalOpen = 'guide'; showModal(node); },
        hideModal: hideModal,
        getState: function () { return state; },
        setTab: function (id) {
          if (currentTab !== id) location.hash = '#' + id;
          else markDirty();
        },
        isCatchingUp: function () { return catchingUp; },
        hadSave: hadSave,
      });
    }

    if (window.Renderer && typeof window.Renderer.create === 'function') {
      renderer = window.Renderer.create(canvas);
    }
    window.addEventListener('resize', function () {
      if (renderer) renderer.resize();
    });

    initCanvasHover();

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', syncFromHash);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (catchingUp && catchupCheckpointMs !== null) {
          // Mid-catch-up, `state` only reflects progress up through
          // catchupCheckpointMs, not "now" — stamping savedAt=now (what
          // save() does) would claim the un-simulated remainder never
          // happened, silently dropping it. Checkpoint to the true
          // simulated-until instant instead, so a reload resumes exactly
          // the remainder.
          try {
            state.savedAt = catchupCheckpointMs;
            localStorage.setItem(SAVE_KEY, Engine.serialize(state));
          } catch (e) { /* ignore: game must run without localStorage */ }
        } else {
          save();
        }
      } else {
        // Defensive guard: if savedAt is invalid (0 or unset), it means this
        // state was never properly initialized (e.g. opened in a background tab
        // before any regular visibility cycle). Avoid granting free offline time
        // by treating it as a fresh state, and skip catch-up.
        if (!(state.savedAt > 0)) {
          state.savedAt = Date.now();
        } else {
          var hiddenSec = Math.min((Date.now() - state.savedAt) / 1000, OFFLINE_CAP_SEC);
          if (catchingUp || hiddenSec < 1) {
            // Under a second (a quick tab flick): nothing worth catching up.
          } else if (hiddenSec <= 10) {
            // A short hide is simulated in one go without the overlay, so it
            // never flashes over (or closes) an open modal; no summary.
            Engine.simulate(state, hiddenSec);
            state.savedAt = Date.now();
            save();
            markDirty();
          } else {
            runCatchup(hiddenSec, showOrQueueOfflineModal);
          }
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

    lastFrame = 0;
    lastDomUpdate = 0;
    lastAutosave = performance.now();
    syncKnown();

    if (offlineInfo && offlineInfo.seconds > 0) {
      // runCatchup pauses/resumes the rAF loop itself and calls save() once
      // catch-up finishes, so the loop is intentionally not started here.
      runCatchup(offlineInfo.seconds, showOrQueueOfflineModal);
    } else {
      if (Help) Help.maybeShowIntroOnBoot(hadSave);
      rafId = requestAnimationFrame(frame);
    }
  }

  // ---------- canvas ring hover ----------

  var canvasLongPressTimer = null;

  function canvasTipText(i) {
    var c = state.circles[i];
    var def = Engine.CIRCLES[i];
    var cap = Engine.levelCap(c);
    var lps = Engine.lapsPerSec(state, i);
    return def.name + ' · Lv ' + c.level + '/' + cap + ' · ' + lps.toFixed(2) + ' laps/s · ×' + fmt(c.multLog);
  }

  function handleCanvasPoint(clientX, clientY) {
    if (!renderer || !canvas || typeof renderer.hitTest !== 'function') return;
    var rect = canvas.getBoundingClientRect();
    var i = renderer.hitTest(clientX - rect.left, clientY - rect.top, state);
    if (i === -1) {
      if (Help) Help.hide();
      return;
    }
    if (Help) Help.showAt(clientX, clientY, function () { return canvasTipText(i); });
  }

  function initCanvasHover() {
    if (!canvas) return;
    canvas.addEventListener('mousemove', function (e) {
      handleCanvasPoint(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', function () {
      if (Help) Help.hide();
    });
    canvas.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      var touch = e.touches[0];
      var x = touch.clientX;
      var y = touch.clientY;
      clearTimeout(canvasLongPressTimer);
      canvasLongPressTimer = setTimeout(function () {
        handleCanvasPoint(x, y);
      }, 450);
    }, { passive: true });
    canvas.addEventListener('touchmove', function () {
      clearTimeout(canvasLongPressTimer);
    }, { passive: true });
    canvas.addEventListener('touchend', function () {
      clearTimeout(canvasLongPressTimer);
    }, { passive: true });
  }

  function start(data) {
    state = null;

    if (data && data.save) {
      try { state = Engine.deserialize(data.save); } catch (e) { state = null; }
    }
    if (!state) {
      state = loadFromLocalStorage();
    }

    var hadSave = !!state;

    // The actual simulate() call is deferred to init()'s non-blocking
    // runCatchup, not run here: this must stay a fast, synchronous boot path
    // (see the Task 11 controller ruling). savedAt/save() likewise happen
    // once catch-up finishes, not here, to avoid double-counting the gap.
    var offlineInfo = null;
    if (state && state.savedAt) {
      var offlineSec = Math.min((Date.now() - state.savedAt) / 1000, OFFLINE_CAP_SEC);
      if (offlineSec > 10) {
        offlineInfo = { seconds: offlineSec };
      }
    }

    if (!state) {
      state = Engine.newState();
      // A fresh state with no prior save must have a valid savedAt so that
      // future visibilitychange events can correctly compute elapsed time.
      state.savedAt = Date.now();
    }

    init(offlineInfo, hadSave);
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

// src/help.js — hover tooltips, first-run intro modal, and one-time unlock
// tips. Only calls the Shared Engine API on window.Engine; reaches into
// ui.js only through the hooks passed to Help.init().
(function () {
  'use strict';

  var HELP_KEY = 'revidle.help.v1';
  var LONGPRESS_MS = 450;
  var TIP_MARGIN = 8;
  var TIP_MAX_WIDTH = 260;

  var Engine = window.Engine;

  // ---------- hooks (wired by ui.js via Help.init) ----------

  var hooks = {
    toast: function () {},
    isModalOpen: function () { return null; },
    showModal: function () {},
    hideModal: function () {},
    getState: function () { return null; },
  };

  function init(h) {
    if (h) {
      for (var k in h) {
        if (Object.prototype.hasOwnProperty.call(h, k)) hooks[k] = h[k];
      }
    }
    seen = loadSeen();
  }

  // ---------- persisted "seen" flags ----------

  var seen = {};

  function loadSeen() {
    try {
      var raw = localStorage.getItem(HELP_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') return obj;
      }
    } catch (e) { /* ignore: help state is best-effort */ }
    return {};
  }

  function saveSeen() {
    try {
      localStorage.setItem(HELP_KEY, JSON.stringify(seen));
    } catch (e) { /* ignore */ }
  }

  function markSeen(key) {
    if (seen[key]) return false;
    seen[key] = true;
    saveSeen();
    return true;
  }

  // ---------- small helpers ----------

  function fmt(x) {
    return Engine.fmtLog(x);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') node.className = attrs[k];
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

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  // ---------- tooltip copy ----------
  // Every entry is either a plain string, or a function(state, i) returning a
  // string. Live numbers always go through Engine helpers — never hardcode
  // tuned values here.

  var TIPS = {
    score: 'Your total score. Each lap around a ring multiplies your score by that ring’s ×mult, then by every other unlocked ring’s mult.',
    income: function (s) {
      return 'Score gained per second: score per lap × total laps/s across every unlocked ring. Right now that’s ' + fmt(Engine.incomeLog(s)) + '/s.';
    },
    buyMode: 'Choose how many levels a Buy click purchases: ×1, ×10, or Max (as many as you can afford). Key: M.',

    circleChip: function (s, i) {
      var def = Engine.CIRCLES[i];
      var c = s.circles[i];
      var p = Engine.promoEffects(s);
      var gainLog = c.multGainLog + Math.log10(p.p1);
      return def.name + ' ×' + fmt(c.multLog) + ' — grows +' + fmt(gainLog) + ' each ' + def.name + ' lap. All ring mults multiply together into your score per lap.';
    },
    pMultChip: function (s) {
      return 'P.Mult — your Prestige multiplier. It multiplies alongside every ring’s ×mult into your score per lap. Currently ×' + fmt(Math.log10(s.pMult)) + '.';
    },
    pExpChip: function (s) {
      return 'P.Exp — the exponent applied to (Π ring mults × P.Mult). Small increases compound fast. Currently ^' + s.pExp.toFixed(3) + '.';
    },

    circleLevel: function (s, i) {
      var c = s.circles[i];
      var cap = Engine.levelCap(c);
      return 'Level ' + c.level + ' of ' + cap + '. Cap = 100 + 10 × ascensions. At the cap you can Ascend this ring.';
    },
    circleLps: function (s, i) {
      var lps = Engine.lapsPerSec(s, i);
      return lps.toFixed(2) + ' laps per second — level × base speed × the Lap Speed promotion.';
    },
    circleGain: function (s, i) {
      var c = s.circles[i];
      var p = Engine.promoEffects(s);
      var gainLog = c.multGainLog + Math.log10(p.p1);
      return 'Each lap of this ring adds +' + fmt(gainLog) + ' to its ×mult.';
    },
    buyBtn: function (s, i) {
      var costLog = Engine.costLog(s, i);
      return 'Buy levels for this ring. Cost: ' + fmt(costLog) + ' score. ×10/Max buy as many as you can afford, up to that count. Key: ' + (i === 9 ? '0' : String(i + 1)) + '.';
    },
    ascendBtn: function (s, i) {
      var p = Engine.promoEffects(s);
      return 'Ascend: resets this ring to level 5 in exchange for ×' + p.p3.toFixed(2) + ' more mult gain per lap (kept), +10 level cap, and +0.1 cost multiplier.';
    },
    lockedRow: 'Locked. Unlocks once you buy 5 levels of the previous ring.',

    prestigeCurrent: function (s) {
      return 'Your current permanent boost from prestiging: ×' + fmt(Math.log10(s.pMult)) + ' P.Mult, ^' + s.pExp.toFixed(3) + ' P.Exp.';
    },
    prestigePending: function (s) {
      var g = Engine.pendingPrestige(s);
      return 'What you’d gain by prestiging right now: ×' + fmt(Math.log10(g.pMult)) + ' P.Mult, ^' + g.pExp.toFixed(3) + ' P.Exp. Prestiging resets your rings but keeps P.Mult, P.Exp, and promotions.';
    },
    prestigeReq: function (s) {
      var reqLog = Math.max(Engine.TUNE.prestigeMinLog, s.prestigeReqLog);
      return 'You need score ≥ ' + fmt(reqLog) + ' to prestige. The requirement rises each time you prestige.';
    },

    promoXp: function (s) {
      return 'Promotion XP, earned once P.Mult reaches ' + fmt(Math.log10(Engine.TUNE.promoMin)) + ': floor((P.Mult / ' + fmt(Math.log10(Engine.TUNE.promoMin)) + ') ^ ' + Engine.TUNE.promoPow + '). Spend it on a card below — promoting resets your rings and P.Mult/P.Exp.';
    },
    promoCard: function (s, k) {
      var names = ['Mult Gain', 'Lap Speed', 'Ascension Power', 'Promotion Power'];
      var about = [
        'boosts how much ×mult every lap earns.',
        'boosts every ring’s laps per second.',
        'boosts the mult gain kept from Ascending.',
        'boosts the other three promotions.',
      ];
      return names[k] + ' — ' + about[k] + ' Promotion Power boosts the other three.';
    },

    goInfinite: function (s) {
      return 'Go Infinite: gain +' + fmt(Engine.ipGainLog(s)) + ' IP and +' + Engine.infGain(s)
        + ' Infinity, then restart the Revolution stage. Upgrades, generators and IP are kept.';
    },

    helpBtn: 'How to play (key: ? or H).',

    // ---- ∞ tab (Task 11) ----

    ipHeader: function (s) {
      return 'Infinity Points — earned each time you go Infinite. Next Infinity gives +'
        + fmt(Engine.ipGainLog(s)) + ' IP. Spend IP on the Tree, Generators and Stars.';
    },
    infCount: function (s) {
      return 'Infinities performed: ' + fmtInf(s.infinities) + '. Several upgrades grow stronger with more Infinities.';
    },
    iuCard: function (s, i) {
      var u = Engine.UPGRADES[i];
      if (!u) return '';
      var owned = Engine.hasUpg(s, u.id);
      var effect = Engine.upgEffect(s, u.id);
      var status;
      if (owned) {
        status = effect === null ? 'Owned.' : 'Owned — currently ×' + fmtEffect(effect) + '.';
      } else if (u.req === 'prev') {
        status = 'Requires an earlier column’s upgrade.';
      } else {
        status = 'Requires ' + u.req.join(' or ') + '.';
      }
      var descText = u.desc.charAt(u.desc.length - 1) === '.' ? u.desc : (u.desc + '.');
      return u.name + ' — ' + descText + ' Cost ' + fmt(Math.log10(u.cost)) + ' IP. ' + status;
    },
    gpLine: function (s) {
      return 'Generator Power multiplies every ring’s mult gain per lap by GP^' + Engine.gpExp(s).toFixed(3)
        + '. It resets each Infinity, so runs speed up as they go.';
    },
    genRow: function (s, k) {
      var n = k + 1;
      var g = s.inf.gens[k];
      var target = n === 1 ? 'GP' : ('G' + (n - 1));
      return 'G' + n + ': you have ' + fmt(g.aLog) + ' (' + g.b + ' bought). Each makes ×'
        + fmt(Engine.genMultLog(s, k)) + ' ' + target + ' per second. Every purchase doubles its output.';
    },
    genBuy: function (s, k) {
      var n = k + 1;
      return 'Buy another G' + n + ' for ' + fmt(Engine.genCostLog(s, k))
        + ' IP. Bought generators are kept through Infinity; produced ones are not.';
    },
    gpChip: function (s) {
      return 'Generator Power boost to mult gain: ×' + fmt(Engine.gpMultLog(s)) + '.';
    },
  };

  // Formats a plain (non-log) multiplier/value for tooltip copy.
  function fmtEffect(x) {
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    var abs = Math.abs(x);
    if (abs >= 1000 || abs < 0.001) return x.toExponential(2);
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(abs < 10 ? 3 : 2);
  }

  // Formats a plain (non-log) count such as state.infinities: usually an
  // integer, but passive-Infinity upgrades (18;1) can make it fractional.
  function fmtInf(n) {
    var frac = Math.abs(n - Math.round(n)) > 1e-9;
    try {
      return n.toLocaleString('en-US', frac ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    } catch (e) {
      return String(n);
    }
  }

  function textForKey(key, i) {
    var entry = TIPS[key];
    if (entry === undefined) return '';
    if (typeof entry === 'function') {
      var s = hooks.getState();
      if (!s) return '';
      return entry(s, i);
    }
    return entry;
  }

  // ---------- tooltip component ----------

  var tipNode = null;
  var mode = null; // 'element' | 'point' | null
  var activeTarget = null;
  var activePoint = null; // { x, y } viewport coords
  var activeTextFn = null;
  var longPressTimer = null;
  var longPressTarget = null;
  var suppressNextClickOn = null;

  function ensureTipNode() {
    if (tipNode) return tipNode;
    tipNode = document.createElement('div');
    tipNode.id = 'tip';
    tipNode.setAttribute('role', 'tooltip');
    tipNode.hidden = true;
    document.body.appendChild(tipNode);
    return tipNode;
  }

  function findTipTarget(node) {
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.tipFn || (node.hasAttribute && node.hasAttribute('data-tip'))) return node;
      node = node.parentNode;
    }
    return null;
  }

  function textForElement(target) {
    if (typeof target.tipFn === 'function') return target.tipFn();
    var key = target.getAttribute('data-tip');
    var iAttr = target.getAttribute('data-tip-i');
    var i = iAttr === null ? undefined : Number(iAttr);
    return textForKey(key, i);
  }

  function positionAt(x, y) {
    var tip = ensureTipNode();
    var margin = TIP_MARGIN;
    var rect = tip.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var left = x - rect.width / 2;
    var top = y - rect.height - 10;
    var flipped = false;
    if (top < margin) {
      top = y + 18;
      flipped = true;
    }
    if (left < margin) left = margin;
    if (left + rect.width > vw - margin) left = vw - margin - rect.width;
    if (top + rect.height > vh - margin) top = vh - margin - rect.height;
    if (top < margin) top = margin;

    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.classList.toggle('below', flipped);
  }

  function positionForTarget(target) {
    var r = target.getBoundingClientRect();
    positionAt(r.left + r.width / 2, r.top);
  }

  function renderTip() {
    // A dirty re-render (ui.js rebuilds a tab body with innerHTML = '') can
    // detach the element a tooltip is anchored to without ever firing
    // mouseout/blur on it. Detect that here rather than positioning against
    // a detached node's zero rect (which would otherwise pin the tooltip to
    // the viewport corner and leave it stuck open indefinitely).
    if (mode === 'element' && activeTarget && !activeTarget.isConnected) {
      hide();
      return;
    }

    var tip = ensureTipNode();
    var text = activeTextFn ? activeTextFn() : '';
    if (!text) {
      hide();
      return;
    }
    tip.textContent = text;
    tip.style.maxWidth = TIP_MAX_WIDTH + 'px';
    var wasHidden = tip.hidden;
    tip.hidden = false;
    if (mode === 'element') {
      positionForTarget(activeTarget);
    } else if (mode === 'point' && activePoint) {
      positionAt(activePoint.x, activePoint.y);
    }
    if (wasHidden && !prefersReducedMotion()) {
      tip.classList.remove('show');
      // Force reflow so the fade-in transition restarts on rapid re-shows.
      // eslint-disable-next-line no-unused-expressions
      tip.offsetWidth;
      tip.classList.add('show');
    } else {
      tip.classList.add('show');
    }
  }

  function showElement(target) {
    if (activeTarget === target && mode === 'element') return;
    mode = 'element';
    activeTarget = target;
    activePoint = null;
    activeTextFn = function () { return textForElement(target); };
    var tip = ensureTipNode();
    target.setAttribute('aria-describedby', tip.id);
    renderTip();
  }

  function showAt(x, y, textFn) {
    mode = 'point';
    activePoint = { x: x, y: y };
    activeTarget = null;
    activeTextFn = textFn;
    renderTip();
  }

  function hide() {
    if (activeTarget && activeTarget.getAttribute('aria-describedby') === (tipNode && tipNode.id)) {
      activeTarget.removeAttribute('aria-describedby');
    }
    mode = null;
    activeTarget = null;
    activePoint = null;
    activeTextFn = null;
    if (tipNode) {
      tipNode.classList.remove('show');
      tipNode.hidden = true;
    }
  }

  function refresh() {
    if (!mode) return;
    renderTip();
  }

  // ---------- delegated hover/focus wiring ----------

  document.addEventListener('mouseover', function (e) {
    var t = findTipTarget(e.target);
    if (t) showElement(t);
  }, true);

  document.addEventListener('mouseout', function (e) {
    var t = findTipTarget(e.target);
    if (!t) return;
    var related = e.relatedTarget;
    if (related && t.contains(related)) return;
    if (activeTarget === t) hide();
  }, true);

  document.addEventListener('focusin', function (e) {
    var t = findTipTarget(e.target);
    if (t) showElement(t);
  });

  document.addEventListener('focusout', function (e) {
    var t = findTipTarget(e.target);
    if (t && activeTarget === t) hide();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mode) hide();
  });

  window.addEventListener('scroll', function () {
    if (mode) hide();
  }, true);

  // ---------- touch: long-press to show, next tap to hide ----------

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTarget = null;
  }

  document.addEventListener('touchstart', function (e) {
    if (mode) {
      // A tap while a tip is already showing closes it, and must not act on
      // whatever it landed on.
      var closing = e.target;
      hide();
      suppressNextClickOn = closing;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var t = findTipTarget(e.target);
    if (!t) return;
    clearLongPress();
    longPressTarget = t;
    longPressTimer = setTimeout(function () {
      if (longPressTarget === t) {
        showElement(t);
        suppressNextClickOn = t;
      }
      longPressTimer = null;
    }, LONGPRESS_MS);
  }, { passive: false });

  document.addEventListener('touchmove', clearLongPress, { passive: true });
  document.addEventListener('touchend', function () {
    clearLongPress();
  }, { passive: true });
  document.addEventListener('touchcancel', clearLongPress, { passive: true });

  document.addEventListener('click', function (e) {
    if (suppressNextClickOn) {
      var target = suppressNextClickOn;
      suppressNextClickOn = null;
      if (target === e.target || (target.contains && target.contains(e.target))) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  // ---------- intro modal ----------

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
    var panel = el('div', { class: 'modal-panel' }, [
      el('h2', { class: 'modal-title' }, ['How to play']),
      beat('#ff3b4f', 'Orbit', 'Every lap of a dot earns score. Faster rings lap more often.'),
      beat('#ffd93b', 'Buy', 'Levels make a ring faster; buying 5 levels of a ring unlocks the next.'),
      beat('#2affc6', 'Multiply', 'Each lap also grows that ring’s ×mult; all mults multiply your score per lap.'),
      beat('#a24dff', 'Reset for power', 'Max a ring to Ascend it. Later, Prestige and Promotions trade progress for permanent boosts. They unlock as you go.'),
      el('div', { class: 'row help-intro-actions' }, [
        el('button', {
          class: 'btn primary',
          id: 'intro-start',
          onclick: function () {
            markSeen('introSeen');
            hooks.hideModal();
          },
        }, ['Start orbiting']),
        el('button', {
          class: 'btn',
          onclick: function () {
            markSeen('introSeen');
            hooks.hideModal();
          },
        }, ['Skip']),
      ]),
    ]);
    hooks.showModal(panel);
    var startBtn = panel.querySelector('#intro-start');
    if (startBtn) startBtn.focus();
  }

  function maybeShowIntroOnBoot(hadSave) {
    if (hadSave) return;
    if (seen.introSeen) return;
    showIntro();
  }

  // ---------- one-time unlock tips ----------

  function onTick(state) {
    if (!state) return;
    for (var i = 0; i < state.circles.length; i++) {
      if (Engine.canAscend(state, i)) {
        if (markSeen('ascendSeen')) {
          hooks.toast('Ascend ready — max-level rings can reset to level 5 for a mult gain boost. Hover the button for details.');
        }
        break;
      }
    }
    if (Engine.canPrestige(state)) {
      if (markSeen('prestigeSeen')) {
        hooks.toast('Prestige ready — reset your rings for a permanent score boost. Hover the Prestige tab for details.');
      }
    }
    if (Engine.promoXp(state) > 0) {
      if (markSeen('promoSeen')) {
        hooks.toast('Promotions ready — spend XP on permanent boosts. Hover a card on the Promote tab for details.');
      }
    }
    if (Engine.canInfinity(state)) {
      if (hooks.isModalOpen() === 'infinity') {
        markSeen('infinitySeen');
      } else if (markSeen('infinitySeen')) {
        hooks.toast('Infinity reached — hover Go Infinite for details.');
      }
    }
    if (state.infinities >= 1) {
      if (markSeen('infTabSeen')) {
        hooks.toast('∞ tab unlocked — spend Infinity Points on upgrades.');
      }
    }
    if (Engine.hasUpg(state, '1;1')) {
      if (markSeen('gensSeen')) {
        hooks.toast('Generators online — they build Generator Power, which boosts every ring’s mult gain.');
      }
    }
    var auto = Engine.autoUnlocked(state);
    if (auto.buy || auto.asc || auto.promote || auto.prestige || auto.infinity) {
      if (markSeen('autoSeen')) {
        hooks.toast('Automation unlocked — configure it in ∞ → Auto.');
      }
    }
  }

  window.Help = {
    init: init,
    showIntro: showIntro,
    maybeShowIntroOnBoot: maybeShowIntroOnBoot,
    onTick: onTick,
    refresh: refresh,
    showAt: showAt,
    hide: hide,
    TIPS: TIPS,
  };
})();

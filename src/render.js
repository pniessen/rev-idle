// src/render.js
// Canvas orbit renderer for Rev Idle. Attaches window.Renderer.
// Consumes Engine.CIRCLES / Engine.lapsPerSec via window.Engine at call time.
(function () {
  'use strict';

  var INK = '#07060d';
  var TWO_PI = Math.PI * 2;
  var MAX_PULSES = 40;
  var PULSE_LIFE = 0.5; // seconds
  var PULSE_COOLDOWN = 0.1; // seconds, per circle
  var FAST_LPS_THRESHOLD = 6;
  var TRAIL_SEGMENTS = 24;

  // Deterministic PRNG (mulberry32) so the starfield is seeded/stable.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var num = parseInt(h, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // Colors are drawn from a small fixed palette (Engine.CIRCLES, ~10 entries).
  // Parse each hex color exactly once and cache the result, keyed by the hex
  // string itself, so no per-frame/per-segment parsing or string building is
  // needed. Shared at module scope so multiple Renderer instances reuse it.
  var glowStopCache = Object.create(null);

  // Precomputed radial-gradient color-stop strings for a given hex color.
  // Gradients need the alpha baked into each stop's color (ctx.globalAlpha
  // applies to the whole fill, not per-stop), so this is the one place we
  // still need rgba() strings — computed once per unique color, then cached.
  function getGlowStops(hex) {
    var cached = glowStopCache[hex];
    if (cached) return cached;
    var c = hexToRgb(hex);
    var head = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',';
    cached = {
      s90: head + '0.9)',
      s35: head + '0.35)',
      s0: head + '0)'
    };
    glowStopCache[hex] = cached;
    return cached;
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d');

    var width = 0; // CSS pixels
    var height = 0;
    var dpr = 1;

    var starCanvas = document.createElement('canvas');
    var starCtx = starCanvas.getContext('2d');

    var time = 0; // accumulated seconds, used for pulsing animations
    var reducedMotion = prefersReducedMotion();

    // Ring-buffer-ish pool of active lap-pulse ripples. Reused array, no per-frame alloc.
    var pulses = []; // { i, r, color, start }
    var lastSpawn = new Array(10).fill(-Infinity);

    function buildStarfield() {
      var w = Math.max(1, Math.floor(width));
      var h = Math.max(1, Math.floor(height));
      starCanvas.width = Math.max(1, Math.floor(w * dpr));
      starCanvas.height = Math.max(1, Math.floor(h * dpr));
      starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starCtx.clearRect(0, 0, w, h);

      var rand = mulberry32(1337);
      var count = Math.round((w * h) / 2600);
      for (var k = 0; k < count; k++) {
        var x = rand() * w;
        var y = rand() * h;
        var r = rand() * 1.1 + 0.2;
        var a = rand() * 0.5 + 0.1;
        starCtx.beginPath();
        starCtx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        starCtx.arc(x, y, r, 0, TWO_PI);
        starCtx.fill();
      }
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      var w = canvas.clientWidth || canvas.width || 1;
      var h = canvas.clientHeight || canvas.height || 1;
      width = w;
      height = h;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStarfield();
    }

    function orbitRadius(i, minWH) {
      var rMax = 0.46 * minWH;
      var rMin = 0.08 * minWH;
      return rMin + (i * (rMax - rMin)) / 9;
    }

    function drawBackground(cx, cy, minWH) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, width, height);

      var vign = ctx.createRadialGradient(cx, cy, minWH * 0.1, cx, cy, minWH * 0.75);
      vign.addColorStop(0, 'rgba(20,16,36,0)');
      vign.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(starCanvas, 0, 0, width, height);
    }

    function drawLockedTrack(cx, cy, r) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    function drawFastRing(cx, cy, r, color) {
      var pulse = reducedMotion ? 0 : Math.sin(time * 4) * 0.6 + 0.6; // 0..1.2
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2 + pulse * 1.4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 + pulse * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    function drawTrackAndDot(cx, cy, r, color, progress, lps) {
      // Track
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();

      var angle = progress * TWO_PI - Math.PI / 2;

      // Comet trail: arc behind the dot. Uses ctx.globalAlpha per segment
      // with the raw hex strokeStyle so no per-segment color string is
      // built or parsed.
      var trailFrac = Math.min(0.9, lps * 0.25);
      if (trailFrac > 0.001) {
        var trailLen = trailFrac * TWO_PI;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (var s = 0; s < TRAIL_SEGMENTS; s++) {
          var t0 = s / TRAIL_SEGMENTS;
          var t1 = (s + 1) / TRAIL_SEGMENTS;
          var a0 = angle - trailLen * t0;
          var a1 = angle - trailLen * t1;
          ctx.globalAlpha = (1 - t1) * 0.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a1, true);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Dot
      var dotR = 4 + Math.min(1, lps / FAST_LPS_THRESHOLD) * 2;
      var dx = cx + r * Math.cos(angle);
      var dy = cy + r * Math.sin(angle);
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    function spawnPulseIfNeeded(i, r, color, lapsCount) {
      if (reducedMotion) return;
      if (!lapsCount || lapsCount <= 0) return;
      if (time - lastSpawn[i] < PULSE_COOLDOWN) return;
      lastSpawn[i] = time;
      if (pulses.length >= MAX_PULSES) {
        pulses.shift();
      }
      pulses.push({ i: i, r: r, color: color, start: time });
    }

    function drawPulses(cx, cy) {
      if (pulses.length === 0) return;
      var kept = [];
      for (var p = 0; p < pulses.length; p++) {
        var pulse = pulses[p];
        var age = time - pulse.start;
        if (age >= PULSE_LIFE) continue;
        var frac = age / PULSE_LIFE;
        var radius = pulse.r + frac * 26;
        ctx.save();
        ctx.globalAlpha = (1 - frac) * 0.55;
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 2 * (1 - frac) + 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
        kept.push(pulse);
      }
      pulses.length = 0;
      for (var k = 0; k < kept.length; k++) pulses.push(kept[k]);
    }

    function drawCoreGlow(cx, cy, minWH, color) {
      var radius = Math.max(10, minWH * 0.07);
      var stops = getGlowStops(color);
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, stops.s90);
      grad.addColorStop(0.4, stops.s35);
      grad.addColorStop(1, stops.s0);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    function draw(state, dt, lapsThisTick) {
      time += dt || 0;
      reducedMotion = prefersReducedMotion();

      var Engine = window.Engine;
      var cx = width / 2;
      var cy = height / 2;
      var minWH = Math.min(width, height);

      drawBackground(cx, cy, minWH);

      var highestColor = '#a24dff';
      var haveUnlocked = false;

      var circles = (state && state.circles) || [];
      var count = Math.min(10, circles.length);

      for (var i = 0; i < count; i++) {
        var circleState = circles[i];
        var r = orbitRadius(i, minWH);

        if (!circleState || !circleState.unlocked) {
          drawLockedTrack(cx, cy, r);
          continue;
        }

        var cfg = (Engine && Engine.CIRCLES && Engine.CIRCLES[i]) || { color: '#ffffff' };
        var color = cfg.color;
        var lps = Engine && typeof Engine.lapsPerSec === 'function' ? Engine.lapsPerSec(state, i) : 0;

        if (lps > FAST_LPS_THRESHOLD) {
          drawFastRing(cx, cy, r, color);
        } else {
          drawTrackAndDot(cx, cy, r, color, circleState.progress || 0, lps);
        }

        var lapsCount = lapsThisTick && lapsThisTick[i];
        spawnPulseIfNeeded(i, r, color, lapsCount);

        highestColor = color;
        haveUnlocked = true;
      }

      drawPulses(cx, cy);
      drawCoreGlow(cx, cy, minWH, haveUnlocked ? highestColor : '#3b2a55');
    }

    resize();

    return { draw: draw, resize: resize };
  }

  window.Renderer = { create: create };
})();

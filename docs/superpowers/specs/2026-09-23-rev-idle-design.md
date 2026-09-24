# Rev Idle — Design Spec (2026-09-23)

A faithful single-file browser clone of the **Revolution stage** of *Revolution Idle* (Oni Gaming), using numbers from https://revolutionidle.wiki.gg/wiki/Revolution. Original code and visuals.

## Scope
In: 10 circles, levels, ascension, prestige, 4 promotions, Infinity finale screen, autosave, export/import, offline progress, stats.
Out (future): Infinity upgrades, generators, challenges, Eternity+, soul shop, automation, leaderboard.

## Mechanics

### Circles
| # | Name | Initial cost | Cost mult | Base lap speed (laps/s per level) |
|---|------|-------------|-----------|------|
| 0 | Red | 4 | 1.20 | 0.200 |
| 1 | Orange | 100 | 1.24 | 0.100 |
| 2 | Yellow | 1e3 | 1.28 | 0.0667 |
| 3 | Green | 1e4 | 1.32 | 0.050 |
| 4 | Turquoise | 1e6 | 1.36 | 0.040 |
| 5 | Cyan | 1e9 | 1.40 | 0.0333 |
| 6 | Blue | 1e12 | 1.44 | 0.0286 |
| 7 | Purple | 1e15 | 1.48 | 0.025 |
| 8 | Pink | 1e18 | 1.52 | 0.0222 |
| 9 | White | 1e27 | 1.56 | 0.020 |

- Start: Red level 5, score 0. Circle *i+1* unlocks when circle *i* reaches level 5 (first time; stays unlocked until reset).
- Laps/s = level × baseSpeed × P2 (lap speed promotion).
- Each circle has a colour mult, starting at 1. Each lap adds `multGain` to it. Base multGain = 0.01, × P1.
- On each lap of any circle: score += perRev, where `perRev = (Π colourMults × P.Mult) ^ commonExp`, `commonExp = P.Exp`.
- Laps are simulated analytically per tick (fractional progress accumulates; whole laps counted), so high speeds are exact and offline progress is a big tick.

### Level cost
- Level cap = 100 + 10 × ascensions.
- Cost of buying level L (current level L → L+1), after `a` ascensions:
  `cost = init × Π_{k<a} (m + 0.1k)^(100 + 10k) × (m + 0.1a)^L` where levels restart counting from 0 on the new segment. (Matches the wiki example: Orange asc1 lv10 = 100 × 1.24^100 × 1.34^10.)
  Note: after ascension the level resets to 5 but the cost segment index counts from 0, so the post-ascension cost for level L uses exponent L.
- Buy modes: ×1, ×10, Max (limited by cap).

### Ascension
- Available when level = cap. Resets level to 5, multGain ×= ascPower, cap += 10, cost mult += 0.1.
- ascPower base = 10, replaced by P3 once promotion 3 has a level.

### Prestige
- Unlock at score ≥ 1e10 and score ≥ the score at the last prestige.
- Gains (take max with current value, never reduce):
  `P.Mult = 2.56 × log10(score/1e3)^2.25`, `P.Exp = 1 + log10(score/1e5)/225`.
- Resets score, circles (levels, mults, ascensions, unlocks).
- Formulas are reconstructed from a garbled wiki render; tune constants via the pacing sim if needed.

### Promotions
- Unlock when P.Mult (current or pending) ≥ 1000.
- Promote: compute `xp = ⌊(P.Mult/1000)^0.75⌋` using max(current, pending) P.Mult. The chosen promotion's level is set to `xp` (allowed only if `xp` > its current level). Resets score, circles, P.Mult, P.Exp.
- Effects (L = level):
  - P4 = 1 + 0.05 × L4^0.48
  - P1 (mult-gain mult) = P4 × (⌊L1^1.5⌋ + 1)
  - P2 (lap speed mult) = P4 × (1 + √L2)
  - P3 (ascension power) = P4 × (10 + L3^0.82)
- A promotion can only be chosen if it would raise that level.

### Infinity
- At score ≥ 1.79e308: "Go Infinite" button. Shows finale with stats; grants IP = 1 and increments Infinity count (stored; no spend yet). Resets everything except stats, IP, infinity count.

## Numbers
Score, mults, perRev and costs stored as **log10** (plain JS numbers). Helpers: `logAdd`, `logSub`, formatting (`1.23e45`, plain with separators below 1e6).

## Architecture (single `index.html`)
- `<script id="engine">`: pure functions — `newState()`, `tick(state, dt)`, `costLog(state, i)`, `buy(state, i, n)`, `ascend(state, i)`, `prestigeGain(state)`, `prestige(state)`, `promoEffects(state)`, `promote(state, k)`, `goInfinite(state)`, `serialize/deserialize`. No DOM access. Also exported via `module.exports` when run in Node.
- `<script id="ui">`: canvas renderer (neon orbits, trails, lap pulses, "solid ring" when laps/s > ~6), top mult bar, tabbed side panel (Circles / Prestige / Promotions / Stats / Settings), buy mode toggle, save/export/import, offline progress on load (cap 8h).
- Dark neon theme; responsive (panel below canvas on narrow screens).

## Testing
- `test/engine.test.js` (Node, `node:test`): extracts the engine script from `index.html`, checks costs vs. wiki example, unlocks, ascension, prestige gains, promotion formulas, serialize round-trip, offline tick equivalence.
- `test/sim.js`: greedy-buyer pacing sim reporting time to first prestige, first promotion, Infinity.

## Delivery
Published as a private Artifact.

# Rev Idle

A browser idle game modelled on the Revolution stage of [Revolution Idle](https://revolutionidle.wiki.gg/) by Oni Gaming. The code and visuals are original; this is a fan project with no affiliation.

**Play:** https://pniessen.github.io/rev-idle/

Neon dots orbit ten concentric rings. Each lap earns score and raises that ring's multiplier. Buy levels, ascend rings at their cap, prestige for P.Mult and P.Exp, spend promotions on permanent boosts, and push on to Infinity (1.79e308).

### The Infinity layer

Reaching Infinity earns Infinity Points (IP) and opens the **∞** tab. Spend IP on the Infinity Upgrade tree to unlock Generators (which passively boost your mult gain each run), Automation (autobuy, auto-ascend, auto-promote, auto-prestige and, later, auto-Infinity), and Infinity Challenges — nine handicapped runs to Infinity that each pay a permanent IP bonus. Later upgrades let you **Break** Infinity: score can climb past 1.79e308 without an automatic reset, and every fixed step past it multiplies your IP gain, in exchange for choosing when to go Infinite yourself. Breaking also opens **Stars**, which convert Generator Power into Stardust for a further run of upgrades. Progress and automation continue while the game is closed, up to an 8-hour offline cap.

## Develop

No dependencies, Node 18 or newer.

```bash
npm test              # engine unit tests
npm run sim           # pacing simulation to the 1st Infinity (greedy bot, prints milestones)
npm run sim:layer     # idle-profile campaign from a fresh game through the finale
node build.mjs        # inline src/ into index.html (Pages) and dist/artifact.html
```

`test/sim.js` has two modes, selected by `MODE` (default `first`):
- `MODE=first` — a single active-play run to the first Infinity. Env: `DT`, `HOURS`, `QUIET`, `TUNE`, plus bot knobs `PRESTIGE_X`, `PROMO_X`, `PROMO_FIRST`, `STALL_SEC`.
- `MODE=layer` — the full idle check-in campaign (spec §12/§13), through Generators, Automation, Challenges, Break and Stars, to the finale. Useful env:
  - `DAYS=<n>` — stop after `n` simulated days (default 16).
  - `CHECK=1` — exit non-zero on any FAIL row or a wall-time budget overrun; also cross-checks against an `OFFLINE=1` and a `NOSKIP=1` replay.
  - `OFFLINE=1` — run each night's idle gap through the engine's chunked offline catch-up (as the UI does) instead of the sim's own stepping.
  - `FROM=<name>` — resume from a saved snapshot in `.sim/` (e.g. `phaseB-start`, `phaseC-start`, `stars-start`) instead of a fresh game.
  - `NOSKIP=1` — disable macro-step extrapolation and simulate every check-in in full.

| Path | Role |
|------|------|
| `src/engine.js` | Pure game logic in log10 space; tuning constants live in `Engine.TUNE` |
| `src/engine-infinity.js` | IP, the Infinity Upgrade tree, Generators, Infinity Challenges, Break, Stars and Stardust |
| `src/engine-auto.js` | Automation: autobuy, auto-ascend, auto-promote, auto-prestige, auto-Infinity, offline/adaptive stepping |
| `src/render.js` | Canvas orbit renderer |
| `src/ui.js`, `src/template.html`, `src/styles.css` | Panel, loop, saves, offline progress |
| `src/ui-infinity.js` | The ∞ tab: Tree, Gens, Auto, ICs and Stars sub-tabs |
| `docs/superpowers/` | Design spec and implementation plan |

Saves live in `localStorage`. Use Settings → Export/Import to move them between browsers.

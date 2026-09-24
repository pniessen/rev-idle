# Rev Idle

A browser idle game modelled on the Revolution stage of [Revolution Idle](https://revolutionidle.wiki.gg/) by Oni Gaming. The code and visuals are original; this is a fan project with no affiliation.

**Play:** https://pniessen.github.io/rev-idle/

Neon dots orbit ten concentric rings. Each lap earns score and raises that ring's multiplier. Buy levels, ascend rings at their cap, prestige for P.Mult and P.Exp, spend promotions on permanent boosts, and push on to Infinity (1.79e308).

## Develop

No dependencies, Node 18 or newer.

```bash
npm test          # engine unit tests
npm run sim       # pacing simulation (greedy bot, prints milestones)
node build.mjs    # inline src/ into index.html (Pages) and dist/artifact.html
```

| Path | Role |
|------|------|
| `src/engine.js` | Pure game logic in log10 space; tuning constants live in `Engine.TUNE` |
| `src/render.js` | Canvas orbit renderer |
| `src/ui.js`, `src/template.html`, `src/styles.css` | Panel, loop, saves, offline progress |
| `docs/superpowers/` | Design spec and implementation plan |

Saves live in `localStorage`. Use Settings → Export/Import to move them between browsers.

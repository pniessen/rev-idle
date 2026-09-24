# Rev Idle — Infinity Layer Design Spec (2026-09-24)

This spec extends [2026-09-23-rev-idle-design.md](2026-09-23-rev-idle-design.md), which covers the shipped Revolution stage. It adds the whole Infinity layer of *Revolution Idle*: Infinity Points, the Infinity Upgrade tree, Generators, Automation, Infinity Challenges, Break Infinity and Stars. Everything is built in one pass, organised as Phases A, B and C.

**Sources:**
- [Infinity](https://revolutionidle.wiki.gg/wiki/Infinity) (the Generators and Stars links redirect here)
- [Infinity Upgrades](https://revolutionidle.wiki.gg/wiki/Infinity_Upgrades)
- [Infinity Challenges](https://revolutionidle.wiki.gg/wiki/Infinity_Challenges)
- [Automations](https://revolutionidle.wiki.gg/wiki/Automations)
- [Guide:Infinity](https://revolutionidle.wiki.gg/wiki/Guide:Infinity)
- [Guide:Break Infinity](https://revolutionidle.wiki.gg/wiki/Guide:Break_Infinity)
- [Achievements](https://revolutionidle.wiki.gg/wiki/Achievements)

**Labels:**
- **[W]** means the value comes from the wiki.
- **[R]** means the wiki gives no formula or number, so it was reconstructed here. Every [R] number is an entry in `Engine.TUNE` (see §11) so the pacing sim can adjust it.

**Invariant:** Revolution-stage mechanics (circles, level costs, ascension, prestige, promotions) stay exactly as shipped. The only exceptions are the explicit modifiers listed in §3. With no upgrades, no active challenge and no generators, every existing formula must give bit-identical results. The existing tests guard this.

---

## 1. Decisions

| # | Ruling | Rationale |
|---|---|---|
| D1 | Phases A, B and C all ship in this build. | Product owner. |
| D2 | IP before Break is flat per Infinity (§2.2). | Product owner. It matches the wiki's tree costs and the guide's figure of about 17 IP over about 11 Infinities. |
| D3 | The tree is **faithful but trimmed**. It uses the wiki ids, costs and effects. It drops 10;1, 17;2, 18;2, 19;2 and 20;2, and adds one node, **3;2 Auto Work** (1 IP), which unlocks auto-promote. | Product owner. At its real cost (10;1, 256 IP) auto-promote cannot be reached before challenges. Promoting is the most tedious part of a repeat run. The dropped nodes are late, narrow or redundant with kept ones. |
| D4 | Four automations are unlocked by upgrades: Autobuy (1;1), Auto-Ascend (2;2), Auto-Promote (3;2) and Auto-Prestige (5;3). Auto-Infinity comes from 15;1 and only matters while Infinity is broken. | Product owner, plus the wiki. |
| D5 | **Fixed** Infinity is automatic after the first one. While not broken, score is capped at 1.79e308, and on reaching it the game performs an Infinity at once and shows a toast. Only the very first Infinity shows the modal. A Settings toggle, "Confirm each Infinity", brings the modal back. | The wiki says a fixed Infinity happens "as soon as you get 1.8e308". Without this, dozens of Phase B runs would each need a click. |
| D6 | Each prerequisite is **any owned node in the previous kept column**. Exceptions are listed in §4. | The wiki shows no tree edges. The guide's path, which skips 2;1 and 5;3, has to be legal. |
| D7 | The two IP achievements become built-in milestones: the 5th and later Infinities give ×2 IP, and completing IC4 gives ×2 IP. There is no achievement system. | This keeps the flat IP curve faithful. |
| D8 | Starting a challenge performs an Infinity-style reset with no reward. Exiting one resets the run the same way. A challenge always plays as **fixed** (capped at e308, completes on reaching it) whatever the Break toggle says. Completed challenges can be re-run to improve the best time. | This matches the real game's challenge semantics. Best times feed 15;2–4 and 16;3. |
| D9 | The vague challenge rewards and handicaps ("stronger", "a lot weaker", "decay") get concrete [R] numbers, and the UI shows those numbers. | Players need legible effects. |
| D10 | Auto-prestige fires when a **ratio** threshold is met, pending P.Mult ≥ X × current (default X = 10), OR an optional exponent-gain threshold is met. It also has a minimum time and a stall rule. The defaults reproduce the pacing bot. | The wiki's "1,000" is ambiguous. A ratio works at every stage of the game. |
| D11 | Autobuy is an on/off switch per circle. There is no percent-of-score slider. | The wiki advises "100%" anyway. This keeps the UI small at 400 px. |
| D12 | There are 10 generators. G5–G10 only matter in Phase C, through Stardust upgrade 1, which extends 1;1 up to G10. | The Stardust upgrade tops out at G10. |
| D13 | The Star exponent base is 0.4 (wiki Infinity page), not 0.45 (guide). | The wiki mechanics page takes precedence over the guide. |
| D14 | All new big numbers (IP, GP, generator amounts, Stardust) are stored as log10. `ip` is replaced by `inf.ipLog`. | Break Infinity pushes IP past 1e308, and log storage avoids a second migration. |
| D15 | The layer ends at 1.79e308 IP. IP is capped there, and a one-time "Eternity — coming soon" finale modal is shown. Play continues. | Eternity is out of scope. The cap is faithful because in the real game you cannot pass it without Eternity. |
| D16 | Time Flux, macros, the IP Adjuster, leaderboards and achievements are out of scope. | None of these are core to the loop. |
| D17 | UI: one new main tab, **∞**, which appears after the first Infinity. It holds sub-tabs Tree · Gens · Auto · ICs · Stars, and each sub-tab appears once it is unlocked. | This keeps the main tab bar at 6 items on 400 px screens and leaves room for an Eternity layer switcher later. |
| D18 | Offline progress runs automation and generators, and can perform any number of fixed or auto Infinities. It uses the same **adaptive step** as the sim (§9.1). The **8 h offline cap stays**. | Otherwise idle play does not work, and a shared step rule keeps the sim honest about offline play. The idle pacing profile (§12) has an 8 h night gap, so a player who checks in by the next morning loses nothing. A longer cap would mostly help players who skip days, which the 1–2 week target does not assume. |
| D19 | Pacing follows the real game and is **mostly idle** (product owner, revised 2026-09-24; challenge timings revised 2026-09-24 per Task 14 rulings). IC4 and IC9 take 3–6 h each; IC1 and IC2 take 20–90 min each and IC3 30–90 min (floor 15 min); IC5–IC8 are informational, kept faithful to the wiki's handicaps rather than pinned to a duration band. First Infinity to the IP-cap finale takes 7–14 days of game time under the idle check-in profile. All targets are in §12. | The layer is meant to be played over weeks, with automation and offline progress doing most of the work. |

---

## 2. Infinity core

### 2.1 Reaching Infinity
- `INFINITY_LOG = log10(1.79e308)` (unchanged).
- **Not broken, or inside a challenge:** after every tick, `scoreLog = min(scoreLog, INFINITY_LOG)`. `canInfinity(s)` is `scoreLog ≥ INFINITY_LOG`.
- **First Infinity** (`infinities === 0`): the UI shows the existing modal and the player confirms. When it is triggered offline, the score stays capped and the modal shows on return, as today.
- **Later fixed Infinities** (including challenge completions): the engine calls `goInfinite(s)` itself at the end of `tick`.
- **Exception:** when `infinities === 0` or `inf.auto.confirmInfinity` is on, `tick` only sets `inf.pendingConfirm = true`. The score stays capped, and the UI shows the modal, which calls `goInfinite`. While an Infinity awaits confirmation (`awaitingInfinity(s)`: at the cap and pending, or about to be), `prestige`/`promote` are refused and automation does not buy, ascend, promote or prestige, so a click that lands between the capping tick and the modal cannot reset the run. `postTick` clears a `pendingConfirm` left set below the cap (e.g. an old save), and the UI shows the modal only while `pendingConfirm && canInfinity` (and closes it otherwise).
- **Broken (and no challenge active):** there is no cap. `canInfinity(s)` is still `scoreLog ≥ INFINITY_LOG`. The player infinites manually through the button, or Auto-Infinity does it (§6.5).

### 2.2 IP gain

```
ipGainLog(s) =
    log10(1 + icDoneCount)                   // +1 per completed IC   [W]
  + log10(2) * [s.infinities >= 4]           // the 5th and later Infinities  [W achv → milestone]
  + log10(2) * [ic.done[3]]                  // IC4 completed          [W achv → milestone]
  + upgIpLog(s)                              // 15;2, 16;1              (§4)
  + log10(1 + sdU[1])                        // Stardust upgrade 2      [W]
  + breakBonusLog(s)                         // §8
  + log10(TUNE.ipBase)                       // [R] default 1
```

- All flags are read from the state **before** the Infinity is applied. So the run that completes IC4 does not yet get the IC4 ×2.
- `ip` is then added: `inf.ipLog = min(INFINITY_LOG, logAdd(inf.ipLog, ipGainLog))` (D15).

### 2.3 Infinity count (∞)
- On each Infinity, `infinities += infGain(s)`, where `infGain = 2^[ic.done[8]]`. The IC9 reward is "Double Infinities gain" [W].
- Passive gain comes from 18;1 (§4). `infinities` stays a plain number; it cannot realistically exceed 1e15.

### 2.4 `goInfinite(s)` (rewritten)
**Precondition:** `canInfinity(s)`.

It performs these steps in order:
1. Grant IP (§2.2) and ∞ (§2.3).
2. Record the run time `t = inf.t`:
   - `stats.fastestInfinity = min(existing, t)`
   - push `{t, ipGainLog}` onto `stats.lastInfinities`, keeping the last 10
   - `stats.totalIpLog = logAdd(stats.totalIpLog, ipGainLog)`
3. If `inf.ic.active = n > 0`:
   - `ic.done[n-1] = true`
   - `ic.best[n-1] = min(existing, t)`
   - `ic.active = 0`
4. Revolution reset:
   - `resetRun(s)`
   - `pMult = 1`, `pExp = 1`
   - `prestigeReqLog = TUNE.prestigeMinLog`
   - `promo = ic.done[3] ? [1,1,1,1] : [0,0,0,0]` (IC4 reward)
5. Infinity-run reset:
   - `inf.t = 0`
   - `inf.tRun = 0`
   - `inf.gpLog = -Infinity`
   - each generator's `aLog = b > 0 ? log10(b) : -Infinity`
   - `inf.stars.sdLog = -Infinity`
   - clear the stall trackers
6. Kept (not reset): IP, ∞, upgrades, generator `b`, challenge done/best, Break toggle, star counts, SD upgrade levels, automation settings and stats.

`resetForChallenge(s)` runs steps 4 and 5 only. It is used by `startChallenge` and `exitChallenge`.

---

## 3. Modifiers: the single `mods(s)` hook

`mods(s)` is computed once per tick and on demand, and it is pure. Every Revolution formula reads from it, and it is the **only** place where upgrades, challenges and stars touch Revolution mechanics.

| Field | Default (no Infinity content) | Used in | Formula |
|---|---|---|---|
| `lapMult` | 1 | `lapsPerSec`, `tick` | `1.1^[3;1] × 1.2^[4;1] × 3^[19;3]` |
| `gainLog` | 0 | per-lap mult gain in `tick` | `gpExp × max(0, gpLog)` (§5.3) |
| `expAdd` | 0 | `perRevLog` | `[2;1]×(0.01 + min(0.5, 0.01·sdU[2])) + 0.03·[IC3 done] − 0.4·[IC3 active]` |
| `prodLog` | 0 | `perRevLog` (inside the product, before the exponent) | `(0.2·[IC7 done] − 2·[IC7 active]) × log10(max(1, inf.t))` |
| `ascBase` | 10 | `promoEffects.p3` | `10 + 2·[6;1] + 1·[13;1] + 2·[IC8 done]` |
| `ascMult` | 1 | `promoEffects.p3` | `f62 × f162 × 1.2^[IC2 done] × 0.25^[IC2 active]` (§4) |
| `v[1..4]` | 1 | `promoEffects` variable parts | see below |
| `pMultMult` | 1 | `pendingPrestige` | 5;1 factor |
| `pExpMult` | 1 | `pendingPrestige` | 5;2 factor |
| `gainPow` | 1 | `pendingPrestige`, `promoXp` | `TUNE.ic4Pow` (0.32, see Deviations) if IC4 active |
| `disabledPromo` | [] | `promoEffects`, `canPromote` | `[1,3]` (P2, P4, zero-indexed) if IC1 active |
| `maxCircles` | 10 | `buy` unlock chain, `tick` | `TUNE.ic9Circles` (3, see Deviations) if IC9 active |
| `noAscend` | false | `canAscend` | true if IC8 active |
| `decay` | 0 | `tick` | `TUNE.ic6Decay` if IC6 active |

**Promotion variable parts:**
- `v1 = vAll × (1 + √L1/10)^[14;1]`
- `v2 = vAll × TUNE.ic1Boost^[IC1 done]`
- `v3 = vAll`
- `v4 = vAll × TUNE.ic1Boost^[IC1 done] × f163`

where `vAll = TUNE.ic5Reward^[IC5 done] × TUNE.ic5Nerf^[IC5 active]`.

**Modified formulas** (they reduce exactly to the shipped ones when all mods are at their defaults):

```
p4 = 1 + 0.05 · L4^0.48 · v4
p1 = p4 · (floor(L1^1.5) · v1 + 1)
p2 = p4 · (1 + √L2 · v2)
p3 = p4 · (ascBase + L3^0.82 · v3) · ascMult
```
- A disabled promotion's level is treated as 0 in these formulas.

```
laps/s(i)       = level · baseSpeed · p2 · lapMult
per-lap gain(i) = multGainLog_i + log10(p1) + gainLog           // exposed as multGainPerLapLog(s, i)
perRevLog       = (pExp + expAdd) · (Σ unlocked multLog + log10(pMult) + prodLog)
```
- The effective exponent is floored at 0.1.

**Prestige gains:**
```
raw pMult = 2.56 · (scoreLog−3)^2.25 · pMultMult
pMult     = raw^gainPow
pExp      = 1 + ((min(scoreLog, INFINITY_LOG)−5)/225) · pExpMult · gainPow
```

**Promotion XP:**
```
promoXp = floor( ((m / promoMin)^0.75)^gainPow )
```

**IC6 decay:** each tick, for every circle, `multLog ← max(0, multLog · (1 − decay)^dt)`.

---

## 4. Infinity Upgrade tree (faithful, trimmed)

- An upgrade id is `"col;row"`. Costs are in IP [W].
- "Req" is the prerequisite. **prev** means any owned node in the previous kept column (D6).
- `∞` = `s.infinities`, `t` = `inf.t` (seconds in the current Infinity) and `IP` = current IP.
- "ΣIC" is the sum of the 9 best challenge times in seconds. It is only defined once all 9 are done; otherwise the factor is 1.
- `ctf = clamp(TUNE.icRefSec / ΣIC, 1, 1e4)`.

| Id | Name | Cost | Effect (formula) | Req | Phase |
|---|---|---|---|---|---|
| 1;1 | Infinity Generation | 1 | G1 ×max(1,∞) [W]. Unlocks Generators (grants 1 free G1) and Autobuy. | — | A |
| 2;1 | Exponential Box | 1 | commonExp +0.01 [W] (Stardust upgrade 3 raises this) | 1;1 | A |
| 2;2 | Auto Ascend | 1 | unlocks Auto-Ascend [W] | 1;1 | A |
| 3;1 | Fast Laps | 1 | lap speed ×1.1 [W] | prev | A |
| **3;2** | **Auto Work** (added, D3) | 1 | unlocks Auto-Promote | prev | A |
| 4;1 | Even Faster Laps | 3 | lap speed ×1.2 [W] | prev | A |
| 5;1 | Long Term Prestiging | 3 | P.Mult gain ×`min(10, 1+√(t/600))` [R] | 4;1 | A |
| 5;2 | Solid Exponent | 3 | P.Exp gain ×`(1 + u52K·log2(1+∞))` [R], `u52K` = 0.01 (§11) | 4;1 | A |
| 5;3 | Auto Prestige | 3 | unlocks Auto-Prestige [W] | 4;1 | A |
| 6;1 | Mighty Ascension | 3 | ascension power base +2 [W] | 5;1 or 5;2 | A |
| 6;2 | Ascend to Ascend | 3 | asc power ×`f62 = 1 + u62K·log10(1+∞)` [R], `u62K` = 0.01 (§11) | 5;2 or 5;3 | A |
| 7;1 | Challenges! | 5 | unlocks Infinity Challenges [W] | prev | B |
| 8;1 | Generator and Time | 16 | G1 ×`(1 + t/60)^0.5` [R] | 7;1 | B |
| 8;2 | Generator and Power | 32 | G1 ×`(1 + log10(1+GP))` [R] | 7;1 | B |
| 8;3 | Generator and Constant | 16 | G1 ×5 [W] | 7;1 | B |
| 9;1 | Generator 2 and Time | 128 | G2 ×`(1 + t/60)^0.5` [R] | prev | B |
| 9;2 | Generator 2 and Constant | 128 | G2 ×3 [W] | prev | B |
| 11;1 | Weak Generators | 300 | G1 ×`(1 + log10(1+IP))` [R] | prev (col 9) | B |
| 11;2 | Medium Generators | 400 | G2 ×`(1 + log10(1+IP))^0.5` [R] | prev (col 9) | B |
| 12;1 | First, But Better | 512 | G2 ×`max(1,∞)^0.5` [R] | prev | B |
| 13;1 | A Little Gift | 600 | ascension power base +1 [W] | prev | B |
| 14;1 | First for the First | 1,024 | P1 variable part ×`(1 + √L1/10)` [R] | prev | B |
| 14;2 | Efficiency V | 1,024 | gpExp → 0.75 [W] | prev | B |
| 15;1 | Auto Infinity | 2,048 | unlocks Auto-Infinity [W] | prev | C |
| 15;2 | Fast IP Gain | 2,048 | IP ×`ctf^0.5` [R] | prev | C |
| 15;3 | First Generator Power | 2,048 | G1 ×`ctf` [R] | prev | C |
| 15;4 | Second Generator Power | 2,048 | G2 ×`ctf^0.75` [R] | prev | C |
| 16;1 | Infinities to IP | 5,000 | IP ×`max(1,∞)^0.2` [R] | prev | C |
| 16;2 | Stronger Ascension Power | 5,000 | asc power ×`f162 = 1 + 0.05·log2(1+∞)` [R] | prev | C |
| 16;3 | Empowered Promotions | 5,000 | P4 variable part ×`f163 = clamp(3600/ICbest9, 1, 10)^0.5` [R] (1 before IC9 is done) | prev | C |
| 17;1 | Third's Turn | 1e6 | G3 ×`max(1,∞)^0.25` [R] | prev | C |
| 17;3 | Boost for the First | 1e6 | G1 ×10 [W] | prev | C |
| 18;1 | Passive Infinities | 2e11 | ∞/s = `TUNE.passiveInfK × infGain / max(1, fastestInfinity) × sdU4mult` [R] | prev | C |
| 18;3 | Third from Second | 1e11 | G3 ×`(1 + b2)` [R] | prev | C |
| 19;1 | Almost One | 1e12 | gpExp → 0.9 [W] | prev | C |
| 19;3 | Challenge Efficiency | 1e12 | lap speed ×3 [W] | prev | C |
| 20;1 | As Fast as Strong | 1e21 | all generators ×`clamp(600/fastestInfinity, 1, 100)^0.5` [R] (1 if there is no fastest time yet) | prev | C |
| 21;1 | A Falling Star | 1e33 | unlocks Stars [W] | 20;1 | C |

**Tree rules:**
- "prev" for column 11 is column 9, because column 10 is dropped.
- IP spent is never refunded.
- In total there are 38 nodes: 11 in Phase A, 12 in Phase B and 15 in Phase C.

**Buying:** `canBuyUpgrade(s, id)` requires three things: the node is not owned, its prerequisites are met, and `ipLog ≥ log10(cost)`. `buyUpgrade` spends the IP with `logSub`.

---

## 5. Generators

### 5.1 Ownership and cost
- Generators are unlocked by 1;1. Buying 1;1 sets `gens[0].b = 1` and `aLog = 0`; that is the free G1.
- Generator k (1-based) has a bought count `b_k`. Its purchase count is `p_k = b_k − 1` for G1 (the free one does not count) and `p_k = b_k` otherwise. Cost of the next one is `first_k · step_k^p_k` [R]:

| Gk | Cost of next (IP) |
|---|---|
| G1 | `32 · 5^(b1−1)` → 32, 160, 800, 4000 … |
| G2 | `150 · 10^b2` |
| G3 | `1e5 · 100^b3` |
| G4 | `1e9 · 1e3^b4` |
| G5–G10 | `10^(9 + 6(k−4)) · 10^((k−1)·b_k)`: first costs 1e15, 1e21, 1e27, 1e33, 1e39, 1e45 |

- Gk+1 is only buyable once `b_k ≥ 1`.
- Buying a generator adds 1 to both `b_k` and the current amount: `aLog = logAdd(aLog, 0)`.

### 5.2 Production (per tick, explicit Euler, using start-of-tick values)
```
M_k (log)  = log10(2)·(b_k − 1)                          // ×2 per purchase  [W]
           + upgrade factors on Gk (§4)
           + log10(max(1,∞)) if 1;1 applies to Gk        // G1; SD upg 1 extends it to G(1+sdU[0])
           + log10(2)·[IC6 done]                          // "all generators twice as strong"
           + 20;1 factor
           + log10(TUNE.genRate)                          // [R] default 0.0025 (§11)
softcap:   if M_k > 1000 then M_k = 1000 · (M_k/1000)^0.5  // "Generator Mult softcapped at 1e1,000" [W], [R] shape

gpLog  = logAdd(gpLog, a1Log + M_1 + starGpLog + log10(dt))
aLog_k = logAdd(aLog_k, a(k+1)Log + M_(k+1) + log10(dt))   for k = 1..9
```
- `starGpLog` is defined in §7.

### 5.3 Effect on the Revolution stage
- Every circle's per-lap mult gain is multiplied by `max(1, GP)^gpExp` (so `gainLog = gpExp · max(0, gpLog)`).
- `gpExp` is 0.666 by default, 0.75 with 14;2 and 0.9 with 19;1 [W]. As the wiki's example says, GP 16 gives ×6.35.
- GP resets every Infinity. So each run accelerates as it goes, and time-based upgrades reward longer runs.

---

## 6. Automation

All automation logic lives in the engine as `autoStep(s, dt)`:
- `tick` calls it after production.
- `simulate` calls it too, which is how automation also runs offline.
- The pacing bot uses it unchanged, so the bot's pacing is the pacing the player gets.

Each automation needs its upgrade **and** its master toggle to be on.

Every step runs in this order: ascend, then buy, then promote, then prestige, then infinity. The stall tracker is shared by promote and prestige:
- `rt.markLog` / `rt.markT` update whenever `scoreLog ≥ markLog + 1` or score drops.
- The run is stalled when `inf.tRun − markT > auto.stallSec`.
- `inf.tRun` is the time since the last prestige, promotion or Infinity reset.
- `tick` adds `dt` to both `inf.t` and `inf.tRun`. `prestige`, `promote` and the Infinity reset set `inf.tRun = 0` and clear `rt`.

### 6.1 Autobuy colours (1;1)
- **Settings:** `auto.buy.on` (default true once unlocked) and `auto.buy.circles[10]` (all true).
- **Behaviour:** repeatedly buy one level of the **cheapest** affordable level among enabled, unlocked, below-cap circles, until nothing is affordable. There is a hard cap of `TUNE.autoBuyMaxPerStep = 500` purchases per step.

### 6.2 Auto-Ascend (2;2)
- **Settings:** `auto.asc.on` and `auto.asc.circles[10]`.
- **Behaviour:** ascend every enabled circle where `canAscend` is true. Under IC8 this does nothing.

### 6.3 Auto-Promote (3;2)
- **Settings:**
  - `on`
  - `order` (a permutation of [0,1,2,3], default [0,1,2,3])
  - `xFactor` (default 2)
  - `minTime` (s, default 1)
- **Behaviour:**
  1. Let `k` be the next promotion in the cycle: `order[stats.promotions mod 4]`, skipping disabled ones.
  2. When `inf.tRun ≥ minTime`, promote to `k` if `promoXp ≥ max(1, promo[k]·xFactor, promo[k]+1)`.
  3. Otherwise, if the run is stalled and `!canPrestige`, promote to the first promotion in cycle order that `canPromote` allows.

### 6.4 Auto-Prestige (5;3)
- **Settings:**
  - `on`
  - `multX` (default 10)
  - `expGain` (default 0, meaning off)
  - `minTime` (s, default 0.2)
- **Behaviour:** if `canPrestige && inf.tRun ≥ minTime`, prestige when **any** of these holds:
  - `pMult === 1`, the first prestige after a reset
  - `pending.pMult ≥ multX · pMult`
  - `expGain > 0 && pending.pExp − pExp ≥ expGain`
  - stalled AND (`pending.pMult > 1.5·pMult` or `pending.pExp > pExp + 0.02`)

### 6.5 Auto-Infinity (15;1, broken only)
- **Settings:**
  - `on`
  - `minIpLog` (default 0, i.e. ≥ 1 IP)
  - `minTime` (s, default 0)
- **Behaviour:** when broken and no challenge is active, infinite once `canInfinity && ipGainLog ≥ minIpLog && inf.t ≥ minTime`.

### 6.6 Shared
- `auto.stallSec` defaults to 30 (0 turns the stall rule off).
- `auto.confirmInfinity` defaults to false (see D5).
- Autobuy and Auto-Ascend default to on when unlocked. Promote and Prestige also default to on with the settings above.

---

## 7. Stars (21;1)

State: `stars.n` (Stars), `stars.nb` (base upgrades), `stars.ne` (exponent upgrades), `stars.sdLog` (Stardust; resets on Infinity [W]), `stars.sdU[4]` (Stardust-upgrade levels; kept [W]).

```
base     = 2.75 + 0.275·nb                               [W]
exp      = 0.4 + 0.05·ne                                 [W] (D13)
SD/s     = n ≥ 1 ? 0.05 · base^n : 0                     [W]
starGpLog = exp · max(0, sdLog)                          // GP gain ×SD^exp  [W]
```

**Costs (IP):**
- Next Star, with n Stars owned: `costLog = 33 + Σ_{j<n} step_j`, where `step_j` is 3 for j < 18, 7 for 18 ≤ j < 30, and `7 + (j − 29)` for j ≥ 30. [W] gives "+e3, then e7 or more after ~e87"; the growth after that is [R].
- Base upgrade: `1e34 · 1e4^nb` [R].
- Exponent upgrade: `1e35 · 1e5^ne` [R], capped at ne = 12.

**Stardust upgrades** (costs in SD [R]; effects [W]). The table's j is 1-based; the state stores `sdU[j−1]`, and `n` is that level. `sdU4mult = min(62.62, 1.05^sdU[3])`.

| j | Effect | Cost of next | Max |
|---|---|---|---|
| 1 | 1;1's ×∞ also applies to G2 … G(1+n) | `10 · 100^n` | 9 (reaches G10) |
| 2 | IP ×(1+n) | `20 · 10^n` | ∞ |
| 3 | 2;1 gives +0.01·n more commonExp | `50 · 3^n` | 50 (+0.5) |
| 4 | 18;1 rate ×`min(62.62, 1.05^n)` | `100 · 2^n` | 85 |

---

## 8. Infinity Challenges (7;1) and Break Infinity

- Only one challenge can be active at a time. Challenge n requires challenge n−1 to be done.
- **Start** (`startChallenge(s, n)`): calls `resetForChallenge` and sets `ic.active = n`.
- **Exit** (`exitChallenge(s)`): calls `resetForChallenge` and sets `active = 0`.
- **Goal:** reach 1.79e308 score with the handicap active. Completion follows §2.4, so it pays normal IP and ∞.
- **Reward:** the IC-specific bonus, plus +1 to the IP multiplier (via `icDoneCount`).

| IC | Name | Handicap [W] → implementation | Reward [W] → implementation |
|---|---|---|---|
| 1 | Ionized Speed | P2 and P4 disabled (level treated as 0, cannot promote into them) | P2 and P4 variable parts ×`ic1Boost` (1.5) [R] |
| 2 | Descent | asc power ÷4 | asc power ×1.2 |
| 3 | The First Root | commonExp −0.4 | commonExp +0.03 |
| 4 | Steep Climbs | prestige and promote gains ^`ic4Pow` = 0.32 (wiki 0.4; see Deviations) (§3) | after every Infinity, all promotions start at level 1; IP ×2 (D7) |
| 5 | Fired From Work | all promotion variable parts ×`ic5Nerf` (0.25) [R] | ×`ic5Reward` (1.1) [R] |
| 6 | The Drain | colour mult logs decay ×(1−0.01)^dt, floor ×1 [R] | all generators ×2 |
| 7 | Quadratic Division | product of mults ÷ t² | product of mults × t^0.2 |
| 8 | Noscensions | ascensions disabled | ascension power base +2 |
| 9 | Isolationism | only the first `ic9Circles` = 3 colours (Red–Yellow) can unlock (wiki 4; see Deviations) | ∞ gain ×2; unlocks Break Infinity |

**Break Infinity:**
- `canBreak(s)` is `ic.done` all true. `setBroken(s, bool)` flips the toggle. The Break card at the top of the ICs sub-tab offers "Break" and "Fix".
- Fixing while `scoreLog > INFINITY_LOG` clamps the score, which triggers the automatic Infinity at the next tick.
- IP bonus while broken [W]:
  ```
  breakBonusLog(s) = broken && !ic.active ? max(0, floor((scoreLog − breakStartLog) / breakStepLog)) : 0
  ```
  With the tuned `breakStartLog` = 4100 and `breakStepLog` = 74 (§11), that gives ×10 at e4,174, ×100 at e4,248, and so on. The wiki values are 2772 and 308, giving ×10 at e3,080 and ×100 at e3,388 (see Deviations).
- The UI shows an "IP bar": progress from the last ×10 threshold to the next one.

---

## 9. Offline progress, save format, engine API

### 9.1 Offline, hidden tab and step size
- `simulate(s, seconds, opts)` runs `tick` in steps of `adaptiveDt(s, opts)`. `tick` itself advances generators, IC6 decay, 18;1 and Stardust, then calls `autoStep` and the fixed/auto Infinity checks. It returns:
  ```
  { scoreLogBefore, scoreLogAfter, ipGainedLog, infinitiesGained, icCompleted: [n...] }
  ```
- **Step rule:** `adaptiveDt(s, opts)` is:
  ```
  anyAutoOn(s) ? clamp(inf.tRun / TUNE.dtRunDiv, opts.dtMin ?? TUNE.dtMin, opts.dtMax ?? TUNE.dtMax) : TUNE.dtFixed
  ```
  Dynamics are fast right after a reset, so steps start fine and coarsen as the run matures. Without automation the step is 1 s, as shipped.
- **UI offline and hidden-tab catch-up** call `simulate` at the default step (`dtMin` 0.1) in chunks spread across animation frames behind a "Catching up… N%" overlay (Task 10 ruling; chunked ≡ one call). One 8 h call is only sanity-bounded (≤ 6 s in Node).
- The offline modal adds these lines: "+X IP", "+N Infinities" and "Challenge n completed".

### 9.2 State v2 (additions; v1 fields unchanged except `ip`)
```js
{
  v: 2,
  // ... all v1 fields; `ip` removed (migrated), `infinities` kept
  inf: {
    ipLog: -Infinity,
    upg: {},                                  // { '1;1': true, ... }
    gens: [{ b: 0, aLog: -Infinity }, ...×10],
    gpLog: -Infinity,
    t: 0,                                     // seconds in current Infinity
    tRun: 0,                                  // seconds since last prestige/promotion/Infinity
    broken: false,
    pendingConfirm: false,                    // fixed Infinity awaiting modal (confirmInfinity / first)
    finaleSeen: false,
    ic: { active: 0, done: [false ×9], best: [null ×9] },
    stars: { n: 0, nb: 0, ne: 0, sdLog: -Infinity, sdU: [0, 0, 0, 0] },
    auto: {
      buy:      { on: true, circles: [true ×10] },
      asc:      { on: true, circles: [true ×10] },
      promote:  { on: true, order: [0, 1, 2, 3], xFactor: 2, minTime: 1 },
      prestige: { on: true, multX: 10, expGain: 0, minTime: 0.2 },
      infinity: { on: false, minIpLog: 0, minTime: 0 },
      stallSec: 30,
      confirmInfinity: false,
    },
    rt: { markLog: -Infinity, markT: 0 },     // stall tracker (saved; harmless)
  },
  stats: { /* v1 fields */, fastestInfinity: null, lastInfinities: [], totalIpLog: -Infinity },
}
```

### 9.3 Migration
- `deserialize` accepts `v === 1 || v === 2`, then returns `migrate(obj)`. `migrate` does three things:
  1. It deep-merges `obj` onto `newState()`: plain objects recursively, arrays element-wise with defaults for missing entries, and the `-inf` sentinel restored.
  2. If `v === 1`, it sets `inf.ipLog = ip > 0 ? log10(ip) : -Infinity`, deletes `ip` and sets `v = 2`.
  3. It validates the result: 10 circles and 10 generators.
- A v1 save that already went Infinite, with `ip: 1` and `infinities: 1`, therefore loads with 1 IP and sees the ∞ tab immediately.
- Unknown extra keys are dropped.

### 9.4 Engine API additions (all pure; `s` = state)

| Function | Returns / effect |
|---|---|
| `mods(s)` | modifier object (§3) |
| `multGainPerLapLog(s, i)` | the log gain per lap for circle i (used by UI and tooltips) |
| `ipGainLog(s)`, `infGain(s)`, `breakBonusLog(s)` | §2.2, §2.3, §8 |
| `UPGRADES` | array of `{ id, col, row, name, cost, phase, req: 'prev' \| [ids], desc, effectText(s) }` |
| `hasUpg(s, id)`, `canBuyUpgrade(s, id)`, `buyUpgrade(s, id)` | §4 |
| `upgEffect(s, id)` | numeric current factor, for display |
| `genCostLog(s, k)`, `canBuyGen(s, k)`, `buyGen(s, k)`, `genMultLog(s, k)`, `gpMultLog(s)` | §5 (k is 0-based) |
| `autoStep(s, dt)` | §6; returns `{ actions: [...] }` for toasts and sim logging |
| `CHALLENGES` | array of `{ n, name, handicap, reward }` (display text) |
| `canStartChallenge(s, n)`, `startChallenge(s, n)`, `exitChallenge(s)` | §8 |
| `canBreak(s)`, `setBroken(s, on)` | §8 |
| `starCostLog(s)`, `buyStar(s)`, `starBaseCostLog(s)`, `buyStarBase(s)`, `starExpCostLog(s)`, `buyStarExp(s)` | §7 |
| `sdRateLog(s)`, `sdUpgCostLog(s, j)`, `canBuySdUpg(s, j)`, `buySdUpg(s, j)` | §7 |
| `migrate(obj)` | §9.3 |
| `anyAutoOn(s)`, `adaptiveDt(s, opts)` | step-size helpers (§9.1) |
| `registerHooks(h)`, `DEFAULT_MODS` | core extension points used by the split engine files (see the implementation plan) |
| `resetForChallenge(s)`, `icDoneCount(s)`, `upgReqMet(s, id)`, `genSoftcap(L)`, `gpExp(s)`, `starGpLog(s)`, `passiveInfRate(s)`, `ctf(s)`, `isStalled(s)` | helpers exposed for the UI, tooltips and tests |

The engine is split across `src/engine.js` (core), `src/engine-infinity.js` and `src/engine-auto.js`. All three attach to the single `Engine` object. Stardust-upgrade indices `j` in the API are 0-based (`sdU[j]`).

**Changed functions:**
- `goInfinite` (§2.4)
- `canInfinity` (unchanged test; cap semantics in §2.1)
- `tick`
- `simulate` (new return fields)
- `lapsPerSec`, `perRevLog`, `promoEffects`, `pendingPrestige`, `promoXp`, `canPromote`, `canAscend`, `buy` (these read `mods`)
- `fmtLog`: exponents ≥ 1,000 get thousands separators, e.g. `1.00e3,080`

All existing signatures are kept.

---

## 10. UI

### 10.1 Navigation (400 px first)
- **Main tabs:** Circles · Prestige · Promote · **∞** · Stats · Settings.
  - ∞ is visible once `infinities ≥ 1` or `ipLog > -Infinity`.
  - At widths under 420 px, Stats and Settings collapse to icon buttons (inline SVG glyphs, not emoji), so labels stay at ≥ 12 px.
- **∞ tab layout:**
  - A sticky header: `IP 1.23e45 · +X next · ∞ 1,234`. At the IP cap (finale) the `+X next` part is hidden. The IP bar is not in this header; it lives on the Prestige tab (§10.3).
  - A sub-tab row: **Tree · Gens · Auto · ICs · Stars**.
    - Gens and Auto appear with 1;1.
    - ICs appears with 7;1.
    - Stars appears with 21;1.
    - The last sub-tab used is remembered in localStorage (wrapped in try/catch).
- **Top chip bar (Circles):** adds a `GP ×…` chip once generators exist, and an `IC n` chip while a challenge is active.

### 10.2 Sub-tabs
- **Tree.**
  - The tree is drawn as a vertical list of column rows rather than an SVG graph.
  - Each row has a small column label ("C5") and 1–4 cards in a 2-wide grid. Each card shows the short name, the cost, and the current effect value (e.g. `×3.2`).
  - A card is in one of three states:
    - owned: filled accent
    - buyable: glow, and it is a button
    - locked: dim, shows the unmet requirement (`Needs 5;1 or 5;2`)
  - Rows are revealed progressively: every column up to and including the first column with no owned node, plus one dimmed preview column.
  - Tapping a buyable card buys it. There is no two-step confirm, because it is cheap and irreversible but low-stakes; this matches circle buys.
- **Gens.**
  - A GP line: `GP 1.2e5 → Mult Gain ×2,345 (^0.666)`.
  - Rows G1…G(highest bought + 1), each with amount, `×mult`, `+rate/s` of the next tier down, and a Buy button showing the cost.
  - A footnote line appears when the softcap is active.
- **Auto.** One card per unlocked automation (always expanded; not collapsible).
  - Buy and Ascend: a master toggle plus a 5×2 grid of colour-dot toggles.
  - Promote: a master toggle; an order picker (4 chips, tap to cycle positions); `×` factor; min time.
  - Prestige: a master toggle; multX; expGain; min time.
  - Infinity (15;1): a master toggle; min IP (accepts `1e20`); min time.
  - A shared "stall seconds" field.
  - Inputs are validated. Invalid input reverts to the previous value and shows a toast.
- **ICs.**
  - A Break card at the top, shown once `canBreak`, with a Break/Fix toggle.
  - Then 9 cards in a single column. Each card shows its number and name, the handicap, the reward, a status (locked / available / active / done ✓), the best time, and a Start or Exit button.
  - Start and Exit use the existing `twoStepConfirm`, because they reset the run.
- **Stars.**
  - Readouts: `SD 1.2e9 (+3.4e7/s) → GP ×…`.
  - Three buyables: Star, Base and Exponent, each showing its current value, cost and a Buy button.
  - The 4 Stardust upgrades, each with level/max, effect and cost.
  - A reminder: "Stardust resets on Infinity — spend it first."

### 10.3 Other surfaces
- **Prestige tab:**
  - When broken, the Infinity button reads `Go Infinite (+X IP)` and the IP bar is shown.
  - While a challenge is active, a banner reads `IC4 Steep Climbs — reach 1.79e308`.
- **Canvas:** a subtle banner with the IC name while a challenge is active.
- **Stats:**
  - Infinities, total IP and fastest Infinity.
  - The last 10 Infinities (time and IP).
  - IC best times and ΣIC.
- **Settings:** a "Confirm each Infinity" toggle.
- **Modals:**
  - The first-Infinity modal copy changes to "You gained 1 Infinity Point. Spend it in the new ∞ tab."
  - The Eternity finale (D15) shows once.
- **Toasts:** automatic Infinity `+X IP (∞ n)` (one per real Infinity — detected from `stats.lastInfinities`, so passive 18;1 Infinities do not toast), `Challenge n completed` in live play (offline catch-up lists completions in its summary instead), and upgrade bought (only when bought via the offline summary).

### 10.4 Tooltips
These use the concurrent help system: a `data-tip` key with optional `data-tip-i`, `TIPS[key]` as a string or `function(s, i)`, or a `tipFn` on the element.
- Live numbers always come from Engine helpers.
- New keys and their copy, where `{…}` means a live value:

| Key (i) | Copy |
|---|---|
| `ipHeader` | Infinity Points — earned each time you go Infinite. Next Infinity gives +{ipGain} IP. Spend IP on the Tree, Generators and Stars. |
| `infCount` | Infinities performed: {∞}. Several upgrades grow stronger with more Infinities. |
| `iuCard` (i = index into `Engine.UPGRADES`) | {name} — {effect text}. Cost {cost} IP. {Requires … / Owned — currently ×{value}}. |
| `gpLine` | Generator Power multiplies every ring's mult gain per lap by GP^{gpExp}. It resets each Infinity, so runs speed up as they go. |
| `genRow` (k, 0-based) | G{k}: you have {amount} ({bought} bought). Each makes {mult} {G(k−1) or GP} per second. Every purchase doubles its output. |
| `genBuy` (k, 0-based) | Buy another G{k} for {cost} IP. Bought generators are kept through Infinity; produced ones are not. |
| `autoBuy` | Autobuy: every moment, buys the cheapest affordable level among the rings you've enabled. |
| `autoAsc` | Auto-Ascend: ascends enabled rings as soon as they hit their level cap. |
| `autoPromote` | Auto-Promote: cycles through promotions in your order, promoting once XP reaches {×factor} your current level in the next one (or when progress stalls). |
| `autoPrestige` | Auto-Prestige: prestiges when pending P.Mult ≥ {multX}× current, or P.Exp would rise by ≥ {expGain}, or progress has stalled — after at least {minTime}s. |
| `autoInfinity` | Auto-Infinity (Broken only): goes Infinite once this run would give ≥ {minIP} IP and has lasted ≥ {minTime}s. |
| `stallSec` | A run counts as stalled when score hasn't grown ×10 for this many seconds. Stalls let Auto-Prestige/Promote act early. 0 = off. |
| `icCard` (n) | Challenge {n}: {handicap}. Reach 1.79e308 to complete. Reward: {reward}, plus +1 to your IP multiplier. Best: {time}. |
| `icStart` (n) | Starting resets your current run (no IP). You keep upgrades, generators and IP. |
| `breakToggle` | Broken: score can pass 1.79e308 and you choose when to go Infinite. Every e74 past e4,100 multiplies IP ×10 (tuned `breakStartLog`/`breakStepLog`, §11). Fixed: you go Infinite automatically at 1.79e308. |
| `ipBar` | IP bonus ×{10^k}. Next ×10 at e{threshold}. |
| `starBuy` | Stars produce Stardust: 0.05 × base^stars per second ({rate}/s now). |
| `starBase` | Star base {base} → {base+0.275}. Raises Stardust per Star. |
| `starExp` | Stardust exponent {exp} → {exp+0.05}. Generator Power gain × Stardust^exp. |
| `sdAmount` | Stardust {sd}. Resets on Infinity — spend it before you go Infinite. |
| `sdUpg` (j, 0-based) | {effect}. Level {n}/{max}. Cost {cost} Stardust. Kept through Infinity. |
| `gpChip` | Generator Power boost to mult gain: ×{gpMult}. |
| `icChip` | In Challenge {n}: {handicap}. |
| `confirmInfinity` | Show a confirmation when you reach 1.79e308 instead of going Infinite automatically. |
| `goInfinite` (updated) | Go Infinite: gain +{ipGain} IP and +{infGain} Infinity, then restart the Revolution stage. Upgrades, generators and IP are kept. |

---

## 11. TUNE constants (all reconstructed values)

| Key | Default | Meaning |
|---|---|---|
| `ipBase` | 1 | global IP multiplier (escape hatch) |
| `genRate` | 0.0025 (was 1; Task 14) | global generator output multiplier, applied to every M_k |
| `gpExp0`, `gpExp14`, `gpExp19` | 0.666, 0.75, 0.9 | [W] GP exponents |
| `genCost` | table §5.1 | per-generator `[log first_k, log step_k]`, applied to `p_k` |
| `genSoftcapLog` | 1000 | [W] softcap start |
| `u51Div`, `u51Cap` | 600, 10 | 5;1 |
| `u52K` | 0.01 (was 0.1; Task 14) | 5;2 |
| `u62K`, `u162K` | 0.01 (was 0.25; Task 14), 0.05 | 6;2, 16;2 |
| `u8TimeDiv` | 60 | 8;1, 9;1 |
| `u121Pow`, `u171Pow`, `u161Pow` | 0.5, 0.25, 0.2 | ∞-power upgrades |
| `u141K` | 0.1 | 14;1 |
| `icRefSec`, `ctfMax` | 36000, 1e4 | 15;2–4 |
| `u163Ref` | 3600 | 16;3 |
| `passiveInfK` | 0.2 (was 2; Task 14) | 18;1 |
| `u201Ref`, `u201Cap` | 600, 100 | 20;1 |
| `ic1Boost`, `ic5Nerf`, `ic5Reward` | 1.5, 0.25, 1.1 | challenge promotion factors |
| `ic6Decay` | 0.01 | per-second fractional decay of colour mult logs |
| `starBaseCost`, `starExpCost`, `starExpMax` | [34,4], [35,5], 12 | [firstLog, stepLog] |
| `sdUpgCost` | [[1,2],[1.30103,1],[1.69897,0.47712],[2,0.30103]] | [firstLog, stepLog] |
| `autoBuyMaxPerStep` | 500 | CPU guard |
| `ic4Pow` | 0.32 (wiki 0.4; see Deviations) | [W] IC4 gain power (last-resort lever) |
| `ic9Circles` | 3 (wiki 4; see Deviations) | [W] IC9 circle limit (last-resort lever) |
| `breakStartLog`, `breakStepLog` | 4100, 74 (wiki 2772, 308; see Deviations) | [W] IP bar: ×10 per `breakStepLog` of score past `breakStartLog` (wiki: ×10 at e3,080, then every e308) |
| `starStep` | `[[0,3],[18,7],[30,'grow']]` — **hardcoded in `starCostLog`, not a TUNE key** | [W]/[R] star cost steps: 3 below index 18, 7 below 30, then `7 + (j−29)` |
| `dtRunDiv`, `dtMin`, `dtMax`, `dtFixed` | 50, 0.1, 2, 1 | adaptive step (§9.1) |

---

## 12. Pacing targets (revised: real-game-like, mostly idle)

### 12.1 Player profiles used for measurement
- **Active:** used from the new game until all four automations are owned (about Infinity 8).
  - The bot acts every tick. It performs any buy, ascend, prestige or promote whose automation is not owned yet, using the existing greedy rules.
  - It spends IP right after each Infinity.
  - Runs 2–8 are therefore measured active, which is how a real player plays early Infinity.
- **Idle (from the first check-in after the 4th automation):**
  - Engine automation runs all the time. So do fixed and auto Infinity.
  - The "player" checks in every 3 h during a 16 h day, then there is an 8 h night gap. The night gap equals the offline cap, so no time is lost.
  - At a check-in the bot does the following: spends IP and SD from the scripted list (§13), buys generators and stars, starts or re-runs challenges, and sets auto-infinity thresholds.
  - Between check-ins nothing is bought. A challenge started at a check-in runs until it completes; normal runs then resume automatically, because `ic.active` resets on completion.

Game time equals wall time for a player on this schedule. "t∞" is game time since the first Infinity.

### 12.2 Targets
| Milestone | Target | Floor (collapse guard) |
|---|---|---|
| 1st Infinity (active, regression) | 3h22m ±10% since new game | — |
| 2nd Infinity run | 80–100 min | ≥ 50 min |
| 3rd Infinity run | 50–70 min | ≥ 30 min |
| Run length at Infinity 11 | 25–35 min | ≥ 15 min |
| All 4 automations owned (9 IP) | by Infinity 8 | — |
| 7;1 bought (Challenges) | t∞ 10–16 h | ≥ 8 h |
| IC1, 2 (each attempt, start → completion) | 20–90 min (ruling, Task 14) | ≥ 15 min |
| IC3 (each attempt) | 30–90 min | ≥ 15 min |
| IC5, 6, 7, 8 (each attempt) | informational: expected minutes | no floor — faithful to the wiki handicaps (controller ruling, Task 14) |
| IC4 and IC9 (each attempt) | 3–6 h | ≥ 2 h |
| All 9 ICs → Break unlocked | t∞ 42–96 h (ruling, Task 14; quantised by the 3 h check-ins) | ≥ 40 h |
| Col 17 (1e6 IP) | informational: Break + 0–24 h (ruling, Task 14), measured in t∞ from the Break unlock | — |
| First Star (2e33 IP) | t∞ 5–8 days | ≥ 4 days |
| **1.79e308 IP finale** | **t∞ 7–14 days (168–336 h)** | ≥ 6 days |

### 12.3 Calibration levers (in order of preference)
| Milestone band | Primary levers | Last resort (deviation note required) |
|---|---|---|
| Runs 2–11 | `genRate`, `u51*`, `u52K`, `u62K` | — |
| 7;1 timing | Phase A levers above | `ipBase` |
| IC1–3, 5–8 | `ic1Boost`, `ic5Nerf`, `ic6Decay`, the generator strength implied by attempt gating | — |
| IC4, IC9 | generator/upgrade strength at the guide's attempt point | `ic4Pow`, IC9 circle count |
| Break → col 17 | `icRefSec`, `ctfMax`, `u161Pow` | `breakStartLog`, `breakStepLog` |
| Col 17 → Star | `u171Pow`, 18;3, `u201Ref`, `u201Cap`, `passiveInfK` | generator cost table |
| Star → finale | `starStep` growth, `starBaseCost`, `starExpCost`, `starExpMax`, `sdUpgCost` | `genSoftcapLog` |

Wiki [W] numbers change only as a last resort. Any such change is recorded in a "Deviations" note in this spec, like the existing 0.04 mult gain.

---

### 12.4 Calibration results (Task 14)

Changed: `genRate` 1 → 0.0025, `u52K` 0.1 → 0.01, `u62K` 0.25 → 0.01, `passiveInfK` 2 → 0.2, and the wiki values `ic4Pow` 0.4 → 0.32, `ic9Circles` 4 → 3 (new TUNE key), `breakStartLog`/`breakStepLog` 2772/308 → 4100/74 (see Deviations). Engine ruling: the P.Exp prestige gain reads `min(scoreLog, INFINITY_LOG)` (§3), because Revolution-stage formulas are defined up to Infinity. Without it a broken run diverges within seconds. The change is bit-identical before Break.

Full `MODE=layer DAYS=16 CHECK=1` run. The stepped and `OFFLINE=1` runs agree within ±15% on every row, and the Phase B `NOSKIP=1` replay agrees on Break. CHECK=1 exits 0 with a total wall time of 4 min 21 s.

| Milestone | Result (t∞ unless noted) | Target | Status |
|---|---|---|---|
| 1st Infinity | 3h22m04s | 3h22m ±10% | PASS |
| 2nd Infinity run | 1h32m | 80–100 min | PASS |
| 3rd Infinity run | 1h03m | 50–70 min | PASS |
| Run at Infinity 11 | 26m | 25–35 min | PASS |
| All 4 automations | Infinity 7 | by Infinity 8 | PASS |
| 7;1 bought | 11h18m | 10–16 h | PASS |
| IC1 / IC2 | 25m / 25m | 20–90 min | PASS |
| IC3 | 37m | 30–90 min | PASS |
| IC4 | 3h38m | 3–6 h | PASS |
| IC5 / IC6 / IC7 / IC8 | 1m33s / 29s / 18s / 11m | informational | INFO (ruling) |
| IC9 | 3h44m | 3–6 h | PASS |
| Break unlocked | 45h02m (day 1.88) | 42–96 h | PASS |
| Col 17 (1e6 IP) | 2d07h11m (Break unlock + 10h09m) | informational, Break + 0–24 h | INFO |
| First Star | 5d20h | 5–8 d | PASS |
| Finale | 11d15h | 7–14 d | PASS |

**IC5–IC8 (ruling):** these are faithful to the wiki handicaps. They start when normal runs last 11–30 s and are expected to take minutes, so they are reported without a target.

**Why Col 17 comes early (now informational):** IP is already about e5.2 when Infinity is broken. The IP comes from Phase B's [W] multipliers (×(1+ICs), ×2 at the 5th Infinity, ×2 for IC4), from runs lasting seconds, and from buying columns 15–16 before Break. At about e2.5 IP per few-second run, 1e6 arrives within hours whatever the break bonus. The listed levers (`icRefSec`, `ctfMax`, `u161Pow`) act on factors of ×1–×6 and cannot hold IP below 1e6 for 16 h.

**Break at 45 h:** the time is set by the one-IC-per-check-in cadence and the night gaps. IC9 completes during the evening of day 1.

**Notes:**
- 6;2 at `u62K` = 0.01 is only about ×1.02 at ∞ = 100, so it is nearly cosmetic. It stays in the tree as a cheap Phase A node. Its strength was lowered because larger values let the IC3 and IC4 attempts complete in minutes.
- **Regression guard:** any change to Phase A or Phase B (tree, generators, IC rewards, Revolution stage) must re-run the Phase C calibration (`FROM=phaseC-start`, then a full `CHECK=1`). Two values are cliff-sensitive:
  - `ic4Pow`: 0.32 takes 3h38m, and 0.30 never completes.
  - `breakStartLog` sits just above the ~e4,000 score reached at Break. A shift of ±100 in that score moves First Star by about ±1 d.

### Deviations

- **IC4 gain power 0.4 → 0.32.** With 0.4 the IC4 attempt at its gate (first G2) took about 1 h; the target is 3–6 h. `ic4Pow` is the spec's last-resort lever for IC4. The value sits near a cliff (0.30 does not complete within 12 h).
- **Break bonus `breakStartLog`/`breakStepLog` 2772/308 → 4100/74.** With the P.Exp clamp, broken runs saturate at score e4,000–e27,000 over the layer. Wiki numbers would need about e95,000 for 1.79e308 IP (they reach only e12 IP by day 16). A lower step alone makes the layer explode at Break. A start near the score reached at Break (about e4,000) with a step of 74 gives a smooth takeoff: Star at about 5.8 d and the finale at about 11.6 d. Stepped, OFFLINE and NOSKIP runs agree. `passiveInfK` 2 → 0.2 ([R]) keeps passive ∞ from dominating the late game.
- **IC9 circles 4 → 3.** With 4 colours the attempt took 29–45 min, because normal runs at the gate last about 11 s. There is no [R] lever for IC9, and the circle count is the spec's last-resort lever. With 3 colours it takes about 3 h 44 min.

## 13. Sim changes (`test/sim.js`)

- **`MODE=first` (default):** today's single-run active bot. It is the regression guard for the 1st Infinity.
- **`MODE=layer`:** the idle profile of §12.1, from a fresh state through the finale, capped at `DAYS` (default 16).
  1. **Automation.** Everything runs through the engine: `tick` → `autoStep` → fixed/auto Infinity. The bot never performs an action itself once the matching automation is owned. Before that (the Active profile), the existing greedy logic performs it every tick.
  2. **Check-ins** follow the §12.1 schedule; in the Active profile, every Infinity counts as a check-in. At each one the bot:
     - Spends IP down the **scripted list**, buying the next item whenever it is affordable: 1;1, 2;2, 3;2, 3;1, 4;1, 5;3, 5;2, 6;1, 6;2, 7;1, 8;3, 8;1, 8;2, G1, 9;2, G2, 9;1, 11;1, 11;2, 12;1, 13;1, 14;1, 14;2, 15;2, 16;1, 15;3, 15;4, 16;2, 16;3, 15;1, 17;3, 17;1, 18;3, 19;3, 19;1, 18;1, 20;1, 21;1, then stars and generators.
     - When the next list item is not affordable, buys the cheapest generator costing ≤ 10% of current IP.
  3. **Challenges** are started at check-ins, only when no challenge is active and the guide's gate is met:
     - IC1 and IC2 right after 7;1.
     - IC3 after column 8.
     - IC4 after the first G2.
     - IC5 and IC6 right after.
     - IC7 after column 13.
     - IC8 after column 14.
     - IC9 right after.

     An attempt still running after 8 h is abandoned with `exitChallenge` and retried 4 check-ins later. Every attempt is logged. After Break, each IC is re-run once per day, at the first check-in of the day, to lower its best time.
  4. **Break mode.** At the first check-in after Break, the bot breaks Infinity and turns on auto-infinity (15;1).
     - At each later check-in it sets `minIpLog` to the IP gain at the moment a run's IP-per-minute peaks. A run cut at `minIpLog` cannot show what lies beyond it, so the bot looks ahead: it plays one fresh run on a cloned state (auto-Infinity off, up to 2 h, real state untouched) and takes the gain at the peak of `ipGain / max(1 min, t)`.
     - **This probe is an oracle.** A real idle player reads the IP bar and guesses, so the sim's post-Break pace is an **upper bound** for idle players.
     - Before 15;1 is owned, it goes Infinite at check-ins only.
  5. **Stars.** At each check-in the bot buys Stardust upgrades while affordable, in the guide order 1, 3, 2, 4. Then it buys whichever of Star, Base and Exponent is cheapest.
- **Step size:** the engine's `adaptiveDt` with `dtMin 0.1` and `dtMax 2`.
- **Wall-time budget:** a full `MODE=layer CHECK=1` run must finish in ≤ 5 min on a laptop. Three strategies achieve this:
  1. **Adaptive dt** (above). Most game time is spent late in runs, at 2 s steps.
  2. **Macro-steps (event skipping) for repeated runs.**
     - **Trigger:** no check-in purchase happened, no challenge is active, and the last 5 Infinities had run times within 2% of each other and identical `ipGainLog`.
     - **Action:** the sim extrapolates `k` whole runs at once. It adds `k × runTime` to the clock, `k × ipGain` to IP, `k × infGain` to ∞, and updates the stats (count, fastest, last 10, total IP). State after an Infinity is a run start, so this is exact apart from ∞-dependent effects.
     - **Choosing k:** `k` is the smallest of: the runs until the next check-in, the runs until the next scripted purchase becomes affordable, and 1000. `k` is halved until recomputing `ipGainLog` and `genMultLog(s, 0)` at `∞ + k·infGain` drifts less than 5%.
     - `NOSKIP=1` disables macro-steps. `CHECK=1` also replays the Phase B window (7;1 → Break) with `NOSKIP=1` and requires milestone agreement within ±10%.
  3. **Snapshots.** At each phase boundary (7;1 bought, Break, first Star) the sim writes the serialized state to `.sim/<name>.json` (gitignored). `FROM=<name>` resumes from a snapshot, so each phase can be tuned in ≤ 2 min.
- **Output:**
  - A milestone table: game time, t∞ and calendar day for each §12.2 row, with PASS/FAIL against target and floor.
  - Every challenge attempt.
  - The macro-step count and wall time per phase.
  - `VERBOSE=1` adds a line per Infinity.
- **`CHECK=1`** exits non-zero on any FAIL or when the wall budget is exceeded.
- **`OFFLINE=1`** replays each night gap through `simulate` at the default step, in consecutive 300 s chunks, the way the UI's chunked catch-up does it. Milestones must land within ±15% of the stepped run.

---

## 14. Testing (`test/engine.test.js`, `test/infinity.test.js`, `node:test`)

1. **Regression.** With default mods, `promoEffects`, `perRevLog`, `pendingPrestige`, `promoXp` and `lapsPerSec` equal the shipped formulas on sampled states. Existing tests keep passing.
2. **Migration.**
   - A v1 fixture (fresh, mid-run, post-Infinity with `ip: 1`) loads with `inf.ipLog = 0` and no `ip` key.
   - A v2 fixture missing nested fields gets them filled with defaults.
   - The serialize round trip keeps `-Infinity`.
3. **IP.**
   - The 1st Infinity gives 1 IP; the 5th gives 2.
   - The IC4 ×2 applies from the next Infinity on.
   - The IC count adds +1 each.
   - Break boundaries at `breakStartLog + k·breakStepLog` (tuned values from TUNE). The wiki values 2772/308 are also checked: e3,079 gives ×1, e3,080 gives ×10, e3,388 gives ×100.
4. **Upgrades.** Prerequisites (including the special cases 6;1 and 6;2, and column 11 depending on column 9); cost deduction; each effect changes the targeted quantity by the stated factor.
5. **Generators.** G1 alone gives GP = `m·t` (within 1e-6 relative). A 2-tier closed form holds for small `dt`. The ×2-per-purchase rule holds. The softcap is continuous at 1e1000.
6. **Challenges.** Each handicap is checked in isolation (e.g. IC8: `canAscend` is false; IC9: circle `ic9Circles`+1 never unlocks). Completion sets done/best and pays IP. Exit resets without IP. Challenges ignore the Break toggle.
7. **Automation.** `autoStep` decisions on constructed states: autobuy picks the cheapest level; prestige fires on the ratio and exponent thresholds and on a stall; promote follows the order and `xFactor` and skips disabled promotions; auto-infinity respects its minimums.
8. **Offline.**
   - `simulate(s, 600)` with automation versus 6,000 active 0.1 s ticks: prestige count within ±1, and score within 1.5 decades.
   - `simulate(s, 8h)` at the default step on an automated fixture completes in ≤ 6 s (Node), and 96 × 300 s chunks equal one 8 h call.
9. **Stars.** SD rate, GP multiplier, the star cost step sequence (e33, e36 … e87, e94 …), and the Stardust upgrade caps.
10. **Tooltips.** Every `data-tip` key used in `ui.js` exists in `TIPS`, and every function entry returns a non-empty string on a fresh state and on a late-game fixture.

---

## 15. Out of scope / follow-ups
- Eternity and everything after it.
- Time Flux, macros, the IP Adjuster, achievements and leaderboards.
- Autobuyers for the tree, generators and stars (Eternity milestones in the real game).
- The dropped nodes 10;1, 17;2, 18;2, 19;2 and 20;2 (D3). Each could return later as a TUNE-gated addition.

# Player guidance — design spec (2026-09-24)

Problem (user): "It's still not clear how to play the game, or what the objectives of the game are." New players get a 4-line intro card, 3-second unlock toasts and hover tooltips, but nothing states the objective or tells them what to do next.

Approved design (user, 2026-09-24): all of the following.

## 1. Objective up front
- Intro card opens with the objective: "Grow your score to Infinity (1.79e308) — then go beyond. Each new layer resets your progress in exchange for permanent power." Numbers come from Engine (`Engine.INFINITY_LOG`, `fmtLog`).
- **Journey strip**: Revolution → Prestige → Promotions → Infinity → Challenges → Break → Stars → Finale. Current stage highlighted, reached stages filled, future stages shown as "???" until reached (no spoilers beyond the next stage — the next stage's name is shown). Shown in the intro, at the top of the ? guide, and as a compact row in the next-goal card's expanded view.
  - Stage reached predicates: Revolution always; Prestige `stats.prestiges ≥ 1 || canPrestige`; Promotions `stats.promotions ≥ 1 || promoXp > 0`; Infinity `infinities ≥ 1`; Challenges `hasUpg('7;1')`; Break `inf.broken || canBreak`; Stars `hasUpg('21;1')`; Finale `ipLog ≥ INFINITY_LOG`.

## 2. Next-goal card
- Always-visible compact card docked under the score box (bottom-left of the stage, above the canvas; on < 820 px it sits between the canvas and the panel). Shows: goal title, progress bar + "x / y" text (log scale for big numbers), one-line "why", "Show me" (highlight target, switch tab if needed) and "Learn more" (opens the ? guide at the goal's section). Collapsible to a single line; collapsed state remembered.
- Goals are an ordered table (§5). **Current goal = first goal not completed.** Completion is sticky: completed ids stored in localStorage `revidle.guide.v1` (try/catch; works without storage). Rule: when a goal's `done(state)` is true, it and **every earlier goal** are marked complete (so resets like Prestige never regress goals, and loading an advanced save skips ahead).
- `ack` goals (tutorial explanations) complete when the player presses the coach popover's button.
- On completion: brief check animation + toast "Goal complete: <title>", then the next goal slides in.
- After the last goal: card shows "All goals complete — you've reached the end of this version."

## 3. First-minutes tutorial (coach marks)
- Goals flagged `coach: true` render as a spotlight: dim overlay with a cut-out around the target element + popover (title, 1–2 sentences, button "Next" for ack goals; action goals advance when done). Popover positioned near target, clamped to viewport, works at 375–400 px. "Skip tutorial" link marks all coach goals complete.
- Coach runs only when no modal is open and not during catch-up; if the target isn't on screen (wrong tab), coach switches to the needed tab. Escape = skip current step's spotlight (goal remains in card).
- Shown only for fresh players (no save at boot) or when "Restart tutorial" is pressed in Settings.

## 4. ? guide
- The ? button (and H) opens a full-height guide panel (modal on mobile, side sheet on desktop) with a table of contents and sections (§6). Locked sections show "Unlocks when …" with the unlock condition, not the content. Top: objective + journey strip. Deep-linkable from goals ("Learn more") and unlock cards.

## 5. Goal table (ids, done predicate, progress, target, section)
Targets are CSS selectors resolved at runtime; tab = tab id to switch to.

| # | id | title | done(s) | progress | target (tab) | coach | section |
|---|---|---|---|---|---|---|---|
| 1 | buyRed | Buy a Red level | circles[0].bought ≥ 1 | bought/1 | Red row Buy button (circles) | yes | buying |
| 2 | readMult | Your multipliers | ack | — | multbar Red chip | yes (ack) | mults |
| 3 | unlockOrange | Buy 5 Red levels to unlock Orange | circles[1].unlocked | bought[0]/5 | Red Buy (circles) | yes | buying |
| 4 | buyOrange | Buy an Orange level | circles[1].level ≥ 1 | — | Orange Buy (circles) | yes | buying |
| 5 | buyModes | Buy in bulk | ack | — | buy-mode toggle (circles) | yes (ack) | buying |
| 6 | unlockGreen | Unlock Green | circles[3].unlocked | unlocked count/4 | next locked row (circles) | no | buying |
| 7 | ascendRed | Max Red and Ascend it | any circle ascensions ≥ 1 | Red level / cap | Red Ascend button (circles) | no | ascension |
| 8 | reachPrestige | Reach 1e10 score | canPrestige(s) or prestiges ≥ 1 | scoreLog / TUNE.prestigeMinLog (log) | score box | no | prestige |
| 9 | prestige | Prestige for a permanent ×P.Mult | stats.prestiges ≥ 1 | — | Prestige button (prestige) | no | prestige |
| 10 | unlockWhite | Unlock all 10 rings | circles[9].unlocked or promotions ≥ 1 | unlocked/10 | next locked row | no | buying |
| 11 | reachPromote | Reach ×TUNE.promoMin P.Mult | promoXp > 0 or promotions ≥ 1 | log pMult / log promoMin | P chip | no | promotions |
| 12 | promote | Promote once | stats.promotions ≥ 1 | — | Promote card (promote) | no | promotions |
| 13 | promoteAll | Level all four Promotions | every promo[k] ≥ 1 | count/4 | Promote tab | no | promotions |
| 14 | infinity | Reach Infinity (1.79e308) | infinities ≥ 1 | scoreLog / INFINITY_LOG | score box | no | infinity |
| 15 | buyGens | Buy your first Infinity Upgrade | hasUpg('1;1') | — | ∞ tab Tree | no | infinity |
| 16 | buyG2 | Buy Generator 2 | gens[1].b ≥ 1 | — | ∞ Gens | no | generators |
| 17 | automate | Own all four automations | 1;1, 2;2, 3;2, 5;3 owned | count/4 | ∞ Tree | no | automation |
| 18 | unlockIC | Unlock Infinity Challenges | hasUpg('7;1') | — | ∞ Tree | no | challenges |
| 19 | firstIC | Complete a Challenge | icDoneCount ≥ 1 | — | ∞ ICs | no | challenges |
| 20 | allIC | Complete all 9 Challenges | icDoneCount = 9 | n/9 | ∞ ICs | no | challenges |
| 21 | breakInf | Break Infinity | inf.broken | — | ∞ ICs Break card | no | break |
| 22 | stars | Buy your first Star | stars.n ≥ 1 | — | ∞ Stars | no | stars |
| 23 | finale | Reach 1.79e308 IP | ipLog ≥ INFINITY_LOG | ipLog / INFINITY_LOG | ∞ header | no | finale |

All thresholds read from Engine / Engine.TUNE at runtime (never hardcoded).

## 6. Guide sections (content)
objective, circles (laps & score), mults (how score per lap is computed: Π ring mults × P.Mult, ^ exponent), buying (levels, speed, unlock-at-5, bulk modes, keys), ascension, prestige, promotions, infinity, generators, automation, challenges, break, stars, finale, glossary, tips. Each: short paragraphs + a "What to do" list. Unlock conditions: sections tied to the goal/stage where they first matter (e.g. prestige section unlocks at goal 8). Copy is plain, second person, no jargon without a glossary entry, numbers live from Engine.

## 7. Unlock explainer cards
Replace the one-time unlock toasts in `Help.onTick` with a card (modal-style, small): title, **What it is**, **Why it matters**, **What to do now**, buttons **Show me** (highlight target) and **Got it**. Queue; never shown over another modal or during catch-up; offline-accumulated unlocks show as one card listing each. Keys: existing ones (ascendSeen, prestigeSeen, promoSeen, infinitySeen, infTabSeen, gensSeen, autoSeen, icSeen, breakSeen, starsSeen). The first-Infinity modal remains as is (it already explains).

## 8. Highlights
Current goal's target gets class `guide-pulse` (soft pulsing outline in the accent colour; static outline under reduced motion). Re-applied after re-renders (targets are re-resolved at the 10 Hz DOM tick). Settings toggle "Show guidance" (default on; stored in `revidle.guide.v1`) hides the goal card, highlights and unlock cards (unlock cards fall back to toasts).

## Constraints
Existing global constraints apply (log10 numbers, pure engine untouched, no innerHTML with dynamic data, localStorage try/catch, 400 px / 375 px, 40 px touch targets, reduced motion, keyboard access, no alert/confirm/prompt, rebuild and commit generated outputs). Save format unchanged. Tooltip-coverage test must still pass.

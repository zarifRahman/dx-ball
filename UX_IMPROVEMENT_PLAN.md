# DX-Ball UX Improvement Plan

## Current State

Well-structured brick breaker with clean code, responsive canvas, polished visuals (glows, gradients, particles). Supports keyboard, mouse, and touch. But feels like a tech demo — missing features that make players return.

## Key Gaps

- **No audio** — silent games feel broken
- **Single level** — win once, nothing new
- **No powerups** — classic DX-Ball signature feature absent
- **No pause** — can't stop mid-game
- **No high score persistence** — score disappears on restart
- **No difficulty curve** — ball speed never changes
- **No score feedback** — points add silently
- **No combo system** — rapid hits worth same as slow hits
- **No settings** — can't adjust volume or difficulty
- **No tutorial** — minimal onboarding

---

## Prioritized Features

| # | Feature | Effort | Impact | Description |
|---|---------|--------|--------|-------------|
| 1 | Sound effects | Medium | High | Web Audio API — hit, break, ball loss, win/lose jingles |
| 2 | Pause | Small | High | Escape key / tap pause icon. Basic expectation |
| 3 | Powerups (6 types) | Large | High | Wider paddle, multi-ball, sticky paddle, laser, slow ball, extra life |
| 4 | Multiple levels (5-10) | Medium | High | New brick patterns, increasing speed per level |
| 5 | Score popups | Small | Medium | Floating "+10" text on brick hit |
| 6 | Combo multiplier | Small | Medium | x2, x3, x4 for rapid consecutive hits |
| 7 | High score board | Small | Medium | localStorage persistence, top 5 leaderboard |
| 8 | Difficulty scaling | Small | Medium | Ball speeds up per level, more multi-hit bricks |
| 9 | Start menu | Medium | Medium | Title screen with play, settings, high scores |
| 10 | Settings panel | Small | Low | Sound volume, controls hint, difficulty select |
| 11 | Screen shake | Small | Low | Camera shake on brick break — juicy impact feel |
| 12 | Mobile haptics | Small | Low | `navigator.vibrate()` on hit for tactile feedback |

---

## Build Phases

### Phase 1 — Core Feel
> Goal: Make the game *feel* complete

- [ ] **Pause system** — Escape/P key, tap-to-pause icon on mobile
- [ ] **Sound effects** — procedural Web Audio API sounds (no asset files needed)
  - Ball hit paddle
  - Ball hit brick
  - Brick destroyed
  - Ball lost
  - Level win
  - Game over
- [ ] **Score popups** — floating "+5" / "+10" text at brick position, fades upward

### Phase 2 — Depth
> Goal: Give players reasons to keep playing

- [ ] **Powerups** — drop from destroyed bricks (random chance ~20%)
  - Wider Paddle (green) — 1.5x paddle width for 15 seconds
  - Multi-Ball (cyan) — splits into 3 balls
  - Sticky Paddle (yellow) — ball sticks on catch, release on click
  - Laser (red) — paddle shoots lasers to destroy bricks
  - Slow Ball (blue) — reduces ball speed 50% for 10 seconds
  - Extra Life (pink) — +1 life
- [ ] **Multiple levels** — 5-10 unique brick layouts
  - Level 1: Standard 10x6 grid (current)
  - Level 2: Diamond pattern
  - Level 3: Inverted pyramid
  - Level 4: Checkerboard with 3-hit bricks
  - Level 5: Fortress (walls of multi-hit bricks)
  - Levels 6-10: Mix patterns with increasing multi-hit density
- [ ] **Combo multiplier** — hits within 500ms stack: x1 → x2 → x3 → x4 (max)
  - Visual: combo counter near score
  - Resets after 500ms without hit
- [ ] **Difficulty scaling** — per level:
  - Ball base speed +5% per level
  - More multi-hit bricks in later levels
  - Fewer powerup drops in later levels

### Phase 3 — Polish
> Goal: Professional game feel

- [ ] **High score board** — localStorage, top 5 scores with date
- [ ] **Start menu** — title screen
  - "DX-BALL" title with glow animation
  - Play button
  - High Scores button
  - Settings button
- [ ] **Settings panel** — sound volume slider, controls reference
- [ ] **Screen shake** — 2-3px random offset for 100ms on brick destruction
- [ ] **Mobile haptics** — `navigator.vibrate(10)` on brick hit, `vibrate(50)` on ball loss
- [ ] **Level transition** — brief "LEVEL X" overlay between levels

---

## Technical Notes

- Sound: Use Web Audio API with `OscillatorNode` for procedural sounds (no audio files)
- Powerups: New `Powerup` type in `types.ts`, drop physics in `engine.ts`, render in `renderer.ts`
- Levels: `levels.ts` module with brick layout definitions
- High scores: `localStorage.getItem/setItem` with JSON serialization
- Combos: Track `lastHitTime` in `GameState`, calculate multiplier in `updateGame()`
- Screen shake: Offset canvas transform in render loop, decay over frames
- Pause: New `"paused"` phase in `GamePhase` type, skip `updateGame()` when paused

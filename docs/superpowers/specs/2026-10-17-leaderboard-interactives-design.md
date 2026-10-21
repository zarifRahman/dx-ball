# DX-Ball — Leaderboard + Interactives

Date: 2026-10-17
Branch: `feat/leaderboard-interactives`

## Goal

Make scoring social and sticky: named local leaderboard, live run stats,
and three interactives — NEW BEST celebration, achievements, daily challenge.
Client-only (localStorage); no backend.

## Build on existing

`DxBallGame.tsx` already has: `loadHighScores`/`saveHighScore`/`resetBestScores`,
`HighScoreTable`, a `highscores` menu view, `scoreKey(difficulty, speed)`, best shown
on menu + HUD. Current store keeps ONE best per mode, no name. We extend, not rewrite.

## Data model (`types.ts`)

- `LeaderboardEntry { name: string; score: number; date: string }`
- Store: `Record<key, LeaderboardEntry[]>` — sorted desc, capped at 10 per key.
- Migration: legacy `{ score, date }` → `[{ name: "Player", score, date }]`.
- `RunStats { bricksDestroyed: number; bestCombo: number; powerupsCollected: number; levelReached: number }`
  — new `GameState` fields, tracked inside `updateGame` (pure).
- `Achievement { id: string; label: string; desc: string }` + unlocked `id[]` in localStorage.

## New modules (pure, testable — keep component from growing)

- `leaderboard.ts` — `load()`, `save()`, `qualifies(table, key, score)`,
  `insert(table, key, name, score, date)`, migration. Moved out of component.
- `achievements.ts` — fixed list (~5): Combo x4, No-death level clear, 10k score,
  Fireball frenzy (≥5 bricks one fireball), Daily done. `evaluate(stats, events, unlocked) → newlyUnlocked[]`.
- `daily.ts` — `dailySeed(dateStr)` → `mulberry32` RNG → deterministic board + difficulty.
  Daily runs score under key `daily|YYYY-MM-DD`.

## UI (`DxBallGame.tsx` + `renderer.ts`)

- Leaderboard view: named top-10 table per mode (extend `highscores` view).
- End screen: run-stats panel (bricks destroyed, best combo, level reached).
- NEW BEST: score `qualifies` → celebration flash/shake + name input → `insert`.
- Achievement toast on unlock.
- Menu: "Daily Challenge" entry → daily board, separate best.

## Known limit (daily determinism)

Engine uses `Math.random()` for powerup drops / particles. Daily determinism covers
**board layout + difficulty only**, not drop RNG. Full determinism would require seeding
all engine randomness — out of scope. Flagged with a `ponytail:` comment.

## Phases

1. Data model + `leaderboard.ts` + migration.
2. Run stats tracking (engine + end screen).
3. Named leaderboard UI + name entry + NEW BEST celebration.
4. Achievements.
5. Daily challenge.

## Checks

- `leaderboard.ts`: assert insert sorts desc + caps 10 + migration shape.
- `achievements.ts`: assert evaluate unlocks on threshold, not before.
- `daily.ts`: assert same date → same board (determinism).

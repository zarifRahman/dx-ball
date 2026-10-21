// lib/game/daily.ts
// Deterministic daily challenge: same calendar day → same board + difficulty for everyone.
// ponytail: only the BOARD and difficulty are seeded here. Powerup-drop / particle RNG in the
// engine still uses Math.random(), so two daily runs are not bit-identical — fine for a daily.
// Upgrade path: thread a seeded RNG through engine.ts if full determinism is ever needed.

import { BRICK_COLS, BRICK_ROWS } from "./constants";
import type { BrickGrid } from "./levels";
import type { Difficulty } from "./types";

// Local YYYY-MM-DD (callers may pass their own string for testing).
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailyKey(dateStr: string): string {
  return `daily:${dateStr}`;
}

// Hash a date string to a 32-bit seed.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — tiny deterministic PRNG, returns () => [0,1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export interface DailyChallenge {
  dateStr: string;
  difficulty: Difficulty;
  grid: BrickGrid; // 0 = empty, 1-6 = brick tier
}

// Deterministic board for a given day. Same dateStr → identical result.
export function dailyChallenge(dateStr: string = todayStr()): DailyChallenge {
  const rng = mulberry32(hashSeed(dateStr));
  const difficulty = DIFFICULTIES[Math.floor(rng() * DIFFICULTIES.length)];
  const grid: BrickGrid = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < BRICK_COLS; c++) {
      // ~18% gaps for shape; otherwise a tier weighted toward lower rows being tougher.
      if (rng() < 0.18) { row.push(0); continue; }
      const tier = 1 + Math.floor(rng() * 6);
      row.push(tier);
    }
    grid.push(row);
  }
  // Guarantee at least one brick so the level is completable/non-trivial.
  const hasBrick = grid.some((row) => row.some((cell) => cell > 0));
  if (!hasBrick) grid[0][0] = 1;
  return { dateStr, difficulty, grid };
}

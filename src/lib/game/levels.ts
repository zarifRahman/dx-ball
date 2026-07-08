// lib/game/levels.ts
// Each level defines a 2D grid of brick tiers.
// 0 = empty cell, 1-6 = brick tier (maps to BRICK_TIERS[tier-1])
// Grid is ROWS x COLS (row 0 is top row).

export type BrickGrid = number[][];

// Level 1 — Standard 10x6 grid (original layout, all rows filled)
const level1: BrickGrid = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
];

// Level 2 — Diamond pattern
const level2: BrickGrid = [
  [0, 0, 0, 0, 3, 3, 0, 0, 0, 0],
  [0, 0, 0, 2, 4, 4, 2, 0, 0, 0],
  [0, 0, 1, 3, 5, 5, 3, 1, 0, 0],
  [0, 1, 2, 4, 6, 6, 4, 2, 1, 0],
  [0, 0, 1, 3, 5, 5, 3, 1, 0, 0],
  [0, 0, 0, 2, 4, 4, 2, 0, 0, 0],
  [0, 0, 0, 0, 3, 3, 0, 0, 0, 0],
];

// Level 3 — Inverted pyramid
const level3: BrickGrid = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
  [0, 0, 3, 3, 3, 3, 3, 3, 0, 0],
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 0, 0, 5, 5, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 6, 0, 0, 0, 0],
];

// Level 4 — Checkerboard with 3-hit bricks
const level4: BrickGrid = [
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  [0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
  [1, 0, 3, 0, 3, 0, 3, 0, 1, 0],
  [0, 2, 0, 3, 0, 3, 0, 2, 0, 2],
  [1, 0, 3, 0, 3, 0, 3, 0, 1, 0],
  [0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
];

// Level 5 — Fortress (outer walls of multi-hit bricks, empty interior)
const level5: BrickGrid = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 3, 3, 3, 3, 3, 3, 0, 2],
  [2, 0, 3, 0, 0, 0, 0, 3, 0, 2],
  [2, 0, 3, 0, 1, 1, 0, 3, 0, 2],
  [2, 0, 3, 0, 1, 1, 0, 3, 0, 2],
  [2, 0, 3, 3, 3, 3, 3, 3, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
];

// Level 6 — Cross / Plus pattern
const level6: BrickGrid = [
  [0, 0, 0, 0, 2, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 3, 3, 0, 0, 0, 0],
  [1, 1, 2, 2, 4, 4, 2, 2, 1, 1],
  [1, 1, 2, 2, 4, 4, 2, 2, 1, 1],
  [0, 0, 0, 0, 3, 3, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 2, 0, 0, 0, 0],
];

// Level 7 — Zigzag stripes
const level7: BrickGrid = [
  [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
  [0, 2, 2, 0, 0, 2, 2, 0, 0, 2],
  [0, 0, 3, 3, 0, 0, 3, 3, 0, 0],
  [0, 0, 0, 4, 4, 0, 0, 4, 4, 0],
  [1, 0, 0, 0, 5, 5, 0, 0, 5, 5],
  [2, 2, 0, 0, 0, 6, 6, 0, 0, 6],
];

// Level 8 — Bull's-eye rings
const level8: BrickGrid = [
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 3, 3, 3, 3, 3, 3, 0, 2],
  [2, 0, 3, 0, 0, 0, 0, 3, 0, 2],
  [2, 0, 3, 0, 4, 4, 0, 3, 0, 2],
  [2, 0, 3, 3, 3, 3, 3, 3, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
];

export const LEVELS: BrickGrid[] = [
  level1,
  level2,
  level3,
  level4,
  level5,
  level6,
  level7,
  level8,
];

export const TOTAL_LEVELS = LEVELS.length;

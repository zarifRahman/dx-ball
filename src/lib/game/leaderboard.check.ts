// Runnable check for leaderboard insert/sort/cap, qualifies, and legacy migration.
// Run (see fireball.check.ts header for the pattern):
//   npx tsc src/lib/game/leaderboard.check.ts --outDir /tmp/dxcheck --module commonjs \
//     --moduleResolution node --esModuleInterop --skipLibCheck && node /tmp/dxcheck/leaderboard.check.js
import assert from "node:assert";

// Shim a localStorage so loadLeaderboard migration path runs under node.
const store: Record<string, string> = {};
// @ts-expect-error minimal shim
globalThis.window = {};
// @ts-expect-error minimal shim
globalThis.localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

import {
  insertScore,
  qualifies,
  bestScore,
  loadLeaderboard,
  LEADERBOARD_KEY,
  MAX_ENTRIES,
} from "./leaderboard";
import type { LeaderboardTable } from "./types";

const KEY = "normal:1";

// --- insert sorts desc + caps at MAX_ENTRIES ---
{
  let t: LeaderboardTable = {};
  for (let i = 0; i < MAX_ENTRIES + 5; i++) t = insertScore(t, KEY, `P${i}`, i * 100, "d");
  const rows = t[KEY];
  assert.strictEqual(rows.length, MAX_ENTRIES, "must cap at MAX_ENTRIES");
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].score >= r.score), "must be sorted desc");
  assert.strictEqual(bestScore(t, KEY), (MAX_ENTRIES + 4) * 100, "best = top score");
}

// --- qualifies: full board only beats the lowest ---
{
  let t: LeaderboardTable = {};
  for (let i = 0; i < MAX_ENTRIES; i++) t = insertScore(t, KEY, `P${i}`, 1000 + i, "d");
  assert.strictEqual(qualifies(t, KEY, 999), false, "below lowest kept must not qualify");
  assert.strictEqual(qualifies(t, KEY, 5000), true, "above lowest must qualify");
  assert.strictEqual(qualifies(t, KEY, 0), false, "zero never qualifies");
  assert.strictEqual(qualifies({}, "empty", 1), true, "empty board always qualifies");
}

// --- name sanitised (trim + 12 cap, blank → default) ---
{
  const t = insertScore({}, KEY, "   ", 50, "d");
  assert.strictEqual(t[KEY][0].name, "Player", "blank name falls back to Player");
  const t2 = insertScore({}, KEY, "ABCDEFGHIJKLMNOP", 50, "d");
  assert.ok(t2[KEY][0].name.length <= 12, "name capped at 12");
}

// --- legacy single-best migrates to a one-row array ---
{
  store[LEADERBOARD_KEY] = JSON.stringify({ "hard:1.25": { score: 777, date: "2020-01-01" } });
  const loaded = loadLeaderboard();
  assert.deepStrictEqual(loaded["hard:1.25"], [{ name: "Player", score: 777, date: "2020-01-01" }],
    "legacy {score,date} must migrate to [{name:Player,...}]");
}

console.log("PASS: leaderboard insert/cap/sort, qualifies, name sanitise, legacy migration");

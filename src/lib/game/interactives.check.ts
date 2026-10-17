// Runnable check for daily determinism + achievement evaluation.
//   npx tsc src/lib/game/interactives.check.ts --outDir /tmp/dxcheck --module commonjs \
//     --moduleResolution node --target es2019 --esModuleInterop --skipLibCheck && node /tmp/dxcheck/interactives.check.js
import assert from "node:assert";
import { dailyChallenge, dailyKey } from "./daily";
import { evaluate } from "./achievements";
import type { AchievementId, RunStats } from "./types";

// --- daily: same date => identical board; key format ---
{
  const a = dailyChallenge("2026-10-17");
  const b = dailyChallenge("2026-10-17");
  assert.deepStrictEqual(a, b, "same date must yield identical daily challenge");
  assert.strictEqual(dailyKey("2026-10-17"), "daily:2026-10-17");
  assert.ok(a.grid.some((row) => row.some((c) => c > 0)), "daily board must have at least one brick");
  // different dates should usually differ — check across a spread
  const grids = ["2026-01-01", "2026-06-15", "2026-12-31"].map((d) => JSON.stringify(dailyChallenge(d).grid));
  assert.ok(new Set(grids).size > 1, "different dates should produce different boards");
}

// --- achievements: threshold logic + no re-award ---
{
  const base: RunStats = { bricksDestroyed: 0, bestCombo: 0, powerupsCollected: 0, levelReached: 1, fireballKills: 0, deaths: 0 };
  const none = new Set<AchievementId>();

  assert.deepStrictEqual(evaluate(base, { score: 0, clearedLevel: false, isDaily: false }, none), [], "nothing at zero");

  assert.deepStrictEqual(
    evaluate({ ...base, bestCombo: 4 }, { score: 0, clearedLevel: false, isDaily: false }, none),
    ["combo4"], "combo4 unlocks at x4");

  assert.deepStrictEqual(
    evaluate({ ...base, deaths: 0 }, { score: 0, clearedLevel: true, isDaily: false }, none),
    ["noDeathClear"], "flawless needs clear + 0 deaths");

  assert.deepStrictEqual(
    evaluate({ ...base, deaths: 1 }, { score: 0, clearedLevel: true, isDaily: false }, none),
    [], "flawless denied if a ball was lost");

  assert.deepStrictEqual(
    evaluate({ ...base, fireballKills: 10, deaths: 0 }, { score: 10000, clearedLevel: true, isDaily: true }, none).sort(),
    ["dailyDone", "fireballFrenzy", "noDeathClear", "score10k"],
    "multiple unlock together (clear + 0 deaths + 10k + 10 fireball kills + daily; combo stays 0)");

  const already = new Set<AchievementId>(["combo4"]);
  assert.deepStrictEqual(
    evaluate({ ...base, bestCombo: 4 }, { score: 0, clearedLevel: false, isDaily: false }, already),
    [], "already-unlocked not re-awarded");
}

console.log("PASS: daily determinism + achievement evaluation");

// lib/game/achievements.ts
// Small fixed set of unlockable badges. evaluate() is pure; load/save persist unlocked ids.

import type { Achievement, AchievementId, RunStats } from "./types";

export const ACHIEVEMENTS_KEY = "dxball_achievements";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "combo4", label: "Combo Master", desc: "Reach a x4 combo in one run" },
  { id: "noDeathClear", label: "Flawless", desc: "Clear a level without losing a ball" },
  { id: "score10k", label: "High Roller", desc: "Score 10,000 points in a run" },
  { id: "fireballFrenzy", label: "Pyromaniac", desc: "Destroy 10 bricks with fireballs in a run" },
  { id: "dailyDone", label: "Daily Grind", desc: "Finish a daily challenge" },
];

// Context beyond RunStats that some achievements need.
export interface AchievementContext {
  score: number;
  clearedLevel: boolean; // a level was just cleared (won phase reached)
  isDaily: boolean;
}

// Pure: return ids newly earned this evaluation (not already in `unlocked`).
export function evaluate(
  stats: RunStats,
  ctx: AchievementContext,
  unlocked: ReadonlySet<AchievementId>,
): AchievementId[] {
  const earned: AchievementId[] = [];
  const add = (id: AchievementId, cond: boolean) => {
    if (cond && !unlocked.has(id)) earned.push(id);
  };

  add("combo4", stats.bestCombo >= 4);
  add("noDeathClear", ctx.clearedLevel && stats.deaths === 0);
  add("score10k", ctx.score >= 10000);
  add("fireballFrenzy", stats.fireballKills >= 10);
  add("dailyDone", ctx.isDaily && ctx.clearedLevel);

  return earned;
}

export function loadUnlocked(): Set<AchievementId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const valid = new Set(ACHIEVEMENTS.map((a) => a.id));
    return new Set(parsed.filter((id): id is AchievementId => typeof id === "string" && valid.has(id as AchievementId)));
  } catch {
    return new Set();
  }
}

export function saveUnlocked(unlocked: ReadonlySet<AchievementId>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...unlocked]));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function achievementById(id: AchievementId): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

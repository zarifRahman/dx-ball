// lib/game/leaderboard.ts
// Named local leaderboard — top-N scores per mode key, persisted in localStorage.
// Replaces the legacy single-best-per-mode store and migrates it on load.

import type { Difficulty, GameSpeed, LeaderboardEntry, LeaderboardTable } from "./types";

export const LEADERBOARD_KEY = "dxball_highscores"; // same key — old data migrates in place
export const MAX_ENTRIES = 10;
export const DEFAULT_NAME = "Player";

// Mode key for a difficulty/speed pair. Daily keys are built as `daily:YYYY-MM-DD`.
export function scoreKey(difficulty: Difficulty, speed: GameSpeed): string {
  return `${difficulty}:${speed}`;
}

function isValidEntry(v: unknown): v is LeaderboardEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<LeaderboardEntry>;
  return (
    typeof e.score === "number" &&
    Number.isFinite(e.score) &&
    e.score >= 0 &&
    typeof e.name === "string" &&
    typeof e.date === "string"
  );
}

// Coerce one stored value (legacy `{score,date}` OR `LeaderboardEntry[]`) into rows.
function coerceRows(value: unknown): LeaderboardEntry[] {
  if (Array.isArray(value)) {
    return value
      .filter(isValidEntry)
      .map((e) => ({ name: e.name, score: Math.floor(e.score), date: e.date }));
  }
  // Legacy single-best object { score, date } → one anonymous row
  if (value && typeof value === "object") {
    const e = value as { score?: unknown; date?: unknown };
    if (typeof e.score === "number" && Number.isFinite(e.score) && e.score >= 0) {
      return [
        {
          name: DEFAULT_NAME,
          score: Math.floor(e.score),
          date: typeof e.date === "string" ? e.date : new Date().toISOString(),
        },
      ];
    }
  }
  return [];
}

function sortCap(rows: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...rows].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
}

export function loadLeaderboard(): LeaderboardTable {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
    const table: LeaderboardTable = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const rows = sortCap(coerceRows(value));
      if (rows.length) table[key] = rows;
    }
    return table;
  } catch {
    return {};
  }
}

export function saveLeaderboard(table: LeaderboardTable): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(table));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function bestScore(table: LeaderboardTable, key: string): number {
  return table[key]?.[0]?.score ?? 0;
}

// Would `score` land on the board? (board not full, or beats the lowest kept row)
export function qualifies(table: LeaderboardTable, key: string, score: number): boolean {
  if (score <= 0) return false;
  const rows = table[key] ?? [];
  if (rows.length < MAX_ENTRIES) return true;
  return score > rows[rows.length - 1].score;
}

// Immutably insert a row and return the new table (sorted, capped).
export function insertScore(
  table: LeaderboardTable,
  key: string,
  name: string,
  score: number,
  date: string = new Date().toISOString(),
): LeaderboardTable {
  const cleanName = (name.trim() || DEFAULT_NAME).slice(0, 12);
  const rows = sortCap([...(table[key] ?? []), { name: cleanName, score: Math.floor(score), date }]);
  return { ...table, [key]: rows };
}

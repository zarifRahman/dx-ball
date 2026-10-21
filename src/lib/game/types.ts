// lib/game/types.ts

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export type Paddle = Rect;

export interface Ball extends Circle {
  vx: number;
  vy: number;
  stuck: boolean; // true = sitting on sticky paddle, waiting for launch
}

export interface Brick extends Rect {
  alive: boolean;
  hits: number;
  maxHits: number;
  fill: string;
  stroke: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  r: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  vy: number;
}

export type PowerupType =
  | "widen"
  | "multiball"
  | "sticky"
  | "laser"
  | "slow"
  | "extralife"
  | "fireball";

export type Difficulty = "easy" | "normal" | "hard";
export type GameSpeed = "0.75" | "1" | "1.25";

export interface Powerup extends Rect {
  vy: number;
  type: PowerupType;
  active: boolean; // false = already collected
}

export interface Laser extends Rect {
  vy: number;
}

// Tracks a currently active timed powerup
export interface ActivePowerup {
  type: PowerupType;
  framesLeft: number;
}

export interface GameState {
  paddle: Paddle;
  balls: Ball[];           // always use balls[] — primary store
  bricks: Brick[];
  score: number;
  lives: number;
  phase: 'menu' | 'waiting' | 'playing' | 'paused' | 'won' | 'lost' | 'levelTransition';
  particles: Particle[];
  popups: ScorePopup[];
  powerups: Powerup[];
  lasers: Laser[];
  activePowerups: ActivePowerup[];
  level: number;                    // 1-based current level
  levelTransitionFrames: number;    // countdown for transition overlay
  lastHitTime: number;              // Date.now() of last brick hit
  comboCount: number;               // current combo multiplier (1 = no combo)
  baseSpeed: number;                // current ball base speed (scales with level + speedMultiplier)
  speedMultiplier: number;          // user-selected global speed scaler
  difficulty: Difficulty;           // user-selected gameplay difficulty
  stickyActive: boolean;            // whether sticky paddle is currently active
  fireballActive: boolean;          // whether ball burns through bricks (DX-Ball fireball)
  shake: number;                    // frames of screen shake remaining (decays to 0)
  runStats: RunStats;               // cumulative stats for the current run (reset on new game)
  isDaily: boolean;                 // daily-challenge run: single board, no level advance
}

// Live stats tracked across one run (carried over between levels, reset on new game)
export interface RunStats {
  bricksDestroyed: number;
  bestCombo: number;
  powerupsCollected: number;
  levelReached: number;             // highest level reached this run
  fireballKills: number;            // bricks destroyed while fireball was active (cumulative this run)
  deaths: number;                   // balls lost this run
}

// Personal best entry stored in localStorage for one difficulty/speed pair
// (legacy single-best shape — kept for migration into LeaderboardEntry[])
export interface HighScoreEntry {
  score: number;
  date: string; // ISO date string
}

export type HighScoreTable = Record<string, HighScoreEntry>;

// One named row in the leaderboard for a given mode key
export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string; // ISO date string
}

// key = `${difficulty}:${speed}` or `daily:YYYY-MM-DD`; value = top-N rows, sorted desc
export type LeaderboardTable = Record<string, LeaderboardEntry[]>;

export type AchievementId =
  | "combo4"
  | "noDeathClear"
  | "score10k"
  | "fireballFrenzy"
  | "dailyDone";

export interface Achievement {
  id: AchievementId;
  label: string;
  desc: string;
}

export interface GameContext {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  keys: Record<string, boolean>;
  setKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  rafRef: React.RefObject<number | null>;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
}
